#!/usr/bin/env python3
"""Automatic UX/UI check for Meca Bingo.

Plays a small game in a headless browser (host + player, ?net=local), takes screenshots of every
screen on several devices and runs layout checks. Results go to ux-report/ (report.md + PNGs).
Exit code 1 if a check fails, so CI marks the commit.

    pip install playwright && python -m playwright install chromium
    python3 tools/ux/ux_check.py            # uses ./public, port 8099
    CHROME=/usr/bin/google-chrome python3 tools/ux/ux_check.py
    SKIN=flamenco-fair python3 tools/ux/ux_check.py   # check one skin (default: dance-floor); report in ux-report/
    EVENT=test python3 tools/ux/ux_check.py   # with a special event on; meant for hidden or out-of-season events
                                              # (the saved choice only holds while no shown event is in season)
    UX_PORT=8098 python3 tools/ux/ux_check.py # another port, e.g. to run two checks at once
"""
import functools, http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'ux-report')
SONGS = open(os.path.join(os.path.dirname(__file__), 'songs.txt'), encoding='utf-8').read()
PORT = int(os.environ.get('UX_PORT', 8099))
EVENT = os.environ.get('EVENT')
DEVICES = {  # name: (width, height)
    'phone-portrait': (375, 740), 'phone-small': (320, 600), 'phone-landscape': (740, 375),
    'tablet': (820, 1180), 'desktop': (1366, 850)
}
MIN_TAP = 40  # px, smallest acceptable tap target
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))

# Layout checks run inside the page
JS_CHECKS = r"""
(() => {
  const out = {};
  out.hscroll = document.documentElement.scrollWidth - innerWidth;
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  out.overflowCells = [...document.querySelectorAll('.cell[data-i]')].filter(c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).map(c => c.innerText.slice(0, 30));
  out.smallTaps = [...document.querySelectorAll('button, a.btn, .cell[data-i], [data-c], [data-s]')].filter(vis)
    .filter(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < %MIN%; }).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 8);
  out.minFont = Math.min(...[...document.querySelectorAll('.cell[data-i] .tt')].filter(vis).map(e => parseFloat(getComputedStyle(e).fontSize)), 99);
  // fixed bars covering the card
  const bar = document.getElementById('callbar');
  if (bar && vis(bar)) { const b = bar.getBoundingClientRect(); out.coveredCells = [...document.querySelectorAll('.cell[data-i]')].filter(c => { const r = c.getBoundingClientRect(); return r.bottom > b.top + 8 && r.top < b.top; }).length; }
  return out;
})()
""".replace('%MIN%', str(MIN_TAP))

# An open dropdown: a .prefs pop (its rect) or a select (its picker's rect: options + the picker's padding and border)
DROPDOWN_JS = r"""
(() => {
  const e = document.querySelector('%SEL%'), sel = e.tagName === 'SELECT', ps = sel && getComputedStyle(e, '::picker(select)');
  const rs = sel ? [...e.options].map(o => o.getBoundingClientRect()) : [e.getBoundingClientRect()], pad = sel ? parseFloat(ps.paddingRight) + parseFloat(ps.borderRightWidth) : 0;
  return { left: Math.round(Math.min(...rs.map(r => r.left)) - pad), right: Math.round(innerWidth - Math.max(...rs.map(r => r.right)) - pad),
    open: sel && e.matches(':open'), rot: sel ? getComputedStyle(e, '::picker-icon').rotate : '', hscroll: document.documentElement.scrollWidth - innerWidth };
})()
"""
MENU_ROT = "getComputedStyle(document.querySelector('.prefs>summary'), '::after').rotate"

def page_checks(page, label, card=False):
    r = page.evaluate(JS_CHECKS)
    if card and page.evaluate("!!document.getElementById('rotate') && !document.getElementById('rotate').classList.contains('hidden')"):
        check(f'{label}: asks to turn the phone (card too wide for portrait)', True); check(f'{label}: no sideways scroll', r['hscroll'] <= 1, f"{r['hscroll']}px")
        return
    check(f'{label}: no sideways scroll', r['hscroll'] <= 1, f"{r['hscroll']}px wider than the screen")
    if card:
        check(f'{label}: song names fit their cell', not r['overflowCells'], ', '.join(r['overflowCells']))
        check(f'{label}: song names readable (≥ 9px)', r['minFont'] >= 9, f"smallest {r['minFont']}px")
        check(f'{label}: call button does not cover the card', not r.get('coveredCells'), f"{r.get('coveredCells')} cells under the button")
    small = [s for s in r['smallTaps'] if not s.startswith(('lang', 'fs', 'snap'))]
    check(f'{label}: tap targets ≥ {MIN_TAP}px', not small, ', '.join(small))

def shot(page, name, full=False):
    page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)

def run():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.png'): os.remove(os.path.join(OUT, f))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=os.path.join(ROOT, 'public'))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{PORT}'
    with sync_playwright() as p:
        kw = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
        browser = p.chromium.launch(**kw)
        for fmt, vertical in (('es', False), ('es', True), ('us', False)):
            tag = f"{fmt}{'-vertical' if vertical else ''}"
            ctx = browser.new_context()
            if os.environ.get('SKIN'): ctx.add_init_script(f"localStorage.setItem('meca-skin', {json.dumps(os.environ['SKIN'])})")
            if EVENT: ctx.add_init_script(f"localStorage.setItem('meca-event', JSON.stringify({{pick: {json.dumps(EVENT)}, sug: null}}))")
            host = ctx.new_page(); host.set_viewport_size({'width': 1366, 'height': 850})
            host.goto(base + '/host.html?net=local'); host.evaluate('localStorage.clear()'); host.reload(); time.sleep(0.6)
            if tag == 'es':
                dates = host.evaluate("[[2026,0,3],[2026,6,1],[2026,11,1]].map(([y,m,d]) => Events.inDates([{from:'12-01',to:'01-06'}], new Date(y,m,d)))")
                check('event dates: 12-01→01-06 has Jan 3 and Dec 1, not Jul 1 (wraps over New Year)', dates == [True, False, True], str(dates))
                if EVENT:
                    check(f'host: special event "{EVENT}" on', host.evaluate('document.documentElement.dataset.event') == EVENT, str(host.evaluate('document.documentElement.dataset.event')))
                    check('host: event picker shows it pressed', host.evaluate(f"!!document.querySelector('#eventPick [data-event={json.dumps(EVENT)}][aria-pressed=true]') && !document.getElementById('eventWrap').classList.contains('hidden')"))
                else:
                    check('host: no special event', host.evaluate("!('event' in document.documentElement.dataset)"))
                # skins renamed to English ids: an old id saved on a device, or sent by an older host, maps to the new one
                old = browser.new_page(); old.add_init_script("localStorage.setItem('meca-skin', 'pista')")
                old.goto(base + '/host.html?net=local'); time.sleep(0.3)
                got = old.evaluate("[document.documentElement.dataset.skin, localStorage.getItem('meca-skin')]")
                check('skin: an old saved id (pista) migrates to dance-floor and is saved again', got == ['dance-floor', 'dance-floor'], str(got))
                got = old.evaluate("['pista', 'verbena', 'feria', 'mesa', 'clasico'].map(Skin.id)")
                check('skin: Skin.id maps the old ids to the new ones', got == ['dance-floor', 'street-party', 'flamenco-fair', 'board-game', 'classic'], str(got))
                old.close()
                # first screen: only "paste your playlist"
                for dev in ('desktop', 'phone-small'):
                    w, h = DEVICES[dev]; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                    shot(host, f'host-paste-{dev}'); page_checks(host, f'host paste ({dev})')
                    check(f'host paste ({dev}): playlist box visible without scrolling', host.evaluate("document.getElementById('plUrl').getBoundingClientRect().bottom < innerHeight"))
                # header language select: on Chrome the customizable select flips its arrow and keeps its list off the edges
                w, h = DEVICES['phone-portrait']; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                if host.evaluate("CSS.supports('appearance', 'base-select')"):
                    host.click('#lang'); time.sleep(0.4); shot(host, 'host-lang-open-phone')
                    r = host.evaluate(DROPDOWN_JS.replace('%SEL%', '#lang'))
                    check('host lang select (phone-portrait): open, arrow flipped', r['open'] and r['rot'] not in ('none', '0deg'), f"open={r['open']} rotate={r['rot']}")
                    check('host lang select (phone-portrait): list ≥ 24px from both edges', min(r['left'], r['right']) >= 24, f"left {r['left']}px, right {r['right']}px")
                    host.keyboard.press('Escape'); time.sleep(0.2)
                    check('host lang select (phone-portrait): Escape closes it', not host.evaluate("document.getElementById('lang').matches(':open')"))
                host.set_viewport_size({'width': 1366, 'height': 850})
            host.click('#tOrPaste'); host.fill('#paste', SONGS + ('\n' + '\n'.join(f'Extra Song {i} - Extra Artist' for i in range(20)) if fmt == 'us' else '')); host.click('#useList')
            host.click(f'#fmt [data-v="{fmt}"]')
            if tag == 'es': host.set_input_files('#photoIn', os.path.join(os.path.dirname(__file__), 'test-photo.jpg')); time.sleep(0.8)
            if vertical:
                # prize 1 → "line (also columns)" from the shapes gallery
                host.click('.pz[data-k="0"]'); time.sleep(0.3); host.click('#gal [data-preset="lineHV"]'); host.click('#shDone'); time.sleep(0.2)
            if fmt == 'us':
                host.click('#freeCenter')
                # add a drawn prize: three squares of the top row
                host.click('#addPrize'); time.sleep(0.3); host.click('#tabDraw')
                for dev in ('phone-portrait', 'desktop'):
                    w, h = DEVICES[dev]; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                    shot(host, f'host-draw-{dev}'); page_checks(host, f'prize editor draw ({dev})')
                host.click('#drawGrid [data-cell="0"]'); host.click('#drawGrid [data-cell="2"]'); host.click('#drawGrid [data-cell="4"]')
                host.click('#tabGal'); time.sleep(0.2)
                w, h = DEVICES['phone-portrait']; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                shot(host, 'host-gallery-phone'); page_checks(host, 'prize editor gallery (phone-portrait)')
                host.click('#tabDraw'); host.click('#shDone'); time.sleep(1.2)
                check('drawn prize added', host.evaluate("document.querySelectorAll('.pz[data-k]').length") == 3)
                check('prize estimates shown', 'canci' in host.inner_text('#prizeList').lower() or 'song' in host.inner_text('#prizeList').lower())
                shot(host, 'host-prizes-us-phone', full=True); page_checks(host, 'host setup us (phone-portrait)')
                host.set_viewport_size({'width': 1366, 'height': 850})
            if tag == 'es':
                for dev in ('desktop', 'phone-portrait'):
                    w, h = DEVICES[dev]; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                    shot(host, f'host-setup-{dev}', full=True); page_checks(host, f'host setup ({dev})')
                # special event dropdown: same icon slot in every option ("None" empty), event icons loaded, list on screen
                for dev in ('phone-small', 'desktop'):
                    w, h = DEVICES[dev]; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                    host.evaluate("document.getElementById('eventMenu').scrollIntoView({block: 'start'})"); host.click('#eventCur'); time.sleep(0.3)
                    ev = host.evaluate("""(() => { const o = [...document.querySelectorAll('#eventPick [data-event]')], s = o.map(b => b.querySelector('.evico')), p = document.getElementById('eventPick').getBoundingClientRect();
                      return {n: o.length, slots: s.map(e => e ? Math.round(e.getBoundingClientRect().width) : 0), imgs: o.filter(b => b.dataset.event).map(b => { const i = b.querySelector('.evico img'); return !!i && i.complete && i.naturalWidth > 0; }),
                        none: !s[0] || !s[0].children.length, inside: p.left >= 0 && p.right <= innerWidth, arrow: getComputedStyle(document.querySelector('#eventCur'), '::after').transform }; })()""")
                    check(f'host ({dev}): event options all start with an icon slot of the same width', ev['n'] >= 2 and len(set(ev['slots'])) == 1 and ev['slots'][0] > 0 and ev['none'], str(ev['slots']))
                    check(f'host ({dev}): every event option shows its icon (loaded)', ev['imgs'] and all(ev['imgs']), str(ev['imgs']))
                    check(f'host ({dev}): open event list inside the screen, arrow turned', ev['inside'] and ev['arrow'] not in ('none', ''), str(ev))
                    shot(host, f'host-event-menu-{dev}'); page_checks(host, f'host event menu open ({dev})')
                    host.keyboard.press('Escape'); time.sleep(0.1)
                    check(f'host ({dev}): Escape closes the event list', host.evaluate("!document.getElementById('eventMenu').open && document.activeElement.id === 'eventCur'"))
                host.set_viewport_size({'width': 1366, 'height': 850})
            if tag == 'es':
                host.click('#modePick [data-mode="auto"]'); time.sleep(0.2)
                check('auto mode without extension shows how to get it', host.is_visible('#extWarn'))
                w, h = DEVICES['phone-portrait']; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                shot(host, 'host-modes-phone', full=True); page_checks(host, 'host modes (phone-portrait)')
                host.set_viewport_size({'width': 1366, 'height': 850})
                host.click('#modePick [data-mode="manual"]')
            host.click('#create'); time.sleep(0.6)
            if tag == 'es':
                check('host game screen opens at the top', host.evaluate('scrollY') == 0, f"scrollY={host.evaluate('scrollY')}")
                check('game screen says the mode', 'manual' in host.inner_text('#modeBanner').lower())
                host.click('#helpBtn'); time.sleep(0.2); shot(host, 'host-help-desktop'); check('host rules help opens', host.is_visible('#help')); host.click('#helpOk')
            code = host.inner_text('#codeBig')
            player = ctx.new_page()
            player.goto(f'{base}/play.html?r={code}&net=local')
            player.evaluate("localStorage.removeItem('meca-dev'); localStorage.setItem('meca-name', JSON.stringify('Ana'))" + ("" if tag == 'es' else "; localStorage.setItem('meca-help-seen', '1')")); player.reload(); time.sleep(1)
            if tag == 'es':
                check('player: rules shown the first time', player.is_visible('#help'))
                player.set_viewport_size({'width': 375, 'height': 740}); time.sleep(0.5); shot(player, 'player-help-phone'); page_checks(player, 'player help (phone)', card=True)
                player.click('#helpOk'); time.sleep(0.2)
                check('player: a tap in portrait does not go full screen', player.evaluate('document.fullscreenElement === null'))
                w, h = DEVICES['phone-landscape']; player.set_viewport_size({'width': w, 'height': h}); time.sleep(0.3)  # an upright 3x9 card asks to turn the phone
            player.click('.cell[data-i] >> nth=0'); player.click('.cell[data-i] >> nth=2')
            if tag == 'es':
                time.sleep(0.3); check('player (phone-landscape): first tap goes full screen', player.evaluate('!!document.fullscreenElement'))
                player.evaluate('document.exitFullscreen()'); time.sleep(0.3)  # Playwright can't resize a full-screen window
                pev = player.evaluate("[document.documentElement.dataset.event || null, document.querySelectorAll('.evfx').length, !!document.querySelector('.evfx[data-fx=mark]')]")
                if EVENT:
                    check(f'player card: follows the host\'s event "{EVENT}" (state)', pev[0] == EVENT, str(pev[0]))
                    check('player: marking a cell shows the event\'s mark effect', pev[2])
                    bg = player.evaluate("(() => { const e = document.querySelector('.evbg'), s = e && getComputedStyle(e); return s ? [s.display, s.pointerEvents] : null; })()")
                    check('player: event background shown and lets taps through', bg and bg[0] != 'none' and bg[1] == 'none', str(bg))
                else:
                    check('player: no special event', pev[0] is None, str(pev[0]))
                    check('player: marking a cell adds no effect', pev[1] == 0, f'{pev[1]} .evfx')
            for dev, (w, h) in DEVICES.items():
                if tag != 'es' and dev in ('tablet', 'desktop'): continue
                player.set_viewport_size({'width': w, 'height': h}); time.sleep(0.4)
                shot(player, f'player-{tag}-{dev}'); page_checks(player, f'player card {tag} ({dev})', card=True)
                if dev == 'phone-landscape':
                    # landscape: prize and card number move up into the header row, CALL is a narrow column
                    r = player.evaluate("""(() => { const q = s => document.querySelector(s).getBoundingClientRect(), h = q('.head h1'), s = q('.head > .row'), b = q('#board');
                      const top = Math.min(h.top, s.top), bot = Math.max(h.bottom, s.bottom), off = ['#prize', '#cardNo'].filter(k => { const r = q(k), m = (r.top + r.bottom) / 2; return m < top || m > bot || m > b.top; });
                      return { off, w: Math.round(q('#callBtn').width) }; })()""")
                    check(f'player card {tag} ({dev}): prize and card number in the header row', not r['off'], ', '.join(r['off']) + ' outside it')
                    check(f'player card {tag} ({dev}): call button 56–64px wide', 56 <= r['w'] <= 64, f"{r['w']}px")
            if tag == 'es':
                # host game screen with a played song and a valid call shown
                host.click('#unlock'); host.click('#todo .song >> nth=0'); time.sleep(1.4)
                shot(host, 'host-photo-moment-desktop'); check('host: photo moment shows after a new song', host.is_visible('#moment'))
                host.click('#moment'); time.sleep(0.9)
                for dev in ('desktop', 'tablet', 'phone-portrait'):
                    w, h = DEVICES[dev]; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.3)
                    shot(host, f'host-game-{dev}', full=True); page_checks(host, f'host game ({dev})')
                w, h = DEVICES['phone-landscape']; player.set_viewport_size({'width': w, 'height': h})
                player.click('#callBtn'); time.sleep(0.8)
                shot(player, 'player-result-phone')
                if EVENT: check('player: the call shows the event\'s win/nope effect', player.evaluate("!!document.querySelector('.evfx[data-fx=win], .evfx[data-fx=nope]')"))
                host.set_viewport_size({'width': 1366, 'height': 850}); time.sleep(0.2); shot(host, 'host-call-desktop')
                # a new phone (no name yet, its own other skin): the name screen follows the host's skin
                hs = host.evaluate('document.documentElement.dataset.skin')
                own = next(k for k in ('street-party', 'dance-floor') if k != hs)
                fresh = ctx.new_page(); fresh.set_viewport_size({'width': 375, 'height': 740})
                fresh.add_init_script(f"localStorage.setItem('meca-skin', {json.dumps(own)}); localStorage.removeItem('meca-name')")
                fresh.goto(f'{base}/play.html?r={code}&net=local'); time.sleep(1)
                check('player name screen uses the host\'s skin', fresh.is_visible('#name') and fresh.evaluate('document.documentElement.dataset.skin') == hs, f"{fresh.evaluate('document.documentElement.dataset.skin')} vs host {hs}")
                if EVENT: check(f'player name screen follows the host\'s event "{EVENT}" (peek)', fresh.evaluate('document.documentElement.dataset.event') == EVENT, str(fresh.evaluate('document.documentElement.dataset.event')))
                check('player name screen keeps the phone\'s own saved skin', fresh.evaluate("localStorage.getItem('meca-skin')") == own)
                shot(fresh, 'player-name-phone'); page_checks(fresh, 'player name (phone)'); fresh.close()
            ctx.close()
        for lang in ('es', 'en'):
            for dev in (('phone-portrait', 'phone-small', 'tablet', 'desktop') if lang == 'es' else ('phone-small', 'desktop')):
                w, h = DEVICES[dev]; land = browser.new_page(viewport={'width': w, 'height': h}); land.goto(f'{base}/{lang}/'); time.sleep(0.5)
                shot(land, f'landing-{lang}-{dev}', full=True); page_checks(land, f'landing /{lang}/ ({dev})')
                # language menu: the arrow flips while open and the list keeps 24px off both edges
                closed = land.evaluate(MENU_ROT); land.click('.prefs>summary'); time.sleep(0.3)
                r = land.evaluate(DROPDOWN_JS.replace('%SEL%', '.prefs .pop'))
                if dev in ('phone-portrait', 'desktop'): shot(land, f'landing-{lang}-{dev}-menu')
                check(f'landing /{lang}/ ({dev}): language menu arrow flips when open', land.evaluate(MENU_ROT) != closed, f'{closed} both ways')
                check(f'landing /{lang}/ ({dev}): language menu ≥ 24px from both edges, no sideways scroll', min(r['left'], r['right']) >= 24 and r['hscroll'] <= 1, f"left {r['left']}px, right {r['right']}px, scroll {r['hscroll']}px")
                land.click('.prefs>summary'); time.sleep(0.3)
                check(f'landing /{lang}/ ({dev}): language menu closes, arrow back', land.evaluate(MENU_ROT) == closed and not land.evaluate("document.querySelector('.prefs').open"))
                land.close()
        browser.close()
    srv.shutdown()
    failed = [r for r in results if not r[1]]
    lines = ['# Meca Bingo · UX report', '', f'{len(results) - len(failed)}/{len(results)} checks passed', '']
    lines += [f"- {'✅' if ok else '❌'} {n}" + (f' — {d}' if (d and not ok) else '') for n, ok, d in results]
    lines += ['', 'Screenshots:', ''] + [f'- {f}' for f in sorted(os.listdir(OUT)) if f.endswith('.png')]
    open(os.path.join(OUT, 'report.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('\n'.join(lines[:3] + [l for l in lines if l.startswith('- ❌')]))
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(run())

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

# A dropdown (details.dd): is it open, its arrow's rotate, where its list is and the sideways scroll
DROPDOWN_JS = r"""
(() => {
  const d = document.querySelector('%SEL%'), r = d.querySelector('.dd-pop').getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(innerWidth - r.right), open: d.open,
    rot: getComputedStyle(d.querySelector('summary'), '::after').rotate, hscroll: document.documentElement.scrollWidth - innerWidth };
})()
"""
# Chips (.svc, .pill) whose text is below WCAG AA (4.5:1) on their effective background:
# own background-color composited over the ancestors' until one is opaque, --page as the last fallback
CHIP_CONTRAST_JS = r"""
(() => {
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#0000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => { const a = f[3] + b[3] * (1 - f[3]); return a ? [0, 1, 2].map(i => (f[i] * f[3] + b[i] * b[3] * (1 - f[3])) / a).concat(a) : [0, 0, 0, 0]; };
  const lum = c => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const page = rgba(getComputedStyle(document.documentElement).getPropertyValue('--page').trim() || '#fff');
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  return [...document.querySelectorAll('.svc, .pill')].filter(vis).map(e => {
    let bg = [0, 0, 0, 0];
    for (let n = e; n && bg[3] < 1; n = n.parentElement) bg = over(bg, rgba(getComputedStyle(n).backgroundColor));
    if (bg[3] < 1) bg = over(bg, [...page.slice(0, 3), 1]);
    const fg = over(rgba(getComputedStyle(e).color), bg), [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return { text: e.textContent.trim().slice(0, 24) || e.id, ratio: Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100 };
  }).filter(c => c.ratio < 4.5);
})()
"""

def chip_contrast(page, label):
    low = page.evaluate(CHIP_CONTRAST_JS)
    check(f'{label}: chip text contrast ≥ 4.5:1', not low, ', '.join(f"{c['text']} {c['ratio']}:1" for c in low))

MENU_ROT = "getComputedStyle(document.querySelector('%SEL% > summary'), '::after').rotate"

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
    chip_contrast(page, label)

# The leave confirmation (#modal, a native <dialog>): open with Cancel focused, Tab kept inside, Escape = Cancel
MODAL_JS = r"""
(() => { const d = document.getElementById('modal');
  return { open: d.open, modal: d.matches(':modal'), focus: document.activeElement.id,
    aria: [d.getAttribute('role'), d.getAttribute('aria-modal'), d.getAttribute('aria-labelledby'), d.getAttribute('aria-describedby')].join(' ') }; })()
"""

def confirm_checks(page, label, screen, shot_name, small=False):
    url = page.url
    page.click('#homeLink'); time.sleep(0.2)
    m = page.evaluate(MODAL_JS)
    check(f'{label}: leave confirmation opens as a modal dialog', m['open'] and m['modal'], str(m))
    check(f'{label}: confirmation is an alertdialog labelled by its title and text', m['aria'] == 'alertdialog true mTitle mText', m['aria'])
    check(f'{label}: confirmation focuses Cancel', m['focus'] == 'mNo', m['focus'])
    page.keyboard.press('Tab'); page.keyboard.press('Tab')
    check(f'{label}: Tab stays inside the confirmation', page.evaluate("document.getElementById('modal').contains(document.activeElement)"), page.evaluate('document.activeElement.id'))
    page.keyboard.press('Shift+Tab'); page.keyboard.press('Shift+Tab')
    check(f'{label}: Shift+Tab stays inside the confirmation', page.evaluate("document.getElementById('modal').contains(document.activeElement)"), page.evaluate('document.activeElement.id'))
    if screen == '#game':
        behind = page.evaluate("(() => { const b = document.getElementById('endBtn'); b.focus(); return [b.matches(':focus'), document.activeElement.id]; })()")
        check(f'{label}: page behind the confirmation is inert', not behind[0], str(behind))
    shot(page, shot_name); page_checks(page, f'{label} confirmation')
    if small:
        vp = page.viewport_size; w, h = DEVICES['phone-small']; page.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
        page_checks(page, f'{label} confirmation (phone-small)'); page.set_viewport_size(vp); time.sleep(0.2)
    page.keyboard.press('Escape'); time.sleep(0.2)
    after = page.evaluate(f"[document.getElementById('modal').open, document.activeElement.id, !document.querySelector('{screen}').classList.contains('hidden')]")
    check(f'{label}: Escape closes the confirmation, back on the opener, still in the game', not after[0] and after[1] == 'homeLink' and after[2] and page.url == url, str(after) + ' ' + page.url)

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
                # header language dropdown: the arrow flips while open and the list keeps 24px off both edges
                w, h = DEVICES['phone-portrait']; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                host.click('#lang>summary'); time.sleep(0.4); shot(host, 'host-lang-open-phone')
                r = host.evaluate(DROPDOWN_JS.replace('%SEL%', '#lang'))
                check('host lang dropdown (phone-portrait): open, arrow flipped', r['open'] and r['rot'] not in ('none', '0deg'), f"open={r['open']} rotate={r['rot']}")
                check('host lang dropdown (phone-portrait): list ≥ 24px from both edges, no sideways scroll', min(r['left'], r['right']) >= 24 and r['hscroll'] <= 1, f"left {r['left']}px, right {r['right']}px, scroll {r['hscroll']}px")
                host.keyboard.press('Escape'); time.sleep(0.2)
                check('host lang dropdown (phone-portrait): Escape closes it', host.evaluate("!document.getElementById('lang').open && document.activeElement === document.querySelector('#lang>summary')"))
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
                    ev = host.evaluate("""(() => { const o = [...document.querySelectorAll('#eventPick [data-v]')], s = o.map(b => b.querySelector('.evico')), p = document.getElementById('eventPick').getBoundingClientRect();
                      return {n: o.length, slots: s.map(e => e ? Math.round(e.getBoundingClientRect().width) : 0), imgs: o.filter(b => b.dataset.v).map(b => { const i = b.querySelector('.evico img'); return !!i && i.complete && i.naturalWidth > 0; }),
                        none: !s[0] || !s[0].children.length, inside: p.left >= 0 && p.right <= innerWidth, arrow: getComputedStyle(document.querySelector('#eventCur'), '::after').rotate }; })()""")
                    check(f'host ({dev}): event options all start with an icon slot of the same width', ev['n'] >= 2 and len(set(ev['slots'])) == 1 and ev['slots'][0] > 0 and ev['none'], str(ev['slots']))
                    check(f'host ({dev}): every event option shows its icon (loaded)', ev['imgs'] and all(ev['imgs']), str(ev['imgs']))
                    check(f'host ({dev}): open event list inside the screen, arrow turned', ev['inside'] and ev['arrow'] not in ('none', '0deg', ''), str(ev))
                    shot(host, f'host-event-menu-{dev}'); page_checks(host, f'host event menu open ({dev})')
                    host.keyboard.press('Escape'); time.sleep(0.1)
                    check(f'host ({dev}): Escape closes the event list', host.evaluate("!document.getElementById('eventMenu').open && document.activeElement.id === 'eventCur'"))
                host.set_viewport_size({'width': 1366, 'height': 850})
                # "More options": with the full song the gap dropdown stays shut; picking a song length updates the summary and closes the list
                host.click('#tMore'); time.sleep(0.2)
                host.click('#gap>summary'); time.sleep(0.2)
                check('host: with the full song the gap dropdown does not open', not host.evaluate("document.getElementById('gap').open"))
                host.click('#clip>summary'); time.sleep(0.2); want = host.inner_text('#clip [data-v="30"]'); host.click('#clip [data-v="30"]'); time.sleep(0.2)
                got = host.evaluate("[document.getElementById('clip').open, document.querySelector('#clip>summary').innerText, document.querySelector('#clip [data-v=\"30\"]').getAttribute('aria-pressed'), JSON.parse(localStorage.getItem('meca-host')).cfg.clip, document.querySelector('#gap>summary').getAttribute('aria-disabled')]")
                check('host: picking a song length closes the list, shows it, saves it and enables the gap', got == [False, want, 'true', 30, 'false'], str(got))
                host.click('#gap>summary'); time.sleep(0.2); check('host: with a song length the gap dropdown opens', host.evaluate("document.getElementById('gap').open"))
                host.click('#gap [data-v="next"]'); host.click('#clip>summary'); host.click('#clip [data-v="0"]'); host.click('#tMore'); time.sleep(0.2)
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
                ctx.set_offline(True); time.sleep(0.3)
                b = host.evaluate("[document.getElementById('modeBanner').className, document.getElementById('modeBanner').innerText, I18N.get(document.documentElement.lang).roomOffline]")
                check('offline: the game banner warns players cannot join', 'warn' in b[0].split() and b[1].strip() == b[2], str(b[:2]))
                shot(host, 'host-offline')
                ctx.set_offline(False); time.sleep(0.3)
                check('back online: the banner says manual again', 'manual' in host.inner_text('#modeBanner').lower())
                j = host.evaluate("(() => { const a = document.querySelector('#joinUrl'); return [a.tagName, a.target, a.rel, a.href]; })()")
                check('host: join URL is a link that opens in a new tab', j[0] == 'A' and j[1] == '_blank' and 'noopener' in j[2].split(), str(j[:3]))
                check('host: join link goes to the player page of this game', j[3].endswith(f"play.html?r={host.inner_text('#codeBig')}&net=local"), j[3])
                host.click('#helpBtn'); time.sleep(0.2); shot(host, 'host-help-desktop'); check('host rules help opens', host.is_visible('#help')); host.click('#helpOk')
                w, h = DEVICES['phone-portrait']; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.3)
                confirm_checks(host, 'host game (phone-portrait)', '#game', 'host-confirm-phone', small=True)
                host.set_viewport_size({'width': 1366, 'height': 850}); time.sleep(0.2)
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
                lg = player.evaluate("[!document.querySelector('#play').classList.contains('hidden'), !!document.querySelector('.head h1 a'), !!document.getElementById('homeLink'), getComputedStyle(document.querySelector('.head h1')).cursor]")
                check('player card: logo is not a link', lg[0] and not lg[1] and not lg[2] and lg[3] != 'pointer', str(lg))
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
                    r = host.evaluate("(() => { const r = document.querySelector('#joinUrl').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
                    check(f'host game ({dev}): join link tap target ≥ 40px', min(r) >= 40, f'{r[0]}x{r[1]}px')
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
                rot = MENU_ROT.replace('%SEL%', '.prefs')
                closed = land.evaluate(rot); land.click('.prefs>summary'); time.sleep(0.3)
                r = land.evaluate(DROPDOWN_JS.replace('%SEL%', '.prefs'))
                if dev in ('phone-portrait', 'desktop'): shot(land, f'landing-{lang}-{dev}-menu')
                check(f'landing /{lang}/ ({dev}): language menu arrow flips when open', land.evaluate(rot) != closed, f'{closed} both ways')
                check(f'landing /{lang}/ ({dev}): language menu ≥ 24px from both edges, no sideways scroll', min(r['left'], r['right']) >= 24 and r['hscroll'] <= 1, f"left {r['left']}px, right {r['right']}px, scroll {r['hscroll']}px")
                land.click('.prefs>summary'); time.sleep(0.3)
                check(f'landing /{lang}/ ({dev}): language menu closes, arrow back', land.evaluate(rot) == closed and not land.evaluate("document.querySelector('.prefs').open"))
                land.close()
        # chips readable on every skin: landing hero + final section, host paste screen
        skins = json.load(open(os.path.join(ROOT, 'site', 'skins', 'skins.json'), encoding='utf-8'))['order']
        for skin in skins:
            ctx = browser.new_context(viewport={'width': 1366, 'height': 850})
            ctx.add_init_script(f"localStorage.setItem('meca-skin', {json.dumps(skin)})")
            pg = ctx.new_page()
            for path, name, png in (('/en/', 'landing /en/', 'landing'), ('/host.html?net=local', 'host paste', 'host-paste')):
                pg.goto(base + path); time.sleep(0.4)
                shot(pg, f'chips-{skin}-{png}', full=True); chip_contrast(pg, f'skin {skin} · {name} (desktop)')
            ctx.close()
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

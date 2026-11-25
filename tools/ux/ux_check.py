#!/usr/bin/env python3
"""Automatic UX/UI check for Meca Bingo.

Plays a small game in a headless browser (host + player, ?net=local), takes screenshots of every
screen on several devices and runs layout checks. Results go to ux-report/ (report.md + PNGs).
Exit code 1 if a check fails, so CI marks the commit.

    pip install playwright && python -m playwright install chromium
    python3 tools/ux/ux_check.py            # uses ./public, port 8099
    CHROME=/usr/bin/google-chrome python3 tools/ux/ux_check.py
    SKIN=feria python3 tools/ux/ux_check.py   # check one skin (default: pista); report in ux-report/
    UX_PORT=8098 python3 tools/ux/ux_check.py # another port, e.g. to run two checks at once
"""
import functools, http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'ux-report')
SONGS = open(os.path.join(os.path.dirname(__file__), 'songs.txt')).read()
PORT = int(os.environ.get('UX_PORT', 8099))
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
            host = ctx.new_page(); host.set_viewport_size({'width': 1366, 'height': 850})
            host.goto(base + '/host.html?net=local'); host.evaluate('localStorage.clear()'); host.reload(); time.sleep(0.6)
            if tag == 'es':
                # first screen: only "paste your playlist"
                for dev in ('desktop', 'phone-small'):
                    w, h = DEVICES[dev]; host.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
                    shot(host, f'host-paste-{dev}'); page_checks(host, f'host paste ({dev})')
                    check(f'host paste ({dev}): playlist box visible without scrolling', host.evaluate("document.getElementById('plUrl').getBoundingClientRect().bottom < innerHeight"))
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
                w, h = DEVICES['phone-landscape']; player.set_viewport_size({'width': w, 'height': h}); time.sleep(0.3)  # an upright 3x9 card asks to turn the phone
            player.click('.cell[data-i] >> nth=0'); player.click('.cell[data-i] >> nth=2')
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
                shot(player, 'player-result-phone'); host.set_viewport_size({'width': 1366, 'height': 850}); time.sleep(0.2); shot(host, 'host-call-desktop')
                # a new phone (no name yet, its own other skin): the name screen follows the host's skin
                hs = host.evaluate('document.documentElement.dataset.skin')
                own = next(k for k in ('verbena', 'pista') if k != hs)
                fresh = ctx.new_page(); fresh.set_viewport_size({'width': 375, 'height': 740})
                fresh.add_init_script(f"localStorage.setItem('meca-skin', {json.dumps(own)}); localStorage.removeItem('meca-name')")
                fresh.goto(f'{base}/play.html?r={code}&net=local'); time.sleep(1)
                check('player name screen uses the host\'s skin', fresh.is_visible('#name') and fresh.evaluate('document.documentElement.dataset.skin') == hs, f"{fresh.evaluate('document.documentElement.dataset.skin')} vs host {hs}")
                check('player name screen keeps the phone\'s own saved skin', fresh.evaluate("localStorage.getItem('meca-skin')") == own)
                shot(fresh, 'player-name-phone'); page_checks(fresh, 'player name (phone)'); fresh.close()
            ctx.close()
        for lang in ('es', 'en'):
            for dev in (('phone-portrait', 'phone-small', 'tablet', 'desktop') if lang == 'es' else ('phone-small', 'desktop')):
                w, h = DEVICES[dev]; land = browser.new_page(viewport={'width': w, 'height': h}); land.goto(f'{base}/{lang}/'); time.sleep(0.5)
                shot(land, f'landing-{lang}-{dev}', full=True); page_checks(land, f'landing /{lang}/ ({dev})'); land.close()
        browser.close()
    srv.shutdown()
    failed = [r for r in results if not r[1]]
    lines = ['# Meca Bingo · UX report', '', f'{len(results) - len(failed)}/{len(results)} checks passed', '']
    lines += [f"- {'✅' if ok else '❌'} {n}" + (f' — {d}' if (d and not ok) else '') for n, ok, d in results]
    lines += ['', 'Screenshots:', ''] + [f'- {f}' for f in sorted(os.listdir(OUT)) if f.endswith('.png')]
    open(os.path.join(OUT, 'report.md'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines[:3] + [l for l in lines if l.startswith('- ❌')]))
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(run())

#!/usr/bin/env python3
"""Landing screenshots, one set per skin.

    python3 tools/site/screenshots.py            # all skins
    python3 tools/site/screenshots.py feria      # one skin

Plays a small game in a headless browser (host + one player, ?net=local) and saves:
  public/img/skins/<skin>/host.jpg|webp     host screen, 1280×800
  public/img/skins/<skin>/player.jpg|webp   player's card, 390×760
The default skin's pictures are also copied to public/img/host.* and player.* (the landing's
HTML and the share preview use those). js/skin.js swaps the landing pictures when the skin changes.
"""
import functools, http.server, io, json, os, re, shutil, sys, threading, time
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUB = os.path.join(ROOT, 'public')
UX = os.path.join(ROOT, 'tools', 'ux')
INDEX = json.load(open(os.path.join(ROOT, 'site', 'skins', 'skins.json'), encoding='utf-8'))
DEFAULT, SKINS = INDEX['default'], INDEX['order']
SONGS = open(os.path.join(UX, 'songs.txt'), encoding='utf-8').read()
PORT = 8098


def save(png, folder, name):
    img = Image.open(io.BytesIO(png)).convert('RGB')
    img.save(os.path.join(folder, name + '.jpg'), quality=82, optimize=True, progressive=True)
    img.save(os.path.join(folder, name + '.webp'), quality=80, method=6)


def shoot(browser, base, skin):
    out = os.path.join(PUB, 'img', 'skins', skin); os.makedirs(out, exist_ok=True)
    ctx = browser.new_context(device_scale_factor=1)
    ctx.add_init_script(f"localStorage.setItem('meca-skin', {json.dumps(skin)}); localStorage.setItem('meca-lang', JSON.stringify('en'))")
    host = ctx.new_page(); host.set_viewport_size({'width': 1280, 'height': 800})
    host.goto(base + '/host.html?net=local'); host.evaluate('localStorage.clear()'); host.reload(); time.sleep(0.6)
    host.click('#tOrPaste'); host.fill('#paste', SONGS); host.click('#useList')
    host.click('#fmt [data-v="es"]')
    host.set_input_files('#photoIn', os.path.join(UX, 'test-photo.jpg')); time.sleep(0.8)
    host.click('#modePick [data-mode="manual"]')
    host.click('#create'); time.sleep(0.6)
    code = host.inner_text('#codeBig')
    player = ctx.new_page(); player.set_viewport_size({'width': 390, 'height': 760})
    player.goto(f'{base}/play.html?r={code}&net=local')
    player.evaluate("localStorage.removeItem('meca-dev'); localStorage.setItem('meca-name', JSON.stringify('Ana')); localStorage.setItem('meca-help-seen', '1')")
    player.reload(); time.sleep(1)
    if player.is_visible('#help'): player.click('#helpOk')
    # play three songs on the host (closing each photo moment), then mark them on the card
    host.click('#unlock')
    for _ in range(3):
        if not host.is_visible('#todo'): host.click('#unlock')
        host.click('#todo .song >> nth=0'); time.sleep(1.2)
        if host.is_visible('#moment'): host.click('#moment'); time.sleep(0.9)
    played = host.evaluate("[...document.querySelectorAll('#done .song .t div')].map(e => e.textContent.trim())")
    if host.is_visible('#relock'): host.click('#relock')        # song names hidden, as in a real game
    cells = player.query_selector_all('.cell[data-i]')
    marked = 0
    for c in cells:
        if any(t and t in c.inner_text() for t in played): c.click(); marked += 1
    for c in cells[:max(0, 3 - marked)]: c.click()          # the card may hold none of them
    time.sleep(0.5)
    # show the real address instead of the local test server
    site = json.load(open(os.path.join(ROOT, 'site.config.json')))['canonical']
    host.evaluate('''([from, to]) => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.nodeValue.includes(from)) w.currentNode.nodeValue = w.currentNode.nodeValue.replaceAll(from, to); }''', [base.split('//')[1], site])
    host.evaluate('scrollTo(0, 0)'); time.sleep(0.3)
    save(host.screenshot(), out, 'host'); save(player.screenshot(), out, 'player')
    ctx.close()
    if skin == DEFAULT:
        for n in ('host', 'player'):
            for ext in ('jpg', 'webp'): shutil.copyfile(os.path.join(out, f'{n}.{ext}'), os.path.join(PUB, 'img', f'{n}.{ext}'))
    print('saved', skin)


def main():
    want = sys.argv[1:] or SKINS
    for s in want:
        if s not in SKINS: raise SystemExit(f'unknown skin {s}; skins: {", ".join(SKINS)}')
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=PUB))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        kw = {'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}
        browser = p.chromium.launch(**kw)
        for s in want: shoot(browser, f'http://127.0.0.1:{PORT}', s)
        browser.close()
    srv.shutdown()


if __name__ == '__main__':
    main()

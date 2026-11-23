#!/usr/bin/env python3
"""End-to-end test of the extension with fake music players.

    python3 tools/build_extension.py && python3 tools/ext/players_e2e.py
    (set CHROME=/path/to/chrome to use an installed Chrome)

For each supported player (except Amazon import/start, which needs the real site) it opens a
page that behaves like the player (Media Session title/artist + media-key handlers) on the
player's real address, opens the host page, and checks that the host page sees the player,
receives the song that is playing and can skip to the next song.
"""
import json, os, sys, tempfile, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, 'dist', 'chrome')
PUB = os.path.join(ROOT, 'public')
SITE = json.load(open(os.path.join(ROOT, 'site.config.json')))['domains'][-1]   # the workers.dev address
PLAYERS = json.load(open(os.path.join(ROOT, 'extension', 'players.json')))['players']
FAKE = '''<!doctype html><title>fake player</title><body><audio id=a loop src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="></audio>
<script>
let i=0; const songs=[['Song One','Artist A'],['Song Two','Artist B'],['Song Three','Artist C']]; window.log=[];
function show(){ navigator.mediaSession.metadata=new MediaMetadata({title:songs[i][0],artist:songs[i][1]}); }
navigator.mediaSession.setActionHandler('play',()=>{log.push('play');navigator.mediaSession.playbackState='playing'});
navigator.mediaSession.setActionHandler('pause',()=>{log.push('pause');navigator.mediaSession.playbackState='paused'});
navigator.mediaSession.setActionHandler('nexttrack',()=>{log.push('next');i=(i+1)%3;show()});
navigator.mediaSession.setActionHandler('previoustrack',()=>{log.push('prev');i=(i+2)%3;show()});
show(); navigator.mediaSession.playbackState='playing';
</script>'''
def serve_site(route):
    path = '/' + route.request.url.split('/', 3)[3].split('?')[0]
    path = path if path != '/' else '/index.html'
    if path in ('/', ''): path = '/index.html'
    if path == '/host': path = '/host.html'
    try: body = open(PUB + path, 'rb').read()
    except Exception: return route.fulfill(status=404, body='')
    ct = 'text/html' if path.endswith('.html') else 'application/javascript' if path.endswith('.js') else 'text/css' if path.endswith('.css') else 'application/octet-stream'
    route.fulfill(status=200, body=body, headers={'content-type': ct})
ok = True
with sync_playwright() as p:
    for pl_cfg in PLAYERS:
        name, url = pl_cfg['name'], pl_cfg['matches'][0].replace('*', 'test')
        args = [f'--disable-extensions-except={EXT}', f'--load-extension={EXT}', '--autoplay-policy=no-user-gesture-required']
        if os.environ.get('CHROME'):
            kw = dict(executable_path=os.environ['CHROME'], headless=False, args=['--headless=new'] + args)
        else:
            kw = dict(channel='chromium', headless=True, args=args)
        ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), **kw)
        host_root = url.split('/')[0] + '//' + url.split('/')[2]
        ctx.route(host_root + '/**', lambda r: r.fulfill(status=200, body=FAKE, headers={'content-type': 'text/html'}))
        ctx.route(f'https://{SITE}/**', serve_site)
        host = ctx.new_page(); host.goto(f'https://{SITE}/host.html')
        host.evaluate("window.got=[];addEventListener('message',e=>{if(e.data&&e.data.__mbExt)got.push(e.data)})")
        pl = ctx.new_page(); pl.goto(url); time.sleep(3.5)
        ask = lambda m: host.evaluate("m=>new Promise(r=>{const id=Math.random();addEventListener('message',function h(e){if(e.data&&e.data.__mbExt&&e.data.id===id){removeEventListener('message',h);r(e.data)}});postMessage(Object.assign({__mbPage:true,id},m),'*')})", m)
        st = ask({'type': 'getState'})
        nx = ask({'type': 'control', 'action': 'next'}); time.sleep(2.5)
        tracks = [g['title'] for g in host.evaluate('got') if g.get('type') == 'track']
        log = pl.evaluate('window.log')
        good = st.get('player') and nx.get('ok') and 'Song One' in tracks and 'Song Two' in tracks and 'next' in log
        ok &= bool(good)
        print(('OK ' if good else 'FAIL'), name, '| state', st, '| next', nx.get('ok'), '| tracks', tracks, '| player log', log)
        ctx.close()
print('all players OK' if ok else 'SOME PLAYERS FAILED')
sys.exit(0 if ok else 1)

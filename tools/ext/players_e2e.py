#!/usr/bin/env python3
"""End-to-end test of the extension with fake music players.

    python3 tools/build_extension.py && python3 tools/ext/players_e2e.py
    (set CHROME=/path/to/chrome to use an installed Chrome)

For each supported player (except Amazon import/start, which needs the real site) it opens a
page that behaves like the player (Media Session title/artist + media-key handlers) on the
player's real address, opens the host page, and checks that the host page sees the player,
receives the song that is playing, follows play/pause (a muted video playing does not count),
can skip to the next song, and that a second host page opened later gets the song in getState.
During the game (the host's getState) the player tab must be covered with its title "Meca Bingo",
also after the song changes; "Show the player" reveals the page and its title, the next song covers it again.
For the players START can only open (all but Amazon): the bridge's "ready" says open: true, and with no player
tab open, "open" opens the player's address in a tab and brings the host page back to the front.
"""
import base64, json, os, struct, sys, tempfile, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, 'dist', 'chrome')
PUB = os.path.join(ROOT, 'public')
SITE = json.load(open(os.path.join(ROOT, 'site.config.json'), encoding='utf-8'))['domains'][-1]   # the workers.dev address
PLAYERS = json.load(open(os.path.join(ROOT, 'extension', 'players.json'), encoding='utf-8'))['players']
# half a second of real (silent) samples, so the <audio> really plays, loops and pauses
WAV = 'data:audio/wav;base64,' + base64.b64encode(b'RIFF' + struct.pack('<I', 36 + 4000) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 8000, 1, 8) + b'data' + struct.pack('<I', 4000) + b'\x80' * 4000).decode()
# the music is the <audio>; the muted looping <video> stands for Spotify Canvas / motion artwork, which keeps playing when the music pauses
FAKE = '''<!doctype html><title>fake player</title><body><audio id=a loop src="WAV"></audio><video id=v muted loop src="WAV"></video>
<script>
let i=0; const songs=[['Song One','Artist A'],['Song Two','Artist B'],['Song Three','Artist C']]; window.log=[];
function show(){ navigator.mediaSession.metadata=new MediaMetadata({title:songs[i][0],artist:songs[i][1]}); document.title=songs[i][0]+' - '+songs[i][1]; }
navigator.mediaSession.setActionHandler('play',()=>{log.push('play');a.play();navigator.mediaSession.playbackState='playing'});
navigator.mediaSession.setActionHandler('pause',()=>{log.push('pause');a.pause();navigator.mediaSession.playbackState='paused'});
navigator.mediaSession.setActionHandler('nexttrack',()=>{log.push('next');i=(i+1)%3;show()});
navigator.mediaSession.setActionHandler('previoustrack',()=>{log.push('prev');i=(i+2)%3;show()});
show(); v.muted=true; v.play(); a.play(); navigator.mediaSession.playbackState='playing';
</script>'''.replace('WAV', WAV)
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
        covered = lambda: pl.evaluate("!!document.getElementById('mb-cover') && document.title === 'Meca Bingo'")
        hidden = covered()
        pushed = lambda: [g['playing'] for g in host.evaluate('got') if g.get('type') == 'state' and 'id' not in g]
        def after_toggle(want):   # toggle, then wait up to ~2 s for getState and the pushed state to show `want`
            ask({'type': 'control', 'action': 'toggle'})
            for _ in range(10):
                time.sleep(0.2)
                g, pu = ask({'type': 'getState'}).get('playing'), pushed()
                if g == want and pu and pu[-1] == want: break
            return g == want and bool(pu) and pu[-1] == want
        start = st.get('playing') is True and pushed()[-1:] == [True]
        paused = after_toggle(False) and pl.evaluate('!v.paused && a.paused')
        resumed = after_toggle(True) and pl.evaluate('!a.paused')
        nx = ask({'type': 'control', 'action': 'next'}); time.sleep(2.5)
        tracks = [g['title'] for g in host.evaluate('got') if g.get('type') == 'track']
        log = pl.evaluate('window.log')
        hidden = hidden and covered()   # still covered after the song changed
        host = ctx.new_page(); host.goto(f'https://{SITE}/host.html'); time.sleep(1)   # opened after the song started: it missed the push
        late = (ask({'type': 'getState'}).get('track') or {}).get('title')
        tall = pl.evaluate("document.getElementById('mb-cover-show').offsetHeight") >= 40
        pl.click('#mb-cover-show'); time.sleep(0.5)
        revealed = pl.evaluate("!document.getElementById('mb-cover') && document.title === 'Song Two - Artist B'")
        ask({'type': 'control', 'action': 'next'}); time.sleep(1)
        recovered = covered()
        cover_ok = hidden and tall and revealed and recovered
        opened = 'skipped'
        if not pl_cfg.get('start'):   # START opens the player tab, then the host comes back
            ready = host.evaluate("new Promise(r=>{addEventListener('message',e=>{if(e.data&&e.data.__mbExt&&e.data.type==='ready')r(e.data)});postMessage({__mbPage:true,type:'hello'},'*')})")
            pl.close(); time.sleep(0.5)
            none = ask({'type': 'getState'}).get('player') is False
            # a tab the extension opens loads before Playwright's routes apply to it: load it again, now as the fake player
            ctx.on('page', lambda pg: pg.goto(url))
            op = ask({'type': 'open', 'url': url})
            tab = any(pg.url == url and pg.title() in ('Song One - Artist A', 'Meca Bingo') for pg in ctx.pages)
            visible = host.evaluate('document.visibilityState') == 'visible'
            opened = {'ready open': ready.get('open') is True, 'no tab before': none, 'open ok': op.get('ok') is True, 'tab': tab, 'host visible': visible}
            cover_ok = cover_ok and all(opened.values())
        good = st.get('player') and start and paused and resumed and nx.get('ok') and 'Song One' in tracks and 'Song Two' in tracks and 'next' in log and late == 'Song Two' and cover_ok
        ok &= bool(good)
        print(('OK ' if good else 'FAIL'), name, '| state', st, '| playing at start', start, '| paused after toggle (muted video playing)', paused, '| playing after toggle', resumed, '| next', nx.get('ok'), '| tracks', tracks, '| player log', log, '| late host song', late, '| covered in game', hidden, '| button >= 40px', tall, '| revealed', revealed, '| covered on next song', recovered, '| START opens', opened)
        ctx.close()
print('all players OK' if ok else 'SOME PLAYERS FAILED')
sys.exit(0 if ok else 1)

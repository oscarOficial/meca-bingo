#!/usr/bin/env python3
"""Upload a new version to Microsoft Edge Add-ons and submit it for review (Publish API v1.1).

    EDGE_PRODUCT_ID=... EDGE_CLIENT_ID=... EDGE_API_KEY=... \
        python3 tools/ext/edge_publish.py public/download/meca-bingo-sync-chrome.zip

Edge takes the same package as Chrome. The extension must already exist in Partner Center
(the first version is uploaded by hand). Credentials: Partner Center → Edge → Publish API →
Create API credentials (Client ID + API key; the key expires, the page shows when).
Exits 1 with the API's message if the upload or the submission fails.
"""
import json, os, sys, time, urllib.error, urllib.request
sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')

API = os.environ.get('EDGE_API_BASE', 'https://api.addons.microsoftedge.microsoft.com').rstrip('/') + '/v1/products/'
PRODUCT, CLIENT, KEY = (os.environ.get(k, '').strip() for k in ('EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'))
POLL_SECS, POLL_TRIES = float(os.environ.get('EDGE_POLL_SECS', '10')), 60
# Edge asks for certification notes with every submission
NOTES = ('No account is needed for the extension itself. To test it: open https://mecabingo.oscasais.es/host.html, '
         'paste a public playlist link (or a few "Song - Artist" lines), choose Automatic mode and create the game. '
         'Then open a music web player in another tab (open.spotify.com, music.youtube.com, www.deezer.com or '
         'music.apple.com) and play a song: the host page shows the song as marked, and its play/pause/next buttons '
         'control the player. Playing music needs a free account on that music service. The code is plain, not '
         'minified. Source: https://github.com/oscarOficial/meca-bingo (folder extension/).')


def call(method, url, data=None, ctype=None):
    headers = {'Authorization': 'ApiKey ' + KEY, 'X-ClientID': CLIENT}
    if ctype: headers['Content-Type'] = ctype
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, res.headers, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def fail(what, detail):
    sys.exit(f'Edge: {what} failed: {detail}')


def start(what, method, url, data, ctype):
    """Start an operation; the API answers 202 with the operation id in the Location header."""
    status, headers, body = call(method, url, data, ctype)
    op = (headers.get('Location') or '').rstrip('/').split('/')[-1]
    if status != 202 or not op:
        fail(what, f'HTTP {status} {body.decode(errors="replace")[:500]}')
    return op


def wait(what, url):
    for _ in range(POLL_TRIES):
        status, _, body = call('GET', url)
        try: d = json.loads(body or b'{}')
        except ValueError: d = {}
        state = d.get('status')
        if status == 200 and state == 'Succeeded':
            return d
        if status >= 400 or state == 'Failed':
            fail(what, json.dumps(d)[:800] if d else f'HTTP {status}')
        time.sleep(POLL_SECS)
    fail(what, 'no answer after waiting')


def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    if not (PRODUCT and CLIENT and KEY): sys.exit('Edge: set EDGE_PRODUCT_ID, EDGE_CLIENT_ID and EDGE_API_KEY')
    zip_path = sys.argv[1]
    base = API + PRODUCT + '/submissions'
    with open(zip_path, 'rb') as f: package = f.read()
    op = start('package upload', 'POST', base + '/draft/package', package, 'application/zip')
    print('Edge: package uploaded, checking it…')
    wait('package check', f'{base}/draft/package/operations/{op}')
    op = start('submission', 'POST', base, json.dumps({'notes': NOTES}).encode(), 'application/json')
    wait('submission', f'{base}/operations/{op}')
    print('Edge: submitted for review')


if __name__ == '__main__':
    main()

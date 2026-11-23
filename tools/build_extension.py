#!/usr/bin/env python3
"""Build the Meca Bingo Sync extension for each browser from extension/.

    python3 tools/build_extension.py

Writes dist/<browser>/ folders and public/download/meca-bingo-sync-<browser>.zip
  chrome  - Chrome, Edge, Brave, Opera (service worker background)
  firefox - Firefox 128+ (event page background, gecko id)
  safari  - input for Apple's converter / Safari Web Extension Packager
"""
import json, os, re, shutil, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'extension')
FILES = ['background.js', 'bridge.js', 'provider.js', 'mainworld.js', 'popup.html', 'popup.js', 'icons']
GECKO_ID = 'meca-bingo-sync@oscasais.workers.dev'  # never change: identifies the add-on on Firefox


def js_list(items):
    return json.dumps(items).replace('"', "'").replace("','", "', '")


def sync_players():
    """Write the music players from extension/players.json into the manifest and scripts."""
    players = json.load(open(os.path.join(SRC, 'players.json')))['players']
    every = [m for p in players for m in p['matches']]
    importers = [m for p in players if p.get('import') for m in p['matches']]
    mp = os.path.join(SRC, 'manifest.json')
    m = json.load(open(mp))
    for cs in m['content_scripts']:
        if 'provider.js' in cs['js'] or 'mainworld.js' in cs['js']:
            old = set(cs['matches']); cs['matches'] = every
    m['host_permissions'] = every + [p for p in m['host_permissions'] if p not in old and p not in every]
    m['web_accessible_resources'][0]['matches'] = every
    names = [p['name'] for p in players]
    json.dump(m, open(mp, 'w'), indent=2); open(mp, 'a').write('\n')
    p = os.path.join(SRC, 'background.js'); s = open(p).read()
    s = re.sub(r"const AMAZON = \[[^\]]*\];", 'const AMAZON = ' + js_list(importers) + ';', s)
    s = re.sub(r"const PLAYERS = \[[^\]]*\];", 'const PLAYERS = ' + js_list(every) + ';', s)
    open(p, 'w').write(s)
    p = os.path.join(SRC, 'popup.js'); s = open(p).read()
    s = re.sub(r"const PLAYER_NAMES = '[^']*';", "const PLAYER_NAMES = '" + ', '.join(names) + "';", s)
    open(p, 'w').write(s)
    print('players:', ', '.join(names))


def set_version(version=None, bump=None):
    """Set or bump the extension version (x.y.z) in extension/manifest.json."""
    mp = os.path.join(SRC, 'manifest.json'); m = json.load(open(mp))
    if bump:
        a, b, c = (int(x) for x in m['version'].split('.'))
        version = {'major': f'{a+1}.0.0', 'minor': f'{a}.{b+1}.0', 'patch': f'{a}.{b}.{c+1}'}[bump]
    if version:
        m['version'] = version
        json.dump(m, open(mp, 'w'), indent=2); open(mp, 'a').write('\n')
    return m['version']


def sync_domains():
    """Write the domains from site.config.json into the extension sources."""
    cfg = json.load(open(os.path.join(ROOT, 'site.config.json')))
    sites = [f'https://{d}/*' for d in dict.fromkeys([cfg['canonical']] + cfg.get('domains', []))]
    mp = os.path.join(SRC, 'manifest.json')
    m = json.load(open(mp))
    bridge = next(cs for cs in m['content_scripts'] if 'bridge.js' in cs['js'])
    old = set(bridge['matches'])
    bridge['matches'] = sites
    m['host_permissions'] = [p for p in m['host_permissions'] if p not in old] + sites
    m['homepage_url'] = f"https://{cfg['canonical']}/"
    json.dump(m, open(mp, 'w'), indent=2); open(mp, 'a').write('\n')
    for f in ('background.js', 'popup.js'):
        p = os.path.join(SRC, f); s = open(p).read()
        s = re.sub(r"const SITE = \[[^\]]*\];", 'const SITE = ' + json.dumps(sites).replace('"', "'").replace("','", "', '") + ';', s)
        open(p, 'w').write(s)
    p = os.path.join(SRC, 'popup.html'); s = open(p).read()
    c = cfg['canonical']
    s = re.sub(r'<a href="https://[^/"]+/host\.html" target="_blank">[^<]+</a>', f'<a href="https://{c}/host.html" target="_blank">{c}</a>', s)
    open(p, 'w').write(s)
    print('domains:', ', '.join(sites))

def manifest_for(browser):
    m = json.load(open(os.path.join(SRC, 'manifest.json')))
    if browser == 'firefox':
        m['background'] = {'scripts': ['background.js']}
        m['browser_specific_settings'] = {'gecko': {'id': GECKO_ID, 'strict_min_version': '128.0', 'data_collection_permissions': {'required': ['none']}}}
    elif browser == 'safari':
        m['background'] = {'scripts': ['background.js'], 'persistent': False}
        m['browser_specific_settings'] = {'safari': {'strict_min_version': '17.0'}}
    return m

def build(browser):
    out = os.path.join(ROOT, 'dist', browser)
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    for f in FILES:
        s = os.path.join(SRC, f)
        (shutil.copytree if os.path.isdir(s) else shutil.copy)(s, os.path.join(out, f))
    json.dump(manifest_for(browser), open(os.path.join(out, 'manifest.json'), 'w'), indent=2)
    z = os.path.join(ROOT, 'public', 'download', f'meca-bingo-sync-{browser}.zip')
    os.makedirs(os.path.dirname(z), exist_ok=True)
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
        for d, _, fs in os.walk(out):
            for f in fs:
                p = os.path.join(d, f); zf.write(p, os.path.relpath(p, out))
    print(browser, '->', os.path.relpath(z, ROOT))

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Build the extension for every browser.')
    ap.add_argument('--version', help='set this version, e.g. 1.2.0')
    ap.add_argument('--bump', choices=['major', 'minor', 'patch'], help='raise the version')
    a = ap.parse_args()
    print('version:', set_version(a.version, a.bump))
    sync_players()
    sync_domains()
    for b in ('chrome', 'firefox', 'safari'):
        build(b)
    # keep the old download name working (Chrome build)
    shutil.copy(os.path.join(ROOT, 'public/download/meca-bingo-sync-chrome.zip'), os.path.join(ROOT, 'public/download/meca-bingo-sync.zip'))

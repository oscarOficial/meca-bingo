#!/usr/bin/env python3
"""Build the Meca Bingo Sync extension for each browser from extension/.

    python3 tools/build_extension.py

Writes dist/<browser>/ folders and public/download/meca-bingo-sync-<browser>.zip
  chrome  - Chrome, Edge, Brave, Opera (service worker background)
  firefox - Firefox 128+ (event page background, gecko id)
  safari  - input for Apple's converter / Safari Web Extension Packager
"""
import json, os, shutil, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'extension')
FILES = ['background.js', 'bridge.js', 'provider.js', 'mainworld.js', 'popup.html', 'popup.js', 'icons']
GECKO_ID = 'meca-bingo-sync@oscasais.workers.dev'

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
    for b in ('chrome', 'firefox', 'safari'):
        build(b)
    # keep the old download name working (Chrome build)
    shutil.copy(os.path.join(ROOT, 'public/download/meca-bingo-sync-chrome.zip'), os.path.join(ROOT, 'public/download/meca-bingo-sync.zip'))

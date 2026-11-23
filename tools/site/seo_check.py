#!/usr/bin/env python3
"""Basic SEO checks for the landing pages (runs in CI).

    python3 tools/site/seo_check.py
"""
import json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LANGS = list(json.load(open(os.path.join(ROOT, 'site', 'landing.i18n.json'))))
SITE = json.load(open(os.path.join(ROOT, 'site.config.json')))['canonical']


class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.tags = []; self.text = {'title': '', 'h1': ''}; self._in = None
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))
        if tag in self.text: self._in = tag
    def handle_endtag(self, tag):
        if tag == self._in: self._in = None
    def handle_data(self, d):
        if self._in: self.text[self._in] += d


fails, n = [], 0
def check(ok, msg):
    global n; n += 1
    if not ok: fails.append(msg)

for lang in LANGS:
    path = os.path.join(ROOT, 'public', lang, 'index.html')
    p = Page(); p.feed(open(path, encoding='utf-8').read())
    tags = lambda t, **kw: [a for g, a in p.tags if g == t and all(a.get(k) == v for k, v in kw.items())]
    url = f'https://{SITE}/{lang}/'
    title = p.text['title'].strip()
    desc = (tags('meta', name='description') or [{}])[0].get('content', '')
    check(tags('html') and tags('html')[0].get('lang') == lang, f'/{lang}/: <html lang="{lang}">')
    check(10 <= len(title) <= 70, f'/{lang}/: title 10–70 characters ({len(title)})')
    check(70 <= len(desc) <= 160, f'/{lang}/: description 70–160 characters ({len(desc)})')
    check(len(tags('h1')) == 1 and p.text['h1'].strip(), f'/{lang}/: exactly one non-empty <h1>')
    check([a.get('href') for a in tags('link', rel='canonical')] == [url], f'/{lang}/: canonical is {url}')
    hl = {a.get('hreflang'): a.get('href') for a in tags('link', rel='alternate') if a.get('hreflang')}
    check(all(hl.get(l) == f'https://{SITE}/{l}/' for l in LANGS) and 'x-default' in hl, f'/{lang}/: hreflang for every language + x-default')
    check(any(a.get('property') == 'og:url' and a.get('content') == url for a in tags('meta')), f'/{lang}/: og:url')
    check(any(a.get('property') == 'og:image' for a in tags('meta')), f'/{lang}/: og:image')
    imgs = tags('img')
    check(all('alt' in a for a in imgs), f'/{lang}/: every image has alt')
    check(all(a.get('width') and a.get('height') for a in imgs), f'/{lang}/: every image has width/height')
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', open(path, encoding='utf-8').read(), re.S)
    try: types = [json.loads(x)['@type'] for x in lds]
    except Exception: types = []
    check({'WebApplication', 'FAQPage'} <= set(types), f'/{lang}/: structured data (WebApplication, FAQPage)')
    check(not re.search(r'data-(?:t|list)="\w+"></', open(path, encoding='utf-8').read()), f'/{lang}/: all text is in the HTML')

print(f'{n - len(fails)}/{n} SEO checks passed')
for f in fails: print('- ❌', f)
sys.exit(1 if fails else 0)

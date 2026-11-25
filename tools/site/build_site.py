#!/usr/bin/env python3
"""Build the landing page in every language as plain HTML (good for search engines).

    python3 tools/site/build_site.py          # writes public/<lang>/index.html and public/index.html
    python3 tools/site/build_site.py --check  # fails if the committed pages are out of date (CI)

Sources:
  site/landing.template.html   layout; elements with data-t="key" / data-list="key" get the text
  site/landing.i18n.json       texts per language (add a language = add a block here)
  site.config.json             canonical domain

The pages contain the final text (no JavaScript needed to read them), their own title and
description, canonical and hreflang links, Open Graph tags and structured data (JSON-LD).
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATE = os.path.join(ROOT, 'site', 'landing.template.html')
STRINGS = os.path.join(ROOT, 'site', 'landing.i18n.json')
CONFIG = os.path.join(ROOT, 'site.config.json')
DEFAULT = 'en'                         # x-default (search engines, unknown languages)
OG_LOCALE = {'en': 'en_US', 'es': 'es_ES', 'fr': 'fr_FR', 'de': 'de_DE', 'it': 'it_IT', 'nl': 'nl_NL', 'pl': 'pl_PL', 'sk': 'sk_SK'}
esc = lambda s: html.escape(str(s), quote=True)


def head(lang, t, langs, site):
    url = f'https://{site}/{lang}/'
    alts = '\n'.join(f'<link rel="alternate" hreflang="{l}" href="https://{site}/{l}/">' for l in langs)
    alts += f'\n<link rel="alternate" hreflang="x-default" href="https://{site}/">'
    og_alts = '\n'.join(f'<meta property="og:locale:alternate" content="{OG_LOCALE.get(l, l)}">' for l in langs if l != lang)
    app = {
        '@context': 'https://schema.org', '@type': 'WebApplication', 'name': 'Meca Bingo', 'url': url,
        'description': t['metaDesc'], 'inLanguage': lang, 'applicationCategory': 'GameApplication',
        'operatingSystem': 'Any (web browser)', 'isAccessibleForFree': True,
        'image': f'https://{site}/img/host.jpg', 'screenshot': f'https://{site}/img/host.jpg',
        'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR'},
    }
    faq = {
        '@context': 'https://schema.org', '@type': 'FAQPage', 'inLanguage': lang,
        'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in t['faq']],
    }
    howto = {
        '@context': 'https://schema.org', '@type': 'HowTo', 'name': t['howTitle'], 'description': t['howLead'], 'inLanguage': lang,
        'step': [{'@type': 'HowToStep', 'position': i, 'name': t[f's{i}t'], 'text': t[f's{i}p']} for i in range(1, 5)],
    }
    ld = '\n'.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in (app, faq, howto))
    return f'''<title>{esc(t['metaTitle'])}</title>
<meta name="description" content="{esc(t['metaDesc'])}">
<link rel="canonical" href="{url}">
{alts}
<link rel="icon" href="/favicon.png">
<link rel="apple-touch-icon" href="/img/logo.png">
<meta name="theme-color" content="#0d0b1a">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Meca Bingo">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(t['metaTitle'])}">
<meta property="og:description" content="{esc(t['ogDesc'])}">
<meta property="og:image" content="https://{site}/img/host.jpg">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="800">
<meta property="og:image:alt" content="{esc(t['altHost'])}">
<meta property="og:locale" content="{OG_LOCALE.get(lang, lang)}">
{og_alts}
<meta name="twitter:card" content="summary_large_image">
{ld}'''


SERVICES = ['Spotify', 'Deezer', 'Apple Music', 'YouTube Music', 'Amazon Music']
# game modes shown on the landing: card type, shape (cells lit on the logical grid)
MODES = [('es', 'line', list(range(5, 10))), ('es', 'two', list(range(0, 5)) + list(range(10, 15))), ('us', 'corners', [0, 4, 20, 24]),
         ('us', 'x', [0, 6, 12, 18, 24, 4, 8, 16, 20]), ('us', 'stamp', [0, 1, 5, 6]), ('us', 'diamond', [2, 6, 8, 10, 14, 16, 18, 22]),
         ('us', 'frame', [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]), ('es', 'full', list(range(15))), ('us', 'custom', [1, 3, 10, 14, 16, 17, 18])]


ES_COLS = [[0, 2, 4, 5, 8], [1, 3, 6, 7, 8], [0, 1, 2, 5, 7]]   # same sample card as patterns-ui.js


def pattern_svg(fmt, on, label):
    if fmt == 'es':
        cells = ''.join(f'<rect x="{c * 12}" y="{r * 12}" width="10" height="10" rx="2.4" class="{("pon" if r * 5 + ES_COLS[r].index(c) in on else "poff") if c in ES_COLS[r] else "pgap"}"/>'
                        for r in range(3) for c in range(9))
        return f'<svg class="es9" viewBox="-1 -1 108 36" role="img" aria-label="{esc(label)}">{cells}</svg>'
    rows, cols = (3, 5) if fmt == 'es' else (5, 5)
    cells = ''.join(f'<rect x="{c * 12}" y="{r * 12}" width="10" height="10" rx="2.4" class="{"pon" if r * cols + c in on else "poff"}"/>'
                    for r in range(rows) for c in range(cols))
    return f'<svg viewBox="-1 -1 {cols * 12} {rows * 12}" role="img" aria-label="{esc(label)}">{cells}</svg>'


def render(lang, L, site):
    t = L[lang]
    s = open(TEMPLATE, encoding='utf-8').read()
    s = s.replace('{{HEAD}}', head(lang, t, list(L), site))
    s = s.replace('{{SERVICES}}', ''.join(f'<span class="svc">{esc(n)}</span>' for n in SERVICES))
    s = s.replace('{{MODES}}', ''.join(f'<div class="mode">{pattern_svg(f, set(on), t["modes"][k][0])}<b>{esc(t["modes"][k][0])}</b><span>{esc(t["modes"][k][1])}</span></div>' for f, k, on in MODES))
    s = s.replace('{{LANGS}}', ''.join(
        f'<a href="/{l}/" hreflang="{l}" lang="{l}"' + (' aria-current="page"' if l == lang else '') + f'>{esc(L[l]["langName"])}</a>' for l in L))
    s = re.sub(r'\{\{(\w+)\}\}', lambda m: esc(lang if m.group(1) == 'lang' else t[m.group(1)]), s)
    # data-t="key": fill the element's text
    s = re.sub(r'(<(\w+)\b[^>]*\bdata-t="(\w+)"[^>]*>)(</\2>)', lambda m: m.group(1) + esc(t[m.group(3)]) + m.group(4), s)
    # data-list="key": fill <li> items
    s = re.sub(r'(<(\w+)\b[^>]*\bdata-list="(\w+)"[^>]*>)(</\2>)', lambda m: m.group(1) + ''.join(f'<li>{esc(x)}</li>' for x in t[m.group(3)]) + m.group(4), s)
    s = s.replace('<div class="feat" id="feat"></div>', '<div class="feat" id="feat">' + ''.join(
        f'<div><b>{esc(a)}</b><span>{esc(b)}</span></div>' for a, b in t['feats']) + '</div>')
    s = s.replace('<tbody id="provRows"></tbody>', '<tbody id="provRows">' + ''.join(
        f'<tr><td><b>{esc(n)}</b></td><td class="{c1}">{esc(a)}</td><td class="{c2}">{esc(b)}</td></tr>' for n, c1, a, c2, b in t['prov']) + '</tbody>')
    s = s.replace('<div id="faqList" style="margin-top:20px"></div>', '<div id="faqList" style="margin-top:20px">' + ''.join(
        f'<details class="q"><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in t['faq']) + '</div>')
    # modern image format with the JPEG as fallback
    s = re.sub(r'<img ([^>]*?)src="/img/(host|player|moment)\.jpg"([^>]*)>',
               lambda m: f'<picture><source srcset="/img/{m.group(2)}.webp" type="image/webp"><img {m.group(1)}src="/img/{m.group(2)}.jpg"{m.group(3)}></picture>', s)
    left = re.findall(r'\{\{\w+\}\}|data-(?:t|list)="\w+"></', s)
    if left: raise SystemExit(f'{lang}: unfilled {left[:5]}')
    return s


def root_page(L):
    # Only used when the files are served without the Worker (local tests); the Worker sends "/"
    # to /<lang>/ by itself, using the browser's language.
    langs = json.dumps(list(L))
    return f'''<!DOCTYPE html>
<html lang="{DEFAULT}"><head><meta charset="utf-8"><title>Meca Bingo</title>
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=/{DEFAULT}/">
<script>const L = {langs}, l = (navigator.language || '').slice(0, 2); location.replace('/' + (L.includes(l) ? l : '{DEFAULT}') + '/');</script>
</head><body><a href="/{DEFAULT}/">Meca Bingo</a></body></html>
'''


def build():
    L = json.load(open(STRINGS, encoding='utf-8'))
    site = json.load(open(CONFIG, encoding='utf-8'))['canonical']
    out = {os.path.join('public', l, 'index.html'): render(l, L, site) for l in L}
    out[os.path.join('public', 'index.html')] = root_page(L)
    return out


if __name__ == '__main__':
    pages = build()
    if '--check' in sys.argv:
        stale = [p for p, c in pages.items() if not os.path.exists(os.path.join(ROOT, p)) or open(os.path.join(ROOT, p), encoding='utf-8').read() != c]
        if stale:
            print('Out of date, run: python3 tools/site/build_site.py\n  ' + '\n  '.join(stale)); sys.exit(1)
        print('landing pages up to date'); sys.exit(0)
    for p, c in pages.items():
        os.makedirs(os.path.dirname(os.path.join(ROOT, p)), exist_ok=True)
        open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(c)
        print('wrote', p)

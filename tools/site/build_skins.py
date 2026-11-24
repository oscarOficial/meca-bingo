#!/usr/bin/env python3
"""Build the skins ("Pick your mood") from site/skins/.

    python3 tools/site/build_skins.py          # writes the files below
    python3 tools/site/build_skins.py --check  # fails if they are out of date or a skin is invalid (CI)

Sources (one folder per skin, see site/skins/README.md):
  site/skins/skins.json        default skin and the order shown to people
  site/skins/<id>/skin.json    names and descriptions per language, theme colour, colour scheme, fonts
  site/skins/<id>/tokens.css   token values (declarations only)
  site/skins/<id>/decor.css    optional: decorations and landing art direction; `:skin` = this skin

Writes:
  public/css/skins.css   every skin, scoped to html[data-skin=<id>]
  public/css/fonts.css   the skin fonts (between the skins:fonts markers)
  public/js/skin.js      the skin list (between the skins:registry markers)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'site', 'skins')
APP_CSS = os.path.join(ROOT, 'public', 'css', 'app.css')
OUT_CSS = os.path.join(ROOT, 'public', 'css', 'skins.css')
FONTS = os.path.join(ROOT, 'public', 'css', 'fonts.css')
SKIN_JS = os.path.join(ROOT, 'public', 'js', 'skin.js')
FONT_DIR = os.path.join(ROOT, 'public', 'fonts')
LANGS = list(json.load(open(os.path.join(ROOT, 'site', 'landing.i18n.json'), encoding='utf-8')))
ALLOWED_PROPS = {'font-synthesis'}          # plain properties a tokens.css may set besides tokens
ID = re.compile(r'^[a-z][a-z0-9-]{1,30}$')
errors = []


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def base_tokens():
    """Token names defined in app.css :root: the contract a skin may override."""
    root = re.search(r':root\{(.*?)\}', strip_comments(open(APP_CSS, encoding='utf-8').read()), re.S).group(1)
    return set(re.findall(r'(--[\w-]+)\s*:', root))


def read_skin(sid, tokens_ok):
    d = os.path.join(SRC, sid)
    meta = json.load(open(os.path.join(d, 'skin.json'), encoding='utf-8'))
    for key in ('name', 'description'):
        missing = [l for l in LANGS if not meta.get(key, {}).get(l)]
        if missing: errors.append(f'{sid}: skin.json "{key}" is missing {", ".join(missing)}')
    if not re.match(r'^#[0-9a-fA-F]{6}$', meta.get('themeColor', '')): errors.append(f'{sid}: skin.json needs "themeColor": "#rrggbb"')
    if meta.get('colorScheme') not in (None, 'light', 'dark'): errors.append(f'{sid}: "colorScheme" must be light or dark')
    for f in meta.get('fonts', []):
        if not os.path.exists(os.path.join(FONT_DIR, f['file'])): errors.append(f'{sid}: font file public/fonts/{f["file"]} not found')
    tokens = strip_comments(open(os.path.join(d, 'tokens.css'), encoding='utf-8').read()).strip()
    if '{' in tokens or '}' in tokens: errors.append(f'{sid}: tokens.css holds declarations only (no selectors or braces)')
    for name in re.findall(r'(?:^|;)\s*([\w-]+)\s*:', tokens):
        if name.startswith('--_'): continue                                  # private to this skin
        if name.startswith('--'):
            if name not in tokens_ok: errors.append(f'{sid}: tokens.css sets {name}, which is not a token (typo? add it to app.css :root first)')
        elif name not in ALLOWED_PROPS: errors.append(f'{sid}: tokens.css may only set tokens (and {", ".join(sorted(ALLOWED_PROPS))}), not "{name}"')
    decor_p = os.path.join(d, 'decor.css')
    decor = open(decor_p, encoding='utf-8').read() if os.path.exists(decor_p) else ''
    if decor and ':skin' not in decor: errors.append(f'{sid}: decor.css rules must start with :skin')
    return meta, tokens, decor


def css_for(sid, meta, tokens, decor):
    scope = f'html[data-skin={sid}]'
    decls = ';\n  '.join(x.strip() for x in tokens.split(';') if x.strip())
    if meta.get('colorScheme'): decls += (';\n  ' if decls else '') + f'color-scheme:{meta["colorScheme"]}'
    out = [f'/* ---------- {sid} · {meta["name"]["en"]} ---------- */']
    if decls: out.append(f'{scope}{{\n  {decls}\n}}')
    if decor.strip(): out.append(re.sub(r':skin\b', scope, decor.strip()))
    return '\n'.join(out)


def replace_between(text, start, end, body, where):
    i, j = text.find(start), text.find(end)
    if i < 0 or j < i: raise SystemExit(f'{where}: markers {start!r} … {end!r} not found')
    return text[:i + len(start)] + '\n' + body + text[j:]


def build():
    index = json.load(open(os.path.join(SRC, 'skins.json'), encoding='utf-8'))
    order, default = index['order'], index['default']
    if default not in order: errors.append(f'skins.json: default "{default}" is not in "order"')
    tokens_ok = base_tokens()
    skins = {}
    for sid in order:
        if not ID.match(sid): errors.append(f'skins.json: "{sid}" is not a valid id (a-z, 0-9, -)'); continue
        if not os.path.isdir(os.path.join(SRC, sid)): errors.append(f'skins.json: folder site/skins/{sid}/ not found'); continue
        skins[sid] = read_skin(sid, tokens_ok)
    if errors: return None

    css = ['/* GENERATED by tools/site/build_skins.py from site/skins/ — edit the skin folders, not this file. */']
    css += [css_for(sid, *skins[sid]) for sid in order]
    out = {OUT_CSS: '\n\n'.join(css) + '\n'}

    faces, seen = [], set()
    for sid in order:
        for f in skins[sid][0].get('fonts', []):
            key = (f['family'], f['weight'], f['file'])
            if key in seen: continue
            seen.add(key)
            faces.append(f"@font-face{{font-family:'{f['family']}';font-style:normal;font-weight:{f['weight']};font-display:swap;src:url(../fonts/{f['file']}) format('woff2')}}")
    out[FONTS] = replace_between(open(FONTS, encoding='utf-8').read(), '/* skins:fonts:start */', '/* skins:fonts:end */',
                                 '/* generated by tools/site/build_skins.py: each file is only downloaded when its skin is on */\n' + '\n'.join(faces) + '\n', 'fonts.css')

    reg = {sid: {'color': skins[sid][0]['themeColor'], 'name': skins[sid][0]['name'], 'description': skins[sid][0]['description']} for sid in order}
    body = f"  const DEF = {json.dumps(default)}, SKINS = {json.dumps(reg, ensure_ascii=False)};\n  "
    out[SKIN_JS] = replace_between(open(SKIN_JS, encoding='utf-8').read(),
                                   '// skins:registry:start (generated by tools/site/build_skins.py from site/skins/ — do not edit here)',
                                   '// skins:registry:end', body, 'skin.js')
    return out


def main():
    check = '--check' in sys.argv
    out = build()
    if errors:
        print('\n'.join('✗ ' + e for e in errors)); sys.exit(1)
    stale = [p for p, s in out.items() if not os.path.exists(p) or open(p, encoding='utf-8').read() != s]
    if check:
        if stale: print('Out of date (run python3 tools/site/build_skins.py):\n' + '\n'.join('  ' + os.path.relpath(p, ROOT) for p in stale)); sys.exit(1)
        print('skins up to date'); return
    for p in stale:
        open(p, 'w', encoding='utf-8', newline='\n').write(out[p]); print('wrote', os.path.relpath(p, ROOT))
    if not stale: print('nothing to do')


if __name__ == '__main__':
    main()

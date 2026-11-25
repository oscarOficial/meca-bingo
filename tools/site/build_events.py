#!/usr/bin/env python3
"""Build the special events (a seasonal layer on top of any skin) from site/events/.

    python3 tools/site/build_events.py          # writes the files below
    python3 tools/site/build_events.py --check  # fails if they are out of date or an event is invalid (CI)

Sources (one folder per event, see site/events/README.md):
  site/events/events.json       events shown in the host's picker (order) and built but never shown (hidden)
  site/events/<id>/event.json   names per language, suggested dates, effects
  site/events/<id>/layer.css    background and effects; `:event` = this event

Writes:
  public/css/events.css   every event, scoped to html[data-event=<id>]
  public/js/events.js     the event list (between the events:registry markers)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'site', 'events')
APP_CSS = os.path.join(ROOT, 'public', 'css', 'app.css')
OUT_CSS = os.path.join(ROOT, 'public', 'css', 'events.css')
EVENTS_JS = os.path.join(ROOT, 'public', 'js', 'events.js')
LANGS = list(json.load(open(os.path.join(ROOT, 'site', 'landing.i18n.json'), encoding='utf-8')))
ID = re.compile(r'^[a-z][a-z0-9-]{1,30}$')
DATE = re.compile(r'^(\d\d)-(\d\d)$')
DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
HOOKS, CONFETTI = {'win', 'nope', 'mark', 'moment'}, {'colors', 'emoji'}
errors = []


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def base_tokens():
    """Token names defined in app.css :root: the skin's look, which an event must not change."""
    root = re.search(r':root\{(.*?)\}', strip_comments(open(APP_CSS, encoding='utf-8').read()), re.S).group(1)
    return set(re.findall(r'(--[\w-]+)\s*:', root))


def blocks(css):
    """Top-level (prelude, body) pairs of a stylesheet."""
    out, i, depth, start = [], 0, 0, 0
    while i < len(css):
        c = css[i]
        if c == '{':
            if depth == 0: prelude, open_at = css[start:i].strip(), i
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: out.append((prelude, css[open_at + 1:i])); start = i + 1
        elif c == ';' and depth == 0: start = i + 1                         # @import / @charset
        i += 1
    if depth: out.append(('', ''))                                           # unbalanced: reported by the caller
    return out


def check_layer(eid, css, tokens):
    for prelude, body in blocks(css):
        if not prelude: errors.append(f'{eid}: layer.css has unbalanced braces'); continue
        if prelude.startswith('@keyframes'): continue
        if prelude.startswith('@media'): check_layer(eid, body, tokens); continue
        if prelude.startswith('@'): errors.append(f'{eid}: layer.css may only use @keyframes and @media, not "{prelude.split()[0]}"'); continue
        bad = [s.strip() for s in prelude.split(',') if not s.strip().startswith(':event')]
        if bad: errors.append(f'{eid}: layer.css rules must start with :event ("{bad[0]}")')
        for name in re.findall(r'(?:^|;)\s*(--[\w-]+)\s*:', body):
            if name in tokens: errors.append(f'{eid}: layer.css sets {name}, a token of the skin (colours and fonts stay the mood\'s; use a private --_name)')


def read_event(eid, tokens):
    d = os.path.join(SRC, eid)
    meta = json.load(open(os.path.join(d, 'event.json'), encoding='utf-8'))
    missing = [l for l in LANGS if not meta.get('name', {}).get(l)]
    if missing: errors.append(f'{eid}: event.json "name" is missing {", ".join(missing)}')
    dates = meta.get('dates', [])
    if not isinstance(dates, list): errors.append(f'{eid}: "dates" must be a list of {{"from": "MM-DD", "to": "MM-DD"}}'); dates = []
    for r in dates:
        for k in ('from', 'to'):
            m = DATE.match(str(r.get(k, '')) if isinstance(r, dict) else '')
            if not m or not (1 <= int(m[1]) <= 12 and 1 <= int(m[2]) <= DAYS[int(m[1]) - 1]):
                errors.append(f'{eid}: dates "{k}" must be a real date as "MM-DD", not {json.dumps(r.get(k) if isinstance(r, dict) else r)}')
    effects = meta.get('effects', {})
    if not isinstance(effects, dict): errors.append(f'{eid}: "effects" must be an object'); effects = {}
    for hook, fx in effects.items():
        if hook not in HOOKS: errors.append(f'{eid}: effects "{hook}" is not a hook ({", ".join(sorted(HOOKS))})'); continue
        if not isinstance(fx, dict) or set(fx) - {'confetti'}: errors.append(f'{eid}: effects "{hook}" may only hold "confetti"'); continue
        c = fx.get('confetti', {})
        if not isinstance(c, dict) or set(c) - CONFETTI: errors.append(f'{eid}: effects "{hook}" confetti may only hold {", ".join(sorted(CONFETTI))}'); continue
        if any(not re.match(r'^#[0-9a-fA-F]{6}$', str(x)) for x in c.get('colors', [])): errors.append(f'{eid}: effects "{hook}" confetti colors must be "#rrggbb"')
        if any(not isinstance(x, str) or not x for x in c.get('emoji', [])): errors.append(f'{eid}: effects "{hook}" confetti emoji must be strings')
    layer_p = os.path.join(d, 'layer.css')
    if not os.path.exists(layer_p): errors.append(f'{eid}: layer.css not found'); return meta, ''
    layer = open(layer_p, encoding='utf-8').read()
    check_layer(eid, strip_comments(layer), tokens)
    return meta, layer


def replace_between(text, start, end, body, where):
    i, j = text.find(start), text.find(end)
    if i < 0 or j < i: raise SystemExit(f'{where}: markers {start!r} … {end!r} not found')
    return text[:i + len(start)] + '\n' + body + text[j:]


def build():
    index = json.load(open(os.path.join(SRC, 'events.json'), encoding='utf-8'))
    order, hidden = index.get('order', []), index.get('hidden', [])
    ids = order + hidden
    for eid in sorted(set(ids)):
        if ids.count(eid) > 1: errors.append(f'events.json: "{eid}" is listed more than once (in "order" or "hidden", not both)')
    tokens = base_tokens()
    events = {}
    for eid in dict.fromkeys(ids):
        if not ID.match(eid): errors.append(f'events.json: "{eid}" is not a valid id (a-z, 0-9, -)'); continue
        if not os.path.isdir(os.path.join(SRC, eid)): errors.append(f'events.json: folder site/events/{eid}/ not found'); continue
        events[eid] = read_event(eid, tokens)
    if errors: return None

    css = ['/* GENERATED by tools/site/build_events.py from site/events/ — edit the event folders, not this file. */']
    for eid, (meta, layer) in events.items():
        css.append(f'/* ---------- {eid} · {meta["name"]["en"]} ---------- */\n' + re.sub(r':event\b', f'html[data-event={eid}]', layer.strip()))
    out = {OUT_CSS: '\n\n'.join(css) + '\n'}

    reg = {}
    for eid, (meta, _) in events.items():
        reg[eid] = {'name': meta['name'], 'dates': meta.get('dates', []), 'effects': meta.get('effects', {})}
        if eid in hidden: reg[eid]['hidden'] = True
    body = f"  const ORDER = {json.dumps(order)}, EVENTS = {json.dumps(reg, ensure_ascii=False)};\n  "
    out[EVENTS_JS] = replace_between(open(EVENTS_JS, encoding='utf-8').read(),
                                     '// events:registry:start (generated by tools/site/build_events.py from site/events/ — do not edit here)',
                                     '// events:registry:end', body, 'events.js')
    return out


def main():
    check = '--check' in sys.argv
    out = build()
    if errors:
        print('\n'.join('✗ ' + e for e in errors)); sys.exit(1)
    stale = [p for p, s in out.items() if not os.path.exists(p) or open(p, encoding='utf-8').read() != s]
    if check:
        if stale: print('Out of date (run python3 tools/site/build_events.py):\n' + '\n'.join('  ' + os.path.relpath(p, ROOT) for p in stale)); sys.exit(1)
        print('events up to date'); return
    for p in stale:
        open(p, 'w', encoding='utf-8', newline='\n').write(out[p]); print('wrote', os.path.relpath(p, ROOT))
    if not stale: print('nothing to do')


if __name__ == '__main__':
    main()

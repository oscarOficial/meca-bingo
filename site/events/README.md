# Special events ("Special event")

A special event is a layer on top of any skin (e.g. Dance floor + Christmas): a fun, animated
background and effects for the game's moments (marking a cell, a valid call, a wrong one, the
photo moment). Colours and fonts stay the skin's.

Each event is one folder here. `python3 tools/site/build_events.py` turns the folders into
`public/css/events.css` and the event list in `public/js/events.js`. CI runs it with `--check`:
it fails if an event is invalid or the built files are out of date.

```
site/events/
  events.json         events shown in the host's picker (order) and built but never shown (hidden)
  <id>/event.json     names (every site language), suggested dates, effects
  <id>/layer.css      background and effects (rules start with :event)
```

The host picks the event in setup, under "Pick your mood" ("None" + the events in `order`). An
event whose dates include today is pre-selected; if the host turns it off, that sticks until the
season changes. The host's event is sent to every player with the skin.

## Add, hide or remove an event

| I want to… | Do this, then run `python3 tools/site/build_events.py` |
|---|---|
| **Add** an event | Copy a folder (e.g. `test/`), rename it (`a-z`, `0-9`, `-`), edit `event.json` and `layer.css`, add the id to `order` in `events.json`. |
| **Hide** an event | Move its id from `order` to `hidden`. It is still built (the UX check can use it with `EVENT=<id>`, and `Events.set('<id>')` in the host's console shows it) but never shown or suggested. |
| **Remove** an event | Remove its id from `events.json` and delete its folder. |

An id is in `order` or in `hidden`, never in both. `test` is a hidden event that exercises every
slot: `EVENT=test python3 tools/ux/ux_check.py`.

## event.json

```json
{
 "name": {"en": "Christmas", "es": "Navidad", "…": "every language of site/landing.i18n.json"},
 "dates": [{"from": "12-01", "to": "01-06"}],
 "effects": {
  "win": {"confetti": {"colors": ["#ffffff", "#d4f1ff"], "emoji": ["❄️"]}},
  "mark": {}
 }
}
```

- `dates`: inclusive `MM-DD` ranges when the event is suggested; a range may wrap over New Year
  (`12-01` → `01-06`). May be empty (never suggested).
- `effects`: one key per hook, only `win` (valid call), `nope` (wrong call), `mark` (a cell is
  marked on the phone) and `moment` (the host's photo moment). A hook may hold `confetti` with
  `colors` (`#rrggbb`) and/or `emoji`. For `win` it replaces the default confetti; for the other
  hooks confetti is only thrown when configured. A missing hook keeps the default behaviour.

## layer.css

Write every rule with `:event` first; it becomes `html[data-event=<id>]`. `@keyframes` and
`@media` are allowed. A layer must not set a token of `public/css/app.css :root` (colours and
fonts are the skin's; read them with `var(--accent)` etc.); private helpers named `--_something`
are fine. `url()` paths are relative to the built `public/css/events.css`:
`url(../img/events/<id>/tree.svg)`.

| Slot | What it is |
|---|---|
| `.evbg` | Background behind the page, on every host and player page (added by `js/events.js`). Hidden until the layer shows it: `:event .evbg{display:block}`. Fixed, full screen, `pointer-events:none`. Use it and its `::before`/`::after` (or children you style with gradients). |
| `.evfx[data-fx=win\|nope\|mark\|moment]` | Added by `js/fx.js` for 3 s when the hook fires. `win`, `nope` and `moment` cover the screen; `mark` sits exactly over the marked cell. Invisible unless the layer styles it: give it a short animation. |

## Performance (players are on phones)

- Backgrounds are CSS only, no JS. Snow, glows and anything that moves are gradients; a few small
  SVG illustrations (decorations, an effect's picture) are fine: put them in
  `public/img/events/<id>/` with their licence next to them (e.g. `LICENSE-FluentEmoji.txt`).
- Animate `transform` and `opacity` only; never `top`/`left`/`width`, `filter` or `box-shadow`.
- Few elements: `.evbg`, its pseudo-elements, a handful of layered gradients.
- Lighter on phones: drop or slow parts under `@media (max-width:560px)`.
- Animations pause while the tab is hidden and stop with `prefers-reduced-motion` (app.css does
  both); confetti and `.evfx` are skipped under reduced motion.

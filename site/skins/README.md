# Skins ("Pick your mood")

Each skin is one folder here. `python3 tools/site/build_skins.py` turns the folders into
`public/css/skins.css`, the skin fonts in `public/css/fonts.css` and the skin list in
`public/js/skin.js`. CI runs it with `--check`: it fails if a skin is invalid or the built
files are out of date.

```
site/skins/
  skins.json          default skin + the order shown in "Pick your mood"
  <id>/skin.json      names and descriptions (every site language), theme colour, colour scheme, fonts
  <id>/tokens.css     token values: declarations only, no selectors
  <id>/decor.css      optional: decorations and landing art direction (rules start with :skin)
```

## Add, change, hide or remove a skin

| I want to… | Do this, then run `python3 tools/site/build_skins.py` |
|---|---|
| **Add** a skin | Copy a folder (e.g. `verbena/`), rename it (`a-z`, `0-9`, `-`), edit its three files, add the id to `order` in `skins.json`. Then `python3 tools/site/screenshots.py <id>` for its thumbnail and landing screenshots. |
| **Change** a skin | Edit its `tokens.css` (colours, fonts, shapes) or `decor.css` (decorations). |
| **Hide** a skin | Remove its id from `order` (the folder can stay). Players sent a hidden skin get the default. |
| **Remove** a skin | Remove it from `order`, delete its folder and `public/img/skins/<id>/`. Delete font files no other skin uses. |
| **Change the default** | Set `default` in `skins.json` (it must be in `order`), then remake the screenshots: `python3 tools/site/screenshots.py`. |

The build stops with a clear message when, for example, a name is missing in one language,
a font file does not exist, `tokens.css` sets something that is not a token (typos), or
`decor.css` has a rule that does not start with `:skin`.

## Tokens

Defined, with the Classic values, in `public/css/app.css` (`:root`). A skin overrides only
what it changes. Shadow tokens never use `none` (write `0 0 #0000`) because they are combined.
A skin may also define private helpers named `--_something` (e.g. `--_glow-pink`).

| Group | Tokens |
|---|---|
| Page | `--page` `--page-image` `--page-image-size` `--page-image-pos` `--page-image-attach` `--surface` `--surface-2` `--border` `--paper` `--tint` `--tint-strong` `--scrim` `--now-bg` `--moment-bg` |
| Text | `--text` `--text-muted` `--text-accent` `--text-highlight` `--text-success` `--text-danger` |
| Roles (fills) and the text on them | `--accent` / `--accent-fill` + `--on-accent` · `--selected` + `--on-selected` · `--highlight` + `--on-highlight` · `--success` + `--on-success` |
| Type | `--font-display` `--font-body` `--font-sign` `--font-mono` `--body-weight` `--heading-weight` `--heading-tracking` `--heading-color` `--h3-font` `--h3-weight` `--label-font` `--label-weight` `--label-tracking` `--th-tracking` |
| Logo and signs | `--logo-color` `--logo-shadow` · `--brand-*` ("Bingo" in the logo: `bg clip color shadow border pad radius display rotate`) · `--sign-font` `--sign-weight` `--sign-color` `--sign-shadow` · `--result-ok` `--result-no` `--result-ok-shadow` |
| Shapes | `--border-w` · `--btn-radius` `--btn-border-w` `--btn-border-color` `--btn-shadow` `--btn-shadow-press` `--btn-press` `--btn-big-border` `--btn-big-shadow` `--btn-cy-bg` `--btn-cy-text` `--btn-cy-border` `--btn-cy-shadow` · `--card-radius` `--card-border` `--card-shadow` · `--modal-radius` `--modal-shadow` · `--pill-border` `--pill-text` · `--selected-border` |
| Player's card | `--board-bg` `--board-border` `--board-radius` `--board-pad` `--board-shadow` `--board-label` · `--cell-bg` `--cell-text` `--cell-muted` `--cell-border` `--cell-border-w` `--cell-radius` `--cell-gap-bg` `--cell-gap-border` · marked: `--cell-on-bg` `--cell-on-text` `--cell-on-muted` `--cell-on-border` `--cell-on-shadow` `--cell-glow` · `--lit-1`…`--lit-4` (a colour per tile, cycling) · stamp ring: `--mark` (`none`/`block`) `--mark-border` `--mark-widths` `--mark-rotate` |

Colour roles mean the same in every skin: `--accent` is the brand colour (prize shapes, big
buttons), `--selected` is "this one is chosen" (tabs, toggles), `--highlight` is "look here"
(free square, the prize name). Every `--on-*` must be readable on its fill.

## Decorations

`decor.css` can switch on these slots (they are hidden by default) and restyle landing
sections. Write every rule with `:skin` first; it becomes `html[data-skin=<id>]`.

| Slot | Where | Used by |
|---|---|---|
| `.ball` (`i`, two `b`) | landing, above the title | pista |
| `.neon` (`span` for line 2) | landing, above the title | pista |
| `.topband` | landing, top of the page (shows the "free · no accounts" line) | verbena |
| `.sticker` | landing, corner of the screenshots | verbena |
| `.volante` | landing, under the hero | feria |
| `.faroles` (14 `i`; `.small` on the player's phone) | every page, at the top (added by `js/skin.js`) | feria |

Landing sections a decor may restyle: `.hero`, `.steps .card`, `.final`, `#how`, `#mood`, `.shots`.
Keep decorations `aria-hidden` and make every animation stop with `prefers-reduced-motion`
(app.css already does this for all of them).

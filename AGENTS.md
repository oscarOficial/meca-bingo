# AGENTS.md — Meca Bingo

> Instructions for AI agents (Claude Code, Codex, Cursor…) working in this repo.
> Humans: this is also the short guide to the project. The product and how to run it are in `README.md`.

## Context

Music bingo for friends. The host's browser is the game server; players join from their phones
over WebRTC (PeerJS). There is no database for games. A small Cloudflare Worker serves the static
site, imports public playlists and stores anonymous usage counters.

**Every push to `main` deploys to production** (Cloudflare builds from `main`). Never push, and
never commit to `main` from a task: tasks live on their own branch and the human merges them.

## Map

| Path | What it is |
|---|---|
| `public/` | The static site, served as is. No bundler, no framework, no npm dependencies. |
| `public/js/game.js` | Card generation and prize rules. No DOM, tested by `tests/patterns.test.js`. |
| `public/js/host.js`, `play.js` | Host screen and player screen. |
| `public/js/net.js` | Host ↔ player connection (PeerJS, or `?net=local` BroadcastChannel). |
| `public/js/i18n.js` | All game texts, one block per language. |
| `public/js/fx.js`, `patterns-ui.js`, `skin.js`, `stats.js` | Shared helpers, prize pictures, skins, anonymous counters. |
| `public/js/vendor/` | Third-party code (PeerJS, QR, canvas-confetti). Don't edit. |
| `src/worker.js`, `playlist.js`, `stats.js` | The Worker: domains/redirects, `/api/playlist`, `/api/event` (Cloudflare D1). |
| `site/landing.template.html`, `site/landing.i18n.json` | Source of the landing pages `public/<lang>/index.html`. |
| `site/skins/` | One folder per skin; how they work: `site/skins/README.md`. |
| `site/events/` | One folder per special event (a layer over any skin); how they work: `site/events/README.md`. |
| `extension/` | Meca Bingo Sync browser extension (Chrome/Edge, Firefox, Safari). `extension/RELEASING.md`. |
| `tools/` | Python build and check scripts (site, skins, extension, UX check). |

## Generated files: never edit them by hand

Edit the source, run the build, commit both.

| Generated | Source | Build |
|---|---|---|
| `public/<lang>/index.html` | `site/landing.*` | `python tools/site/build_site.py` |
| `public/css/skins.css`, `public/css/fonts.css`, `public/js/skin.js` (skin list) | `site/skins/` | `python tools/site/build_skins.py` |
| `public/css/events.css`, `public/js/events.js` (event list) | `site/events/` | `python tools/site/build_events.py` |
| `dist/` (gitignored), lists inside `extension/*.js` | `extension/players.json`, `site.config.json` | `python tools/build_extension.py` |
| `public/download/*.zip`, extension version | — | Only the release workflow. Never in a task. |

## Validation

On Windows use `python` (`python3` is the Store stub); in CI and on macOS/Linux it is `python3`.
Run what matches the area you changed. All of them must pass.

| You changed | Run |
|---|---|
| Anything | `node tests/patterns.test.js` |
| `public/` (game, host, player, CSS) | `python tools/ux/ux_check.py` → `ux-report/report.md` + screenshots. `SKIN=<id>` to check one skin (default `pista`), `EVENT=<id>` to add a special event; `UX_PORT=<port>` if 8099 is taken (e.g. another check running). |
| `site/landing.*` | `python tools/site/build_site.py`, then `python tools/site/build_site.py --check` and `python tools/site/seo_check.py` |
| `site/skins/` | `python tools/site/build_skins.py`, then `--check`. For new skins or a new default: `python tools/site/screenshots.py <id>` |
| `site/events/` | `python tools/site/build_events.py`, then `--check`; `EVENT=<id> python tools/ux/ux_check.py` |
| `extension/`, `site.config.json` | `python tools/build_extension.py` and `python tools/ext/players_e2e.py` |
| `src/` | `npx wrangler dev`, then try the endpoint you changed on `http://localhost:8787` |

Manual play in one browser: `npx wrangler dev`, then `http://localhost:8787/host.html?net=local` and
`http://localhost:8787/play.html?r=CODE&net=local` in other tabs. Playwright is installed locally
(`pip install playwright && python -m playwright install chromium` if not).

## Conventions

- **Language.** Code, comments, commit messages, file names and docs are in **English**. Text
  people see goes through i18n.
- **i18n.** Every visible string in the game is in `public/js/i18n.js`, in **all 8 languages**
  (en, es, fr, de, it, nl, pl, sk). Landing texts in `site/landing.i18n.json`, same keys in every
  language. Skin names and descriptions in each `skin.json`. Never hard-code a visible string.
- **Style.** Plain modern JS in IIFEs with a short header comment saying what the file is; match
  the neighbouring code (compact, few comments, comments only for the non-obvious "why").
- **Styling.** Use the design tokens (`public/css/app.css` `:root`, overridden per skin). No
  hard-coded colours where a token exists. Check at least the default skin and one dark skin.
- **Escaping.** Song titles, artists, player names and messages come from users and playlists:
  always through `esc()` (from `fx.js`) or `textContent`, never raw into `innerHTML`.
- **Privacy.** Stats are anonymous (no ids, names, IPs or song titles). Any change to what is
  collected must also update `public/privacy.html`, and is a decision for the human.
- **Phones first.** Players are on phones; the UX check enforces no sideways scroll, tap targets
  ≥ 40px, song names ≥ 9px that fit their cell.
- **Dependencies.** None for the site. Adding one is a decision for the human.
- **Commits.** Short imperative subject < 72 chars, like the existing history
  (`Skin system: one folder per skin, …`). Body only for the "why".

## Ask the human before touching

- `wrangler.jsonc`, `site.config.json`, `.github/`: deploy, domains and CI.
- `extension/manifest.json`, the extension version, `public/download/`: store releases.
- `src/stats.js`, `public/js/stats.js`, `public/privacy.html`: what data we collect.
- `public/js/vendor/`.
- `AGENTS.md`, `CLAUDE.md`, `factory/` (except the job folder you were given), `.claude/`.

## Task factory

Tasks from `factory/backlog.md` run with `/tarea`: spec → build → review → the human merges.
How it works: `factory/README.md`. If the factory started you, your role instructions are in
`.claude/agents/` and your task message gives you the job folder and the worktree.

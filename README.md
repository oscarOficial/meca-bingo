# Meca Bingo 🎵

**Live site: https://mecabingo.oscasais.es** · Contact: info@mecabingo.oscasais.es (backup: https://meca-bingo.oscasais.workers.dev) · [Host a game](https://mecabingo.oscasais.es/host.html) · [Extension](https://mecabingo.oscasais.es/extension.html) · [Privacy](https://mecabingo.oscasais.es/privacy.html)

Music bingo for friends. The host turns a **public playlist** into unique bingo cards; every
player joins from their phone with a code or QR, marks the songs they recognise and calls
LINE / 2 LINES / BINGO. The host's screen checks every call automatically.

## How it works

- **No database.** The host's browser *is* the game server. Phones connect to it directly
  (WebRTC through [PeerJS](https://peerjs.com)); the public PeerJS service only introduces
  browsers to each other, no game data goes through it.
- **Static site + one small Worker** on Cloudflare:
  - `public/index.html` – landing page (host or join)
  - `public/host.html` – set up and run a game
  - `public/play.html` – player's card
  - `src/playlist.js` – reads a public playlist (no login) and returns its songs

## What the host can customise

| Setting | Options |
|---|---|
| Playlist | Link to a public playlist, or paste `Song - Artist` lines |
| Card | 3×9 (15 songs with gaps, like 90-ball bingo) or 5×5 (25 songs, like 75-ball bingo); prizes are shapes (gallery or drawn) |
| Lines | Horizontal only, or horizontal + vertical (+ diagonals on 5×5). On 3×9 a column only counts with 3 songs |
| Prizes | Line, 2 lines, Bingo (full card) – any combination, in that order |
| Song length | Whole song, 30 / 45 / 60 / 90 s (timer reminds the host) |
| Players | Up to 30 |
| Photos & messages | Any number of photos (kept only in the host's browser) and three lists of messages |
| Language | English, Spanish (add more in `js/i18n.js`) |

Songs and players go together (from simulations: first-line ties ≤ 20 %, full-card ties ≤ 25 %):

| Players | 3×9 card | 5×5 card |
|---|---|---|
| up to 4 | 28 | 48 |
| up to 8 | 31 | 50 |
| up to 12 | 34 | 52 |
| up to 20 | 36 | 55 |
| up to 30 | 38 | 58 |

If the playlist is too short for the chosen number of players, the game cannot start; the host
can add songs or lower the number of players with one click.

## Playlist providers

All imports read **public** playlists without logging in, best effort:

| Provider | How | Status |
|---|---|---|
| Deezer | Public API | should be solid |
| Spotify | Public embed page | first 100 songs |
| Apple Music | Structured data in the public page | to verify |
| YouTube / YouTube Music | Public playlist page | to verify |
| Amazon Music | No public API; tries the page | likely needs the Chrome extension |

If a provider fails you can always paste the song list.

## Deploy on Cloudflare (Workers, free, unlimited static traffic)

The project is a Cloudflare **Worker with static assets**: `public/` holds the app and
`src/worker.js` adds the `/api/playlist` importer. Config is in `wrangler.jsonc`.

1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → this repo.
2. Deploy command: `npx wrangler deploy` (the default). No build command needed.
3. Every push to `main` publishes automatically at https://meca-bingo.oscasais.workers.dev
4. Custom domain: **Settings → Domains & Routes → Add → Custom domain** → `mecabingo.oscasais.es`. The zone `oscasais.es` must use Cloudflare DNS (free plan is enough).

## Local testing

```bash
npx wrangler dev          # app + playlist API on http://localhost:8787
# host:   http://localhost:8787/host.html?net=local
# player: http://localhost:8787/play.html?r=CODE&net=local   (other tabs, same browser)
```
`?net=local` swaps WebRTC for a BroadcastChannel so everything runs in one browser.


## Meca Bingo Sync (browser extension, optional)

One code base in `extension/` for Chrome/Edge, Firefox and Safari. It marks the song that is
playing and adds play / pause / next to the host screen with the Spotify, Amazon Music, Deezer,
YouTube Music and Apple Music web players (list in `extension/players.json`). With Amazon Music
(no public API) it also imports the playlist and starts the round in shuffle.

- Build: `python3 tools/build_extension.py` (`--bump patch|minor|major` to raise the version)
- Test with fake players: `python3 tools/ext/players_e2e.py`
- CI + releases (GitHub Release and store uploads): `.github/workflows/extension.yml`
- How to release, store secrets: `extension/RELEASING.md`; store texts: `extension/STORE.md`
- Install page `/extension.html`, privacy policy `/privacy.html`

To add a music player: add it to `extension/players.json`, build, test, release a `minor` version.

## UX check (runs on every push)

`tools/ux/ux_check.py` plays a small game in a headless browser (host + player), takes screenshots
of every screen on phone (portrait, small, landscape), tablet and desktop, and checks the layout:
no sideways scroll, song names fit their cell and stay ≥ 9px, buttons ≥ 40px, the call button never
covers the card, the photo moment appears. The GitHub Action `UX check` runs it on each push and
attaches the screenshots + `report.md` to the run (artifact `ux-report`).

```bash
pip install playwright && python -m playwright install chromium
python3 tools/ux/ux_check.py
```

## Domains

All domains live in **`site.config.json`**:

- `canonical`: the main address (used by Google, the sitemap and share previews).
- `domains`: every address the site is served on. The extension works on all of them.
- `redirectToCanonical`: `true` sends visitors of the other domains to the canonical one.

To add or change a domain:
1. Edit `site.config.json`.
2. Cloudflare → Worker → Settings → Domains & Routes → Add → Custom domain (the zone must use Cloudflare DNS).
3. Release a new extension version (Actions → Extension → Run workflow → `minor`), only needed if the domain list changed.
4. Commit and push (or Retry build).

## Landing page and languages (SEO)

The landing is plain HTML per language at `/en/` and `/es/`, built from:

- `site/landing.template.html`: layout (elements with `data-t="key"` get the text)
- `site/landing.i18n.json`: all texts, including the page title and description per language

After editing either file run `python3 tools/site/build_site.py` and commit the generated
`public/<lang>/index.html` (CI fails if you forget). `python3 tools/site/seo_check.py` checks
titles, descriptions, canonical, hreflang, images and structured data.

`/` sends visitors to their browser's language (`/es/` or `/en/`). Each page has its own
canonical address, `hreflang` links to the other languages, Open Graph tags and structured data
(WebApplication, FAQ, HowTo). The sitemap lists both languages with their alternates.

To add a language: add a block to `site/landing.i18n.json` (same keys), run the build, and the
Worker, sitemap and language links pick it up. The game itself (host and player screens) gets
its texts from `public/js/i18n.js`.


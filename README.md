# Meca Bingo 🎵

**Live site: https://meca-bingo.oscasais.workers.dev** · [Host a game](https://meca-bingo.oscasais.workers.dev/host.html) · [Extension](https://meca-bingo.oscasais.workers.dev/extension.html) · [Privacy](https://meca-bingo.oscasais.workers.dev/privacy.html)

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
| Card | Spanish 3×9 (15 songs with gaps) or classic 5×5 |
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

## Local testing

```bash
npx wrangler dev          # app + playlist API on http://localhost:8787
# host:   http://localhost:8787/host.html?net=local
# player: http://localhost:8787/play.html?r=CODE&net=local   (other tabs, same browser)
```
`?net=local` swaps WebRTC for a BroadcastChannel so everything runs in one browser.


## Meca Bingo Sync (Chrome extension, optional)

Source in `extension/`; `python3 tools/build_extension.py` builds Chrome/Edge, Firefox and Safari packages
into `public/download/meca-bingo-sync-<browser>.zip`;
install page at `/extension.html`, privacy policy at `/privacy.html`.
It imports Amazon Music playlists (no public API), starts the round in shuffle, marks the song
that is playing and adds play / pause / next to the host screen. Works with the Amazon Music and
Spotify web players. Store submission notes: `extension/STORE.md`.

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

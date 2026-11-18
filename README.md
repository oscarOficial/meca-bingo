# Meca Bingo 🎵

Music bingo for friends. The host turns a **public playlist** into unique bingo cards; every
player joins from their phone with a code or QR, marks the songs they recognise and calls
LINE / 2 LINES / BINGO. The host's screen checks every call automatically.

## How it works

- **No database.** The host's browser *is* the game server. Phones connect to it directly
  (WebRTC through [PeerJS](https://peerjs.com)); the public PeerJS service only introduces
  browsers to each other, no game data goes through it.
- **Static site + one small function** on Cloudflare Pages:
  - `index.html` – landing page (host or join)
  - `host.html` – set up and run a game
  - `play.html` – player's card
  - `functions/api/playlist.js` – reads a public playlist (no login) and returns its songs

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

Minimum playlist size (from simulations, keeps ties low with 30 players): **40 songs** for 3×9,
**55 songs** for 5×5. Shorter playlists cannot start a game.

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

## Deploy on Cloudflare Pages (free, unlimited bandwidth)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick this repository.
3. Build settings: **Framework preset: None**, **Build command: (empty)**, **Build output directory: `/`**.
4. **Save and Deploy**. Every push to `main` publishes automatically at `https://<project>.pages.dev`.

## Local testing

```bash
python3 -m http.server 8080
# host:   http://localhost:8080/host.html?net=local
# player: http://localhost:8080/play.html?r=CODE&net=local   (other tabs, same browser)
```
`?net=local` swaps WebRTC for a BroadcastChannel so everything runs in one browser.
The playlist import function only runs on Cloudflare (or `npx wrangler pages dev .`).

# Publishing Meca Bingo Sync on the Chrome Web Store

Everything needed to fill in the store form. Upload file: `public/download/meca-bingo-sync.zip`
(the contents of this folder, without this file).

## 1. Developer account (once)
1. Go to https://chrome.google.com/webstore/devconsole with the Google account that will own the extension.
2. Accept the agreement and pay the one-time US$5 registration fee.
3. Verify the contact email.

## 2. New item
**Items → New item → upload `meca-bingo-sync.zip`.**

### Store listing
- **Name:** Meca Bingo Sync
- **Summary (≤132 chars):** Companion for Meca Bingo: import Amazon Music playlists, mark the song that is playing and control the music.
- **Category:** Entertainment
- **Language:** English (add Spanish as a second listing language)
- **Description:**

  > Meca Bingo turns a public playlist into a music bingo night: every friend gets a unique card on their phone and marks the songs they recognise.
  >
  > This optional extension is for the host's computer and makes the night run by itself:
  > • Import Amazon Music playlists (Amazon has no public API, so the extension reads the playlist in your own browser)
  > • Start the round in shuffle from the Meca Bingo screen
  > • Mark the song that is playing automatically
  > • Play, pause, next and previous from the bingo screen
  >
  > Works with the Amazon Music and Spotify web players in Chrome. Players do not need the extension.
  > No accounts, no tracking, no data leaves your browser.

- **Icon:** `icons/icon128.png`
- **Screenshots (1280×800):** host screen with the control bar, import from Amazon, player card on a phone. (Take them from the live site.)
- **Homepage:** https://meca-bingo.oscasais.workers.dev/
- **Support:** https://github.com/oscarOficial/meca-bingo/issues

### Privacy practices
- **Single purpose:** Connect the Meca Bingo host page with the music player tab (Amazon Music / Spotify web) to import the playlist, mark the song that is playing and control playback.
- **Permission justifications:**
  - `storage`: remember, for the browser session only, which tab is the music tab and whether it has already been shown (Chrome only plays sound in a tab that has been visible once).
  - Host `music.amazon.*`: read the playlist the host asks to import, read the title/artist of the song playing, press play/pause/next/previous and the shuffle button.
  - Host `open.spotify.com`: read the title/artist of the song playing and press play/pause/next/previous.
  - Host `meca-bingo.oscasais.workers.dev`: exchange messages with the Meca Bingo host page.
- **Remote code:** No, the extension does not use remote code.
- **Data usage:** tick nothing in "collected data" (the extension only reads song titles/artists and passes them to the Meca Bingo page in the same browser; nothing is sent to a server). Certify the three statements (no selling, no unrelated use, no creditworthiness).
- **Privacy policy URL:** https://meca-bingo.oscasais.workers.dev/privacy.html

### Distribution
- Visibility: **Public** (or **Unlisted** while testing: only people with the link can install it).
- Regions: all.

## 3. After approval
Copy the store link and put it in `public/extension.html` (`STORE_URL`), so the site sends people there
instead of the zip.

## Notes
- If you change the site's domain, update `host_permissions` and the `bridge.js` match in `manifest.json`,
  and the `SITE` lists in `background.js` / `popup.js`, then bump `version`.
- Review usually takes a few days; host permissions on specific sites are reviewed by a person.

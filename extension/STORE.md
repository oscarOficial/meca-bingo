# Publishing Meca Bingo Sync on the Chrome Web Store

Build the packages first: `python3 tools/build_extension.py` (one source, three builds).
Chrome upload file: `public/download/meca-bingo-sync-chrome.zip`.

## 1. Developer account (once)
1. Go to https://chrome.google.com/webstore/devconsole with the Google account that will own the extension.
2. Accept the agreement and pay the one-time US$5 registration fee.
3. Verify the contact email.

## 2. New item
**Items → New item → upload `meca-bingo-sync.zip`.**

### Store listing
- **Name:** Meca Bingo Sync
- **Summary (≤132 chars):** Companion for Meca Bingo: marks the song that is playing on your music web player and lets the host control the music.
- **Category:** Entertainment
- **Language:** English (add Spanish as a second listing language)
- **Description:**

  > Meca Bingo turns a public playlist into a music bingo night: every friend gets a unique card on their phone and marks the songs they recognise.
  >
  > This optional extension is for the host's computer and makes the night run by itself:
  > • Mark the song that is playing automatically
  > • Play, pause, next and previous from the bingo screen
  > • Amazon Music: import the playlist (Amazon has no public API, so the extension reads it in your own browser) and start the round in shuffle
  >
  > Works with the Spotify, Amazon Music, Deezer, YouTube Music and Apple Music web players. Players do not need the extension.
  > No accounts, no tracking, no data leaves your browser.

- **Icon:** `icons/icon128.png`
- **Screenshots (1280×800):** `store-assets/2-host.png`, `3-players.png`, `4-photo-moment.png`, `1-import.png`
- **Small promo tile (440×280):** `store-assets/promo-440x280.png`
- **Homepage:** https://mecabingo.oscasais.es/
- **Support:** https://github.com/oscarOficial/meca-bingo/issues

### Privacy practices
- **Single purpose:** Connect the Meca Bingo host page with the music player tab (Spotify, Amazon Music, Deezer, YouTube Music or Apple Music web player) to import the playlist, mark the song that is playing and control playback.
- **Permission justifications:**
  - `storage`: remember, for the browser session only, which tab is the music tab and whether it has already been shown (Chrome only plays sound in a tab that has been visible once).
  - Host `music.amazon.*`: read the playlist the host asks to import, read the title/artist of the song playing, press play/pause/next/previous and the shuffle button.
  - Hosts `open.spotify.com`, `www.deezer.com`, `music.youtube.com`, `music.apple.com` (and `beta.music.apple.com`): read the title/artist of the song playing (from the standard Media Session data the player gives the browser) and press play/pause/next/previous through the player's own media-key handlers.
  - Hosts `mecabingo.oscasais.es` (plus the backup address `meca-bingo.oscasais.workers.dev`): exchange messages with the Meca Bingo host page.
- **Remote code:** No, the extension does not use remote code.
- **Data usage:** tick nothing in "collected data" (the extension only reads song titles/artists and passes them to the Meca Bingo page in the same browser; nothing is sent to a server). Certify the three statements (no selling, no unrelated use, no creditworthiness).
- **Privacy policy URL:** https://mecabingo.oscasais.es/privacy.html (until the domain is live: https://meca-bingo.oscasais.workers.dev/privacy.html)

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


# Firefox Add-ons (addons.mozilla.org) — free

1. Create a Firefox account and open https://addons.mozilla.org/developers/ → **Submit a New Add-on**.
2. Choose **On this site** (listed) and upload `public/download/meca-bingo-sync-firefox.zip`.
3. Source code question: answer **No** (the code is not minified or generated).
4. Reuse the Chrome texts above (name, summary, description, category *Music*, privacy policy URL).
5. Firefox lets people choose which sites an extension may use. If someone switches site access off,
   the extension cannot see the music player: the popup will say no player tab is open.
Minimum Firefox version: 128 (needed for the page-level script that talks to the player).

# Safari (Mac App Store) — US$99/year

Safari extensions are only installed from the App Store, inside a small Mac app.
1. Join the **Apple Developer Program** (US$99/year) with the Apple ID that will publish it.
2. Package `public/download/meca-bingo-sync-safari.zip`:
   - with a Mac: `xcrun safari-web-extension-converter dist/safari --app-name "Meca Bingo Sync" --bundle-identifier dev.workers.oscasais.mecabingo --macos-only`
     then in Xcode set the Team, **Product → Archive → Distribute App → App Store Connect**;
   - or, without a Mac, App Store Connect's **Safari Web Extension Packager** if it is available for your account.
3. In App Store Connect fill in the listing (same texts), category **Music**, privacy policy URL, screenshots.
4. Test on a Mac before submitting: Safari shows a permission request for each music player and the site
   the first time; the user must allow them (Safari → Settings → Extensions).

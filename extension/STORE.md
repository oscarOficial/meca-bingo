# Publishing Meca Bingo Sync on the Chrome Web Store

Build the packages first: `python3 tools/build_extension.py` (one source, three builds).
Chrome upload file: `public/download/meca-bingo-sync-chrome.zip`.

## 1. Developer account (once)
1. Go to https://chrome.google.com/webstore/devconsole with the Google account that will own the extension.
2. Accept the agreement and pay the one-time US$5 registration fee.
3. **Settings** (left menu of the items list, not inside the item): set the publisher contact email
   (`contact@oscasais.es`) and verify it from the email Google sends. Without a verified contact email
   the item cannot be submitted.

## 2. New item
**Items → New item → upload `meca-bingo-sync.zip`.**

### Store listing
- **Name:** Meca Bingo Sync
- **Summary (≤132 chars):** comes from the extension itself (`manifest.json` → `_locales/<lang>/messages.json`,
  key `extDescription`), one per language. Change it there, not in the dashboard.
- **Category:** Entertainment
- **Languages:** the store shows the listing in the visitor's language. The zip already has all eight
  (`en` default, `es`, `fr`, `de`, `it`, `nl`, `pl`, `sk`). In **Store listing**, pick each language in the
  language menu (top right) and paste its description below. Screenshots can stay the same for every language.
- **Description** (one per language):

  **English (en) — default**

  ```
  Meca Bingo turns a public playlist into a music bingo night: every friend gets a unique card on their phone and marks the songs they recognise.

  This optional extension is for the host's computer and makes the night run by itself:
  • Marks the song that is playing automatically
  • Play, pause, next and previous from the bingo screen
  • Amazon Music: imports the playlist (Amazon has no public API, so the extension reads it in your own browser) and starts the round in shuffle

  Works with the Spotify, Amazon Music, Deezer, YouTube Music and Apple Music web players. Players do not need the extension.
  No accounts, no tracking, no data leaves your browser.
  ```

  **Español (es)**

  ```
  Meca Bingo convierte una playlist pública en una noche de bingo musical: cada amigo recibe un cartón único en su móvil y marca las canciones que reconoce.

  Esta extensión opcional es para el ordenador del presentador y hace que la noche vaya sola:
  • Marca automáticamente la canción que está sonando
  • Reproducir, pausa, siguiente y anterior desde la pantalla del bingo
  • Amazon Music: importa la playlist (Amazon no tiene API pública, así que la extensión la lee en tu propio navegador) y arranca la ronda en aleatorio

  Funciona con los reproductores web de Spotify, Amazon Music, Deezer, YouTube Music y Apple Music. Los jugadores no necesitan la extensión.
  Sin cuentas, sin rastreo, ningún dato sale de tu navegador.
  ```

  **Français (fr)**

  ```
  Meca Bingo transforme une playlist publique en soirée bingo musical : chaque ami reçoit une carte unique sur son téléphone et coche les chansons qu’il reconnaît.

  Cette extension facultative est destinée à l’ordinateur de l’animateur et fait tourner la soirée toute seule :
  • Coche automatiquement la chanson en cours
  • Lecture, pause, suivante et précédente depuis l’écran du bingo
  • Amazon Music : importe la playlist (Amazon n’a pas d’API publique, l’extension la lit donc dans ton propre navigateur) et lance la manche en aléatoire

  Fonctionne avec les lecteurs web de Spotify, Amazon Music, Deezer, YouTube Music et Apple Music. Les joueurs n’ont pas besoin de l’extension.
  Pas de compte, pas de pistage, aucune donnée ne quitte ton navigateur.
  ```

  **Deutsch (de)**

  ```
  Meca Bingo macht aus einer öffentlichen Playlist einen Musik-Bingo-Abend: Jede Person bekommt eine eigene Karte auf dem Handy und markiert die Songs, die sie erkennt.

  Diese optionale Erweiterung ist für den Computer der Spielleitung und lässt den Abend von selbst laufen:
  • Markiert den laufenden Song automatisch
  • Play, Pause, Weiter und Zurück direkt im Bingo-Bildschirm
  • Amazon Music: importiert die Playlist (Amazon hat keine öffentliche API, daher liest die Erweiterung sie in deinem eigenen Browser) und startet die Runde im Zufallsmodus

  Funktioniert mit den Web-Playern von Spotify, Amazon Music, Deezer, YouTube Music und Apple Music. Die Spieler brauchen die Erweiterung nicht.
  Keine Konten, kein Tracking, keine Daten verlassen deinen Browser.
  ```

  **Italiano (it)**

  ```
  Meca Bingo trasforma una playlist pubblica in una serata di tombola musicale: ogni amico riceve una cartella unica sul telefono e segna le canzoni che riconosce.

  Questa estensione facoltativa è per il computer di chi presenta e fa andare la serata da sola:
  • Segna automaticamente la canzone che sta suonando
  • Play, pausa, avanti e indietro dallo schermo della tombola
  • Amazon Music: importa la playlist (Amazon non ha un’API pubblica, quindi l’estensione la legge nel tuo browser) e fa partire il turno in ordine casuale

  Funziona con i web player di Spotify, Amazon Music, Deezer, YouTube Music e Apple Music. Ai giocatori l’estensione non serve.
  Niente account, niente tracciamento, nessun dato lascia il tuo browser.
  ```

  **Nederlands (nl)**

  ```
  Meca Bingo maakt van een openbare playlist een muziekbingo-avond: elke vriend krijgt een unieke kaart op zijn telefoon en vinkt de nummers aan die hij herkent.

  Deze optionele extensie is voor de computer van de spelleider en laat de avond vanzelf lopen:
  • Vinkt het nummer dat speelt automatisch aan
  • Afspelen, pauze, volgende en vorige vanaf het bingoscherm
  • Amazon Music: importeert de playlist (Amazon heeft geen openbare API, dus de extensie leest hem in je eigen browser) en start de ronde in willekeurige volgorde

  Werkt met de webspelers van Spotify, Amazon Music, Deezer, YouTube Music en Apple Music. Spelers hebben de extensie niet nodig.
  Geen accounts, geen tracking, er verlaten geen gegevens je browser.
  ```

  **Polski (pl)**

  ```
  Meca Bingo zamienia publiczną playlistę w wieczór muzycznego bingo: każdy znajomy dostaje na telefonie własną kartę i zaznacza piosenki, które rozpoznaje.

  To opcjonalne rozszerzenie jest na komputer prowadzącego i sprawia, że wieczór toczy się sam:
  • Samo zaznacza piosenkę, która właśnie gra
  • Odtwarzanie, pauza, następna i poprzednia z ekranu bingo
  • Amazon Music: importuje playlistę (Amazon nie ma publicznego API, więc rozszerzenie czyta ją w Twojej przeglądarce) i puszcza rundę losowo

  Działa z odtwarzaczami webowymi Spotify, Amazon Music, Deezer, YouTube Music i Apple Music. Gracze nie potrzebują rozszerzenia.
  Bez kont, bez śledzenia, żadne dane nie opuszczają Twojej przeglądarki.
  ```

  **Slovenčina (sk)**

  ```
  Meca Bingo premení verejný playlist na večer hudobného binga: každý kamarát dostane do mobilu vlastnú kartu a označuje pesničky, ktoré spozná.

  Toto voliteľné rozšírenie je pre počítač moderátora a večer sa vďaka nemu riadi sám:
  • Automaticky označí pesničku, ktorá práve hrá
  • Prehrať, pauza, ďalšia a predchádzajúca priamo z obrazovky binga
  • Amazon Music: importuje playlist (Amazon nemá verejné API, preto ho rozšírenie číta v tvojom vlastnom prehliadači) a pustí kolo náhodne

  Funguje s webovými prehrávačmi Spotify, Amazon Music, Deezer, YouTube Music a Apple Music. Hráči rozšírenie nepotrebujú.
  Žiadne účty, žiadne sledovanie, žiadne dáta neopúšťajú tvoj prehliadač.
  ```

- **Icon:** `icons/icon128.png`
- **Screenshots (1280×800):** `store-assets/2-host.png`, `3-players.png`, `4-photo-moment.png`, `1-import.png`
- **Small promo tile (440×280):** `store-assets/promo-440x280.png`
- **Official website:** leave it on **None**. It only accepts sites verified in Google Search Console;
  anything else fails with "The official website is not valid". (To use it, verify `mecabingo.oscasais.es`
  in Search Console with a DNS TXT record in Cloudflare first.)
- **Homepage URL:** https://mecabingo.oscasais.es/
- **Support:** info@mecabingo.oscasais.es (support email) · https://github.com/oscarOficial/meca-bingo/issues (support site)
- **Publisher contact email (Chrome, Settings page):** contact@oscasais.es (verified)
- **Support email shown on the listings (Firefox):** info@mecabingo.oscasais.es

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
Put each store link in `public/extension.html` (`STORE_URL`, `EDGE_URL`, `FIREFOX_URL`) and in
`public/js/host.js` (`STORES`), so the site sends people there instead of the zip. Current links:
- Chrome Web Store: https://chromewebstore.google.com/detail/kjefpodcfpmpoocaeliddebomimbckic
- Edge Add-ons: https://microsoftedge.microsoft.com/addons/detail/meca-bingo-sync/jdkejadbliplmenkjebcboggjpnaibpi
- Firefox Add-ons: https://addons.mozilla.org/firefox/addon/meca-bingo/

## Notes
- If you change the site's domain, update `host_permissions` and the `bridge.js` match in `manifest.json`,
  and the `SITE` lists in `background.js` / `popup.js`, then bump `version`.
- Review usually takes a few days; host permissions on specific sites are reviewed by a person.


# Firefox Add-ons (addons.mozilla.org) — free

1. Create a Firefox account and open https://addons.mozilla.org/developers/ → **Submit a New Add-on**.
2. Choose **On this site** (listed) and upload `public/download/meca-bingo-sync-firefox.zip`.
3. Source code question: answer **No** (the code is not minified or generated).
4. Reuse the Chrome texts above (name, summary, description, category *Music*, privacy policy URL). Firefox also reads the summary
   from `_locales`; add the other descriptions under **Edit Product Page → language**.
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

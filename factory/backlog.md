# Backlog

`/tarea` takes the first unchecked item, in file order (or the one you name: `/tarea 3`, `/tarea skins`).
It knows nothing about dependencies: put each item after the ones it builds on, and don't start
an item before the one it needs is merged into `main`.

Line format: `- [ ] <short imperative title>`. Optional detail goes on indented lines below it.
When the task is merged: `- [x] <title> → task/<id>`. Done by hand: `- [x] <title> → by hand`.

## Next

### Game screens

- [x] Player join screen uses the host's skin → task/player-join-screen-uses-the-hosts-skin
    Cuando el usuario se conecta a la partida para poner su nombre el tema no encaja con el skin que el host ha seleccionado.
- [x] Host game screen opens at the top after creating the game → task/host-game-screen-opens-at-the-top-after
    Tras crear partida la pantalla del host debe de mostrar desde el inicio (ahora se queda anclada abajo y no muestra el código QR ni las fotos).
- [x] 3×9 card shows its empty cells on phones → task/3-9-card-shows-its-empty-cells-on-phones
    Los cartones si se selecciona el cartón 3x9 no aparecen las celdas vacías (quizás debamos, para los cartones, si es un móvil fijar el portrait).
- [x] Compact player header and slimmer CALL button in landscape → task/compact-player-header-and-slimmer-call
    En móvil en horizontal el cartón necesita más espacio. Subir "Jugando por Línea" (con su dibujo del premio) y "Cartón #1" al header, entre el logo y los botones "?" / "online", para ganar altura. Mantener el botón CALL a la derecha (queda bajo el pulgar derecho) pero mucho más estrecho (~56–64 px, texto en dos líneas o en vertical) para ganar ancho. Alternativa a comparar con capturas en la spec: CALL abajo en el centro.
    Note: phone landscape is the layout 3×9 cards now always use on phones; vertical space is the scarcest (real phones lose more to the browser bar than the 740×375 UX check viewport).
- [x] Player goes full screen when the phone is rotated to landscape → task/player-goes-full-screen-when-the-phone
    Cuando el jugador gire el móvil a horizontal, la pantalla de juego debe pasar automáticamente a pantalla completa (así ganamos espacio para el cartón).
    Note: browsers only allow `requestFullscreen()` after a tap, not on an orientation change, and iPhone Safari has no Fullscreen API for pages. The spec must pick a fallback (e.g. enter full screen on the first tap in landscape, an "expand" button, or a PWA manifest with `display: fullscreen`) and say what iPhone gets.

- [x] Language dropdown: arrow shows open/closed and keeps off the right edge → task/language-dropdown-arrow-shows-open
    En el dropdown de idioma la flecha no cambia de estado (abierto/cerrado) y además el desplegable se queda demasiado pegado al borde derecho.
- [x] Special event picker as a dropdown with an icon per event → task/special-event-picker-as-a-dropdown-with
    El selector de evento especial me gustaría que fuera un dropdown y que cada opción tenga un icono representativo al lado (por ejemplo en Navidad un árbol de navidad). "Ninguno" también necesita su icono o un hueco equivalente.
    Note: the icon belongs in each `site/events/<id>/event.json` (built by build_events.py), not hard-coded in host.js.
- [ ] Meca Bingo logo links to the home page
    El logo de Meca Bingo debe llevar al home.
    Note: the logo is the `h1` in `.top` (host.html) and `.head` (play.html); the home is the landing in the current language (`/<lang>/`). The host's browser is the game server and a player leaving drops out of the game, so during a game the link must ask for confirmation first (or the spec proposes something equivalent); before a game starts it can go straight there.

### Special events (Christmas first; do before the extension tasks to be ready for December)

- [x] Special events: system, effect hooks, host picker and sync to players → task/special-events-system-effect-hooks-host
    Un "evento especial" es una capa que se pone encima de cualquier mood (p. ej. Pista de baile + Navidad): cambia el fondo (algo divertido, animado) y añade efectos relacionados con el evento (clicks, animaciones al hacer bingo o Nope…). Los colores y las fuentes siguen siendo los del mood.
    Decisions (human): UI name "Evento especial" (in all 8 languages); in code `event`. Same pattern as skins: `site/events/<id>/event.json` (names in every language, effects, suggested dates) + `layer.css` (rules start with `:event` → `html[data-event=<id>]`), a build like build_skins.py → `public/css/events.css` + the list in `public/js/events.js`, with `--check` in CI. Host picks it in setup next to "Pick your mood" ("Ninguno" + events); an event whose dates include today is suggested pre-selected and the host can turn it off. The host sends `event` to players with the skin (state and peek), applied without saving. Effect hooks in fx.js: `FX.win()`, `FX.nope()`, `FX.mark()`, `FX.moment()`; with no event they look exactly like today.
    Dependency approved: vendor canvas-confetti (ISC, self-hosted in `public/js/vendor/`, with its licence) and use it for confetti instead of the hand-made one in fx.js; honour prefers-reduced-motion. Plain CSS / Web Animations API for the rest; no GSAP or Lottie. Animated backgrounds: CSS only, `pointer-events:none`, paused when the tab is hidden, light on phones. UX check gets `EVENT=<id>` like `SKIN=`. No sounds, landing unchanged, no stats changes. This task ships no event yet (the Christmas one is the next task); a hidden test event is fine if needed to check the system.
- [x] Christmas special event → task/christmas-special-event
    Primer evento especial: Navidad. Fondo animado (nieve cayendo), decoraciones navideñas y efectos al hacer bingo (confeti de copos, árboles, estrellas), al hacer Nope (cae un trozo de carbón) y al marcar una canción (pequeño destello de nieve). Sugerido en las fechas de Navidad (1 dic – 6 ene).
    Decisions (human): illustrations from Fluent Emoji (MIT, Microsoft) as SVG, only the few files used, with the licence file next to them (like the fonts). Must work over all five moods (light and dark); check with `EVENT=navidad` and at least one light and one dark skin.

### Code

- [x] English ids for the skins → task/english-ids-for-the-skins
    Las keys de código de los temas deben estar en inglés, como el resto del código (hoy `pista`, `clasico`, `verbena`, `feria`, `mesa`).
    Decisions (human): rename every skin id to English (folders in `site/skins/`, `skins.json`, generated CSS/JS, `data-skin`, `SKIN=` in the UX check and its default, screenshots in `public/img/skins/<id>/`, docs and AGENTS.md). Visible names in each `skin.json` don't change. A skin saved in localStorage with an old id, and an old id sent by a host on an older version, must map to the new one, not fall back silently. Do it after the Christmas and full-screen tasks are merged (they use the current ids).

### Extension: player sync (each one builds on the previous)

- [ ] Extension: host play/pause state matches the real player
    Los controles de la extensión a veces no están bien sincronizados con el host (muestra que está sonando cuando en realidad está en pausa).
- [ ] Extension: detect the playing playlist on YouTube Music
    Con YouTube la extensión no parece funcionar (no se entera de que está corriendo la playlist de fondo).
- [ ] Extension: host shows the current song after signing in to Spotify
    Tras hacer login en Spotify la playlist empieza pero la página de Host no se actualiza correctamente (no muestra que haya una canción reproduciéndose).
- [ ] Extension: hide the playing song in the player tab
    La extensión debe asegurar que en la tab que esté abierta no se muestra la canción que se está reproduciendo ni en el title ni en ningún sitio del reproductor (lo habíamos hecho anteriormente mostrando una capa superpuesta a la página con una foto divertida).
    Note: extension/provider.js already has cover()/uncover(), today only used while importing/starting Amazon.
- [ ] Extension: START button opens the player tab and returns to the host
    El icono de play, si todavía no está abierta la pestaña, debe ser algo como START (que abra la pestaña del reproductor y vuelva a hacer foco en la página del host).

### Extension: errors the host can act on

- [ ] Extension: detect when Spotify or Deezer can't play because the user isn't signed in
    Con Spotify y Deezer al no estar hecho login no permite hacer play.
- [ ] Extension: clear, actionable errors on the host screen
    En general debemos mejorar que el usuario sepa qué hacer para cada error con la integración entre los diferentes servicios (login, abrir playlist, conexión, problemas de conectividad...). Los errores deben ser visibles para el host y claros.

### Game settings

- [x] Host setting: pause or not between songs → task/host-setting-pause-or-not-between-songs
    Añadir configuración de pausa o no entre canciones.

### Texts

- [x] "Open the playlist in Spotify" shows in Spanish in Dutch, and audit all translations → task/open-the-playlist-in-spotify-shows-in
    "Abrir la playlist en Spotify" en neerlandés aparece en español. Revisar bien las traducciones en todos los idiomas.
    Note: `openPlaylist` in `public/js/i18n.js` is already right in `nl`, so the cause is probably that `#plOpen` / the host's playlist link keep the text from when they were rendered and aren't refreshed on a language change (host.js:134, :402). The audit: every key present in all 8 languages, no text left in another language, and every visible string re-rendered when the language changes.

- [ ] Extension texts: premium accounts and signed-in player needed
    Actualizar la descripción para que se haga hincapié en el uso de cuentas de pago de los servicios para evitar publicidad, además de que deben estar con login hecho y todo funcionando en el reproductor del servicio para que la sincronización funcione correctamente.
    Where: extension/STORE.md, public/extension.html, the extension's _locales and the landing texts that mention the extension, in all 8 languages.

### Icons

- [x] Replace UI emojis with Lucide icons → task/replace-ui-emojis-with-lucide-icons
    Los emojis usados como iconos en la interfaz (❓, 🌐…) se ven distintos en cada dispositivo y no siguen los colores del skin. Sustituirlos por iconos de Lucide (ISC).
    Decisions (human): dependency approved. No runtime library: copy only the icons used into one SVG sprite `public/img/icons.svg` (with Lucide's licence) and draw them with `<svg><use href="/img/icons.svg#name">`, coloured with `currentColor` so they follow the skin tokens. Keep accessible labels.


### Follow-ups found while building (25 Nov)

- [ ] Overlays and toasts follow a language change
    Al cambiar de idioma, lo que está abierto en ese momento se queda en el idioma anterior: la ayuda "Cómo jugar" del jugador, toasts, la pantalla de ganar/perder, el momento foto, el "¡Tiempo!" del temporizador y el editor de premios.
    Note: found by the translations task (task/open-the-playlist-in-spotify-shows-in), which left short-lived overlays out of scope.
- [ ] One shared dropdown component for every dropdown, in every browser
    Unificar el menú de idioma (`details.prefs`), el selector de evento (`details.evmenu`) y los `<select>` del host en un mismo estilo, y que la flecha abierta/cerrada y la distancia al borde funcionen también en Firefox y Safari.
    Note: the dropdowns task only fixes `<select>`s in Chrome (`appearance: base-select`); Firefox/Safari keep native selects whose arrow never flips. The event picker task built its own `.evmenu` next to `.prefs`. Do after both are merged.
- [ ] Landing feature and mode lists use Lucide icons instead of emojis
    Las listas de características y modos de la landing siguen con emojis; usar los iconos de Lucide del sprite como en el juego.
    Note: left out of the icons task. Texts are in `site/landing.i18n.json`, the template in `site/landing.template.html`; rebuild with build_site.py.
- [x] Icon sprite and event images aren't stuck in browser caches for 30 days → not needed (static files bypass the Worker; already max-age=0)
    El Worker cachea los `.svg` 30 días (`src/worker.js:29`): si se añade un icono a `public/img/icons.svg` o se cambia una imagen de evento, los navegadores seguirán con la versión vieja. Versionar la URL (p. ej. `?v=<hash>` generado en un build) o acortar la caché para esos ficheros.
- [ ] Special events polish: hidden-tab load, mark sparkle on scroll, confetti size
    Tres detalles del sistema de eventos: una página que carga en una pestaña oculta anima el fondo hasta el primer cambio de pestaña; el destello al marcar una celda se desplaza si se hace scroll durante su animación (0,8 s); y si un evento define colores y emojis, el confeti normal sale el doble de grande.
- [x] Python tools run on Windows without PYTHONUTF8=1 → task/python-tools-run-on-windows-without
    `ux_check.py`, `seo_check.py` y los mensajes de error de `build_events.py` fallan en la consola de Windows (cp1252) al escribir ✅/✗ o leer JSON, salvo con `PYTHONUTF8=1`. Abrir/escribir ficheros con `encoding='utf-8'` y reconfigurar stdout a UTF-8.
- [ ] English names for the remaining Spanish identifiers
    Quedan identificadores en español en el código (p. ej. las clases `.faroles` y `.volante` de los skins). Renombrarlos a inglés según la regla de AGENTS.md, sin cambiar textos visibles.
- [ ] Remove the dead cache rules from the Worker
    Eliminar el código muerto de caché en `src/worker.js`: las dos líneas de `Cache-Control` de `withHeaders()` (`.woff2/.png/.jpg/.webp/.svg` → 30 días, `.js/.css` → 1 hora) nunca se aplican.
    Note: `wrangler.jsonc` has no `run_worker_first`, so Cloudflare serves every existing file in `public/` before the Worker runs; `withHeaders()` only sees the language landings, the `/host`-style pages and 404s, none of which match those extensions. Static files already get `max-age=0, must-revalidate` (checked in production). Keep the security headers in `withHeaders()`; don't touch `wrangler.jsonc`. Found by the closed SVG-cache task.

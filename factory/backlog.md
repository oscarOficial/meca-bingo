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
- [ ] Compact player header and slimmer CALL button in landscape
    En móvil en horizontal el cartón necesita más espacio. Subir "Jugando por Línea" (con su dibujo del premio) y "Cartón #1" al header, entre el logo y los botones "?" / "online", para ganar altura. Mantener el botón CALL a la derecha (queda bajo el pulgar derecho) pero mucho más estrecho (~56–64 px, texto en dos líneas o en vertical) para ganar ancho. Alternativa a comparar con capturas en la spec: CALL abajo en el centro.
    Note: phone landscape is the layout 3×9 cards now always use on phones; vertical space is the scarcest (real phones lose more to the browser bar than the 740×375 UX check viewport).

### Special events (Christmas first; do before the extension tasks to be ready for December)

- [ ] Special events: system, effect hooks, host picker and sync to players
    Un "evento especial" es una capa que se pone encima de cualquier mood (p. ej. Pista de baile + Navidad): cambia el fondo (algo divertido, animado) y añade efectos relacionados con el evento (clicks, animaciones al hacer bingo o Nope…). Los colores y las fuentes siguen siendo los del mood.
    Decisions (human): UI name "Evento especial" (in all 8 languages); in code `event`. Same pattern as skins: `site/events/<id>/event.json` (names in every language, effects, suggested dates) + `layer.css` (rules start with `:event` → `html[data-event=<id>]`), a build like build_skins.py → `public/css/events.css` + the list in `public/js/events.js`, with `--check` in CI. Host picks it in setup next to "Pick your mood" ("Ninguno" + events); an event whose dates include today is suggested pre-selected and the host can turn it off. The host sends `event` to players with the skin (state and peek), applied without saving. Effect hooks in fx.js: `FX.win()`, `FX.nope()`, `FX.mark()`, `FX.moment()`; with no event they look exactly like today.
    Dependency approved: vendor canvas-confetti (ISC, self-hosted in `public/js/vendor/`, with its licence) and use it for confetti instead of the hand-made one in fx.js; honour prefers-reduced-motion. Plain CSS / Web Animations API for the rest; no GSAP or Lottie. Animated backgrounds: CSS only, `pointer-events:none`, paused when the tab is hidden, light on phones. UX check gets `EVENT=<id>` like `SKIN=`. No sounds, landing unchanged, no stats changes. This task ships no event yet (the Christmas one is the next task); a hidden test event is fine if needed to check the system.
- [ ] Christmas special event
    Primer evento especial: Navidad. Fondo animado (nieve cayendo), decoraciones navideñas y efectos al hacer bingo (confeti de copos, árboles, estrellas), al hacer Nope (cae un trozo de carbón) y al marcar una canción (pequeño destello de nieve). Sugerido en las fechas de Navidad (1 dic – 6 ene).
    Decisions (human): illustrations from Fluent Emoji (MIT, Microsoft) as SVG, only the few files used, with the licence file next to them (like the fonts). Must work over all five moods (light and dark); check with `EVENT=navidad` and at least one light and one dark skin.

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

- [ ] Host setting: pause or not between songs
    Añadir configuración de pausa o no entre canciones.

### Texts

- [ ] Extension texts: premium accounts and signed-in player needed
    Actualizar la descripción para que se haga hincapié en el uso de cuentas de pago de los servicios para evitar publicidad, además de que deben estar con login hecho y todo funcionando en el reproductor del servicio para que la sincronización funcione correctamente.
    Where: extension/STORE.md, public/extension.html, the extension's _locales and the landing texts that mention the extension, in all 8 languages.

### Icons

- [ ] Replace UI emojis with Lucide icons
    Los emojis usados como iconos en la interfaz (❓, 🌐…) se ven distintos en cada dispositivo y no siguen los colores del skin. Sustituirlos por iconos de Lucide (ISC).
    Decisions (human): dependency approved. No runtime library: copy only the icons used into one SVG sprite `public/img/icons.svg` (with Lucide's licence) and draw them with `<svg><use href="/img/icons.svg#name">`, coloured with `currentColor` so they follow the skin tokens. Keep accessible labels.


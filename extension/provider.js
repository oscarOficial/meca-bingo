// Runs on the supported music web players (see players.json): Amazon Music, Spotify, Deezer,
// YouTube Music and Apple Music. Everything except the Amazon part only uses the standard
// Media Session data the player gives the browser, so it works the same on every player.
// - tells the host page which song is playing (title + artist, as the player shows them)
// - plays / pauses / skips through the player's own media-key controls (see mainworld.js)
// - Amazon Music only: reads a playlist and starts it in shuffle
// - during a game (the host page asks for the state): covers the tab and keeps its title "Meca Bingo",
//   so the song isn't given away; "Show the player" reveals it until the song changes
// - Spotify and Deezer only: tells the host when nobody is signed in (the page shows its log-in button)
(() => {
  const isAmazon = location.hostname.startsWith('music.amazon.');
  const root = document.documentElement;
  const _ = k => chrome.i18n.getMessage(k);
  const send = m => chrome.runtime.sendMessage(m).catch(() => {});
  // only on a signed-out page: its top bar log-in button
  const SIGNED_OUT = { 'open.spotify.com': ['spotify', '[data-testid="login-button"]'], 'www.deezer.com': ['deezer', 'a[href^="https://account.deezer.com/"][href*="/login"]'] }[location.hostname];
  const signedOut = () => SIGNED_OUT && document.querySelector(SIGNED_OUT[1]) ? SIGNED_OUT[0] : null;

  // ---------- cover: hides the page while the extension works in this tab (busy) or during a game ----------
  const NAME = 'Meca Bingo';
  function cover(text, game) {
    let d = document.getElementById('mb-cover');
    if (!d) {
      d = document.createElement('div'); d.id = 'mb-cover';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(circle at 20% 0%,#3a1450,#0d0b1a 60%);color:#f3f0ff;font:600 18px system-ui,sans-serif;text-align:center;padding:16px';
      const img = document.createElement('img'); img.src = chrome.runtime.getURL('icons/icon128.png'); img.width = img.height = 96; img.style.borderRadius = '22px';
      const name = document.createElement('div'); name.style.font = '800 30px system-ui'; name.textContent = NAME;
      const msg = document.createElement('div'); msg.id = 'mb-cover-t';
      const b = document.createElement('button'); b.id = 'mb-cover-show'; b.textContent = _('coverShow');
      b.style.cssText = 'min-height:44px;padding:10px 22px;border:0;border-radius:999px;background:#f3f0ff;color:#0d0b1a;font:700 16px system-ui,sans-serif;cursor:pointer';
      b.onclick = () => { shown = songKey(); paint(); };
      d.append(img, name, msg, b);
      root.appendChild(d);
    }
    const m = document.getElementById('mb-cover-t'); if (m.textContent !== text) m.textContent = text;
    d.style.pointerEvents = game ? 'auto' : 'none';
    document.getElementById('mb-cover-show').style.display = game ? '' : 'none';
  }
  const uncover = () => { const d = document.getElementById('mb-cover'); if (d) d.remove(); };
  // the player rewrites the title on every song: keep it NAME while covered, remember the player's own
  let pageTitle = null, watching = false;
  const mask = () => {
    const t = document.title;
    if (t !== NAME) pageTitle = t;
    if (t !== NAME && document.getElementById('mb-cover')) document.title = NAME;
  };
  const titles = new MutationObserver(mask);
  // one place decides the cover: busy (the extension works here), game (a host game is on) or none
  let busy = null, gameAt = 0, shown;   // shown: the song the host chose to reveal (undefined = none)
  const songKey = () => { const np = nowPlaying(); return np ? np.title + '|' + np.artist : null; };
  function paint(key = songKey()) {
    if (shown !== undefined && shown !== key) shown = undefined;
    if (!watching && document.head) { watching = true; titles.observe(document.head, { subtree: true, childList: true, characterData: true }); }
    if (busy !== null) cover(busy, false);
    else if (Date.now() - gameAt < 10000 && shown === undefined) cover(_(signedOut() ? 'coverSignIn' : 'coverHint'), true);
    else { const was = !!document.getElementById('mb-cover'); uncover(); if (was && document.title === NAME && pageTitle !== null) document.title = pageTitle; }
    mask();
  }
  if (location.hash === '#mbcover') { const s = document.createElement('style'); s.id = 'mb-pre'; s.textContent = 'html{background:#0d0b1a!important}body{visibility:hidden!important}'; root.appendChild(s); setTimeout(() => s.remove(), 30000); }
  const unpre = () => { const s = document.getElementById('mb-pre'); if (s) s.remove(); };

  // ---------- what is playing ----------
  // Only unmuted media counts, and real media wins over playbackState, which pages can leave stale.
  // mainworld.js marks the elements it saw call play() (even outside the page); the DOM scan adds the rest.
  function isPlaying() {
    const known = root.dataset.mbPlaying, dom = [...document.querySelectorAll('audio,video')].filter(m => !m.muted);
    if (known === '1' || dom.some(m => !m.paused && !m.ended)) return true;
    if (known === '0' || dom.length) return false;
    try { return navigator.mediaSession.playbackState === 'playing'; } catch (e) { return false; }
  }
  function nowPlaying() {
    try { const m = navigator.mediaSession.metadata; if (m && m.title) return { title: m.title, artist: m.artist || '' }; } catch (e) {}
    return null;
  }
  // a song counts once it has been on for a moment, so skipping fast does not mark it
  const HOLD = 1500;
  let cand = null, since = 0, sent = null, lastPlaying = null;
  setInterval(() => {
    const playing = isPlaying();
    if (playing !== lastPlaying) { lastPlaying = playing; send({ type: 'mb-state', playing }); }
    const np = nowPlaying(), key = np ? np.title + '|' + np.artist : null;
    paint(key);
    if (key !== cand) { cand = key; since = Date.now(); return; }
    if (key && key !== sent && playing && Date.now() - since >= HOLD) { sent = key; send({ type: 'mb-track', title: np.title, artist: np.artist, ts: Date.now() }); }
  }, 400);

  // ---------- player controls (through the player's own media-key handlers) ----------
  let ctlId = 0;
  const control = action => new Promise(res => {
    const id = ++ctlId;
    const on = e => { const m = e.data; if (e.source === window && m && m.__mbCtlRes && m.id === id) { removeEventListener('message', on); res({ ok: m.ok }); } };
    addEventListener('message', on);
    window.postMessage({ __mbCtl: true, id, action, playing: isPlaying() }, '*');
    setTimeout(() => { removeEventListener('message', on); res({ ok: false }); }, 1000);
  });

  // ---------- Amazon: read the whole playlist ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(300); } return null; }
  function scrollBox(el) { while (el && el !== document.body) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 10) return el; el = el.parentElement; } return document.scrollingElement; }
  async function readAmazonPlaylist() {
    const first = await waitFor(() => document.querySelector('[data-testid="ListItem"]'), 20000);
    if (!first) return { ok: false, error: 'empty' };
    const box = scrollBox(first), found = new Map();
    let idle = 0;
    for (let i = 0; i < 400 && idle < 4; i++) {
      const before = found.size;
      for (const row of document.querySelectorAll('[data-testid="ListItem"]')) {
        const lines = (row.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length < 3 || !/^\d+$/.test(lines[0])) continue;      // track rows start with their number
        const rest = lines.slice(1).filter(s => s !== 'E');             // "E" = explicit badge
        found.set(+lines[0], { title: rest[0], artist: rest[1] || '' });
      }
      idle = found.size === before ? idle + 1 : 0;
      const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
      if (atEnd && idle >= 1) idle++;
      box.scrollTop += Math.max(200, box.clientHeight * 0.8);
      await sleep(350);
    }
    box.scrollTop = 0;
    const dt = pageTitle !== null ? pageTitle : document.title, mt = dt.match(/playlist\s+(.+?)\s+(?:en|on|auf|sur|su)\s+Amazon/i);
    const title = mt ? mt[1] : dt.replace(/\s*[|·–-]\s*Amazon.*$/i, '');
    const tracks = [...found.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    return tracks.length ? { ok: true, title: title.trim(), tracks } : { ok: false, error: 'empty' };
  }

  // ---------- Amazon: start the playlist in shuffle ----------
  async function startShuffle(playlistId) {
    const btn = await waitFor(() => location.href.includes(playlistId) && document.querySelector('[data-testid*="Toolbar_Shuffle_Button"]'), 25000);
    if (!btn) return { ok: false, error: 'nobutton' };
    await sleep(800);
    sent = null; cand = null;   // the first song of the round counts even if it was heard before
    (document.querySelector('[data-testid*="Toolbar_Shuffle_Button"]') || btn).click();
    if (await waitFor(isPlaying, 6000)) return { ok: true };
    // Chrome wants one real tap in this tab before it plays sound
    return new Promise(res => {
      unpre(); busy = ''; paint();
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0d0b1a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:600 16px system-ui;cursor:pointer';
      [['70px', '▶'], ['800 28px system-ui', _('tapTitle')], ['', _('tapHint')]].forEach(([f, txt]) => { const e = document.createElement('div'); if (f.startsWith('800')) e.style.font = f; else if (f) e.style.fontSize = f; else e.style.opacity = '.7'; e.textContent = txt; o.appendChild(e); });
      o.onclick = async () => { o.remove(); (document.querySelector('[data-testid*="Toolbar_Shuffle_Button"]') || btn).click(); res({ ok: !!(await waitFor(isPlaying, 5000)), tapped: true }); };
      root.appendChild(o);
      send({ type: 'mb-needtap' });
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg) return;
    if (msg.type === 'mb-status') {
      if (msg.game) { gameAt = Date.now(); paint(); }
      // the held song (the one already sent), so a song skipped before HOLD is never reported
      const playing = isPlaying(), now = nowPlaying(), held = playing && now && now.title + '|' + now.artist === sent;
      reply({ playing, now, track: held ? { title: now.title, artist: now.artist } : null, signedOut: signedOut() }); return;
    }
    if (msg.type === 'mb-control') { control(msg.action).then(reply); return true; }
    if (msg.type === 'mb-import' && isAmazon) {
      unpre(); busy = _('readingPlaylist'); paint();
      readAmazonPlaylist().then(r => { busy = null; paint(); reply(r); }); return true;
    }
    if (msg.type === 'mb-start' && isAmazon) {
      const id = new URL(msg.url).pathname.split('/').pop();
      unpre(); busy = _('startingMusic'); paint();
      if (!location.href.includes(id)) window.postMessage({ __mbGoto: true, path: new URL(msg.url).pathname }, '*');
      startShuffle(id).then(r => { setTimeout(() => { busy = null; paint(); }, 2500); reply(r); }); return true;
    }
  });
  send({ type: 'mb-provider-ready' });
})();

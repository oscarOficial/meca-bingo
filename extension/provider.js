// Runs on the supported music web players (see players.json): Amazon Music, Spotify, Deezer,
// YouTube Music and Apple Music. Everything except the Amazon part only uses the standard
// Media Session data the player gives the browser, so it works the same on every player.
// - tells the host page which song is playing (title + artist, as the player shows them)
// - plays / pauses / skips through the player's own media-key controls (see mainworld.js)
// - Amazon Music only: reads a playlist and starts it in shuffle
(() => {
  const isAmazon = location.hostname.startsWith('music.amazon.');
  const root = document.documentElement;
  const send = m => chrome.runtime.sendMessage(m).catch(() => {});

  // ---------- cover: hides the page while the extension works in this tab ----------
  function cover(text) {
    if (document.getElementById('mb-cover')) { document.getElementById('mb-cover-t').textContent = text; return; }
    const d = document.createElement('div'); d.id = 'mb-cover';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(circle at 20% 0%,#3a1450,#0d0b1a 60%);color:#f3f0ff;font:600 18px system-ui,sans-serif';
    const img = document.createElement('img'); img.src = chrome.runtime.getURL('icons/icon128.png'); img.width = img.height = 96; img.style.borderRadius = '22px';
    const name = document.createElement('div'); name.style.font = '800 30px system-ui'; name.textContent = 'Meca Bingo';
    const msg = document.createElement('div'); msg.id = 'mb-cover-t'; msg.textContent = text;
    d.append(img, name, msg);
    root.appendChild(d);
  }
  const uncover = () => { const d = document.getElementById('mb-cover'); if (d) d.remove(); };
  if (location.hash === '#mbcover') { const s = document.createElement('style'); s.id = 'mb-pre'; s.textContent = 'html{background:#0d0b1a!important}body{visibility:hidden!important}'; root.appendChild(s); setTimeout(() => s.remove(), 30000); }
  const unpre = () => { const s = document.getElementById('mb-pre'); if (s) s.remove(); };

  // ---------- what is playing ----------
  function isPlaying() {
    if (root.dataset.mbPlaying === '1') return true;
    try { if (navigator.mediaSession.playbackState === 'playing') return true; } catch (e) {}
    return [...document.querySelectorAll('audio,video')].some(m => !m.paused);
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
    if (key !== cand) { cand = key; since = Date.now(); return; }
    if (key && key !== sent && playing && Date.now() - since >= HOLD) { sent = key; send({ type: 'mb-track', title: np.title, artist: np.artist, ts: Date.now() }); }
  }, 400);

  // ---------- player controls (through the player's own media-key handlers) ----------
  let ctlId = 0;
  const control = action => new Promise(res => {
    const id = ++ctlId;
    const on = e => { const m = e.data; if (e.source === window && m && m.__mbCtlRes && m.id === id) { removeEventListener('message', on); res({ ok: m.ok }); } };
    addEventListener('message', on);
    window.postMessage({ __mbCtl: true, id, action }, '*');
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
    const dt = document.title, mt = dt.match(/playlist\s+(.+?)\s+(?:en|on|auf|sur|su)\s+Amazon/i);
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
      unpre(); cover('');
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0d0b1a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:600 16px system-ui;cursor:pointer';
      [['70px', '▶'], ['800 28px system-ui', 'Tap to start the music'], ['', 'The browser needs one tap before music can play · Toca para empezar']].forEach(([f, txt]) => { const e = document.createElement('div'); if (f.startsWith('800')) e.style.font = f; else if (f) e.style.fontSize = f; else e.style.opacity = '.7'; e.textContent = txt; o.appendChild(e); });
      o.onclick = async () => { o.remove(); (document.querySelector('[data-testid*="Toolbar_Shuffle_Button"]') || btn).click(); res({ ok: !!(await waitFor(isPlaying, 5000)), tapped: true }); };
      root.appendChild(o);
      send({ type: 'mb-needtap' });
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg) return;
    if (msg.type === 'mb-status') { reply({ playing: isPlaying(), now: nowPlaying() }); return; }
    if (msg.type === 'mb-control') { control(msg.action).then(reply); return true; }
    if (msg.type === 'mb-import' && isAmazon) {
      unpre(); cover('Reading playlist… · Leyendo la playlist…');
      readAmazonPlaylist().then(r => { uncover(); reply(r); }); return true;
    }
    if (msg.type === 'mb-start' && isAmazon) {
      const id = new URL(msg.url).pathname.split('/').pop();
      unpre(); cover('Starting the music… · Arrancando la música…');
      if (!location.href.includes(id)) window.postMessage({ __mbGoto: true, path: new URL(msg.url).pathname }, '*');
      startShuffle(id).then(r => { setTimeout(uncover, 2500); reply(r); }); return true;
    }
  });
  send({ type: 'mb-provider-ready' });
})();

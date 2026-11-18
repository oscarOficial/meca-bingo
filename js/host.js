// Host screen: set up the game, then run it. All game state lives in this browser.
(function () {
  const { $, toast, flash, confetti, pick, esc, store, toggleFullscreen } = FX;
  const KEY = 'meca-host';
  const DEFAULT_CFG = { fmt: 'es', vertical: false, diagonal: false, prizes: { line: true, two: true, bingo: true }, clip: 0, maxPlayers: 30 };

  let lang = store.get('meca-lang') || (navigator.language || 'en').slice(0, 2); if (!I18N.T[lang]) lang = 'en';
  let t = I18N.get(lang);
  // S: the saved game (or the setup in progress)
  let S = store.get(KEY) || { phase: 'setup', cfg: { ...DEFAULT_CFG }, playlist: null, msgs: null };
  if (!S.msgs) S.msgs = { ...t.defaults };
  const save = () => store.set(KEY, S);

  // ---------------- photos (kept in this browser only) ----------------
  let photos = [];
  const db = new Promise(res => { const r = indexedDB.open('meca-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p', { autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  async function loadPhotos() {
    const d = await db; if (!d) return;
    photos = await new Promise(res => { const out = []; const c = d.transaction('p').objectStore('p').openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); }; c.onerror = () => res(out); });
    drawThumbs(); drawReel();
  }
  async function addPhoto(dataUrl) { const d = await db; if (!d) return; await new Promise(r => { const tx = d.transaction('p', 'readwrite'); tx.objectStore('p').add(dataUrl); tx.oncomplete = r; }); photos.push(dataUrl); }
  async function clearPhotos() { const d = await db; if (d) await new Promise(r => { const tx = d.transaction('p', 'readwrite'); tx.objectStore('p').clear(); tx.oncomplete = r; }); photos = []; drawThumbs(); drawReel(); }
  function shrink(file) {
    return new Promise(res => {
      const img = new Image(); img.onload = () => {
        const k = Math.min(1, 900 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', .8)); URL.revokeObjectURL(img.src);
      }; img.onerror = () => res(null); img.src = URL.createObjectURL(file);
    });
  }
  const DEFAULT_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d9a"/><stop offset="1" stop-color="#2de2e6"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="125" font-size="90" text-anchor="middle">🎵</text></svg>');
  let lastPh = -1;
  function rndPhoto() { if (!photos.length) return DEFAULT_PHOTO; let i; do { i = Math.floor(Math.random() * photos.length); } while (i === lastPh && photos.length > 1); lastPh = i; return photos[i]; }
  function drawThumbs() { $('thumbs').innerHTML = photos.map(p => `<img src="${p}" alt="">`).join(''); }
  function drawReel() { const all = photos.length ? [...photos].sort(() => Math.random() - .5) : [DEFAULT_PHOTO]; const list = []; while (list.length < 12) list.push(...all); $('reel').innerHTML = [...list, ...list].map(p => `<div class="pol"><img src="${p}" alt=""></div>`).join(''); }

  // ---------------- texts ----------------
  function texts() {
    t = I18N.get(lang); document.documentElement.lang = lang;
    const set = (id, s) => { const e = $(id); if (e) e.textContent = s; };
    $('lang').innerHTML = I18N.langs.map(l => `<option value="${l}">${I18N.T[l].langName}</option>`).join(''); $('lang').value = lang;
    set('tPlaylist', t.playlist); set('tPlaylistHint', t.playlistHint); set('importBtn', t.import); set('tOrPaste', t.orPaste); set('useList', t.useList);
    set('tCard', t.cardType); const f = $('fmt').children; f[0].textContent = t.cardEs; f[1].textContent = t.cardUs;
    set('tLines', t.lines); const v = $('vertical').children; v[0].textContent = t.linesH; v[1].textContent = t.linesHV; set('tDiag', t.diagonals); set('tVertNote', t.verticalNote);
    set('tPrizes', t.prizes); set('tPLine', t.prizeLine); set('tPTwo', t.prizeTwo); set('tPBingo', t.prizeBingo);
    set('tClip', t.clip); $('clip').innerHTML = [0, 30, 45, 60, 90].map(s => `<option value="${s}">${s ? t.secs(s) : t.full}</option>`).join('');
    set('tMax', t.maxPlayers); set('tPhotos', t.photosMsgs); set('tPhotosHint', t.photosHint); set('tAddPhotos', t.addPhotos); set('clearPhotos', t.removeAll);
    set('tMsgWait', t.msgWait); set('tMsgWin', t.msgWin); set('tMsgLose', t.msgLose); set('tOnePerLine', t.onePerLine); set('create', t.create);
    set('tScan', t.scanToJoin); set('tGoTo', t.orGoTo); set('tPlayers', t.players); set('undo', '↶ ' + t.undo);
    set('tLogHidden', t.logHidden); set('tLogHint', t.logHint); set('unlock', t.showLog); set('relock', '🔒 ' + t.hide); $('q').placeholder = t.find;
    set('tWinners', t.winners); set('tClaims', t.claims); set('endBtn', t.endGame); $('fs').title = t.fullscreen;
  }

  // ---------------- setup ----------------
  function drawSetup() {
    const c = S.cfg;
    [...$('fmt').children].forEach(b => b.classList.toggle('on', b.dataset.v === c.fmt));
    [...$('vertical').children].forEach(b => b.classList.toggle('on', b.dataset.v === (c.vertical ? '1' : '0')));
    $('diagWrap').classList.toggle('hidden', c.fmt !== 'us'); $('diagonal').checked = c.diagonal;
    $('tVertNote').classList.toggle('hidden', !(c.fmt === 'es' && c.vertical));
    $('pLine').checked = c.prizes.line; $('pTwo').checked = c.prizes.two; $('pBingo').checked = c.prizes.bingo;
    $('clip').value = c.clip; $('maxPlayers').value = c.maxPlayers;
    $('msgWait').value = S.msgs.wait.join('\n'); $('msgWin').value = S.msgs.win.join('\n'); $('msgLose').value = S.msgs.lose.join('\n');
    const pl = S.playlist;
    $('plInfo').classList.toggle('hidden', !pl);
    let ok = false;
    if (pl) {
      $('plTitle').textContent = pl.title; $('plCount').textContent = pl.tracks.length + ' ' + t.songs;
      const need = MB.minSongs(c.fmt) - pl.tracks.length; ok = need <= 0;
      $('plCheck').innerHTML = (ok ? `<span class="ok">✓ ${esc(t.enough)}</span>` : `<span class="bad">✗ ${esc(t.needMore(need))}</span>`) + (pl.note ? `<br>${esc(pl.note)}` : '');
      $('plTracks').innerHTML = pl.tracks.map((s, i) => `<div>${i + 1}. ${esc(s.title)}${s.artist ? ' — ' + esc(s.artist) : ''}</div>`).join('');
    }
    const anyPrize = c.prizes.line || c.prizes.two || c.prizes.bingo;
    $('create').disabled = !(ok && anyPrize);
  }
  function readMsgs() {
    const rd = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    S.msgs = { wait: rd('msgWait'), win: rd('msgWin'), lose: rd('msgLose') };
    ['wait', 'win', 'lose'].forEach(k => { if (!S.msgs[k].length) S.msgs[k] = [...t.defaults[k]]; });
  }
  async function importPlaylist() {
    const url = $('plUrl').value.trim(); if (!url) return;
    $('importBtn').disabled = true; $('importBtn').textContent = t.importing;
    try {
      const r = await fetch('/api/playlist?url=' + encodeURIComponent(url));
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || d.error);
      S.playlist = { title: d.title, provider: d.provider, tracks: d.tracks, note: d.note, url };
      save(); drawSetup();
    } catch (e) { toast('⚠️ ' + e.message, 6000); }
    $('importBtn').disabled = false; $('importBtn').textContent = t.import;
  }

  // ---------------- game ----------------
  let net = null, peers = {}; // connection id -> device id
  function createGame() {
    readMsgs();
    const c = S.cfg, code = MB.roomCode();
    const max = Math.max(1, Math.min(MB.MAX_PLAYERS, +c.maxPlayers || 30));
    S = { ...S, phase: 'game', code, seed: code + Date.now(), started: Date.now(),
      cards: MB.makeCards(S.playlist.tracks.length, max, c.fmt, code + Date.now()),
      players: {}, played: [], awarded: {}, claims: [] };
    save(); startGame();
  }
  const enabledPrizes = () => MB.PRIZES.filter(p => S.cfg.prizes[p]);
  // a prize stays open for ties until the next song plays after the first winner
  function currentPrize() {
    for (const p of enabledPrizes()) { const a = S.awarded[p]; if (!a || a.atSong === S.played.length) return p; }
    return null;
  }
  const prizeLabel = p => I18N.prizeName(t, p);
  function cardForPlayer(dev) {
    const p = S.players[dev]; const cells = S.cards[p.card];
    return { no: p.card + 1, fmt: S.cfg.fmt, cells: cells.map(s => s < 0 ? null : [S.playlist.tracks[s].title, S.playlist.tracks[s].artist]) };
  }
  function publicState() {
    const cur = currentPrize();
    return { t: 'state', lang, prize: cur, winners: Object.fromEntries(Object.entries(S.awarded).map(([k, v]) => [k, v.names])), over: !cur };
  }
  function onMessage(cid, m, reply) {
    if (!m || !m.t) return;
    if (m.t === 'join') {
      let p = S.players[m.dev];
      if (!p) {
        const used = new Set(Object.values(S.players).map(x => x.card));
        const free = S.cards.findIndex((_, i) => !used.has(i));
        if (free < 0) { reply({ t: 'full' }); return; }
        p = S.players[m.dev] = { name: String(m.name || '?').slice(0, 24), card: free, joined: Date.now() };
      } else if (m.name) p.name = String(m.name).slice(0, 24);
      peers[cid] = m.dev; save();
      reply({ ...publicState(), t: 'welcome', code: S.code, card: cardForPlayer(m.dev), rules: { vertical: S.cfg.vertical, diagonal: S.cfg.diagonal } });
      drawGame();
    } else if (m.t === 'claim') {
      const dev = peers[cid] || m.dev; const p = S.players[dev]; if (!p) return;
      const cur = currentPrize();
      if (m.prize !== cur) { reply({ t: 'result', ok: false, prize: m.prize, reason: 'closed' }); return; }
      const r = MB.checkClaim(S.cards[p.card], S.cfg.fmt, S.cfg, (m.marks || []).map(Number), S.played, m.prize);
      S.claims.unshift({ name: p.name, card: p.card + 1, prize: m.prize, ok: r.ok, reason: r.reason, at: S.played.length });
      if (r.ok) {
        const a = S.awarded[m.prize] || (S.awarded[m.prize] = { names: [], atSong: S.played.length });
        if (!a.names.includes(p.name)) a.names.push(p.name);
      }
      save();
      reply({ t: 'result', ok: r.ok, prize: m.prize, reason: r.reason });
      showStage(r.ok, p, m.prize, r.reason);
      net.broadcast(publicState());
      drawGame();
    }
  }
  function startGame() {
    $('setup').classList.add('hidden'); $('game').classList.remove('hidden');
    const url = location.origin + location.pathname.replace(/host\.html$/, '') + 'play.html?r=' + S.code + (new URLSearchParams(location.search).get('net') === 'local' ? '&net=local' : '');
    $('codeBig').textContent = S.code; $('joinUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*/, '') + ' · ' + S.code;
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { $('qr').textContent = url; }
    if (net) net.close();
    net = NET.hostRoom(S.code, { onMessage, onStatus: (s, e) => { if (s === 'error' && e !== 'peer-unavailable') console.warn('net', e); } });
    shuffleSnap(); drawGame();
  }
  let q = '', lastSongCount = -1;
  function drawGame() {
    const N = S.playlist.tracks.length, P = S.played, Pset = new Set(P);
    const names = Object.values(S.players);
    $('pCount').textContent = `${names.length}/${S.cards.length}`;
    $('chips').innerHTML = names.length ? names.map(p => `<span class="pill">${esc(p.name)} · #${p.card + 1}</span>`).join('') : `<span class="mut">${esc(t.noPlayers)}</span>`;
    const cur = currentPrize();
    $('prizeNow').innerHTML = cur ? `${esc(t.playingFor)} <b>${esc(prizeLabel(cur))}</b>` : `🎉 ${esc(t.allPrizesDone)}`;
    $('nowLbl').textContent = t.played(`${P.length} / ${N}`);
    $('nowTitle').textContent = P.length ? `🎵 ${t.songN(P.length)}` : t.waitingFirst;
    $('nowSub').textContent = P.length ? t.songHidden : '';
    $('prog').style.width = (P.length / N * 100) + '%'; $('undo').disabled = !P.length;
    // song log
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nq = norm(q), match = i => !nq || norm(S.playlist.tracks[i].title + ' ' + S.playlist.tracks[i].artist).includes(nq);
    const row = (i, cls) => `<div class="song ${cls}" data-s="${i}"><div class="t"><div>${esc(S.playlist.tracks[i].title)}</div><small>${esc(S.playlist.tracks[i].artist)}</small></div><span class="ck">✓</span></div>`;
    const todo = S.playlist.tracks.map((_, i) => i).filter(i => !Pset.has(i) && match(i)).sort((a, b) => norm(S.playlist.tracks[a].title).localeCompare(norm(S.playlist.tracks[b].title)));
    $('hTodo').textContent = t.notPlayed(N - P.length); $('todo').innerHTML = todo.map(i => row(i, '')).join('');
    $('hDone').textContent = t.playedList(P.length); $('done').innerHTML = [...P].reverse().filter(match).map(i => row(i, 'played')).join('');
    // winners and calls
    const W = enabledPrizes().filter(p => S.awarded[p]).map(p => `<div>🏆 <b>${esc(prizeLabel(p))}</b>: ${S.awarded[p].names.map(esc).join(', ')}</div>`);
    $('winners').innerHTML = W.join('') || '—';
    $('claims').innerHTML = S.claims.length ? S.claims.slice(0, 12).map(c => `<div class="claim"><span>${esc(c.name)} · #${c.card} · ${esc(prizeLabel(c.prize))}</span><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'}</span></div>`).join('') : esc(t.noClaims);
    if (P.length !== lastSongCount) { lastSongCount = P.length; net && net.broadcast(publicState()); }
  }
  function markSong(i) {
    const k = S.played.indexOf(i);
    if (k >= 0) S.played.splice(k, 1); else { S.played.push(i); shuffleSnap(); startClip(); q = ''; $('q').value = ''; }
    save(); drawGame();
  }
  // clip timer: reminds the host when it is time to change song
  let tId = null;
  function startClip() {
    clearInterval(tId); const secs = +S.cfg.clip; const el = $('timer'); el.className = 'timer'; el.textContent = '';
    if (!secs) return; let left = secs; el.textContent = '⏱ ' + left;
    tId = setInterval(() => { left--; el.textContent = '⏱ ' + left; if (left <= 0) { clearInterval(tId); el.className = 'timer end'; el.textContent = '⏭ ' + t.timeUp; toast('⏱ ' + t.timeUp); } }, 1000);
  }
  function shuffleSnap() { const s = $('snap'); $('snapImg').src = rndPhoto(); $('snapCap').textContent = pick(S.msgs.wait); s.classList.remove('flip'); void s.offsetWidth; s.classList.add('flip'); }
  let stT = null;
  function showStage(ok, p, prize, reason) {
    const st = $('stage'); clearTimeout(stT);
    st.className = 'stage on ' + (ok ? 'win' : 'lose');
    $('stWho').textContent = `${p.name} · #${p.card + 1} · ${prizeLabel(prize)}`;
    st.querySelector('img').src = rndPhoto();
    st.querySelector('.big p').textContent = ok ? pick(S.msgs.win) : pick(S.msgs.lose);
    st.querySelector('.stamp').textContent = ok ? t.valid : t.nope;
    if (ok) { flash('#3ef08a'); confetti(); } else flash('#ff3d9a');
    stT = setTimeout(() => st.classList.remove('on'), ok ? 6000 : 3500);
  }
  function ask(title, text, fn) { $('mTitle').textContent = title; $('mText').textContent = text; $('mNo').textContent = t.cancel; $('mYes').textContent = t.confirm; $('modal').classList.add('on'); $('mYes').onclick = () => { $('modal').classList.remove('on'); fn(); }; }

  // ---------------- events ----------------
  $('lang').onchange = () => {
    const old = I18N.get(lang); lang = $('lang').value; store.set('meca-lang', lang);
    // switch the default messages too, unless the host already edited them
    if (S.phase === 'setup') { readMsgs(); ['wait', 'win', 'lose'].forEach(k => { if (S.msgs[k].join('\n') === old.defaults[k].join('\n')) S.msgs[k] = [...I18N.get(lang).defaults[k]]; }); }
    texts(); S.phase === 'setup' ? drawSetup() : drawGame(); save();
    if (S.phase === 'game' && net) net.broadcast(publicState());
  };
  $('fs').onclick = toggleFullscreen;
  $('importBtn').onclick = importPlaylist;
  $('plUrl').onkeydown = e => { if (e.key === 'Enter') importPlaylist(); };
  $('useList').onclick = () => { const tr = MB.parsePasted($('paste').value); if (!tr.length) return; S.playlist = { title: 'My list', provider: 'pasted', tracks: tr }; save(); drawSetup(); };
  $('fmt').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.cfg.fmt = b.dataset.v; save(); drawSetup(); };
  $('vertical').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.cfg.vertical = b.dataset.v === '1'; save(); drawSetup(); };
  $('diagonal').onchange = e => { S.cfg.diagonal = e.target.checked; save(); };
  ['line', 'two', 'bingo'].forEach(p => { $('p' + p[0].toUpperCase() + p.slice(1)).onchange = e => { S.cfg.prizes[p] = e.target.checked; save(); drawSetup(); }; });
  $('clip').onchange = e => { S.cfg.clip = +e.target.value; save(); };
  $('maxPlayers').onchange = e => { S.cfg.maxPlayers = Math.max(1, Math.min(30, +e.target.value || 30)); e.target.value = S.cfg.maxPlayers; save(); };
  ['msgWait', 'msgWin', 'msgLose'].forEach(id => $(id).onchange = () => { readMsgs(); save(); });
  $('photoIn').onchange = async e => { for (const f of e.target.files) { const d = await shrink(f); if (d) await addPhoto(d); } e.target.value = ''; drawThumbs(); drawReel(); };
  $('clearPhotos').onclick = clearPhotos;
  $('create').onclick = createGame;
  $('unlock').onclick = () => { $('lock').classList.add('hidden'); $('logBody').classList.remove('hidden'); };
  $('relock').onclick = () => { $('lock').classList.remove('hidden'); $('logBody').classList.add('hidden'); q = ''; $('q').value = ''; drawGame(); };
  $('q').oninput = e => { q = e.target.value; drawGame(); };
  $('todo').onclick = $('done').onclick = e => { const r = e.target.closest('[data-s]'); if (r) markSong(+r.dataset.s); };
  $('undo').onclick = () => { S.played.pop(); save(); drawGame(); };
  $('snap').onclick = shuffleSnap;
  $('stage').onclick = () => $('stage').classList.remove('on');
  $('mNo').onclick = () => $('modal').classList.remove('on');
  $('endBtn').onclick = () => ask(t.endGame, t.endConfirm, () => {
    net && net.broadcast({ t: 'over' }); setTimeout(() => { net && net.close(); net = null; }, 500);
    S = { phase: 'setup', cfg: S.cfg, playlist: S.playlist, msgs: S.msgs }; save();
    $('game').classList.add('hidden'); $('setup').classList.remove('hidden'); drawSetup();
  });

  texts(); loadPhotos();
  if (S.phase === 'game' && S.code) startGame(); else { S.phase = 'setup'; drawSetup(); }
})();

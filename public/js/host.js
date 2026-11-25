// Host screen: set up the game, then run it. All game state lives in this browser.
(function () {
  const { $, icon, toast, pick, esc, store } = FX;
  const toggleFullscreen = () => FX.toggleFullscreen(t.noFullscreen);
  const KEY = 'meca-host';
  const DEFAULT_CFG = { fmt: 'es', freeCenter: false, prizes: MB.defaultPrizes('es'), clip: 0, gap: 'next', maxPlayers: 30, moment: 6 };

  let lang = store.get('meca-lang') || (navigator.language || 'en').slice(0, 2); if (!I18N.T[lang]) lang = 'en';
  let t = I18N.get(lang);
  // S: the saved game (or the setup in progress)
  let S = store.get(KEY) || { phase: 'setup', cfg: { ...DEFAULT_CFG }, playlist: null, msgs: null };
  if (!S.msgs) S.msgs = { ...t.defaults };
  // settings saved by older versions: line/two/bingo switches → prize list
  S.cfg = { ...DEFAULT_CFG, ...S.cfg }; S.cfg.prizes = MB.migratePrizes(S.cfg); delete S.cfg.vertical; delete S.cfg.diagonal;
  const save = () => store.set(KEY, S);

  // ---------------- Meca Bingo Sync (Chrome extension, optional) ----------------
  const EXT = { on: false, version: null, playing: false, player: false };
  let extSeq = 0; const extWait = {};
  function extCall(type, data = {}, ms = 120000) {
    return new Promise(res => {
      const id = 'x' + (++extSeq); extWait[id] = res;
      window.postMessage({ __mbPage: true, type, id, ...data }, '*');
      setTimeout(() => { if (extWait[id]) { delete extWait[id]; res({ ok: false, error: 'timeout' }); } }, ms);
    });
  }
  const isAmazon = u => /^https?:\/\/music\.amazon\./i.test(u || '');
  const normT = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s(feat|ft)\..*$/i, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // find the playlist song the player is playing (titles are written slightly differently by each provider)
  function findTrack(title, artist) {
    if (!S.playlist) return -1;
    const nt = normT(title), na = normT(artist), T = S.playlist.tracks;
    let best = -1, score = 0;
    T.forEach((tr, i) => {
      const a = normT(tr.title); let sc = 0;
      if (a === nt) sc = 3; else if (a && nt && (a.startsWith(nt + ' ') || nt.startsWith(a + ' '))) sc = 2;
      if (sc && na && normT(tr.artist) && (na.includes(normT(tr.artist).split(' ')[0]) || normT(tr.artist).includes(na.split(' ')[0]))) sc += 1;
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }
  window.addEventListener('message', e => {
    const m = e.data; if (e.source !== window || !m || !m.__mbExt) return;
    if (m.id && extWait[m.id]) { const f = extWait[m.id]; delete extWait[m.id]; f(m); }
    if (m.type === 'ready') { EXT.on = true; EXT.version = m.version; drawExt(); if (S.phase !== 'game') drawMode(); else drawGame(); if (S.phase === 'game') window.postMessage({ __mbPage: true, type: 'getState', id: 'st' }, '*'); }
    else if (m.type === 'state') { EXT.playing = !!m.playing; if (m.player !== undefined) EXT.player = m.player; drawExt(); }
    else if (m.type === 'track' && S.phase === 'game') {
      const i = findTrack(m.title, m.artist);
      if (i >= 0 && !S.played.includes(i)) { markSong(i); toast(t.autoMarked(S.played.length), undefined, 'headphones'); }
      else if (i < 0) toast(t.notOnCards, 4000, 'headphones');
    }
  });
  window.postMessage({ __mbPage: true, type: 'hello' }, '*');

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
    const seti = (id, ic, s) => { const e = $(id); if (e) e.innerHTML = icon(ic) + ' ' + esc(s); };
    $('lang').innerHTML = I18N.langs.map(l => `<option value="${l}">${I18N.T[l].langName}</option>`).join(''); $('lang').value = lang;
    set('tPasteTitle', t.pasteTitle); set('tPasteSub', t.pasteSub); $('plUrl').placeholder = t.pastePh; set('importBtn', t.import); set('tWorksWith', t.worksWith);
    set('tHowImport', t.howImport); $('importInfo').innerHTML = t.importInfo.map(x => `<li>${esc(x)}</li>`).join(''); seti('extLink', 'puzzle', t.getExt);
    set('tOrPaste', t.orPaste); set('useList', t.useList); set('plChange', '↺ ' + t.change); set('tSongList', t.songList || t.songs);
    set('tModeTitle', t.modeTitle); seti('tModeAuto', 'headphones', t.modeAuto); seti('tModeManual', 'hand', t.modeManual); set('tModeAutoDesc', t.modeAutoDesc); set('tModeManualDesc', t.modeManualDesc);
    const facts = (id, l, ics) => $(id).innerHTML = l.map((x, i) => `<li>${icon(ics[i])} ${esc(x)}</li>`).join('');
    facts('modeAutoFacts', t.modeAutoFacts, ['headphones', 'sparkles', 'user-check', 'laptop']); facts('modeManualFacts', t.modeManualFacts, ['headphones', 'hand', 'user-x', 'smartphone']);
    set('tExtMissing', t.extMissing); set('getExtBtn', t.getExtBtn + ' →'); set('tSteps', t.stepsTitle); set('helpTitle', t.howToPlay); set('helpOk', t.gotIt); $('helpBtn').title = t.howToPlay; $('helpBtn').setAttribute('aria-label', t.howToPlay);
    set('tCard', t.cardType); set('tFree', t.freeCenter); set('tFreeHint', t.freeCenterHint);
    $('fmt').children[0].innerHTML = `${cardPic('es')}<span><b>${esc(t.cardEsShort)}</b><small>${esc(t.cardEsDesc)}</small></span>`;
    $('fmt').children[1].innerHTML = `${cardPic('us')}<span><b>${esc(t.cardUsShort)}</b><small>${esc(t.cardUsDesc)}</small></span>`;
    set('tPrizesTitle', t.prizesTitle); set('tPrizesHint', t.prizesHint); seti('tMore', 'settings', t.moreOptions);
    set('tabGal', t.patGallery); seti('tabDraw', 'pencil', t.patDraw); set('dClear', t.clear); set('dInvert', t.invert); set('dAll', t.all); seti('shRemove', 'trash', t.remove); set('shDone', t.done); set('shTitle', t.prizeNameLbl);
    set('tClip', t.clip); $('clip').innerHTML = [0, 30, 45, 60, 90].map(s => `<option value="${s}">${s ? t.secs(s) : t.full}</option>`).join('');
    set('tGap', t.gapLbl); $('gap').innerHTML = ['next', 'pause'].map(v => `<option value="${v}">${v === 'pause' ? t.gapPause : t.gapNext}</option>`).join('');
    set('tMax', t.maxPlayers); set('tMoment', t.momentLbl); $('momentSecs').innerHTML = [0, 4, 6, 8, 10].map(v => `<option value="${v}">${v ? t.momentSecs(v) : t.momentOff}</option>`).join(''); seti('tPhotos', 'camera', t.photosMsgs); set('tPhotosHint', t.photosHint); set('tAddPhotos', t.addPhotos); set('clearPhotos', t.removeAll);
    set('tMsgWait', t.msgWait); set('tMsgWin', t.msgWin); set('tMsgLose', t.msgLose); set('tOnePerLine', t.onePerLine); set('create', t.create);
    set('tScan', t.scanToJoin); set('tGoTo', t.orGoTo); set('tPlayers', t.players); set('undo', '↶ ' + t.undo);
    set('tLogHidden', t.logHidden); set('tLogHint', t.logHint); set('unlock', t.showLog); seti('relock', 'lock', t.hide); $('q').placeholder = t.find;
    set('tWinners', t.winners); set('tClaims', t.claims); set('endBtn', t.endGame); $('fs').title = t.fullscreen; $('fs').setAttribute('aria-label', t.fullscreen);
    document.querySelectorAll('[data-ctl=prev],[data-ctl=next]').forEach(b => { b.title = b.dataset.ctl === 'prev' ? t.ctlPrev : t.ctlNext; b.setAttribute('aria-label', b.title); });
    set('tSpecialEvent', t.specialEvent); set('tSpecialEventLead', t.specialEventLead); drawEvents();
  }
  // special event picker under the mood cards: "None", the shown events and the current one if it is hidden (test)
  function drawEvents() {
    if (!window.Events) return;
    const cur = Events.get() || '', ids = [...Events.list]; if (cur && !ids.includes(cur)) ids.push(cur);
    // every option starts with the same icon slot ("None" leaves it empty) so the names line up
    const opt = id => `<span class="evico">${id ? `<img src="${esc(Events.icon(id))}" alt="">` : ''}</span><span>${esc(id ? Events.name(id, lang) : t.eventNone)}</span>`;
    $('eventWrap').classList.toggle('hidden', !ids.length); $('eventPick').setAttribute('aria-label', t.specialEvent);
    const sum = $('eventCur'); sum.title = t.specialEvent; sum.setAttribute('aria-label', t.specialEvent); sum.innerHTML = opt(cur);
    $('eventPick').innerHTML = ['', ...ids].map(id => `<button type="button" data-event="${id}" aria-pressed="${id === cur}">${opt(id)}</button>`).join('');
  }

  // small picture of a card type (the 3×9 one with its gaps)
  function cardPic(fmt) {
    const rows = fmt === 'es' ? 3 : 5, cols = fmt === 'es' ? 9 : 5, gaps = ['010100110', '101011000', '000110101'];
    let r = '';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const gap = fmt === 'es' && gaps[y][x] === '1';
      r += `<rect x="${x * 12}" y="${y * 12}" width="10" height="10" rx="2.4" class="${gap ? 'pgap' : 'poff'}"/>`;
    }
    return `<svg class="cardpic" viewBox="-1 -1 ${cols * 12} ${rows * 12}" aria-hidden="true">${r}</svg>`;
  }
  // ---------------- setup ----------------
  const prizeTitle = (k, cfg = S.cfg) => I18N.prizeTitle(t, cfg.fmt, cfg.prizes[k]);
  function drawSetup() {
    const c = S.cfg, pl = S.playlist;
    $('step1').classList.toggle('hidden', !!pl); $('step2').classList.toggle('hidden', !pl);
    [...$('fmt').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.v === c.fmt));
    $('freeWrap').classList.toggle('hidden', c.fmt !== 'us'); $('freeCenter').checked = !!c.freeCenter;
    $('clip').value = c.clip; $('gap').value = c.gap; $('gap').disabled = !+c.clip; $('maxPlayers').value = c.maxPlayers; $('momentSecs').value = c.moment ?? 6;
    $('msgWait').value = S.msgs.wait.join('\n'); $('msgWin').value = S.msgs.win.join('\n'); $('msgLose').value = S.msgs.lose.join('\n');
    let ok = false;
    if (pl) {
      $('plTitle').textContent = pl.provider === 'pasted' ? t.myList : pl.title; $('plCount').textContent = pl.tracks.length + ' ' + t.songs;
      $('plOpen').classList.toggle('hidden', !pl.url); if (pl.url) { $('plOpen').href = pl.url; $('plOpen').textContent = t.openPlaylist(t.providers[pl.provider] || ''); }
      // songs and players go together: more players need more songs
      const n = pl.tracks.length, players = +c.maxPlayers || 30, cap = MB.maxPlayersFor(c.fmt, n);
      const need = MB.minSongs(c.fmt, players) - n; ok = need <= 0;
      let msg;
      if (ok) msg = `<span class="ok">✓ ${esc(t.enoughFor(n, players))}</span>` + (cap > players ? ` <span class="mut">${esc(t.upTo(cap))}</span>` : '');
      else if (cap > 0) msg = `<span class="bad">✗ ${esc(t.needFor(players, MB.minSongs(c.fmt, players), need))}</span><br><span class="warn">${esc(t.orLower(cap))}</span> <button class="btn" id="useCap" style="padding:6px 12px;margin-top:6px">${esc(t.setPlayers(cap))}</button>`;
      else msg = `<span class="bad">✗ ${esc(t.needMore(MB.minSongs(c.fmt, 1) - n))}</span>`;
      $('plCheck').innerHTML = msg + (pl.note === 'spotify100' ? `<br>${esc(t.spotifyNote)}` : '');
      const u = $('useCap'); if (u) u.onclick = () => { S.cfg.maxPlayers = cap; save(); drawSetup(); };
      $('plTracks').innerHTML = pl.tracks.map((s, i) => `<div>${i + 1}. ${esc(s.title)}${s.artist ? ' — ' + esc(s.artist) : ''}</div>`).join('');
    }
    drawPrizes();
    $('create').disabled = !(ok && c.prizes.length);
    drawMode();
  }
  // automatic (extension marks the songs, host can play) or manual (host marks, doesn't play)
  const mode = () => S.cfg.mode || (EXT.on ? 'auto' : 'manual');
  function drawMode() {
    if (!$('modePick')) return;
    const m = mode();
    [...$('modePick').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    const st = $('extState'); if (EXT.on) st.textContent = '✓ ' + t.extReady; else st.innerHTML = icon('puzzle') + ' ' + esc(t.getExtBtn); st.className = 'pill ' + (EXT.on ? 'ok' : 'warn');
    $('extWarn').classList.toggle('hidden', !(m === 'auto' && !EXT.on));
    $('stepsList').innerHTML = (m === 'auto' ? t.stepsAuto : t.stepsManual).map(x => `<li>${esc(x)}</li>`).join('');
  }
  function showHelp() {
    $('helpRules').innerHTML = t.rules.map(x => `<li>${esc(x)}</li>`).join('');
    const names = (S.cfg.prizes || []).map((_, k) => prizeTitle(k));
    $('helpPrizes').textContent = names.length ? t.rulesPrizes + ' ' + names.join(' → ') : '';
    $('help').classList.add('on');
  }
  // ---- prizes: cards with the shape, how soon it is usually won and warnings ----
  let est = null, estKey = '', estT = null;
  function drawPrizes() {
    const c = S.cfg, list = $('prizeList');
    const key = JSON.stringify([c.fmt, c.freeCenter, c.maxPlayers, S.playlist && S.playlist.tracks.length, c.prizes.map(p => p.pat)]);
    if (key !== estKey) { estKey = key; est = null; clearTimeout(estT); estT = setTimeout(runEstimate, 250); }
    const n = c.prizes.length;
    list.innerHTML = c.prizes.map((p, k) => {
      const e = est && est[k], warns = [];
      if (e) {
        if (k > 0 && est[k - 1] && e.median != null && est[k - 1].median != null && e.median < est[k - 1].median) warns.push(t.warnOrder);
        if (e.never > 0.25) warns.push(t.warnNever); else if (e.ties > 0.35) warns.push(t.warnTies);
      }
      return `<div class="pz" role="button" tabindex="0" data-k="${k}" aria-label="${esc(t.prizeN(k + 1) + ': ' + prizeTitle(k))}">
        <span class="num">${k + 1}</span>
        <span class="mv">${k > 0 ? `<button type="button" data-up="${k}" title="${esc(t.moveUp)}" aria-label="${esc(t.moveUp)}">↑</button>` : ''}${k < n - 1 ? `<button type="button" data-down="${k}" title="${esc(t.moveDown)}" aria-label="${esc(t.moveDown)}">↓</button>` : ''}</span>
        ${PATUI.html(c.fmt, p.pat, { free: c.freeCenter && c.fmt === 'us', label: prizeTitle(k) })}
        <b>${esc(prizeTitle(k))}</b>
        <span class="est">${e && e.median ? esc(t.aroundSong(e.median)) : est ? '' : esc(t.checking)}</span>
        ${warns.map(w => `<span class="w">${icon('triangle-exclamation-point')} ${esc(w)}</span>`).join('')}
      </div>`;
    }).join('') + (n < MB.MAX_PRIZES ? `<button type="button" class="pz add" id="addPrize">${esc(t.addPrize)}</button>` : '');
  }
  function runEstimate() {
    const c = S.cfg; if (!S.playlist || !c.prizes.length) return;
    const n = S.playlist.tracks.length, F = MB.FORMATS[c.fmt];
    if (n < F.songs + 2) return;
    const k = estKey;
    const r = MB.simulate(c.fmt, n, Math.max(2, Math.min(+c.maxPlayers || 30, 30)), c.prizes, { runs: 150, freeCenter: c.freeCenter });
    if (k === estKey) { est = r; drawPrizes(); }
  }
  // move prizes when the card type changes: same shape when it exists, otherwise dropped
  function convertPrizes(prizes, from, to) {
    const out = [];
    for (const p of prizes) {
      if (p.preset && p.preset !== 'custom') { const hit = MB.presetById(to, p.preset); if (hit) out.push({ ...p, pat: hit.pat }); continue; }
      if (p.pat.kind === 'masks') {
        const max = MB.GRID[to].rows * MB.GRID[to].cols;
        const masks = p.pat.masks.map(m => m.filter(i => i < max)).filter(m => m.length);
        if (masks.length) out.push({ ...p, pat: { kind: 'masks', masks } });
      }
    }
    return out.length ? out : MB.defaultPrizes(to);
  }

  // ---- the prize editor (bottom sheet) ----
  let edK = -1, ed = null, tab = 'gal';
  function openSheet(k) {
    const c = S.cfg;
    const unused = MB.PRESETS[c.fmt].find(p => p.id !== 'full' && !c.prizes.some(x => x.preset === p.id)) || MB.PRESETS[c.fmt][0];
    edK = k; ed = k < c.prizes.length ? JSON.parse(JSON.stringify(c.prizes[k])) : { preset: unused.id, pat: unused.pat };
    tab = ed.preset === 'custom' ? 'draw' : 'gal';
    $('shRemove').classList.toggle('hidden', !(k < c.prizes.length && c.prizes.length > 1));
    $('shClose').setAttribute('aria-label', t.cancel); $('shClose').title = t.cancel;
    $('sheet').classList.add('on'); $('sheet').setAttribute('aria-hidden', 'false');
    drawSheet(); setTimeout(() => $('shName').focus({ preventScroll: true }), 50);
  }
  function closeSheet() { $('sheet').classList.remove('on'); $('sheet').setAttribute('aria-hidden', 'true'); edK = -1; ed = null; }
  const edName = () => ed.name || I18N.prizeTitle(t, S.cfg.fmt, ed);
  function drawSheet() {
    const c = S.cfg, fmt = c.fmt, free = c.freeCenter && fmt === 'us';
    $('shPic').innerHTML = PATUI.html(fmt, ed.pat, { free });
    $('shName').value = edName();
    $('tabGal').setAttribute('aria-selected', tab === 'gal'); $('tabDraw').setAttribute('aria-selected', tab === 'draw');
    $('gal').classList.toggle('hidden', tab !== 'gal'); $('draw').classList.toggle('hidden', tab !== 'draw');
    $('gal').innerHTML = MB.PRESETS[fmt].map(p => `<button type="button" data-preset="${p.id}" aria-pressed="${ed.preset === p.id}">${ed.preset === p.id ? '<span class="tick">✓</span>' : ''}${PATUI.html(fmt, p.pat, { free })}<b>${esc(t.presets[fmt][p.id])}</b><small>${esc((fmt === 'us' && p.id === 'line' ? t.presetHints.lineAny : t.presetHints[p.id]) || '')}</small></button>`).join('');
    const sel = $('gal').querySelector('[aria-pressed=true]'); if (sel && tab === 'gal') setTimeout(() => sel.scrollIntoView({ block: 'nearest' }), 30);
    // drawing grid: the current shape (first position of a preset, so it can be edited)
    const on = new Set(ed.preset === 'custom' ? ed.pat.masks[0] : PATUI.frames(fmt, ed.pat)[0]);
    const G = MB.GRID[fmt];
    $('drawHint').textContent = fmt === 'es' ? t.drawHint + ' ' + t.drawHintEs : t.drawHint;
    $('drawGrid').className = 'drawgrid ' + fmt;
    $('drawGrid').innerHTML = Array.from({ length: G.rows * G.cols }, (_, i) => free && i === MB.FREE_CELL
      ? `<button type="button" class="free" disabled aria-label="free">★</button>`
      : `<button type="button" data-cell="${i}" aria-pressed="${on.has(i)}" aria-label="${Math.floor(i / G.cols) + 1}·${i % G.cols + 1}"></button>`).join('');
  }
  // drawing: cells pressed in the grid become the shape
  function setDrawn(cells) {
    const list = [...cells].sort((a, b) => a - b);
    ed.preset = 'custom'; ed.pat = { kind: 'masks', masks: [list] };
    if (!ed.nameEdited) delete ed.name;
    $('shPic').innerHTML = PATUI.html(S.cfg.fmt, ed.pat, { free: S.cfg.freeCenter && S.cfg.fmt === 'us' });
    if (!ed.nameEdited) $('shName').value = edName();
    [...$('gal').children].forEach(b => b.setAttribute('aria-pressed', 'false'));
  }
  const drawnCells = () => new Set([...$('drawGrid').querySelectorAll('[aria-pressed=true]')].map(b => +b.dataset.cell));
  let painting = null;
  $('drawGrid').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-cell]'); if (!b) return; e.preventDefault();
    painting = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', painting); setDrawn(drawnCells());
  });
  $('drawGrid').addEventListener('pointermove', e => {
    if (painting === null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest && el.closest('#drawGrid [data-cell]');
    if (b && b.getAttribute('aria-pressed') !== String(painting)) { b.setAttribute('aria-pressed', painting); setDrawn(drawnCells()); }
  });
  addEventListener('pointerup', () => { painting = null; });
  $('dClear').onclick = () => { $('drawGrid').querySelectorAll('[data-cell]').forEach(b => b.setAttribute('aria-pressed', 'false')); setDrawn(new Set()); };
  $('dAll').onclick = () => { $('drawGrid').querySelectorAll('[data-cell]').forEach(b => b.setAttribute('aria-pressed', 'true')); setDrawn(drawnCells()); };
  $('dInvert').onclick = () => { $('drawGrid').querySelectorAll('[data-cell]').forEach(b => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true')); setDrawn(drawnCells()); };
  $('gal').onclick = e => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    ed.preset = b.dataset.preset; ed.pat = MB.presetById(S.cfg.fmt, ed.preset).pat; if (!ed.nameEdited) delete ed.name;
    drawSheet();
  };
  $('tabGal').onclick = () => { tab = 'gal'; drawSheet(); };
  $('tabDraw').onclick = () => {
    tab = 'draw';
    // drawing always gives one exact shape: start from what the picture shows now
    if (ed.preset !== 'custom') { ed.preset = 'custom'; ed.pat = { kind: 'masks', masks: [PATUI.frames(S.cfg.fmt, ed.pat)[0]] }; if (!ed.nameEdited) delete ed.name; }
    drawSheet();
  };
  $('shName').oninput = e => { const v = e.target.value.trim(); if (v && v !== I18N.prizeTitle(t, S.cfg.fmt, { preset: ed.preset })) { ed.name = v; ed.nameEdited = true; } else { delete ed.name; ed.nameEdited = false; } };
  $('shDone').onclick = () => {
    if (ed.pat.kind === 'masks' && !ed.pat.masks.some(m => m.length)) { toast(t.drawHint, 3000, 'pencil'); return; }
    const p = { preset: ed.preset, pat: ed.pat }; if (ed.name) p.name = ed.name;
    if (edK < S.cfg.prizes.length) S.cfg.prizes[edK] = p; else S.cfg.prizes.push(p);
    save(); closeSheet(); drawSetup();
  };
  $('shRemove').onclick = () => { S.cfg.prizes.splice(edK, 1); save(); closeSheet(); drawSetup(); };
  $('sheet').onclick = e => { if (e.target === $('sheet')) closeSheet(); };
  $('shClose').onclick = closeSheet;
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('sheet').classList.contains('on')) closeSheet(); });
  $('prizeList').onclick = e => {
    const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]'), P = S.cfg.prizes;
    if (up) { const k = +up.dataset.up; [P[k - 1], P[k]] = [P[k], P[k - 1]]; save(); drawSetup(); return; }
    if (down) { const k = +down.dataset.down; [P[k + 1], P[k]] = [P[k], P[k + 1]]; save(); drawSetup(); return; }
    if (e.target.closest('#addPrize')) { openSheet(P.length); return; }
    const card = e.target.closest('.pz[data-k]'); if (card) openSheet(+card.dataset.k);
  };
  $('prizeList').onkeydown = e => { const card = e.target.closest('.pz[data-k]'); if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openSheet(+card.dataset.k); } };
  function readMsgs() {
    const rd = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
    S.msgs = { wait: rd('msgWait'), win: rd('msgWin'), lose: rd('msgLose') };
    ['wait', 'win', 'lose'].forEach(k => { if (!S.msgs[k].length) S.msgs[k] = [...t.defaults[k]]; });
  }
  async function importPlaylist() {
    const url = $('plUrl').value.trim(); if (!url) return;
    $('importBtn').disabled = true; $('importBtn').textContent = t.importing;
    try {
      if (isAmazon(url)) {
        if (!EXT.on) throw new Error(t.needExtension);
        const r = await extCall('import', { url });
        if (!r.ok || !r.tracks || !r.tracks.length) { STATS.track('import', { provider: 'amazon', ok: false, error: r.error || 'empty' }); throw new Error(t.errEmpty('Amazon Music')); }
        S.playlist = { title: r.title || 'Amazon Music', provider: 'amazon', tracks: r.tracks, url };
        STATS.track('import', { provider: 'amazon', ok: true, songs: r.tracks.length });
        save(); drawSetup(); return;
      }
      let r, d;
      try { r = await fetch('/api/playlist?url=' + encodeURIComponent(url)); d = await r.json(); } catch (e) { throw new Error(t.errNetwork); }
      if (!r.ok) {
        const prov = t.providers[d.provider] || '';
        if (d.detail) console.warn('playlist import:', d.detail);
        STATS.track('import', { provider: d.provider || 'unknown', ok: false, error: d.error || 'failed' });
        throw new Error(d.error === 'unsupported' ? t.errUnsupported : d.error === 'empty' ? t.errEmpty(prov) : t.errFailed(prov));
      }
      S.playlist = { title: d.title, provider: d.provider, tracks: d.tracks, note: d.note, url };
      scrollTo(0, 0);
      STATS.track('import', { provider: d.provider, ok: true, songs: d.tracks.length });
      save(); drawSetup();
    } catch (e) { toast(e.message, 8000, 'triangle-exclamation-point'); }
    finally { $('importBtn').disabled = false; $('importBtn').textContent = t.import; }
  }

  // ---------------- game ----------------
  let net = null, peers = {}; // connection id -> device id
  function createGame() {
    readMsgs();
    const c = S.cfg, code = MB.roomCode();
    const max = Math.max(1, Math.min(MB.MAX_PLAYERS, +c.maxPlayers || 30));
    S = { ...S, phase: 'game', mode: mode(), code, seed: code + Date.now(), started: Date.now(),
      cards: MB.makeCards(S.playlist.tracks.length, max, c.fmt, code + Date.now(), { freeCenter: c.fmt === 'us' && c.freeCenter }),
      players: {}, played: [], awarded: {}, claims: [] };
    save(); startGame();
    STATS.track('game_created', { provider: (S.playlist && S.playlist.provider) || 'unknown', songs: S.playlist.tracks.length, fmt: c.fmt,
      prizes: c.prizes.map(p => p.preset || 'custom').join('+'), nPrizes: c.prizes.length, freeCenter: !!c.freeCenter, clip: +c.clip || 0, maxPlayers: max,
      photos: photos.length, mode: S.mode, ext: EXT.on, extVersion: EXT.version || '' });
  }
  const enabledPrizes = () => S.cfg.prizes.map((_, k) => k);
  // a prize stays open for ties until the next song plays after the first winner
  function currentPrize() {
    for (const p of enabledPrizes()) { const a = S.awarded[p]; if (!a || a.atSong === S.played.length) return p; }
    return null;
  }
  const prizeLabel = k => prizeTitle(k);
  function cardForPlayer(dev) {
    const p = S.players[dev]; const cells = S.cards[p.card];
    return { no: p.card + 1, fmt: S.cfg.fmt, cells: cells.map(s => s === MB.FREE ? 'free' : s < 0 ? null : [S.playlist.tracks[s].title, S.playlist.tracks[s].artist]) };
  }
  function publicState() {
    const cur = currentPrize();
    const prizes = S.cfg.prizes.map((p, k) => ({ name: prizeTitle(k), pat: p.pat }));
    return { t: 'state', lang, skin: window.Skin ? Skin.get() : undefined, event: window.Events ? Events.get() : null, prize: cur, prizes, fmt: S.cfg.fmt, free: S.cfg.fmt === 'us' && !!S.cfg.freeCenter, winners: Object.fromEntries(Object.entries(S.awarded).map(([k, v]) => [k, v.names])), over: cur === null };
  }
  function onMessage(cid, m, reply) {
    if (!m || !m.t) return;
    if (m.t === 'peek') reply(publicState());   // a phone on the name screen asks for the skin and language
    else if (m.t === 'join') {
      let p = S.players[m.dev];
      if (!p) {
        const used = new Set(Object.values(S.players).map(x => x.card));
        const free = S.cards.findIndex((_, i) => !used.has(i));
        if (free < 0) { reply({ t: 'full' }); return; }
        p = S.players[m.dev] = { name: String(m.name || '?').slice(0, 24), card: free, joined: Date.now() };
        STATS.track('player_joined', { players: Object.keys(S.players).length });
      } else if (m.name) p.name = String(m.name).slice(0, 24);
      peers[cid] = m.dev; save();
      reply({ ...publicState(), t: 'welcome', code: S.code, card: cardForPlayer(m.dev), rules: { vertical: MB.needsRealLayout(S.cfg.fmt, S.cfg.prizes) } });
      drawGame();
    } else if (m.t === 'claim') {
      const dev = peers[cid] || m.dev; const p = S.players[dev]; if (!p) return;
      const cur = currentPrize();
      if (m.prize !== cur || !S.cfg.prizes[m.prize]) { reply({ t: 'result', ok: false, prize: m.prize, reason: 'closed' }); return; }
      const r = MB.checkClaim(S.cards[p.card], S.cfg.fmt, S.cfg.prizes[m.prize].pat, (m.marks || []).map(Number), S.played);
      S.claims.unshift({ name: p.name, card: p.card + 1, prize: m.prize, ok: r.ok, reason: r.reason, at: S.played.length });
      if (r.ok) {
        const a = S.awarded[m.prize] || (S.awarded[m.prize] = { names: [], atSong: S.played.length });
        if (!a.names.includes(p.name)) a.names.push(p.name);
      }
      save();
      reply({ t: 'result', ok: r.ok, prize: m.prize, reason: r.reason, wrong: r.wrong || [] });
      STATS.track('claim', { prize: (S.cfg.prizes[m.prize] && S.cfg.prizes[m.prize].preset) || 'custom', n: +m.prize + 1, ok: r.ok, reason: r.ok ? '' : (r.reason || ''), songs: S.played.length, players: Object.keys(S.players).length, fmt: S.cfg.fmt });
      showStage(r.ok, p, m.prize, r.reason);
      net.broadcast(publicState());
      drawGame();
    }
  }
  function startGame() {
    $('setup').classList.add('hidden'); $('game').classList.remove('hidden'); scrollTo(0, 0); document.body.classList.add('ingame');
    const url = new URL('play.html', location.href).href.replace(/\?.*$/, '') + '?r=' + S.code + (new URLSearchParams(location.search).get('net') === 'local' ? '&net=local' : '');
    $('codeBig').textContent = S.code; $('joinUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*/, '') + ' · ' + S.code;
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { $('qr').textContent = url; }
    if (net) net.close();
    net = NET.hostRoom(S.code, { onMessage, onStatus: (s, e) => { if (s === 'error' && e !== 'peer-unavailable') console.warn('net', e); } });
    shuffleSnap(); drawGame(); drawExt();
  }
  let q = '', lastSongCount = -1;
  function drawGame() {
    const N = S.playlist.tracks.length, P = S.played, Pset = new Set(P);
    const go = $('gameOpen'), pu = S.playlist && S.playlist.url;
    go.classList.toggle('hidden', !pu); if (pu) { go.href = pu; go.textContent = t.openPlaylist(t.providers[S.playlist.provider] || ''); }
    const names = Object.values(S.players);
    $('pCount').textContent = `${names.length}/${S.cards.length}`;
    $('chips').innerHTML = names.length ? names.map(p => `<span class="pill">${esc(p.name)} · #${p.card + 1}</span>`).join('') : `<span class="mut">${esc(t.noPlayers)}</span>`;
    const cur = currentPrize();
    $('prizeNow').innerHTML = cur !== null ? `${esc(t.playingFor)} <b>${esc(prizeLabel(cur))}</b>${PATUI.html(S.cfg.fmt, S.cfg.prizes[cur].pat, { free: S.cfg.fmt === 'us' && S.cfg.freeCenter })}` : `${icon('party-popper')} ${esc(t.allPrizesDone)}`;
    const md = S.mode || 'manual', mb = $('modeBanner');
    mb.className = 'modebanner ' + (md === 'auto' && !EXT.on ? 'warn' : md);
    mb.innerHTML = md === 'auto' ? (EXT.on ? icon('headphones') + ' ' + esc(t.autoBanner) : icon('triangle-exclamation-point') + ' ' + esc(t.autoNoExt)) : icon('hand') + ' ' + esc(t.manualBanner);
    $('nowLbl').textContent = t.played(`${P.length} / ${N}`);
    $('nowTitle').innerHTML = P.length ? `${icon('eighth-notes')} ${esc(t.songN(P.length))}` : esc(t.waitingFirst);
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
    const W = enabledPrizes().filter(p => S.awarded[p]).map(p => `<div>${icon('trophy')} <b>${esc(prizeLabel(p))}</b>: ${S.awarded[p].names.map(esc).join(', ')}</div>`);
    $('winners').innerHTML = W.join('') || '—';
    $('claims').innerHTML = S.claims.length ? S.claims.slice(0, 12).map(c => `<div class="claim"><span>${esc(c.name)} · #${c.card} · ${esc(prizeLabel(c.prize))}</span><span class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'}</span></div>`).join('') : esc(t.noClaims);
    if (P.length !== lastSongCount) { lastSongCount = P.length; net && net.broadcast(publicState()); }
  }
  function markSong(i) {
    const k = S.played.indexOf(i);
    if (k >= 0) S.played.splice(k, 1); else { S.played.push(i); shuffleSnap(); showMoment(); startClip(); q = ''; $('q').value = ''; }
    save(); drawGame();
  }
  // clip timer: reminds the host when it is time to change song
  let tId = null;
  function startClip() {
    clearInterval(tId); const secs = +S.cfg.clip; const el = $('timer'); el.className = 'timer'; el.textContent = '';
    if (!secs) return; let left = secs; el.innerHTML = icon('timer') + ' ' + left;
    tId = setInterval(() => { left--; el.innerHTML = icon('timer') + ' ' + left; if (left <= 0) { clearInterval(tId); el.className = 'timer end'; if (!(EXT.on && EXT.playing)) { el.innerHTML = icon('skip-forward') + ' ' + esc(t.timeUp); toast(t.timeUp, undefined, 'timer'); }
      else if (S.cfg.gap !== 'pause') { el.innerHTML = icon('skip-forward') + ' ' + esc(t.timeUp); extCall('control', { action: 'next' }, 5000); }
      else { el.innerHTML = icon('pause') + ' ' + t.timeUpPaused(icon('skip-forward')); EXT.playing = false; drawExt(); extCall('control', { action: 'pause' }, 5000).then(r => { if (!r.ok) toast(r.error === 'notab' ? t.noPlayer : t.controlFailed, 5000, 'triangle-exclamation-point'); }); } } }, 1000);
  }
  function drawExt() {
    const pill = $('extPill'); if (pill) { pill.classList.toggle('hidden', !EXT.on); pill.title = 'Meca Bingo Sync ' + (EXT.version || ''); }
    const bar = $('ctlbar'); if (!bar) return;
    const inGame = S.phase === 'game';
    bar.classList.toggle('hidden', !(EXT.on && inGame));
    if (!inGame) return;
    const canStart = S.playlist && S.playlist.provider === 'amazon' && S.playlist.url;
    const pre = canStart && !S.musicStarted;
    bar.classList.toggle('pre', !!pre);
    const tg = $('ctlToggle');
    if (pre) { tg.innerHTML = icon('play') + ' ' + esc(t.startMusic); tg.removeAttribute('aria-label'); tg.removeAttribute('title'); tg.classList.add('start'); tg.classList.remove('playing'); }
    else { tg.innerHTML = icon(EXT.playing ? 'pause' : 'play'); tg.title = EXT.playing ? t.ctlPause : t.ctlPlay; tg.setAttribute('aria-label', tg.title); tg.classList.remove('start'); tg.classList.toggle('playing', EXT.playing); }
  }
  async function ctl(action) {
    if (action === 'toggle' && $('ctlToggle').classList.contains('start')) {
      S.musicStarted = true; save(); drawExt(); toast(t.startingMusic, undefined, 'play');
      const r = await extCall('start', { url: S.playlist.url });
      if (!r.ok) { S.musicStarted = false; save(); drawExt(); toast(t.startFailed, 6000, 'triangle-exclamation-point'); }
      return;
    }
    if (action === 'toggle') { EXT.playing = !EXT.playing; drawExt(); }
    const r = await extCall('control', { action }, 8000);
    if (!r.ok) toast(r.error === 'notab' ? t.noPlayer : t.controlFailed, 5000, 'triangle-exclamation-point');
  }
  // Photo moment: after each new song the photo and its message take the whole screen for a few seconds
  let mT = null;
  function showMoment() {
    const secs = S.cfg.moment ?? 6; const m = $('moment');
    if (!secs || !photos.length || $('stage').classList.contains('on')) return;
    clearTimeout(mT); m.classList.remove('out');
    $('mImg').src = $('snapImg').src; $('mCap').textContent = $('snapCap').textContent;
    $('mLbl').innerHTML = icon('eighth-notes') + ' ' + esc(t.songN(S.played.length));
    m.style.setProperty('--msecs', secs + 's');
    m.classList.remove('on'); void m.offsetWidth; m.classList.add('on');
    mT = setTimeout(hideMoment, secs * 1000); FX.moment();
  }
  function hideMoment() { const m = $('moment'); if (!m.classList.contains('on')) return; m.classList.add('out'); clearTimeout(mT); mT = setTimeout(() => m.classList.remove('on', 'out'), 650); }
  function shuffleSnap() { const s = $('snap'); $('snapImg').src = rndPhoto(); $('snapCap').textContent = pick(S.msgs.wait); s.classList.remove('flip'); void s.offsetWidth; s.classList.add('flip'); }
  let stT = null;
  function showStage(ok, p, prize, reason) {
    hideMoment(); const st = $('stage'); clearTimeout(stT);
    st.className = 'stage on ' + (ok ? 'win' : 'lose');
    $('stWho').textContent = `${p.name} · #${p.card + 1} · ${prizeLabel(prize)}`;
    st.querySelector('img').src = rndPhoto();
    st.querySelector('.big p').textContent = ok ? pick(S.msgs.win) : pick(S.msgs.lose);
    st.querySelector('.stamp').textContent = ok ? t.valid : t.nope;
    ok ? FX.win() : FX.nope();
    stT = setTimeout(() => st.classList.remove('on'), ok ? 6000 : 3500);
  }
  function ask(title, text, fn) { $('mTitle').textContent = title; $('mText').textContent = text; $('mNo').textContent = t.cancel; $('mYes').textContent = t.confirm; $('modal').classList.add('on'); $('mYes').onclick = () => { $('modal').classList.remove('on'); fn(); }; }

  // ---------------- events ----------------
  addEventListener('skinchange', () => { if (S.phase === 'game' && net) net.broadcast(publicState()); });
  addEventListener('eventchange', () => { drawEvents(); if (S.phase === 'game' && net) net.broadcast(publicState()); });
  $('eventPick').onclick = e => { const b = e.target.closest('[data-event]'); if (b) { Events.set(b.dataset.event); $('eventMenu').open = false; } };
  // close the event dropdown on a click outside it or on Escape (like the language menu in skin.js)
  document.addEventListener('click', e => { if ($('eventMenu').open && !$('eventMenu').contains(e.target)) $('eventMenu').open = false; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('eventMenu').open) { $('eventMenu').open = false; $('eventCur').focus(); } });
  $('lang').onchange = () => {
    const old = I18N.get(lang); lang = $('lang').value; store.set('meca-lang', lang);
    // switch the default messages too, unless the host already edited them
    if (S.phase === 'setup') { readMsgs(); ['wait', 'win', 'lose'].forEach(k => { if (S.msgs[k].join('\n') === old.defaults[k].join('\n')) S.msgs[k] = [...I18N.get(lang).defaults[k]]; }); }
    texts(); S.phase === 'setup' ? drawSetup() : drawGame(); drawExt(); save();
    if (S.phase === 'game' && net) net.broadcast(publicState());
  };
  $('fs').onclick = toggleFullscreen;
  $('useList').onclick = () => { const tr = MB.parsePasted($('paste').value); if (!tr.length) return; S.playlist = { title: t.myList, provider: 'pasted', tracks: tr }; save(); drawSetup(); };
  $('fmt').onclick = e => { const b = e.target.closest('button'); if (!b || b.dataset.v === S.cfg.fmt) return; S.cfg.prizes = convertPrizes(S.cfg.prizes, S.cfg.fmt, b.dataset.v); S.cfg.fmt = b.dataset.v; save(); drawSetup(); };
  $('modePick').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; S.cfg.mode = b.dataset.mode; save(); drawMode(); };
  $('helpBtn').onclick = showHelp; $('helpOk').onclick = () => $('help').classList.remove('on');
  $('help').onclick = e => { if (e.target === $('help')) $('help').classList.remove('on'); };
  $('freeCenter').onchange = e => { S.cfg.freeCenter = e.target.checked; save(); drawSetup(); };
  $('plChange').onclick = () => { S.playlist = null; save(); drawSetup(); setTimeout(() => $('plUrl').focus(), 50); };
  $('plForm').onsubmit = e => { e.preventDefault(); importPlaylist(); };
  $('clip').onchange = e => { S.cfg.clip = +e.target.value; $('gap').disabled = !S.cfg.clip; save(); };
  $('gap').onchange = e => { S.cfg.gap = e.target.value; save(); };
  $('momentSecs').onchange = e => { S.cfg.moment = +e.target.value; save(); };
  $('maxPlayers').oninput = e => { const v = +e.target.value; if (v >= 1 && v <= 30) { S.cfg.maxPlayers = v; save(); drawSetup(); } };
  $('maxPlayers').onchange = e => { S.cfg.maxPlayers = Math.max(1, Math.min(30, +e.target.value || 30)); e.target.value = S.cfg.maxPlayers; save(); drawSetup(); };
  ['msgWait', 'msgWin', 'msgLose'].forEach(id => $(id).onchange = () => { readMsgs(); save(); });
  $('photoIn').onchange = async e => { for (const f of e.target.files) { const d = await shrink(f); if (d) await addPhoto(d); } e.target.value = ''; drawThumbs(); drawReel(); };
  $('clearPhotos').onclick = clearPhotos;
  $('create').onclick = createGame;
  const openLog = () => { $('lock').classList.add('hidden'); $('logBody').classList.remove('hidden'); };
  $('unlock').onclick = () => S.mode === 'auto' && EXT.on ? ask(t.showLog, t.autoUnlock, openLog) : openLog();
  $('relock').onclick = () => { $('lock').classList.remove('hidden'); $('logBody').classList.add('hidden'); q = ''; $('q').value = ''; drawGame(); };
  $('q').oninput = e => { q = e.target.value; drawGame(); };
  let relockT = null;
  $('todo').onclick = $('done').onclick = e => { const r = e.target.closest('[data-s]'); if (!r) return; markSong(+r.dataset.s); clearTimeout(relockT); relockT = setTimeout(() => $('relock').click(), 4000); };
  $('undo').onclick = () => { S.played.pop(); save(); drawGame(); };
  $('snap').onclick = shuffleSnap;
  document.querySelectorAll('[data-ctl]').forEach(b => b.onclick = () => ctl(b.dataset.ctl));
  $('stage').onclick = () => $('stage').classList.remove('on');
  $('moment').onclick = hideMoment;
  $('mNo').onclick = () => $('modal').classList.remove('on');
  $('endBtn').onclick = () => ask(t.endGame, t.endConfirm, () => {
    STATS.track('game_ended', { songs: S.played.length, players: Object.keys(S.players || {}).length, minutes: Math.round((Date.now() - (S.started || Date.now())) / 60000),
      prizesWon: Object.keys(S.awarded || {}).length, mode: S.mode || 'manual', claims: (S.claims || []).length, ext: EXT.on, provider: (S.playlist && S.playlist.provider) || 'unknown', fmt: S.cfg.fmt });
    net && net.broadcast({ t: 'over' }); setTimeout(() => { net && net.close(); net = null; }, 500);
    S = { phase: 'setup', cfg: S.cfg, playlist: S.playlist, msgs: S.msgs }; save();
    $('game').classList.add('hidden'); $('setup').classList.remove('hidden'); document.body.classList.remove('ingame'); drawSetup(); drawExt();
  });

  if (window.Events) Events.restore();
  texts(); loadPhotos();
  if (S.phase === 'game' && S.code) startGame(); else {
    S.phase = 'setup'; drawSetup();
    // link pasted on the landing page: /host.html?playlist=…
    const fromLanding = new URLSearchParams(location.search).get('playlist');
    if (fromLanding) { history.replaceState(null, '', location.pathname); $('plUrl').value = fromLanding; S.playlist = null; drawSetup(); importPlaylist(); }
  }
})();

// Player screen: join with a code, get a card, mark songs, call prizes.
(function () {
  const { $, toast, flash, confetti, esc, store } = FX;
  const params = new URLSearchParams(location.search);
  let code = (params.get('r') || '').toUpperCase();
  let lang = store.get('meca-lang') || (navigator.language || 'en').slice(0, 2); if (!I18N.T[lang]) lang = 'en';
  let t = I18N.get(lang);
  // device id: the same phone always gets the same card back
  let dev = store.get('meca-dev'); if (!dev) { dev = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('meca-dev', dev); }
  let name = store.get('meca-name') || '';
  const K = () => 'meca-play-' + code;
  let P = store.get(K()) || { card: null, marks: [] };   // my card and my marks for this game
  let state = { prize: null, winners: {}, over: false }, net = null, connected = false, busy = false;

  const show = id => ['enter', 'name', 'play', 'msg'].forEach(s => $(s).classList.toggle('hidden', s !== id));
  function setStatus(s) { const e = $('status'); e.textContent = s === 'open' ? '● ' + t.online : s === 'lost' ? '● ' + t.reconnecting : '● ' + t.connecting; e.className = 'status pill ' + (s === 'open' ? 'ok' : 'warn'); }
  function texts() {
    t = I18N.get(lang); document.documentElement.lang = lang;
    $('tCode').textContent = t.code; $('tJoin').textContent = t.join; $('tName').textContent = t.yourName; $('nameIn').placeholder = t.namePh; $('tGo').textContent = t.letsGo; $('hint').textContent = t.tapToMark; $('tRotate').textContent = t.rotate; $('rotateAnyway').textContent = t.rotateAnyway; $('resBack').textContent = t.backToCard;
  }
  // prize names and shapes come from the host; very old hosts sent 'line' / 'two' / 'bingo'
  // rules: shown the first time on this phone, and from the ❓ button
  function showHelp() {
    $('helpTitle').textContent = t.playerHelpTitle; $('helpOk').textContent = t.gotIt;
    $('helpRules').innerHTML = t.rules.map(x => `<li>${esc(x)}</li>`).join('');
    const names = (state.prizes || []).map(p => p.name);
    $('helpPrizes').textContent = names.length ? t.rulesPrizes + ' ' + names.join(' → ') : '';
    $('help').classList.add('on');
  }
  const prizeLabel = p => (state.prizes && state.prizes[p] && state.prizes[p].name) || I18N.prizeName(t, p);
  const hasPrize = () => state.prize !== null && state.prize !== undefined;

  // Shorter names on the card: drop "(From the film…)", "[feat. …]", "feat. …"
  const short = s => String(s || '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/i, '').trim() || String(s || '');
  const cellHtml = (s, i, M) => s === 'free'
    ? `<div class="cell free" aria-label="free"><span class="tt">★</span></div>`
    : s
    ? `<div class="cell ${M.has(i) ? 'on' : ''}" data-i="${i}" title="${esc(s[0] + (s[1] ? ' — ' + s[1] : ''))}"><span class="tt">${esc(short(s[0]))}</span>${s[1] ? `<span class="ar">${esc(short(s[1]))}</span>` : ''}</div>`
    : `<div class="cell gap"></div>`;
  let rotateDismissed = false;
  function drawCard() {
    const c = P.card; if (!c) return;
    const M = new Set(P.marks);
    $('cardNo').textContent = `${t.card} #${c.no}`;
    const b = $('board');
    b.className = 'board ' + c.fmt;
    b.innerHTML = c.cells.map((s, i) => cellHtml(s, i, M)).join('');
    // 3×9 on a phone held upright: 9 columns are too narrow to tap, ask to turn the phone
    const rotate = c.fmt === 'es' && innerWidth < 640 && innerHeight > innerWidth && !rotateDismissed;
    $('rotate').classList.toggle('hidden', !rotate);
    sizeBoard(); fitText();
  }
  // make the card fill the space between the header and the call button
  function sizeBoard() {
    const b = $('board'); if (!P.card) return;
    const top = b.getBoundingClientRect().top + scrollY;
    const cb = $('callbar'), side = getComputedStyle(cb).top === '0px';
    const bar = cb.classList.contains('hidden') || side ? 0 : cb.offsetHeight;
    const avail = innerHeight - top - bar - 12;
    const n = P.card.fmt === 'es' ? 3 : 5;
    const h = Math.max(44, Math.min(150, Math.floor((avail - (n - 1) * 8) / n)));
    b.style.setProperty('--cellH', h + 'px');
  }
  // shrink the text of each cell until it fits (long titles, narrow columns)
  function fitText() {
    const over = c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 || [...c.children].some(k => k.scrollWidth > k.clientWidth + 1);
    for (const c of document.querySelectorAll('#board .cell[data-i]')) {
      // first keep whole words and make the text smaller; only split words as a last resort
      c.classList.remove('split', 'tiny', 'clip'); c.style.removeProperty('--clamp');
      let f = 15; c.style.fontSize = f + 'px';
      while (f > 9 && over(c)) { f -= 0.5; c.style.fontSize = f + 'px'; }
      if (over(c)) { c.classList.add('tiny'); }
      if (over(c)) { c.classList.add('split', 'tiny'); f = 11; c.style.fontSize = f + 'px'; while (f > 9 && over(c)) { f -= 0.5; c.style.fontSize = f + 'px'; } }
      if (f < 10.5) c.classList.add('tiny');
      // extreme titles (one huge word in a narrow cell): cut with "…" instead of spilling out
      if (over(c)) { c.classList.add('clip'); c.style.setProperty('--clamp', Math.max(1, Math.floor((c.clientHeight - 8) / (f * 1.12)))); c.title = c.innerText; }
    }
    // one font size per row, so the card looks even
    const lines = {};
    for (const c of document.querySelectorAll('#board .cell[data-i]')) { const k = Math.floor(+c.dataset.i / (P.card.fmt === 'es' ? 9 : 5)); (lines[k] = lines[k] || []).push(c); }
    for (const cells of Object.values(lines)) {
      // cap every cell at the row's median size: similar sizes, without one long title shrinking the whole row
      const sizes = cells.map(c => parseFloat(c.style.fontSize)).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)];
      cells.forEach(c => { if (parseFloat(c.style.fontSize) > med) c.style.fontSize = med + 'px'; if (parseFloat(c.style.fontSize) < 10.5) c.classList.add('tiny'); });
    }
  }
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(drawCard, 120); });
  // the web fonts can arrive after the card is drawn and are a bit wider: fit the text again
  try { document.fonts.ready.then(() => { if (document.querySelector('#board .cell[data-i]')) fitText(); }); document.fonts.addEventListener('loadingdone', () => { if (document.querySelector('#board .cell[data-i]')) fitText(); }); } catch (e) {}
  function drawState() {
    const pz = hasPrize() && state.prizes && state.prizes[state.prize];
    $('prize').innerHTML = state.over ? `<span class="pf">🎉 ${esc(t.allPrizesDone)}</span>` : hasPrize() ? `<span><span class="pf">${esc(t.playingFor)}</span> <b>${esc(prizeLabel(state.prize))}</b></span>${pz && window.PATUI ? PATUI.html(state.fmt || (P.card && P.card.fmt) || 'es', pz.pat, { free: state.free, label: prizeLabel(state.prize) }) : ''}` : '';
    const cb = $('callbar'); const was = cb.classList.contains('hidden'); cb.classList.toggle('hidden', !hasPrize() || !P.card); if (was !== cb.classList.contains('hidden')) { sizeBoard(); fitText(); }
    if (hasPrize()) $('callBtn').innerHTML = `<span>${esc(t.call(prizeLabel(state.prize).replace(/\s*\(.*?\)/g, '').toUpperCase()))}</span>`;
    $('callBtn').disabled = !connected || busy;
    const W = Object.entries(state.winners || {}).filter(([, n]) => n && n.length).map(([p, n]) => `🏆 <b>${esc(prizeLabel(p))}</b>: ${n.map(esc).join(', ')}`);
    $('winners').innerHTML = W.join('<br>'); $('winners').classList.toggle('hidden', !W.length);
  }
  function result(ok, title, sub) {
    const r = $('res'); r.className = 'res on ' + (ok ? 'ok' : 'no'); $('resT').textContent = title; $('resS').textContent = sub || '';
    if (ok) { flash('#3ef08a'); confetti(); } else flash('#ff3d9a');
    try { navigator.vibrate && navigator.vibrate(ok ? [80, 60, 80, 60, 200] : [300]); } catch (e) {}
    setTimeout(() => r.classList.remove('on'), ok ? 5000 : 3000);
  }

  function onMessage(m) {
    if (!m || !m.t) return;
    if (m.lang && m.lang !== lang && I18N.T[m.lang]) { lang = m.lang; texts(); drawCard(); }
    if (m.skin && window.Skin && Skin.valid(m.skin) && m.skin !== Skin.get()) Skin.set(m.skin, false);
    if (m.t === 'welcome') {
      // same game, same card: keep my marks; a different card means a new game
      if (!P.card || P.card.no !== m.card.no || JSON.stringify(P.card.cells) !== JSON.stringify(m.card.cells)) P = { card: m.card, marks: [] };
      P.rules = m.rules || {};
      store.set(K(), P); state = m; show('play'); drawCard(); drawState();
      $('helpBtn').classList.remove('hidden');
      if (!store.get('meca-help-seen')) { store.set('meca-help-seen', 1); showHelp(); }
    } else if (m.t === 'state' && joining) {   // a peek only brings the skin and language
      const before = JSON.stringify(state.winners || {});
      state = { ...state, ...m }; drawState();
      if (JSON.stringify(m.winners || {}) !== before) {
        for (const [p, n] of Object.entries(m.winners || {})) if (n && n.length) toast('🏆 ' + t.winnerIs(n.join(', '), prizeLabel(p)), 5000);
      }
    } else if (m.t === 'result') {
      busy = false; drawState();
      if (m.ok) result(true, t.youWon(prizeLabel(m.prize)));
      else result(false, t.notValid, m.reason === 'wrong' ? '⚠️ ' + t.youWrong : m.reason === 'closed' ? t.prizeClosed : t.youIncomplete);
      (m.wrong || []).forEach(i => { const c = document.querySelector(`.cell[data-i="${i}"]`); if (c) { c.classList.add('wrong'); setTimeout(() => c.classList.remove('wrong'), 4000); } });
    } else if (m.t === 'full') { show('msg'); $('msgText').textContent = t.gameFull; }
    else if (m.t === 'over') { show('msg'); $('msgText').textContent = t.gameOver; $('callbar').classList.add('hidden'); store.del(K()); }
  }
  // without a name yet the connection opens early and only peeks at the game (skin, language)
  let joining = false, last = null;
  function onStatus(s) {
    last = s; connected = s === 'open'; setStatus(s);
    if (s === 'open') net.send(joining ? { t: 'join', dev, name } : { t: 'peek' });
    if (joining && s === 'notfound' && !P.card) { show('msg'); $('msgText').textContent = t.notFound; }
    drawState();
  }
  const open = () => { if (!net) net = NET.joinRoom(code, { onMessage, onStatus }); };
  function connect() {
    joining = true;
    show(P.card ? 'play' : 'msg'); if (!P.card) $('msgText').textContent = t.connecting;
    if (P.card) { drawCard(); drawState(); }
    if (net) { if (last) onStatus(last); } else open();
  }

  $('board').onclick = e => {
    const c = e.target.closest('.cell[data-i]'); if (!c) return;   // the free square has no data-i
    const i = +c.dataset.i, k = P.marks.indexOf(i);
    if (k >= 0) P.marks.splice(k, 1); else P.marks.push(i);
    c.classList.toggle('on', k < 0); store.set(K(), P);
  };
  $('callBtn').onclick = () => { if (!connected || !hasPrize()) return; busy = true; drawState(); net.send({ t: 'claim', dev, prize: state.prize, marks: P.marks }); setTimeout(() => { busy = false; drawState(); }, 6000); };
  $('res').onclick = () => $('res').classList.remove('on');
  $('helpBtn').onclick = showHelp; $('helpOk').onclick = () => $('help').classList.remove('on');
  $('rotateAnyway').onclick = () => { rotateDismissed = true; drawCard(); };
  $('codeForm').onsubmit = e => { e.preventDefault(); const c = $('codeIn').value.trim().toUpperCase(); if (c.length === 5) { code = c; history.replaceState(null, '', '?r=' + c + (params.get('net') ? '&net=' + params.get('net') : '')); P = store.get(K()) || { card: null, marks: [] }; start(); } };
  $('nameForm').onsubmit = e => { e.preventDefault(); const n = $('nameIn').value.trim(); if (!n) return; name = n; store.set('meca-name', n); connect(); };

  function start() {
    if (!code) { show('enter'); return; }
    if (!name) { show('name'); $('nameIn').focus(); open(); return; }
    connect();
  }
  texts(); setStatus('connecting'); start();
})();

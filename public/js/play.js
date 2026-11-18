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
  function setStatus(s) { const e = $('status'); e.textContent = s === 'open' ? '● online' : s === 'lost' ? '● ' + t.reconnecting : '● ' + t.connecting; e.className = 'status pill ' + (s === 'open' ? 'ok' : 'warn'); }
  function texts() {
    t = I18N.get(lang); document.documentElement.lang = lang;
    $('tCode').textContent = t.code; $('tJoin').textContent = t.join; $('tName').textContent = t.yourName; $('nameIn').placeholder = t.namePh; $('tGo').textContent = t.letsGo; $('hint').textContent = t.tapToMark;
  }
  const prizeLabel = p => I18N.prizeName(t, p);

  function drawCard() {
    const c = P.card; if (!c) return;
    const M = new Set(P.marks);
    $('cardNo').textContent = `${t.card} #${c.no}`;
    $('board').className = 'board ' + c.fmt;
    $('board').innerHTML = c.cells.map((s, i) => s ? `<div class="cell ${M.has(i) ? 'on' : ''}" data-i="${i}">${esc(s[0])}${s[1] ? `<small>${esc(s[1])}</small>` : ''}</div>` : `<div class="cell gap"></div>`).join('');
  }
  function drawState() {
    $('prize').innerHTML = state.over ? `🎉 ${esc(t.allPrizesDone)}` : state.prize ? `${esc(t.playingFor)} <b>${esc(prizeLabel(state.prize))}</b>` : '';
    const cb = $('callbar'); cb.classList.toggle('hidden', !state.prize || !P.card);
    if (state.prize) $('callBtn').textContent = t.call(prizeLabel(state.prize).toUpperCase());
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
    if (m.t === 'welcome') {
      // same game, same card: keep my marks; a different card means a new game
      if (!P.card || P.card.no !== m.card.no || JSON.stringify(P.card.cells) !== JSON.stringify(m.card.cells)) P = { card: m.card, marks: [] };
      store.set(K(), P); state = m; show('play'); drawCard(); drawState();
    } else if (m.t === 'state') {
      const before = JSON.stringify(state.winners || {});
      state = { ...state, ...m }; drawState();
      if (JSON.stringify(m.winners || {}) !== before) {
        for (const [p, n] of Object.entries(m.winners || {})) if (n && n.length) toast('🏆 ' + t.winnerIs(n.join(', '), prizeLabel(p)), 5000);
      }
    } else if (m.t === 'result') {
      busy = false; drawState();
      if (m.ok) result(true, t.youWon(prizeLabel(m.prize)));
      else result(false, t.notValid, m.reason === 'wrong' ? '⚠️ ' + t.youWrong : m.reason === 'closed' ? t.prizeClosed : t.youIncomplete);
    } else if (m.t === 'full') { show('msg'); $('msgText').textContent = t.gameFull; }
    else if (m.t === 'over') { show('msg'); $('msgText').textContent = t.gameOver; $('callbar').classList.add('hidden'); store.del(K()); }
  }
  function connect() {
    show(P.card ? 'play' : 'msg'); if (!P.card) $('msgText').textContent = t.connecting;
    if (P.card) { drawCard(); drawState(); }
    net = NET.joinRoom(code, {
      onMessage,
      onStatus: s => {
        connected = s === 'open'; setStatus(s);
        if (s === 'open') net.send({ t: 'join', dev, name });
        if (s === 'notfound' && !P.card) { show('msg'); $('msgText').textContent = t.notFound; }
        drawState();
      }
    });
  }

  $('board').onclick = e => {
    const c = e.target.closest('.cell[data-i]'); if (!c) return;
    const i = +c.dataset.i, k = P.marks.indexOf(i);
    if (k >= 0) P.marks.splice(k, 1); else P.marks.push(i);
    c.classList.toggle('on', k < 0); store.set(K(), P);
  };
  $('callBtn').onclick = () => { if (!connected || !state.prize) return; busy = true; drawState(); net.send({ t: 'claim', dev, prize: state.prize, marks: P.marks }); setTimeout(() => { busy = false; drawState(); }, 6000); };
  $('res').onclick = () => $('res').classList.remove('on');
  $('codeForm').onsubmit = e => { e.preventDefault(); const c = $('codeIn').value.trim().toUpperCase(); if (c.length === 5) { code = c; history.replaceState(null, '', '?r=' + c + (params.get('net') ? '&net=' + params.get('net') : '')); P = store.get(K()) || { card: null, marks: [] }; start(); } };
  $('nameForm').onsubmit = e => { e.preventDefault(); const n = $('nameIn').value.trim(); if (!n) return; name = n; store.set('meca-name', n); connect(); };

  function start() {
    if (!code) { show('enter'); return; }
    if (!name) { show('name'); $('nameIn').focus(); return; }
    connect();
  }
  texts(); setStatus('connecting'); start();
})();

// Card generation and prize rules. No DOM here, so it can be tested on its own.
(function (G) {
  // ---- seeded random numbers (so a game can be rebuilt from its seed) ----
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  const FORMATS = {
    es: { rows: 3, cols: 9, songs: 15, perRow: 5, minSongs: 40, label: '3×9' },
    us: { rows: 5, cols: 5, songs: 25, perRow: 5, minSongs: 55, label: '5×5' }
  };
  const MAX_PLAYERS = 30;

  // Minimum playlist length for a format (from simulations with up to 30 players:
  // keeps first-line ties around 20% or less and full-card ties around 25% or less).
  function minSongs(fmt) { return FORMATS[fmt].minSongs; }

  function shuffle(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  // Layout of the Spanish card: 3 rows x 9 columns, 5 songs per row, no empty column.
  function spanishLayout(rnd) {
    for (;;) {
      const rows = [0, 1, 2].map(() => shuffle([...Array(9).keys()], rnd).slice(0, 5));
      const used = new Set(rows.flat());
      if (used.size === 9) return rows.map(r => r.sort((a, b) => a - b));
    }
  }

  // Build `count` different cards. Songs are spread evenly so every song matters.
  function makeCards(nSongs, count, fmt, seed) {
    const F = FORMATS[fmt];
    const rnd = mulberry32(hashStr(String(seed)));
    const usage = new Array(nSongs).fill(0);
    const seen = new Set(), cards = [];
    let guard = 0;
    while (cards.length < count && guard++ < count * 50) {
      // least-used songs first, random among equals
      const order = shuffle([...Array(nSongs).keys()], rnd).sort((a, b) => usage[a] - usage[b]);
      // take a few more than needed and pick randomly from them, so cards are not too alike
      const pool = order.slice(0, Math.min(nSongs, F.songs + Math.ceil(F.songs * 0.6)));
      const pick = shuffle(pool, rnd).slice(0, F.songs);
      const key = [...pick].sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      pick.forEach(s => usage[s]++);
      shuffle(pick, rnd);
      const cells = new Array(F.rows * F.cols).fill(-1);
      if (fmt === 'es') {
        let k = 0;
        spanishLayout(rnd).forEach((cols, r) => cols.forEach(c => { cells[r * 9 + c] = pick[k++]; }));
      } else pick.forEach((s, i) => { cells[i] = s; });
      cards.push(cells);
    }
    return cards;
  }

  // All the lines a card has under the chosen rules. Each line is a list of cell positions.
  function lines(cells, fmt, rules) {
    const F = FORMATS[fmt], L = [];
    for (let r = 0; r < F.rows; r++) {
      const line = []; for (let c = 0; c < F.cols; c++) if (cells[r * F.cols + c] >= 0) line.push(r * F.cols + c);
      L.push({ kind: 'row', n: r + 1, cells: line });
    }
    if (rules.vertical) {
      for (let c = 0; c < F.cols; c++) {
        const col = []; for (let r = 0; r < F.rows; r++) if (cells[r * F.cols + c] >= 0) col.push(r * F.cols + c);
        // a column only counts when it is full (on the Spanish card: 3 songs)
        if (col.length === F.rows) L.push({ kind: 'col', n: c + 1, cells: col });
      }
    }
    if (rules.diagonal && fmt === 'us') {
      L.push({ kind: 'diag', n: 1, cells: [0, 6, 12, 18, 24] });
      L.push({ kind: 'diag', n: 2, cells: [4, 8, 12, 16, 20] });
    }
    return L;
  }

  const PRIZES = ['line', 'two', 'bingo'];

  // Check a claim. Only what the player marked counts; every mark must be a song that has played.
  function checkClaim(cells, fmt, rules, marks, played, prize) {
    const P = new Set(played), M = new Set(marks.filter(i => cells[i] >= 0));
    const wrong = [...M].filter(i => !P.has(cells[i]));
    if (wrong.length) return { ok: false, reason: 'wrong', wrong };
    const done = lines(cells, fmt, rules).filter(l => l.cells.length && l.cells.every(i => M.has(i)));
    const filled = cells.filter(s => s >= 0).length;
    let ok;
    if (prize === 'line') ok = done.length >= 1;
    else if (prize === 'two') ok = done.length >= 2;
    else ok = M.size === filled;
    return { ok, reason: ok ? 'ok' : 'incomplete', lines: done };
  }

  function roomCode(rnd = Math.random) {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 5 }, () => A[Math.floor(rnd() * A.length)]).join('');
  }

  // "Title - Artist" lines pasted by the host
  function parsePasted(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.replace(/^\d+[\.\)]\s*/, '').split(/\s[-–—]\s/);
      return { title: p[0].trim(), artist: (p.slice(1).join(' - ') || '').trim() };
    }).filter(t => t.title);
  }

  G.MB = { FORMATS, MAX_PLAYERS, PRIZES, minSongs, makeCards, lines, checkClaim, roomCode, parsePasted, mulberry32, hashStr };
})(typeof window !== 'undefined' ? window : globalThis);

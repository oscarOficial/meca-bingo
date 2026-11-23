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
  const FREE = -2, FREE_CELL = 12;   // free centre square on the 5×5 card (always marked)

  // Songs needed for a number of players. From simulations (500 games per point) with the
  // cards this app makes: first-line ties ≤ 20% and full-card ties ≤ 25%. Smoothed and rounded up.
  const NEED = {
    es: [[4, 28], [8, 31], [12, 34], [20, 36], [30, 38]],
    us: [[4, 48], [8, 50], [12, 52], [20, 55], [30, 58]]
  };
  function minSongs(fmt, players = MAX_PLAYERS) {
    for (const [n, songs] of NEED[fmt]) if (players <= n) return songs;
    return NEED[fmt][NEED[fmt].length - 1][1];
  }
  // how many players a playlist of `songs` songs can take (0 = too short for any game)
  function maxPlayersFor(fmt, songs) {
    let best = 0;
    for (let p = 1; p <= MAX_PLAYERS; p++) if (minSongs(fmt, p) <= songs) best = p;
    return best;
  }

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
  function makeCards(nSongs, count, fmt, seed, opts = {}) {
    const F = { ...FORMATS[fmt] };
    const free = fmt === 'us' && opts.freeCenter;
    if (free) F.songs = 24;
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
      } else {
        let k = 0;
        for (let i = 0; i < 25; i++) cells[i] = free && i === FREE_CELL ? FREE : pick[k++];
      }
      cards.push(cells);
    }
    return cards;
  }

  // ================= prize patterns =================
  // A prize is { name, pat } where pat is one of:
  //   { kind: 'lines', dirs: 'h' | 'hv' | 'hvd', need: n }  any n complete lines
  //   { kind: 'full' }                                       the whole card
  //   { kind: 'masks', masks: [[...], ...] }                 any of these shapes (one drawn shape = one mask)
  // Masks use the card's logical grid: 5×5 on the American card; 3 rows × 5 songs on the
  // Spanish card (k-th song of each row), so a shape is equally hard on every card.
  const MAX_PRIZES = 4;
  const GRID = { es: { rows: 3, cols: 5 }, us: { rows: 5, cols: 5 } };
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const US_ROWS = range(0, 5).map(r => range(0, 5).map(c => r * 5 + c));
  const US_COLS = range(0, 5).map(c => range(0, 5).map(r => r * 5 + c));
  const US_DIAG = [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];
  const ES_ROWS = range(0, 3).map(r => range(0, 5).map(k => r * 5 + k));
  const PRESETS = {
    es: [
      { id: 'line', pat: { kind: 'lines', dirs: 'h', need: 1 } },
      { id: 'lineHV', pat: { kind: 'lines', dirs: 'hv', need: 1 } },
      { id: 'two', pat: { kind: 'lines', dirs: 'h', need: 2 } },
      { id: 'corners', pat: { kind: 'masks', masks: [[0, 4, 10, 14]] } },
      { id: 'ends', pat: { kind: 'masks', masks: [[0, 4, 5, 9, 10, 14]] } },
      { id: 'topBottom', pat: { kind: 'masks', masks: [[...ES_ROWS[0], ...ES_ROWS[2]]] } },
      { id: 'full', pat: { kind: 'full' } },
    ],
    us: [
      { id: 'line', pat: { kind: 'lines', dirs: 'hvd', need: 1 } },
      { id: 'lineH', pat: { kind: 'lines', dirs: 'h', need: 1 } },
      { id: 'two', pat: { kind: 'lines', dirs: 'hvd', need: 2 } },
      { id: 'corners', pat: { kind: 'masks', masks: [[0, 4, 20, 24]] } },
      { id: 'stamp', pat: { kind: 'masks', masks: [[0, 1, 5, 6], [3, 4, 8, 9], [15, 16, 20, 21], [18, 19, 23, 24]] } },
      { id: 'x', pat: { kind: 'masks', masks: [[...US_DIAG[0], ...US_DIAG[1]]] } },
      { id: 'plus', pat: { kind: 'masks', masks: [[...US_ROWS[2], ...US_COLS[2]]] } },
      { id: 't', pat: { kind: 'masks', masks: [[...US_ROWS[0], ...US_COLS[2]]] } },
      { id: 'l', pat: { kind: 'masks', masks: [[...US_COLS[0], ...US_ROWS[4]]] } },
      { id: 'diamond', pat: { kind: 'masks', masks: [[2, 6, 8, 10, 14, 16, 18, 22]] } },
      { id: 'frame', pat: { kind: 'masks', masks: [[...US_ROWS[0], ...US_ROWS[4], ...US_COLS[0], ...US_COLS[4]]] } },
      { id: 'full', pat: { kind: 'full' } },
    ],
  };
  for (const f in PRESETS) for (const p of PRESETS[f]) if (p.pat.masks) p.pat.masks = p.pat.masks.map(m => [...new Set(m)].sort((a, b) => a - b));
  const presetById = (fmt, id) => PRESETS[fmt].find(p => p.id === id);
  // default prizes for a card type
  const defaultPrizes = fmt => [{ preset: 'line' }, { preset: 'full' }].map(p => ({ preset: p.preset, pat: presetById(fmt, p.preset).pat }));

  // old settings (vertical / diagonal / line-two-bingo switches) → prize list
  function migratePrizes(cfg) {
    if (Array.isArray(cfg.prizes)) return cfg.prizes;
    const old = cfg.prizes || { line: true, bingo: true }, fmt = cfg.fmt || 'es', out = [];
    const dirs = 'h' + (cfg.vertical ? 'v' : '') + (cfg.diagonal && fmt === 'us' ? 'd' : '');
    if (old.line) out.push({ preset: '', pat: { kind: 'lines', dirs, need: 1 } });
    if (old.two) out.push({ preset: '', pat: { kind: 'lines', dirs, need: 2 } });
    if (old.bingo || !out.length) out.push({ preset: 'full', pat: { kind: 'full' } });
    // match a preset when there is one, so the name and picture are the usual ones
    for (const p of out) { const hit = PRESETS[fmt].find(x => JSON.stringify(x.pat) === JSON.stringify(p.pat)); if (hit) p.preset = hit.id; }
    return out;
  }

  // logical position → card cell (null when there is no song there)
  function cellOf(cells, fmt, i) {
    if (fmt === 'us') return i;
    const r = Math.floor(i / 5), k = i % 5;
    const cols = []; for (let c = 0; c < 9; c++) if (cells[r * 9 + c] !== -1) cols.push(c);
    return cols[k] === undefined ? null : r * 9 + cols[k];
  }
  // The shapes (lists of card cells) that win this prize on this card, and how many are needed.
  function shapesFor(cells, fmt, pat) {
    const F = FORMATS[fmt], song = i => i !== null && cells[i] >= 0;   // free square needs no mark
    const keep = list => list.filter(song);
    let shapes = [], need = 1;
    if (pat.kind === 'full') shapes = [keep(cells.map((_, i) => i))];
    else if (pat.kind === 'lines') {
      need = Math.max(1, pat.need || 1);
      for (let r = 0; r < F.rows; r++) shapes.push(keep(range(0, F.cols).map(c => r * F.cols + c)));
      if (pat.dirs.includes('v')) for (let c = 0; c < F.cols; c++) {
        const col = range(0, F.rows).map(r => r * F.cols + c);
        if (fmt === 'us') shapes.push(keep(col));
        else if (col.every(i => cells[i] >= 0)) shapes.push(col);       // 3×9: only full columns
      }
      if (pat.dirs.includes('d') && fmt === 'us') US_DIAG.forEach(d => shapes.push(keep(d)));
    } else if (pat.kind === 'masks') shapes = (pat.masks || []).map(m => keep(m.map(i => cellOf(cells, fmt, i))));
    return { shapes: shapes.filter(s => s.length), need };
  }
  function prizeDone(cells, fmt, pat, isMarked) {
    const { shapes, need } = shapesFor(cells, fmt, pat);
    const done = shapes.filter(s => s.every(isMarked));
    return { ok: done.length >= need, done };
  }
  // does this prize need the card drawn as it really is (3×9 columns)? otherwise rows of 5 are fine
  const needsRealLayout = (fmt, prizes) => fmt === 'es' && prizes.some(p => p.pat.kind === 'lines' && p.pat.dirs.includes('v'));

  // Check a claim. Only what the player marked counts; every mark must be a song that has played.
  function checkClaim(cells, fmt, pat, marks, played) {
    const P = new Set(played), M = new Set(marks.filter(i => cells[i] >= 0));
    const wrong = [...M].filter(i => !P.has(cells[i]));
    if (wrong.length) return { ok: false, reason: 'wrong', wrong };
    const r = prizeDone(cells, fmt, pat, i => M.has(i));
    return { ok: r.ok, reason: r.ok ? 'ok' : 'incomplete', lines: r.done };
  }

  // Play many pretend games to see when each prize is usually won and how often there are ties.
  // Returns, per prize, the median song number of the first winner and the share of games with a tie.
  function simulate(fmt, nSongs, players, prizes, opts = {}) {
    const runs = opts.runs || 200, out = prizes.map(() => ({ at: [], ties: 0 }));
    const rnd = mulberry32(opts.seed || 12345);
    for (let g = 0; g < runs; g++) {
      const cards = makeCards(nSongs, players, fmt, 'sim' + g + '-' + (opts.seed || 1), opts);
      const order = shuffle([...Array(nSongs).keys()], rnd), pos = new Array(nSongs);
      order.forEach((s, i) => { pos[s] = i + 1; });   // song s plays as song number pos[s]
      prizes.forEach((p, k) => {
        let best = Infinity, count = 0;
        for (const cells of cards) {
          const { shapes, need } = shapesFor(cells, fmt, p.pat);
          // a shape is done when its last song plays; the prize when the need-th shape is done
          const t = shapes.map(s => Math.max(...s.map(i => pos[cells[i]]))).sort((a, b) => a - b)[need - 1];
          if (t === undefined) continue;
          if (t < best) { best = t; count = 1; } else if (t === best) count++;
        }
        if (best < Infinity) { out[k].at.push(best); if (count > 1) out[k].ties++; }
      });
    }
    return out.map(o => { const a = o.at.sort((x, y) => x - y); return { median: a.length ? a[Math.floor(a.length / 2)] : null, ties: a.length ? o.ties / a.length : 0, never: 1 - a.length / runs }; });
  }

  // Kept for older callers and tests: the lines a card has.
  function lines(cells, fmt, rules) {
    const dirs = 'h' + (rules && rules.vertical ? 'v' : '') + (rules && rules.diagonal ? 'd' : '');
    return shapesFor(cells, fmt, { kind: 'lines', dirs, need: 1 }).shapes.map(c => ({ cells: c }));
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

  G.MB = { FORMATS, MAX_PLAYERS, MAX_PRIZES, FREE, FREE_CELL, GRID, PRESETS, presetById, defaultPrizes, migratePrizes, shapesFor, prizeDone, needsRealLayout, minSongs, maxPlayersFor, makeCards, lines, checkClaim, simulate, roomCode, parsePasted, mulberry32, hashStr };
})(typeof window !== 'undefined' ? window : globalThis);

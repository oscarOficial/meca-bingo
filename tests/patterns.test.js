// node tests/patterns.test.js — rules for prize patterns
require('../public/js/game.js'); const MB = globalThis.MB;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('❌', m); } else console.log('✓', m); };
const songs = c => c.filter(s => s >= 0);
for (const fmt of ['es', 'us']) {
  for (const free of [false, true]) {
    if (fmt === 'es' && free) continue;
    const cards = MB.makeCards(40, 30, fmt, 'x' + free, { freeCenter: free });
    for (const c of cards) for (const p of MB.PRESETS[fmt]) if (!MB.shapesFor(c, fmt, p.pat).shapes.length && p.id !== 'lineHV') ok(false, `${fmt} ${p.id} has shapes`);
    const c = cards[0], all = c.map((_, i) => i).filter(i => c[i] >= 0);
    ok(MB.checkClaim(c, fmt, { kind: 'full' }, all, songs(c)).ok, `${fmt}${free ? ' free' : ''}: full card wins`);
    ok(MB.checkClaim(c, fmt, { kind: 'full' }, all, songs(c).slice(1)).reason === 'wrong', `${fmt}: unplayed mark is wrong`);
    ok(!MB.checkClaim(c, fmt, { kind: 'full' }, all.slice(1), songs(c)).ok, `${fmt}: missing one is incomplete`);
    if (free) ok(c[12] === MB.FREE && songs(c).length === 24, 'free centre: 24 songs and a free square');
    // every preset is won when the whole card is marked
    for (const p of MB.PRESETS[fmt]) if (MB.shapesFor(c, fmt, p.pat).shapes.length) ok(MB.checkClaim(c, fmt, p.pat, all, songs(c)).ok, `${fmt}: ${p.id} won by a full card`);
  }
}
// Spanish card: first row = one line, not two; corners use 1st/5th song of top and bottom rows
const c = MB.makeCards(40, 1, 'es', 'y')[0];
const rowCells = r => [...Array(9).keys()].map(k => r * 9 + k).filter(i => c[i] >= 0);
ok(MB.checkClaim(c, 'es', { kind: 'lines', dirs: 'h', need: 1 }, rowCells(0), songs(c)).ok, 'es: a row is a line');
ok(!MB.checkClaim(c, 'es', { kind: 'lines', dirs: 'h', need: 2 }, rowCells(0), songs(c)).ok, 'es: one row is not two lines');
ok(MB.checkClaim(c, 'es', { kind: 'lines', dirs: 'h', need: 2 }, [...rowCells(0), ...rowCells(2)], songs(c)).ok, 'es: two rows are two lines');
const corners = [rowCells(0)[0], rowCells(0)[4], rowCells(2)[0], rowCells(2)[4]];
ok(MB.checkClaim(c, 'es', MB.presetById('es', 'corners').pat, corners, songs(c)).ok, 'es: corners');
ok(!MB.checkClaim(c, 'es', MB.presetById('es', 'corners').pat, corners.slice(1), songs(c)).ok, 'es: 3 corners are not enough');
// 5×5: stamp = any of 4 squares; X; drawn mask
const u = MB.makeCards(60, 1, 'us', 'z')[0];
ok(MB.checkClaim(u, 'us', MB.presetById('us', 'stamp').pat, [18, 19, 23, 24], songs(u)).ok, 'us: bottom-right stamp');
ok(!MB.checkClaim(u, 'us', MB.presetById('us', 'stamp').pat, [18, 19, 23], songs(u)).ok, 'us: incomplete stamp');
ok(MB.checkClaim(u, 'us', MB.presetById('us', 'line').pat, [4, 8, 12, 16, 20], songs(u)).ok, 'us: diagonal line');
ok(!MB.checkClaim(u, 'us', MB.presetById('us', 'lineH').pat, [4, 8, 12, 16, 20], songs(u)).ok, 'us: diagonal is not a horizontal line');
ok(MB.checkClaim(u, 'us', { kind: 'masks', masks: [[0, 2, 4]] }, [0, 2, 4], songs(u)).ok, 'us: drawn shape');
const uf = MB.makeCards(60, 1, 'us', 'z', { freeCenter: true })[0];
ok(MB.checkClaim(uf, 'us', MB.presetById('us', 'x').pat, [0, 6, 18, 24, 4, 8, 16, 20], songs(uf)).ok, 'us free: X without the centre mark');
// migration
const m = MB.migratePrizes({ fmt: 'us', vertical: true, diagonal: true, prizes: { line: true, two: true, bingo: true } });
ok(m.length === 3 && m[0].preset === 'line' && m[1].preset === 'two' && m[2].preset === 'full', 'migration us');
const m2 = MB.migratePrizes({ fmt: 'es', vertical: true, prizes: { line: true, bingo: true } });
ok(m2[0].preset === 'lineHV' && m2[1].preset === 'full', 'migration es vertical');
// simulation: line before full, sensible numbers
let t = Date.now(); const sim = MB.simulate('es', 40, 20, MB.defaultPrizes('es'));
ok(sim[0].median < sim[1].median && sim[1].median <= 40, `es sim: line ${sim[0].median} < bingo ${sim[1].median} (${Date.now() - t} ms)`);
t = Date.now(); const su = MB.simulate('us', 55, 30, MB.PRESETS.us.map(p => ({ pat: p.pat })));
console.log('  us medians', MB.PRESETS.us.map((p, i) => p.id + ':' + su[i].median).join(' '), `(${Date.now() - t} ms)`);
ok(su[0].median < su[su.length - 1].median, 'us sim: line before full');
console.log(fails ? `${fails} FAILED` : 'all pattern tests passed'); process.exit(fails ? 1 : 0);

// Little pictures of prize patterns (host setup, host game screen and player card).
// A pattern that can be won in several places (any line, any corner square…) cycles
// through its positions, so people see that any of them counts.
(function (G) {
  const GRID = { es: { rows: 3, cols: 5 }, us: { rows: 5, cols: 5 } };
  const range = n => Array.from({ length: n }, (_, i) => i);

  // the cells to light up, one list per animation frame (logical grid)
  function frames(fmt, pat) {
    const { rows, cols } = GRID[fmt];
    const R = range(rows).map(r => range(cols).map(c => r * cols + c));
    const C = range(cols).map(c => range(rows).map(r => r * cols + c));
    const D = fmt === 'us' ? [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]] : [];
    if (!pat) return [[]];
    if (pat.kind === 'full') return [range(rows * cols)];
    if (pat.kind === 'masks') return (pat.masks && pat.masks.length ? pat.masks : [[]]);
    const lines = [...R, ...(pat.dirs.includes('v') ? C : []), ...(pat.dirs.includes('d') ? D : [])];
    const need = Math.max(1, pat.need || 1);
    if (need === 1) return lines;
    // n lines at once: show a few typical combinations
    const out = [];
    for (let i = 0; i + need <= R.length; i++) out.push(R.slice(i, i + need).flat());
    if (pat.dirs.includes('v')) out.push(C.slice(0, need).flat());
    if (pat.dirs.includes('d') && need === 2) out.push(D.flat());
    return out;
  }

  // a typical 3×9 card: which of the 9 columns hold the 5 songs of each row
  const ES_COLS = [[0, 2, 4, 5, 8], [1, 3, 6, 7, 8], [0, 1, 2, 5, 7]];
  function svgEs(on, opts) {
    const s = 10, g = 2.2, set = new Set(on || []);
    let cells = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      const k = ES_COLS[r].indexOf(c), x = c * (s + g), y = r * (s + g);
      cells += k < 0 ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="2.4" class="pgap"/>`
        : `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="2.4" data-i="${r * 5 + k}" class="${set.has(r * 5 + k) ? 'pon' : 'poff'}"/>`;
    }
    return `<svg viewBox="-1 -1 ${9 * (s + g)} ${3 * (s + g)}" class="patsvg es9" role="img" aria-label="${opts.label ? String(opts.label).replace(/"/g, '&quot;') : ''}">${cells}</svg>`;
  }
  // SVG picture of one frame
  function svg(fmt, on, opts = {}) {
    if (fmt === 'es' && !opts.logical) return svgEs(on, opts);
    const { rows, cols } = GRID[fmt], s = 10, g = 2.2, W = cols * s + (cols - 1) * g, H = rows * s + (rows - 1) * g;
    const set = new Set(on || []), free = fmt === 'us' && opts.free;
    let cells = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = c * (s + g), y = r * (s + g);
      if (free && i === 12) { cells += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="2.4" class="pf"/><text x="${x + s / 2}" y="${y + s * .74}" text-anchor="middle" font-size="7.5" fill="#1a1630">★</text>`; continue; }
      cells += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="2.4" class="${set.has(i) ? 'pon' : 'poff'}"/>`;
    }
    return `<svg viewBox="-1 -1 ${W + 2} ${H + 2}" class="patsvg ${fmt}" role="img" aria-label="${opts.label ? String(opts.label).replace(/"/g, '&quot;') : ''}">${cells}</svg>`;
  }

  // element with the picture; animated when the pattern has several positions
  function html(fmt, pat, opts = {}) {
    const f = frames(fmt, pat);
    const data = f.length > 1 ? ` data-pf='${JSON.stringify(f)}' data-pfmt="${fmt}" data-pfree="${opts.free ? 1 : 0}"` : '';
    return `<span class="patpic ${opts.cls || ''}"${data}>${svg(fmt, f[0], opts)}</span>`;
  }

  // one clock for every animated picture on the page
  let tick = 0;
  setInterval(() => {
    tick++;
    document.querySelectorAll('.patpic[data-pf]').forEach(el => {
      const f = JSON.parse(el.dataset.pf), on = new Set(f[tick % f.length]);
      el.querySelectorAll('rect').forEach((r, i) => {
        const k = r.dataset.i !== undefined ? +r.dataset.i : i;
        if (!r.classList.contains('pf') && !r.classList.contains('pgap')) r.setAttribute('class', on.has(k) ? 'pon' : 'poff');
      });
    });
  }, 900);

  G.PATUI = { GRID, frames, svg, html };
})(window);

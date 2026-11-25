// Confetti, flashes and small helpers shared by host and player screens.
(function (G) {
  const $ = id => document.getElementById(id);
  // a Lucide icon from the sprite, coloured by currentColor
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="/img/icons.svg#${name}"/></svg>`;
  function toast(msg, ms = 3500, ic) { const e = $('toast'); if (!e) return; if (ic) e.innerHTML = icon(ic) + ' ' + esc(msg); else e.textContent = msg; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), ms); }
  function flash(color) { const f = document.createElement('div'); f.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:34;background:${color};animation:mbflash .6s ease-out forwards`; document.body.appendChild(f); setTimeout(() => f.remove(), 700); }
  const st = document.createElement('style'); st.textContent = '@keyframes mbflash{0%{opacity:.5}100%{opacity:0}}'; document.head.appendChild(st);
  // confetti (vendored canvas-confetti on <canvas id="fx">): two bursts from the bottom corners
  const COLS = ['#ff3d9a', '#2de2e6', '#ffd23f', '#3ef08a', '#ffffff', '#a66bff'];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cannon = null;
  function confetti(opts = {}) {
    const cv = $('fx'); if (!cv || !G.confetti || reduced()) return;
    cannon = cannon || G.confetti.create(cv, { resize: true, disableForReducedMotion: true });
    const o = { particleCount: 90, spread: 55, startVelocity: 45, ticks: 220, colors: COLS, ...opts };
    cannon({ ...o, angle: 60, origin: { x: 0, y: .75 } }); cannon({ ...o, angle: 120, origin: { x: 1, y: .75 } });
  }
  // an event's confetti: its colours and/or emoji (drawn once, then reused)
  const shapes = {};
  function eventConfetti(c) {
    const o = c.colors ? { colors: c.colors } : {};
    if (c.emoji) try {
      const k = c.emoji.join(' '), em = shapes[k] || (shapes[k] = c.emoji.map(text => G.confetti.shapeFromText({ text, scalar: 2 })));
      Object.assign(o, { shapes: c.colors ? ['square', 'circle', ...em] : em, scalar: 2 });
    } catch (e) {}
    return o;
  }
  // effect hooks: with no special event they are today's effects; an event adds its confetti and
  // a short <div class="evfx" data-fx=hook> (over the screen, or over the marked cell) its layer.css styles
  function hook(name, el) {
    const id = G.Events && Events.get(), c = id && (Events.effects(id)[name] || {}).confetti;
    if (name === 'win') confetti(c ? eventConfetti(c) : {}); else if (c) confetti(eventConfetti(c));
    if (!id || reduced()) return;
    const d = document.createElement('div'); d.className = 'evfx'; d.dataset.fx = name; d.setAttribute('aria-hidden', 'true');
    if (el) { const r = el.getBoundingClientRect(); d.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`; } else d.style.inset = '0';
    document.body.appendChild(d); setTimeout(() => d.remove(), 3000);
  }
  const win = () => { flash('#3ef08a'); hook('win'); }, nope = () => { flash('#ff3d9a'); hook('nope'); };
  const mark = el => hook('mark', el), moment = () => hook('moment');
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  async function toggleFullscreen(msg) {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) { toast(msg || 'Full screen is not available here'); }
  }
  G.FX = { $, icon, toast, flash, confetti, win, nope, mark, moment, pick, esc, store, toggleFullscreen };
})(window);

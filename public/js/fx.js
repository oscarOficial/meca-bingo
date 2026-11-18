// Confetti, flashes and small helpers shared by host and player screens.
(function (G) {
  const $ = id => document.getElementById(id);
  function toast(msg, ms = 3500) { const e = $('toast'); if (!e) return; e.textContent = msg; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), ms); }
  function flash(color) { const f = document.createElement('div'); f.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:34;background:${color};animation:mbflash .6s ease-out forwards`; document.body.appendChild(f); setTimeout(() => f.remove(), 700); }
  const st = document.createElement('style'); st.textContent = '@keyframes mbflash{0%{opacity:.5}100%{opacity:0}}'; document.head.appendChild(st);
  let cf = 0;
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('fx'); if (!cv) return; const x = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#ff3d9a', '#2de2e6', '#ffd23f', '#3ef08a', '#ffffff', '#a66bff'], P = [];
    for (let i = 0; i < 180; i++) { const s = i % 2 ? 1 : -1; P.push({ x: s > 0 ? 0 : cv.width, y: cv.height * .75, vx: s * (4 + Math.random() * 9), vy: -(9 + Math.random() * 12), r: Math.random() * 6.3, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 7, h: 4 + Math.random() * 5, c: cols[i % cols.length] }); }
    const id = ++cf; let fr = 0;
    (function step() {
      if (id !== cf) return; x.clearRect(0, 0, cv.width, cv.height);
      P.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); });
      if (++fr < 200) requestAnimationFrame(step); else x.clearRect(0, 0, cv.width, cv.height);
    })();
  }
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
  G.FX = { $, toast, flash, confetti, pick, esc, store, toggleFullscreen };
})(window);

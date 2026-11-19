// Runs inside Amazon Music's own page context. Amazon registers media-key handlers
// (the ones Windows uses for play/pause/next); we keep a copy so the extension can call them.
(() => {
  const H = {};
  try {
    const orig = MediaSession.prototype.setActionHandler;
    MediaSession.prototype.setActionHandler = function (action, handler) { H[action] = handler; return orig.call(this, action, handler); };
  } catch (e) {}
  // Track every audio/video element, even ones never added to the page.
  const root = document.documentElement;
  const mark = () => { let any = false; for (const m of media) if (!m.paused && !m.ended) any = true; root.dataset.mbPlaying = any ? '1' : '0'; };
  const media = new Set();
  const watch = m => { if (media.has(m)) return; media.add(m); ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(ev => m.addEventListener(ev, mark)); };
  try {
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      watch(this);
      const p = origPlay.apply(this, arguments);
      if (p && p.then) p.then(() => { root.dataset.mbBlocked = '0'; mark(); }, err => { if (err && err.name === 'NotAllowedError') root.dataset.mbBlocked = '1'; mark(); });
      return p;
    };
  } catch (e) {}
  const call = a => { const h = H[a]; if (typeof h !== 'function') return false; try { h({ action: a }); return true; } catch (e) { return false; } };
  window.addEventListener('message', e => {
    const m = e.data; if (e.source !== window || !m) return;
    if (m.__mbGoto) {   // move to another playlist without reloading the page (keeps Chrome's permission to play)
      try { history.pushState({}, '', m.path); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); } catch (err) {}
      return;
    }
    if (!m.__mbCtl) return;
    let ok = false, used = '';
    const st = navigator.mediaSession.playbackState;
    const playing = st === 'playing' || root.dataset.mbPlaying === '1' || [...document.querySelectorAll('audio,video')].some(x => !x.paused);
    if (m.action === 'next') { ok = call('nexttrack'); used = 'nexttrack'; }
    else if (m.action === 'prev') { ok = call('previoustrack'); used = 'previoustrack'; }
    else if (m.action === 'pause') { if (!playing) { ok = true; used = 'already paused'; } else { ok = call('pause'); used = 'pause'; } }
    else if (m.action === 'toggle') { used = playing ? 'pause' : 'play'; ok = call(used); }
    window.postMessage({ __mbCtlRes: true, id: m.id, ok, used, known: Object.keys(H) }, '*');
  });
})();

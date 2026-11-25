// Runs inside the music player's own page context. Players register media-key handlers
// (the ones Windows uses for play/pause/next); we keep a copy so the extension can call them.
(() => {
  const H = {};
  try {
    const orig = MediaSession.prototype.setActionHandler;
    MediaSession.prototype.setActionHandler = function (action, handler) { H[action] = handler; return orig.call(this, action, handler); };
  } catch (e) {}
  // Track every audio/video element, even ones never added to the page.
  const root = document.documentElement;
  // mbPlaying: '1' an unmuted one plays, '0' they are all paused, '' none is unmuted (muted Canvas/artwork videos are not the music)
  const mark = () => { let seen = false, any = false; for (const m of media) if (!m.muted) { seen = true; if (!m.paused && !m.ended) any = true; } root.dataset.mbPlaying = any ? '1' : seen ? '0' : ''; };
  const media = new Set();
  const watch = m => { if (media.has(m)) return; media.add(m); ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange'].forEach(ev => m.addEventListener(ev, mark)); };
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
    const playing = !!m.playing;   // decided by provider.js isPlaying()
    if (m.action === 'next') { ok = call('nexttrack'); used = 'nexttrack'; }
    else if (m.action === 'prev') { ok = call('previoustrack'); used = 'previoustrack'; }
    else if (m.action === 'pause') { if (!playing) { ok = true; used = 'already paused'; } else { ok = call('pause'); used = 'pause'; } }
    else if (m.action === 'toggle') { used = playing ? 'pause' : 'play'; ok = call(used); }
    window.postMessage({ __mbCtlRes: true, id: m.id, ok, used, known: Object.keys(H) }, '*');
  });
})();

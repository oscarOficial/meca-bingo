// Anonymous usage counters (no cookies, no ids, no names, no song titles).
// Sent to our own server (/api/event) so we can see how the game is used and what to improve.
window.STATS = {
  track(type, data) {
    try {
      if (!/^https:/.test(location.protocol)) return;          // local tests
      const body = JSON.stringify({ type, lang: document.documentElement.lang || '', data: data || {} });
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))))
        fetch('/api/event', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
    } catch (e) {}
  }
};

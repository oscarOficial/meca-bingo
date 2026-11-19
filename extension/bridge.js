// Runs on the Meca Bingo site and passes messages between the page and the extension.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const post = m => window.postMessage(Object.assign({ __mbExt: true }, m), '*');
  const ask = (m, back) => chrome.runtime.sendMessage(m).then(r => post(Object.assign({ type: back, id: m.id }, r || { ok: false }))).catch(() => post({ type: back, id: m.id, ok: false, error: 'failed' }));
  window.addEventListener('message', e => {
    const m = e.data; if (e.source !== window || !m || !m.__mbPage) return;
    if (m.type === 'hello') post({ type: 'ready', version: VERSION });
    else if (m.type === 'import') ask({ type: 'mb-import', url: m.url, id: m.id }, 'importResult');
    else if (m.type === 'start') ask({ type: 'mb-start', url: m.url, id: m.id }, 'startResult');
    else if (m.type === 'control') ask({ type: 'mb-control', action: m.action, id: m.id }, 'controlResult');
    else if (m.type === 'getState') ask({ type: 'mb-getstate', id: m.id }, 'state');
  });
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'mb-track') post({ type: 'track', title: msg.title, artist: msg.artist, ts: msg.ts });
    if (msg && msg.type === 'mb-state') post({ type: 'state', playing: msg.playing, player: msg.player !== false });
  });
  post({ type: 'ready', version: VERSION });
})();

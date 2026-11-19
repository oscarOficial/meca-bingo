function setStatus(id, cls, text) { const e = document.getElementById(id); e.className = cls; e.textContent = text; }
const SITE = ['https://meca-bingo.oscasais.workers.dev/*'];
async function draw() {
  const s = await chrome.runtime.sendMessage({ type: 'mb-getstate' }).catch(() => null);
  if (!s || !s.player) setStatus('player', 'no', 'No Amazon Music or Spotify tab open');
  else if (s.playing) setStatus('player', 'ok', '▶ Playing'); else setStatus('player', 'warn', '⏸ Paused');
  const tg = document.getElementById('tg'); tg.textContent = s && s.playing ? '⏸' : '▶'; tg.classList.toggle('playing', !!(s && s.playing));
  const site = await chrome.tabs.query({ url: SITE });
  setStatus('site', site.length ? 'ok' : 'no', site.length ? 'Host page open' : 'Host page not open');
}
document.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { await chrome.runtime.sendMessage({ type: 'mb-control', action: b.dataset.a }); setTimeout(draw, 400); });
draw(); setInterval(draw, 1000);

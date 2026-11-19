const SITE = ['https://meca-bingo.oscasais.workers.dev/*'];
async function draw() {
  const s = await chrome.runtime.sendMessage({ type: 'mb-getstate' }).catch(() => null);
  document.getElementById('player').innerHTML = !s || !s.player ? '<span class="no">No Amazon Music or Spotify tab open</span>' : s.playing ? '<span class="ok">▶ Playing</span>' : '<span class="warn">⏸ Paused</span>';
  const tg = document.getElementById('tg'); tg.textContent = s && s.playing ? '⏸' : '▶'; tg.classList.toggle('playing', !!(s && s.playing));
  const site = await chrome.tabs.query({ url: SITE });
  document.getElementById('site').innerHTML = site.length ? '<span class="ok">Host page open</span>' : '<span class="no">Host page not open</span>';
}
document.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { await chrome.runtime.sendMessage({ type: 'mb-control', action: b.dataset.a }); setTimeout(draw, 400); });
draw(); setInterval(draw, 1000);

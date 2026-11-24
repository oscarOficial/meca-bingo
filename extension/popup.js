function setStatus(id, cls, text) { const e = document.getElementById(id); e.className = cls; e.textContent = text; }
const PLAYER_NAMES = 'Amazon Music, Spotify, Deezer, YouTube Music, Apple Music';  // written by tools/build_extension.py
const SITE = ['https://mecabingo.oscasais.es/*', 'https://meca-bingo.oscasais.workers.dev/*'];
const _ = (k, s) => chrome.i18n.getMessage(k, s);
document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = _(e.dataset.i18n));
document.querySelectorAll('[data-i18n-title]').forEach(e => e.title = _(e.dataset.i18nTitle));
document.documentElement.lang = chrome.i18n.getUILanguage();
async function draw() {
  const s = await chrome.runtime.sendMessage({ type: 'mb-getstate' }).catch(() => null);
  if (!s || !s.player) setStatus('player', 'no', _('noPlayer', PLAYER_NAMES));
  else if (s.playing) setStatus('player', 'ok', _('playing')); else setStatus('player', 'warn', _('paused'));
  const tg = document.getElementById('tg'); tg.textContent = s && s.playing ? '⏸' : '▶'; tg.classList.toggle('playing', !!(s && s.playing));
  const site = await chrome.tabs.query({ url: SITE });
  setStatus('site', site.length ? 'ok' : 'no', site.length ? _('hostOpen') : _('hostClosed'));
}
document.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { await chrome.runtime.sendMessage({ type: 'mb-control', action: b.dataset.a }); setTimeout(draw, 400); });
draw(); setInterval(draw, 1000);

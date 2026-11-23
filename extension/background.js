// Connects the Meca Bingo host page with the music player tab.
// The three lists below are written by tools/build_extension.py from players.json and site.config.json
const AMAZON = ['https://music.amazon.es/*', 'https://music.amazon.com/*', 'https://music.amazon.co.uk/*', 'https://music.amazon.de/*', 'https://music.amazon.fr/*', 'https://music.amazon.it/*'];   // players that can import a playlist and start it in shuffle
const PLAYERS = ['https://music.amazon.es/*', 'https://music.amazon.com/*', 'https://music.amazon.co.uk/*', 'https://music.amazon.de/*', 'https://music.amazon.fr/*', 'https://music.amazon.it/*', 'https://open.spotify.com/*', 'https://www.deezer.com/*', 'https://music.youtube.com/*', 'https://music.apple.com/*', 'https://beta.music.apple.com/*'];  // every supported music web player
const SITE = ['https://mecabingo.oscasais.es/*', 'https://meca-bingo.oscasais.workers.dev/*'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function siteTabs() { return chrome.tabs.query({ url: SITE }); }
async function tellSite(msg) { for (const t of await siteTabs()) chrome.tabs.sendMessage(t.id, msg).catch(() => {}); }
async function playerTab() { const t = await chrome.tabs.query({ url: PLAYERS, audible: true }); return t[0] || (await chrome.tabs.query({ url: PLAYERS }))[0]; }
async function amazonTab() { return (await chrome.tabs.query({ url: AMAZON }))[0]; }

// open (or reuse) the Amazon tab in the background, wait until its script answers
async function openAmazon(url, cover) {
  let tab = await amazonTab();
  const target = url + (cover ? '#mbcover' : '');
  if (tab) await chrome.tabs.update(tab.id, { url: target });
  else tab = await chrome.tabs.create({ url: target, active: false });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const t = await chrome.tabs.get(tab.id).catch(() => null);
    if (!t) return null;
    if (t.status === 'complete') { const r = await chrome.tabs.sendMessage(tab.id, { type: 'mb-status' }).catch(() => null); if (r) return tab; }
  }
  return tab;
}
async function focus(tabId) { try { const t = await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {} }

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg && msg.type) {
      // ---- from the host page (through bridge.js) ----
      case 'mb-import': {
        const tab = await openAmazon(msg.url, true);
        if (!tab) return reply({ ok: false, error: 'notab' });
        const r = await chrome.tabs.sendMessage(tab.id, { type: 'mb-import' }).catch(() => null);
        return reply(r || { ok: false, error: 'failed' });
      }
      case 'mb-start': {
        const host = sender.tab;
        await chrome.storage.session.set({ hostTab: host && host.id });
        let tab = await amazonTab();
        const { shown = [] } = await chrome.storage.session.get('shown');
        // Chrome only plays sound in a tab that has been on screen once: show it briefly (covered) the first time
        const mustShow = !tab || !shown.includes(tab.id);
        if (!tab || !(await chrome.tabs.sendMessage(tab.id, { type: 'mb-status' }).catch(() => null))) tab = await openAmazon(msg.url, true);
        if (!tab) return reply({ ok: false, error: 'notab' });
        if (mustShow) { await focus(tab.id); await chrome.storage.session.set({ shown: [...shown, tab.id] }); }
        const r = await chrome.tabs.sendMessage(tab.id, { type: 'mb-start', url: msg.url }).catch(() => null);
        if (host) await focus(host.id);
        return reply(r || { ok: false, error: 'failed' });
      }
      case 'mb-control': {
        const tab = await playerTab();
        if (!tab) return reply({ ok: false, error: 'notab' });
        return reply((await chrome.tabs.sendMessage(tab.id, { type: 'mb-control', action: msg.action }).catch(() => null)) || { ok: false, error: 'failed' });
      }
      case 'mb-getstate': {
        const tab = await playerTab();
        const r = tab ? await chrome.tabs.sendMessage(tab.id, { type: 'mb-status' }).catch(() => null) : null;
        return reply({ player: !!tab, playing: !!(r && r.playing) });
      }
      // ---- from the player tab (provider.js) ----
      case 'mb-track': tellSite({ type: 'mb-track', title: msg.title, artist: msg.artist, ts: msg.ts }); await chrome.storage.session.set({ heard: Date.now() }); return reply({ ok: true });
      case 'mb-state': tellSite({ type: 'mb-state', playing: msg.playing }); return reply({ ok: true });
      case 'mb-needtap': if (sender.tab) await focus(sender.tab.id); return reply({ ok: true });
      default: return reply({ ok: false });
    }
  })();
  return true;
});

// the music tab was closed: tell the host page
chrome.tabs.onRemoved.addListener(async () => { if (!(await playerTab())) tellSite({ type: 'mb-state', playing: false, player: false }); });

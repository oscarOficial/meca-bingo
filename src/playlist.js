// GET /api/playlist?url=<public playlist link>  (called from src/worker.js)
// Reads a PUBLIC playlist from a music provider (no login needed) and returns
// { provider, title, tracks: [{ title, artist }] }.
// Every provider is "best effort": they can change their pages at any time.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

export async function handlePlaylist(request) {
  const u = new URL(request.url).searchParams.get('url') || '';
  try {
    const link = new URL(u.trim());
    const host = link.hostname.replace(/^www\./, '');
    let out;
    if (host.endsWith('spotify.com')) out = await spotify(link);
    else if (host.endsWith('deezer.com') || host === 'deezer.page.link' || host === 'link.deezer.com') out = await deezer(link);
    else if (host.endsWith('music.apple.com')) out = await apple(link);
    else if (host.endsWith('youtube.com') || host === 'youtu.be') out = await youtube(link);
    else if (host.startsWith('music.amazon.')) out = await amazon(link);
    else return json({ error: 'unsupported', message: 'Provider not supported' }, 400);
    out.tracks = dedupe(out.tracks || []);
    if (!out.tracks.length) return json({ error: 'empty', provider: out.provider, message: 'No songs found. Is the playlist public?' }, 422);
    return json(out);
  } catch (e) {
    return json({ error: 'failed', message: String(e && e.message || e) }, 500);
  }
}

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' }
});
const get = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...(opts.headers || {}) }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return opts.json ? r.json() : r.text();
};
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
function dedupe(list) {
  const seen = new Set(), out = [];
  for (const t of list) {
    const title = clean(t.title), artist = clean(t.artist);
    if (!title) continue;
    const k = (title + '|' + artist).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push({ title, artist }); }
  }
  return out;
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------- Spotify: the public "embed" player page includes the track list ----------
async function spotify(link) {
  const m = link.pathname.match(/playlist\/([A-Za-z0-9]+)/);
  if (!m) throw new Error('Not a Spotify playlist link');
  const html = await get(`https://open.spotify.com/embed/playlist/${m[1]}`);
  const nd = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!nd) throw new Error('Spotify page format changed');
  const data = JSON.parse(nd[1]);
  const ent = findKey(data, 'trackList') ? findParentWith(data, 'trackList') : null;
  const list = (ent && ent.trackList) || [];
  return {
    provider: 'spotify',
    title: (ent && (ent.name || ent.title)) || 'Spotify playlist',
    tracks: list.map(t => ({ title: t.title, artist: t.subtitle })),
    note: list.length >= 100 ? 'Spotify only shares the first 100 songs of a playlist this way.' : undefined
  };
}
function findKey(o, key, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return false;
  if (key in o) return true;
  return Object.values(o).some(v => findKey(v, key, depth + 1));
}
function findParentWith(o, key, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return null;
  if (key in o) return o;
  for (const v of Object.values(o)) { const r = findParentWith(v, key, depth + 1); if (r) return r; }
  return null;
}

// ---------- Deezer: has a free public API ----------
async function deezer(link) {
  let id = (link.pathname.match(/playlist\/(\d+)/) || [])[1];
  if (!id) { // short share links redirect to the real page
    const r = await fetch(link.toString(), { headers: { 'user-agent': UA }, redirect: 'follow' });
    id = (new URL(r.url).pathname.match(/playlist\/(\d+)/) || [])[1];
  }
  if (!id) throw new Error('Not a Deezer playlist link');
  const info = await get(`https://api.deezer.com/playlist/${id}`, { json: true });
  if (info.error) throw new Error(info.error.message || 'Deezer error');
  let tracks = [], next = `https://api.deezer.com/playlist/${id}/tracks?limit=200`;
  while (next && tracks.length < 1000) {
    const page = await get(next, { json: true });
    tracks = tracks.concat((page.data || []).map(t => ({ title: t.title, artist: t.artist && t.artist.name })));
    next = page.next;
  }
  return { provider: 'deezer', title: info.title, tracks };
}

// ---------- Apple Music: public page has structured data ----------
async function apple(link) {
  const html = await get(link.toString());
  const tracks = [];
  let title = 'Apple Music playlist';
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      const items = [].concat(d);
      for (const it of items) {
        if (it.name && /Playlist/i.test(it['@type'] || '')) title = it.name;
        for (const t of [].concat(it.track || [])) {
          const a = t.byArtist; tracks.push({ title: t.name, artist: Array.isArray(a) ? a.map(x => x.name).join(', ') : a && a.name });
        }
      }
    } catch (e) {}
  }
  if (!tracks.length) {
    const s = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
    if (s) {
      try {
        walk(JSON.parse(s[1]), o => {
          if (o && o.title && o.artistName && o.contentDescriptor) tracks.push({ title: o.title, artist: o.artistName });
        });
      } catch (e) {}
    }
  }
  return { provider: 'apple', title: decode(title), tracks };
}
function walk(o, fn, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 20) return;
  fn(o);
  for (const v of Object.values(o)) walk(v, fn, depth + 1);
}

// ---------- YouTube / YouTube Music ----------
async function youtube(link) {
  const list = link.searchParams.get('list');
  if (!list) throw new Error('Not a YouTube playlist link (missing list=)');
  const html = await get(`https://www.youtube.com/playlist?list=${list}&hl=en`);
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) throw new Error('YouTube page format changed');
  const data = JSON.parse(m[1]);
  const tracks = [];
  let title = 'YouTube playlist';
  walk(data, o => {
    if (o.playlistVideoRenderer) {
      const v = o.playlistVideoRenderer;
      const name = v.title && (v.title.simpleText || (v.title.runs || []).map(r => r.text).join(''));
      const channel = v.shortBylineText && (v.shortBylineText.runs || []).map(r => r.text).join('');
      // Music videos are usually "Artist - Song"
      const parts = (name || '').split(/\s[-–—]\s/);
      if (parts.length >= 2) tracks.push({ artist: parts[0], title: parts.slice(1).join(' - ').replace(/\s*[\(\[](official|video|lyric|audio|hd|4k|remaster)[^\)\]]*[\)\]]/ig, '') });
      else tracks.push({ title: name, artist: (channel || '').replace(/ - Topic$/, '') });
    }
    if (o.playlistHeaderRenderer && o.playlistHeaderRenderer.title) title = o.playlistHeaderRenderer.title.simpleText || title;
  });
  return { provider: 'youtube', title, tracks };
}

// ---------- Amazon Music: no public API; try the page's structured data ----------
async function amazon(link) {
  const html = await get(link.toString());
  const tracks = [];
  let title = 'Amazon Music playlist';
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      walk(JSON.parse(m[1]), o => {
        if (/MusicPlaylist/i.test(o['@type'] || '') && o.name) title = o.name;
        if (/MusicRecording/i.test(o['@type'] || '') && o.name) {
          const a = o.byArtist; tracks.push({ title: o.name, artist: Array.isArray(a) ? a.map(x => x.name).join(', ') : a && a.name });
        }
      });
    } catch (e) {}
  }
  if (!tracks.length) {
    // music-horizontal-item / music-text-row elements in server rendered HTML
    for (const m of html.matchAll(/primary-text="([^"]+)"[^>]*secondary-text-1="([^"]*)"/g)) tracks.push({ title: decode(m[1]), artist: decode(m[2]) });
  }
  return { provider: 'amazon', title: decode(title), tracks };
}

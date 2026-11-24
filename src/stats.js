// Anonymous usage statistics stored in Cloudflare D1 (binding DB).
// Stored per event: time, day, type, country (from Cloudflare), language and a few
// game numbers. No IP addresses, no ids, no names, no playlist or song titles.

const TYPES = new Set(['import', 'game_created', 'player_joined', 'claim', 'game_ended']);
const KEEP_DAYS = 400;
let ready = false;

async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS events (ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL, country TEXT, lang TEXT, data TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS events_day_type ON events (day, type)'),
  ]);
  ready = true;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// keep only small, known kinds of values
function clean(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {}).slice(0, 20)) {
    if (!/^[a-zA-Z]{1,20}$/.test(k)) continue;
    if (typeof v === 'number' && isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 40);
  }
  return out;
}

export async function handleEvent(request, env, allowedHosts) {
  if (!env.DB) return new Response(null, { status: 204 });
  const origin = request.headers.get('origin') || '';
  try { if (origin && !allowedHosts.has(new URL(origin).hostname)) return new Response(null, { status: 403 }); } catch (e) { return new Response(null, { status: 403 }); }
  const text = await request.text();
  if (text.length > 2000) return new Response(null, { status: 413 });
  let ev; try { ev = JSON.parse(text); } catch (e) { return new Response(null, { status: 400 }); }
  if (!ev || !TYPES.has(ev.type)) return new Response(null, { status: 400 });
  try {
    await init(env.DB);
    const now = Date.now();
    await env.DB.prepare('INSERT INTO events (ts, day, type, country, lang, data) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(now, new Date(now).toISOString().slice(0, 10), ev.type, (request.cf && request.cf.country) || '', String(ev.lang || '').slice(0, 5), JSON.stringify(clean(ev.data)))
      .run();
  } catch (e) { console.error('stats insert', e && e.message); }
  return new Response(null, { status: 204 });
}

// GET /api/stats?days=30  (header Authorization: Bearer <STATS_KEY>)
export async function handleStats(request, env) {
  if (!env.STATS_KEY) return json({ error: 'nokey' }, 503);
  const auth = request.headers.get('authorization') || '';
  if (auth !== 'Bearer ' + env.STATS_KEY) return json({ error: 'auth' }, 401);
  if (!env.DB) return json({ error: 'nodb' }, 503);
  await init(env.DB);
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(KEEP_DAYS, +url.searchParams.get('days') || 30));
  const from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const db = env.DB;
  const q = (sql, ...args) => db.prepare(sql).bind(...args).all().then(r => r.results);
  const J = k => `json_extract(data, '$.${k}')`;
  // tidy up old rows now and then
  if (Math.random() < 0.2) await db.prepare('DELETE FROM events WHERE ts < ?').bind(Date.now() - KEEP_DAYS * 864e5).run();

  const [totals, perDay, providers, imports, langs, countries, formats, players, claims, ended, ext, modes] = await Promise.all([
    q(`SELECT type, COUNT(*) n FROM events WHERE day >= ? GROUP BY type`, from),
    q(`SELECT day, type, COUNT(*) n FROM events WHERE day >= ? AND type IN ('game_created','player_joined') GROUP BY day, type ORDER BY day`, from),
    q(`SELECT ${J('provider')} k, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_created' GROUP BY k ORDER BY n DESC`, from),
    q(`SELECT ${J('provider')} provider, ${J('ok')} ok, ${J('error')} error, COUNT(*) n FROM events WHERE day >= ? AND type = 'import' GROUP BY provider, ok, error ORDER BY n DESC`, from),
    q(`SELECT lang k, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_created' GROUP BY k ORDER BY n DESC`, from),
    q(`SELECT country k, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_created' GROUP BY k ORDER BY n DESC LIMIT 12`, from),
    q(`SELECT ${J('fmt')} k, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_created' GROUP BY k ORDER BY n DESC`, from),
    q(`SELECT AVG(${J('players')}) avgPlayers, MAX(${J('players')}) maxPlayers, AVG(${J('songs')}) avgSongs, AVG(${J('minutes')}) avgMinutes, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_ended' AND ${J('players')} > 0`, from),
    q(`SELECT ${J('prize')} prize, ${J('ok')} ok, ${J('reason')} reason, COUNT(*) n, AVG(${J('songs')}) avgSongs FROM events WHERE day >= ? AND type = 'claim' GROUP BY prize, ok, reason ORDER BY prize, n DESC`, from),
    q(`SELECT COUNT(*) n FROM events WHERE day >= ? AND type = 'game_ended'`, from),
    q(`SELECT ${J('ext')} k, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_created' GROUP BY k`, from),
    q(`SELECT COALESCE(${J('mode')}, 'manual') k, COUNT(*) n FROM events WHERE day >= ? AND type = 'game_created' GROUP BY k ORDER BY n DESC`, from),
  ]);
  return json({ days, from, totals, perDay, providers, imports, langs, countries, formats, players: players[0] || {}, claims, ended: (ended[0] || {}).n || 0, ext, modes });
}

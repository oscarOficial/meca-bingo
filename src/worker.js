// Cloudflare Worker: serves the static app from /public and the playlist importer API.
import { handlePlaylist } from './playlist.js';

const CANONICAL = 'mecabingo.com';

function withHeaders(res, path) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (CANONICAL && !path.startsWith('/api/')) h.set('Strict-Transport-Security', 'max-age=31536000');
  if (/\.(woff2|png|jpg|svg)$/.test(path)) h.set('Cache-Control', 'public, max-age=2592000');
  else if (/\.(js|css)$/.test(path)) h.set('Cache-Control', 'public, max-age=3600');
  return r;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One address for search engines: www → mecabingo.com
    if (url.hostname === 'www.' + CANONICAL) {
      url.hostname = CANONICAL;
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/playlist' && request.method === 'GET') return handlePlaylist(request);
    // "/" and "/host" style addresses go to the matching .html page
    if (url.pathname === '/' || /^\/(host|play|privacy|legal|extension)\/?$/.test(url.pathname)) {
      const page = url.pathname === '/' ? '/index.html' : url.pathname.replace(/\/?$/, '.html');
      return withHeaders(await env.ASSETS.fetch(new Request(new URL(page + url.search, url), request)), page);
    }
    return withHeaders(await env.ASSETS.fetch(request), url.pathname);
  }
};

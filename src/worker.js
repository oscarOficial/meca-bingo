// Cloudflare Worker: serves the static app from /public and the playlist importer API.
// Domains come from site.config.json (canonical address, extra domains, redirects).
import { handlePlaylist } from './playlist.js';
import SITE from '../site.config.json';

const CANONICAL = SITE.canonical;
const PUBLIC_PAGES = ['/', '/extension.html', '/privacy.html'];

function withHeaders(res, path) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!path.startsWith('/api/')) h.set('Strict-Transport-Security', 'max-age=31536000');
  if (/\.(woff2|png|jpg|svg)$/.test(path)) h.set('Cache-Control', 'public, max-age=2592000');
  else if (/\.(js|css)$/.test(path)) h.set('Cache-Control', 'public, max-age=3600');
  return r;
}

const text = (body, type) => new Response(body, { headers: { 'content-type': type + '; charset=utf-8', 'cache-control': 'public, max-age=3600' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    // Optional: every other domain sends visitors to the canonical one
    if (SITE.redirectToCanonical && !isLocal && url.hostname !== CANONICAL && !url.pathname.startsWith('/api/')) {
      url.hostname = CANONICAL;
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/playlist' && request.method === 'GET') return handlePlaylist(request);
    if (url.pathname === '/robots.txt') {
      // Only the canonical domain is indexed; copies on other domains are not
      if (url.hostname !== CANONICAL) return text('User-agent: *\nDisallow: /\n', 'text/plain');
      return text(`User-agent: *\nAllow: /\nDisallow: /play.html\nDisallow: /download/\nSitemap: https://${CANONICAL}/sitemap.xml\n`, 'text/plain');
    }
    if (url.pathname === '/sitemap.xml') {
      const urls = PUBLIC_PAGES.map(p => `  <url><loc>https://${CANONICAL}${p}</loc></url>`).join('\n');
      return text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'application/xml');
    }
    // "/" and "/host" style addresses go to the matching .html page
    let page = url.pathname;
    if (page === '/' || /^\/(host|play|privacy|legal|extension)\/?$/.test(page)) {
      page = page === '/' ? '/index.html' : page.replace(/\/?$/, '.html');
    }
    const res = await env.ASSETS.fetch(new Request(new URL(page + url.search, url), request));
    if (page === '/index.html' && res.ok) {
      // Fill the canonical address into the landing's SEO tags
      const html = (await res.text()).replaceAll('__SITE__', CANONICAL);
      return withHeaders(new Response(html, res), page);
    }
    return withHeaders(res, page);
  }
};

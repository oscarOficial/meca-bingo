// Cloudflare Worker: serves the static app from /public and the playlist importer API.
// Domains come from site.config.json (canonical address, extra domains, redirects).
import { handlePlaylist } from './playlist.js';
import SITE from '../site.config.json';
import TEXTS from '../site/landing.i18n.json';

const CANONICAL = SITE.canonical;
const LANGS = Object.keys(TEXTS);          // landing languages: /en/, /es/...
const DEFAULT_LANG = 'en';
const OTHER_PAGES = ['/extension.html', '/privacy.html'];

// best landing language for this visitor (Accept-Language), e.g. "es-ES,es;q=0.9,en;q=0.8" → es
function pickLang(request) {
  const prefs = (request.headers.get('accept-language') || '').split(',')
    .map(p => { const [tag, q] = p.trim().split(';q='); return { l: tag.slice(0, 2).toLowerCase(), q: q ? +q : 1 }; })
    .sort((a, b) => b.q - a.q);
  const hit = prefs.find(p => LANGS.includes(p.l));
  return hit ? hit.l : DEFAULT_LANG;
}

function withHeaders(res, path) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!path.startsWith('/api/')) h.set('Strict-Transport-Security', 'max-age=31536000');
  if (/\.(woff2|png|jpg|webp|svg)$/.test(path)) h.set('Cache-Control', 'public, max-age=2592000');
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
      const alt = LANGS.map(l => `    <xhtml:link rel="alternate" hreflang="${l}" href="https://${CANONICAL}/${l}/"/>`).join('\n')
        + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="https://${CANONICAL}/"/>`;
      const urls = LANGS.map(l => `  <url>\n    <loc>https://${CANONICAL}/${l}/</loc>\n${alt}\n  </url>`)
        .concat(OTHER_PAGES.map(p => `  <url><loc>https://${CANONICAL}${p}</loc></url>`)).join('\n');
      return text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`, 'application/xml');
    }
    // the home page sends each visitor to their language
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const to = new URL(`/${pickLang(request)}/${url.search}`, url);
      return new Response(null, { status: 302, headers: { location: to.toString(), vary: 'Accept-Language', 'cache-control': 'private, no-store' } });
    }
    const lm = url.pathname.match(/^\/([a-z]{2})(\/(index\.html)?)?$/);
    if (lm && LANGS.includes(lm[1])) {
      if (lm[2] !== '/') return Response.redirect(new URL(`/${lm[1]}/${url.search}`, url).toString(), 301);
      const page = `/${lm[1]}/index.html`;
      return withHeaders(await env.ASSETS.fetch(new Request(new URL(page, url), request)), page);
    }
    // "/" and "/host" style addresses go to the matching .html page
    let page = url.pathname;
    if (/^\/(host|play|privacy|legal|extension)\/?$/.test(page)) page = page.replace(/\/?$/, '.html');
    const res = await env.ASSETS.fetch(new Request(new URL(page + url.search, url), request));
    return withHeaders(res, page);
  }
};

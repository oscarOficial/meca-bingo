// Cloudflare Worker: serves the static app from /public and the playlist importer API.
import { handlePlaylist } from './playlist.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/playlist' && request.method === 'GET') return handlePlaylist(request);
    // "/" and "/host" style addresses go to the matching .html page
    if (url.pathname === '/' || /^\/(host|play)\/?$/.test(url.pathname)) {
      const page = url.pathname === '/' ? '/index.html' : url.pathname.replace(/\/?$/, '.html');
      return env.ASSETS.fetch(new Request(new URL(page + url.search, url), request));
    }
    return env.ASSETS.fetch(request);
  }
};

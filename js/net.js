// Connection between the host's browser and the players' phones.
// Default: PeerJS (WebRTC, phone ↔ host directly). For local testing, add ?net=local to
// both URLs to use a BroadcastChannel between tabs of the same browser.
(function (G) {
  const PREFIX = 'mecabingo-';
  const useLocal = () => new URLSearchParams(location.search).get('net') === 'local';

  // ---------- host side ----------
  function hostRoom(code, { onMessage, onStatus, onPeerLeft }) {
    const conns = new Map();   // connection id -> send function
    let closed = false;
    if (useLocal()) {
      const bc = new BroadcastChannel(PREFIX + code);
      bc.onmessage = e => {
        const m = e.data; if (!m || m.to !== 'host') return;
        if (!conns.has(m.from)) conns.set(m.from, d => bc.postMessage({ to: m.from, data: d }));
        onMessage(m.from, m.data, conns.get(m.from));
      };
      setTimeout(() => onStatus('open'), 0);
      return { broadcast: d => bc.postMessage({ to: '*', data: d }), send: (id, d) => conns.get(id) && conns.get(id)(d), close: () => bc.close() };
    }
    let peer;
    const start = () => {
      if (closed) return;
      peer = new Peer(PREFIX + code.toLowerCase(), { debug: 0 });
      peer.on('open', () => onStatus('open'));
      peer.on('connection', c => {
        c.on('open', () => conns.set(c.connectionId, d => { try { c.send(d); } catch (e) {} }));
        c.on('data', d => onMessage(c.connectionId, d, conns.get(c.connectionId) || (x => c.send(x))));
        c.on('close', () => { conns.delete(c.connectionId); onPeerLeft && onPeerLeft(c.connectionId); });
      });
      peer.on('disconnected', () => { if (!closed) setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500); });
      peer.on('error', e => {
        onStatus('error', e.type);
        // after a reload the old id can still be taken for a few seconds
        if (e.type === 'unavailable-id' || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') {
          try { peer.destroy(); } catch (x) {}
          setTimeout(start, 3000);
        }
      });
    };
    start();
    return {
      broadcast: d => conns.forEach(send => send(d)),
      send: (id, d) => conns.get(id) && conns.get(id)(d),
      close: () => { closed = true; try { peer.destroy(); } catch (e) {} }
    };
  }

  // ---------- player side ----------
  function joinRoom(code, { onMessage, onStatus }) {
    let send = () => {}, closed = false;
    if (useLocal()) {
      const me = 'p' + Math.random().toString(36).slice(2, 8);
      const bc = new BroadcastChannel(PREFIX + code);
      bc.onmessage = e => { const m = e.data; if (m && (m.to === me || m.to === '*')) onMessage(m.data); };
      send = d => bc.postMessage({ to: 'host', from: me, data: d });
      setTimeout(() => onStatus('open'), 50);
      return { send: d => send(d), close: () => bc.close() };
    }
    let peer, conn, retry = 0, everOpen = false;
    const connect = () => {
      if (closed) return;
      if (!peer || peer.destroyed) {
        peer = new Peer({ debug: 0 });
        peer.on('open', connect);
        peer.on('error', e => {
          if (e.type === 'peer-unavailable') onStatus(everOpen ? 'lost' : 'notfound');
          else onStatus('error', e.type);
          setTimeout(connect, Math.min(10000, 2000 + 1000 * retry++));
        });
        return;
      }
      if (peer.disconnected) { peer.reconnect(); return; }
      conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true });
      conn.on('open', () => { retry = 0; everOpen = true; send = d => conn.send(d); onStatus('open'); });
      conn.on('data', onMessage);
      conn.on('close', () => { send = () => {}; onStatus('lost'); setTimeout(connect, 2000); });
    };
    connect();
    return { send: d => send(d), close: () => { closed = true; try { peer.destroy(); } catch (e) {} } };
  }

  G.NET = { hostRoom, joinRoom };
})(window);

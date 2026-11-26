// Connection between the host's browser and the players' phones.
// Default: PeerJS (WebRTC, phone ↔ host directly). For local testing, add ?net=local to
// both URLs to use a BroadcastChannel between tabs of the same browser.
// The connection lifecycle goes to the console as [mb-net] lines; ?debug=1 adds PeerJS detail
// and the type of each message received. Never payloads, names or ICE addresses.
(function (G) {
  const PREFIX = 'mecabingo-';
  const useLocal = () => new URLSearchParams(location.search).get('net') === 'local';
  const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const stamp = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3); };
  const log = (...a) => console.info('[mb-net]', stamp(), ...a);
  const warn = (...a) => console.warn('[mb-net]', stamp(), ...a);
  const dlog = (...a) => { if (DEBUG) log(...a); };
  const peerOpts = () => ({ debug: DEBUG ? 2 : 0 });

  // ICE states and a count of local candidate types; the candidate string itself holds IPs.
  // addEventListener only: PeerJS uses the on* properties.
  function watchIce(c) {
    const pc = c.peerConnection; if (!pc) return;
    const n = { host: 0, srflx: 0, relay: 0, prflx: 0 };
    pc.addEventListener('icecandidate', e => { const t = e.candidate && / typ (\w+)/.exec(e.candidate.candidate || ''); if (t) n[t[1]] = (n[t[1]] || 0) + 1; });
    pc.addEventListener('iceconnectionstatechange', () => {
      log('ice ' + c.connectionId + ': ' + pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') log('ice failed: no direct route and no TURN relay (likely strict NAT / different networks)');
    });
    pc.addEventListener('icegatheringstatechange', () => {
      log('ice gathering: ' + pc.iceGatheringState);
      if (pc.iceGatheringState === 'complete') log('candidates: host ' + n.host + ', srflx ' + n.srflx + ', relay ' + n.relay + (n.prflx ? ', prflx ' + n.prflx : ''));
    });
  }

  // A hung first request to the signalling server otherwise leaves the console silent.
  function watchSignal(peer) {
    const host = (peer.options && peer.options.host) || '?';
    log('connecting to signalling server ' + host);
    const timers = [5, 15].map(s => setTimeout(() => warn('still waiting for signalling server ' + host + ' after ' + s + 's: it is likely unreachable from this network (firewall, ad blocker, captive portal) or down'), s * 1000));
    const clear = () => timers.forEach(clearTimeout);
    peer.on('open', clear); peer.on('error', clear); peer.on('close', clear);
  }

  // ---------- host side ----------
  function hostRoom(code, { onMessage, onStatus, onPeerLeft }) {
    const conns = new Map();   // connection id -> send function
    let closed = false;
    if (useLocal()) {
      const bc = new BroadcastChannel(PREFIX + code);
      log('local: BroadcastChannel ' + PREFIX + code + ' (host)');
      bc.onmessage = e => {
        const m = e.data; if (!m || m.to !== 'host') return;
        dlog('recv ' + (m.data && m.data.t) + ' from ' + m.from);
        if (!conns.has(m.from)) conns.set(m.from, d => bc.postMessage({ to: m.from, data: d }));
        onMessage(m.from, m.data, conns.get(m.from));
      };
      setTimeout(() => onStatus('open'), 0);
      return { broadcast: d => bc.postMessage({ to: '*', data: d }), send: (id, d) => conns.get(id) && conns.get(id)(d), close: () => { log('local: close'); bc.close(); } };
    }
    let peer;
    const start = why => {
      if (closed) return;
      log('host: room ' + code + ', peer id ' + PREFIX + code.toLowerCase() + (why ? ' (restart after ' + why + ')' : ''));
      peer = new Peer(PREFIX + code.toLowerCase(), peerOpts());
      watchSignal(peer);
      peer.on('open', id => { log('signalling server open, id ' + id); onStatus('open'); });
      peer.on('connection', c => {
        log('incoming connection ' + c.connectionId + ' from ' + c.peer);
        watchIce(c);
        c.on('open', () => { log('conn ' + c.connectionId + ' open'); conns.set(c.connectionId, d => { try { c.send(d); } catch (e) {} }); });
        c.on('data', d => { dlog('recv ' + (d && d.t) + ' from ' + c.connectionId); onMessage(c.connectionId, d, conns.get(c.connectionId) || (x => c.send(x))); });
        c.on('close', () => { log('conn ' + c.connectionId + ' close'); conns.delete(c.connectionId); onPeerLeft && onPeerLeft(c.connectionId); });
        c.on('error', e => log('conn ' + c.connectionId + ' error ' + e.type, e.message));
      });
      peer.on('disconnected', () => {
        log('signalling server disconnected' + (closed ? '' : ', reconnecting in 1.5s'));
        if (!closed) setTimeout(() => { if (peer && !peer.destroyed) { log('reconnect'); peer.reconnect(); } }, 1500);
      });
      peer.on('close', () => log('peer close'));
      peer.on('error', e => {
        // after a reload the old id can still be taken for a few seconds
        const restart = e.type === 'unavailable-id' || e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error';
        log('error ' + e.type, e.message, restart ? '(restart in 3s)' : '(no restart)');
        onStatus('error', e.type);
        if (restart) {
          try { peer.destroy(); } catch (x) {}
          setTimeout(() => start(e.type), 3000);
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
      log('local: BroadcastChannel ' + PREFIX + code + ' (player ' + me + ')');
      bc.onmessage = e => { const m = e.data; if (m && (m.to === me || m.to === '*')) { dlog('recv ' + (m.data && m.data.t)); onMessage(m.data); } };
      send = d => bc.postMessage({ to: 'host', from: me, data: d });
      setTimeout(() => onStatus('open'), 50);
      return { send: d => send(d), close: () => { log('local: close'); bc.close(); } };
    }
    log('player: room ' + code);
    let peer, conn, retry = 0, everOpen = false;
    const connect = () => {
      if (closed) return;
      if (!peer || peer.destroyed) {
        peer = new Peer(peerOpts());
        watchSignal(peer);
        peer.on('open', id => { log('signalling server open, id ' + id); connect(); });
        peer.on('disconnected', () => log('signalling server disconnected'));
        peer.on('error', e => {
          if (e.type === 'peer-unavailable') onStatus(everOpen ? 'lost' : 'notfound');
          else onStatus('error', e.type);
          const wait = Math.min(10000, 2000 + 1000 * retry++);
          log('error ' + e.type, e.message, '(retry in ' + wait / 1000 + 's)');
          setTimeout(connect, wait);
        });
        return;
      }
      if (peer.disconnected) { log('reconnect'); peer.reconnect(); return; }
      log('connecting to ' + PREFIX + code.toLowerCase());
      const c = conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true });
      watchIce(c);
      c.on('open', () => { log('conn ' + c.connectionId + ' open'); retry = 0; everOpen = true; send = d => conn.send(d); onStatus('open'); });
      c.on('data', d => { dlog('recv ' + (d && d.t)); onMessage(d); });
      c.on('close', () => { log('conn ' + c.connectionId + ' close, retry in 2s'); send = () => {}; onStatus('lost'); setTimeout(connect, 2000); });
      c.on('error', e => log('conn ' + c.connectionId + ' error ' + e.type, e.message));
    };
    connect();
    return { send: d => send(d), close: () => { closed = true; try { peer.destroy(); } catch (e) {} } };
  }

  G.NET = { hostRoom, joinRoom, log, debug: DEBUG };
})(window);

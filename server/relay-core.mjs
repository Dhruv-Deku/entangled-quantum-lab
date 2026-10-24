/**
 * The shared-lab relay: people in the same room code get each other's
 * messages, nothing more. It keeps the room's latest circuit (the last "sync")
 * so someone joining late starts from it, and forgets a room when it empties.
 * Used by the Vite dev and preview servers and by server/relay.mjs.
 */

export const RELAY_PATH = '/entangled-relay';
const MAX_MESSAGE = 256 * 1024;
const MAX_PEERS = 40;
const ROOM = /^[A-Z0-9]{4,8}$/;

/** @param {import('ws').WebSocketServer} wss */
export function attachRelay(wss) {
  /** @type {Map<string, { peers: Map<string, import('ws').WebSocket>, last: string | null, lastClass: string | null }>} */
  const rooms = new Map();
  wss.on('connection', (ws) => {
    let room = '';
    let id = '';
    const leave = () => {
      const r = rooms.get(room);
      if (!r || r.peers.get(id) !== ws) return;
      r.peers.delete(id);
      if (!r.peers.size) rooms.delete(room);
      else for (const peer of r.peers.values()) if (peer.readyState === 1) peer.send(JSON.stringify({ t: 'left', from: id }));
    };
    ws.on('message', (data) => {
      const text = String(data);
      if (text.length > MAX_MESSAGE) return;
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'join') {
        if (typeof msg.room !== 'string' || !ROOM.test(msg.room) || typeof msg.from !== 'string' || !msg.from || msg.from.length > 40) return;
        leave();
        room = msg.room;
        id = msg.from;
        let r = rooms.get(room);
        if (!r) rooms.set(room, (r = { peers: new Map(), last: null, lastClass: null }));
        if (r.peers.size >= MAX_PEERS && !r.peers.has(id)) {
          ws.send(JSON.stringify({ t: 'full', room }));
          return;
        }
        r.peers.set(id, ws);
        ws.send(JSON.stringify({ t: 'welcome', room, peers: [...r.peers.keys()].filter((p) => p !== id), last: r.last, lastClass: r.lastClass }));
        return;
      }
      const r = rooms.get(room);
      if (!r || r.peers.get(id) !== ws || msg.from !== id) return;
      if (msg.t === 'sync') r.last = text;
      if (msg.t === 'class') r.lastClass = text;
      // a message for one peer, or for everyone else in the room
      if (typeof msg.to === 'string') {
        const peer = r.peers.get(msg.to);
        if (peer && peer.readyState === 1) peer.send(text);
        return;
      }
      for (const [pid, peer] of r.peers) if (pid !== id && peer.readyState === 1) peer.send(text);
    });
    ws.on('close', leave);
    ws.on('error', leave);
  });
  return rooms;
}

/**
 * Serve the relay on an http(s) server's upgrade requests to RELAY_PATH,
 * leaving every other upgrade (Vite's own hot reload) alone.
 * @param {import('http').Server} server
 * @param {typeof import('ws').WebSocketServer} WebSocketServer
 */
export function relayOn(server, WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true });
  attachRelay(wss);
  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(RELAY_PATH)) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  return wss;
}

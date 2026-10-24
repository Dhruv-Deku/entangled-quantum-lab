#!/usr/bin/env node
/**
 * A standalone shared-lab relay, for when the app is served as static files
 * (GitHub Pages and the like): `node server/relay.mjs [port]`, then open the
 * app with ?relay=wss://your-host:port so it connects here.
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RELAY_PATH, relayOn } from './relay-core.mjs';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`Entangled shared-lab relay. Connect a WebSocket to ${RELAY_PATH}.\n`);
});
relayOn(server, WebSocketServer);
server.listen(port, () => console.log(`relay on ws://localhost:${port}${RELAY_PATH}`));

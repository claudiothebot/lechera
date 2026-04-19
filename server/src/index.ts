import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { createServer } from 'node:http';
import { MilkDreamsRoom } from './rooms/MilkDreamsRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();

// Tiny health check for hosting platforms; everything else is WS.
app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('milk-dreams server\n');
});

// Express owns the HTTP layer; Colyseus borrows the same server for WS
// upgrades. This is the 0.17 pattern that lets us add REST endpoints
// alongside the realtime room (we'll need this in Phase 5 for the
// Supabase-backed ranking).
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('milk-dreams', MilkDreamsRoom);

gameServer.listen(PORT).then(() => {
  console.log(`[server] milk-dreams listening on ws://localhost:${PORT}`);
});

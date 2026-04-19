// `dotenv/config` reads `.env` from the CWD if present and stops
// silently otherwise — exactly the "optional persistence" semantics we
// want. Has to run BEFORE the persistence module imports, because
// `getLeaderboardStore()` snapshots `process.env.SUPABASE_*` lazily on
// first call but the module-level singleton check would still race if
// dotenv loaded later. Importing it at the top of the entry point
// resolves the order deterministically.
import 'dotenv/config';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { createServer } from 'node:http';
import { MilkDreamsRoom } from './rooms/MilkDreamsRoom.js';
import { getLeaderboardStore } from './persistence/supabase.js';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();

// Tiny health check for hosting platforms; everything else is WS.
app.get('/health', (_req, res) => {
  res.type('text/plain').send('ok');
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('milk-dreams server\n');
});

/**
 * Phase 5 — public read of the all-time leaderboard. Backed by Supabase
 * when configured, otherwise returns an empty array (the no-op store).
 *
 * CORS: explicit `Access-Control-Allow-Origin: *` because the Vite dev
 * server (5173) and the prod static host will be on different origins
 * than the Colyseus server (2567 / production hostname). The endpoint
 * is read-only and exposes only public ranking data — no auth tokens,
 * no PII — so wildcard CORS is fine.
 */
app.get('/leaderboard', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 10;
  try {
    const entries = await getLeaderboardStore().topRankings(limit);
    res.json({ entries });
  } catch (err) {
    // Defensive: the store already swallows its own errors and returns
    // []. This catch is just for the unexpected case (e.g. an OOM at
    // JSON.stringify) so the response is still valid JSON.
    console.warn(
      `[server] /leaderboard handler error: ${(err as Error).message}`,
    );
    res.json({ entries: [] });
  }
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

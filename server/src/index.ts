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
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MilkDreamsRoom } from './rooms/MilkDreamsRoom.js';
import { getLeaderboardStore } from './persistence/supabase.js';
import { getTweetsStore } from './persistence/tweets.js';

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = express();

/**
 * CORS preflight for `POST /dev/level` (level editor save). Express 5's
 * router uses path-to-regexp v8 — bare `*` in `/dev/*` is invalid ("Missing
 * parameter name"); we register the concrete path. Add more `app.options`
 * lines if new `/dev/...` POST routes appear.
 */
app.options('/dev/level', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.options('/dev/collider-presets', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

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

/**
 * Public billboard tweets for the in-world signs. The ingest service owns
 * fetching/storing raw tweets; this endpoint exposes only the curated,
 * billboard-safe fields returned by the `milk_dreams.billboard_tweets()`
 * RPC, with server-side text cleanup before JSON leaves this process.
 */
app.get('/tweets', async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const tweets = await getTweetsStore().billboardTweets();
    res.json({ tweets });
  } catch (err) {
    console.warn(`[server] /tweets handler error: ${(err as Error).message}`);
    res.json({ tweets: [] });
  }
});

/**
 * Dev-only endpoint used by the level editor's "Save" button. Writes
 * the supplied JSON payload straight into `public/levels/level-01.json`
 * so a reload picks up the new layout for everyone hitting the same
 * dev server.
 *
 * Guard-railed on three axes:
 *  - `NODE_ENV !== 'production'` — the endpoint flat-out refuses to
 *    exist in production builds.
 *  - JSON body is parsed and re-stringified via the LevelDefinition
 *    shape indirectly (the client sends `serializeLevelDefinition`
 *    output, which already went through `normalizeLevelDefinition`);
 *    we just verify that it's syntactically valid JSON before touching
 *    the filesystem.
 *  - File path is computed from this file's URL, so it's always the
 *    repo's `public/levels/level-01.json` regardless of the CWD
 *    `tsx watch` was started from.
 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LEVEL_FILE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/levels/level-01.json',
);

const COLLIDER_PRESETS_FILE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/colliders/collider-presets.json',
);

app.post(
  '/dev/level',
  express.json({ limit: '256kb' }),
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (IS_PRODUCTION) {
      res.status(403).json({ error: 'disabled in production' });
      return;
    }
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'body must be a JSON object' });
      return;
    }
    try {
      const pretty = JSON.stringify(req.body, null, 2) + '\n';
      await writeFile(LEVEL_FILE_PATH, pretty, 'utf8');
      console.log(`[dev-save] wrote ${LEVEL_FILE_PATH} (${pretty.length} B)`);
      res.json({ ok: true, path: LEVEL_FILE_PATH, bytes: pretty.length });
    } catch (err) {
      console.error('[dev-save] write failed', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

/**
 * Dev-only: level editor "Save" for global per-type collider scales.
 * Writes `public/colliders/collider-presets.json`. Same production guard
 * as `POST /dev/level`.
 */
app.post(
  '/dev/collider-presets',
  express.json({ limit: '128kb' }),
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (IS_PRODUCTION) {
      res.status(403).json({ error: 'disabled in production' });
      return;
    }
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'body must be a JSON object' });
      return;
    }
    try {
      const pretty = JSON.stringify(req.body, null, 2) + '\n';
      await writeFile(COLLIDER_PRESETS_FILE_PATH, pretty, 'utf8');
      console.log(
        `[dev-save] wrote ${COLLIDER_PRESETS_FILE_PATH} (${pretty.length} B)`,
      );
      res.json({ ok: true, path: COLLIDER_PRESETS_FILE_PATH, bytes: pretty.length });
    } catch (err) {
      console.error('[dev-save] collider-presets write failed', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// Express owns the HTTP layer; Colyseus borrows the same server for WS
// upgrades. This is the 0.17 pattern that lets us add REST endpoints
// alongside the realtime room (we'll need this in Phase 5 for the
// Supabase-backed ranking).
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('milk-dreams', MilkDreamsRoom);

gameServer.listen(PORT, HOST).then(() => {
  console.log(`[server] milk-dreams listening on ws://${HOST}:${PORT}`);
});

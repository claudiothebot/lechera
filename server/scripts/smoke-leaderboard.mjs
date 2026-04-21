// Phase-5 smoke test: end-to-end Supabase leaderboard.
//
// What this validates depends on whether SUPABASE_URL / SUPABASE_ANON_KEY
// are available: this script loads `server/.env` via `dotenv` so the
// parent process picks the same persistence mode as the spawned server.
// (Without that, only the child had creds and the wrong branch ran.)
//
//  - PERSISTENCE OFF (no env vars on the server):
//    Just verifies that GET /leaderboard returns 200 + `{ entries: [] }`.
//    The room still drives rounds; we don't try to assert any DB writes.
//
//  - PERSISTENCE ON:
//    1. Spawns a client, claims one delivery (1 L banked).
//    2. Forces a round end via the dedicated short-round server (port
//       2569 by default) so we don't wait 3 minutes — see the
//       MD_ROUND_MS env override below.
//    3. Reads /leaderboard and asserts the just-finished round's name
//       appears with total_milk >= 1.
//    4. Reconnects and runs another round to verify accumulation.
//
// Boots its own dedicated server on port `MD_SMOKE_PORT` (default
// 2569) with very short phase durations so the whole script runs in a
// few seconds. The user's main dev server stays untouched.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { Client } from '@colyseus/sdk';
import { goalFor } from '@milk-dreams/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
// Same `.env` the server loads — without this the *parent* process has
// no `SUPABASE_*` while the spawned child does, so `persistenceEnabled`
// below would be false and we'd take the wrong branch.
loadDotenv({ path: path.join(SERVER_DIR, '.env') });
const PORT = Number(process.env.MD_SMOKE_PORT ?? 2569);
const HTTP_BASE = `http://127.0.0.1:${PORT}`;
const WS_BASE = `ws://127.0.0.1:${PORT}`;

// Forward Supabase env from the shell that invoked this script. If
// they're missing, the server boots in "persistence disabled" mode and
// we run the reduced-coverage path.
const persistenceEnabled = !!(
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
);

console.log(
  `[smoke-leaderboard] persistence=${persistenceEnabled ? 'ON' : 'OFF'} port=${PORT}`,
);

function spawnServer() {
  const child = spawn(
    'pnpm',
    ['exec', 'tsx', 'src/index.ts'],
    {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(PORT),
        // Sub-second round so the whole test wraps in ~3s.
        MD_ROUND_MS: '1500',
        MD_SCOREBOARD_MS: '1500',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (b) =>
    process.stdout.write(`[srv] ${b.toString()}`),
  );
  child.stderr.on('data', (b) =>
    process.stderr.write(`[srv] ${b.toString()}`),
  );
  return child;
}

async function waitFor(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not come up at ${url} within ${timeoutMs}ms`);
}

async function fetchEntries() {
  const res = await fetch(`${HTTP_BASE}/leaderboard?limit=10`);
  if (!res.ok) throw new Error(`/leaderboard returned ${res.status}`);
  const body = await res.json();
  if (!body || !Array.isArray(body.entries)) {
    throw new Error(`bad payload: ${JSON.stringify(body)}`);
  }
  return body.entries;
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fail(msg) {
  console.error(`[smoke-leaderboard] FAIL: ${msg}`);
  process.exit(1);
}

const child = spawnServer();
let exited = false;
child.on('exit', (code) => {
  exited = true;
  if (code !== 0 && code !== null) {
    console.error(`[smoke-leaderboard] server exited early code=${code}`);
  }
});

try {
  await waitFor(`${HTTP_BASE}/health`, 8000);

  // Step A — endpoint reachability (works in both modes).
  let entries = await fetchEntries();
  console.log(
    `[step A] /leaderboard reachable, baseline entries=${entries.length}`,
  );
  if (!persistenceEnabled) {
    if (entries.length !== 0) {
      fail(
        `persistence disabled, expected empty list, got ${entries.length}`,
      );
    }
    console.log('[smoke-leaderboard] PASS (persistence off — endpoint OK)');
    process.exit(0);
  }

  // Persistence ON — exercise the full path.
  // Step B — connect, deliver, let the round end, expect a row.
  const goal0 = goalFor(0);
  const baselineByName = new Map(
    entries.map((e) => [e.name, e.total_milk]),
  );

  // Names are mandatory (Phase 6) — pick a stable test name so step C
  // can verify accumulation across two rounds under the same identity.
  // Suffix with a per-process random tag so the row doesn't collide
  // with parallel CI runs against the same Supabase project.
  const myName = `Smoke ${Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(4, '0')}`;
  const c1 = new Client(WS_BASE);
  const room1 = await c1.joinOrCreate('milk-dreams', { name: myName });
  await wait(300);
  const me1 = room1.state.players.get(room1.sessionId);
  if (!me1) fail('self schema not hydrated');
  if (me1.name !== myName) {
    fail(`server changed our name: requested='${myName}', got='${me1.name}'`);
  }
  console.log(`[step B] joined as ${myName}`);

  room1.send('pose', { x: goal0.x, z: goal0.z, yaw: 0 });
  await wait(100);
  room1.send('claim_delivery', { x: goal0.x, z: goal0.z });
  // Wait for the round to end (1.5 s) + persistence flush + scoreboard window.
  await wait(2500);
  await room1.leave();

  entries = await fetchEntries();
  const row = entries.find((e) => e.name === myName);
  if (!row) {
    fail(
      `persistence ON: no leaderboard row for ${myName} after delivery; entries=${JSON.stringify(entries)}`,
    );
  }
  const baseline = baselineByName.get(myName) ?? 0;
  if (row.total_milk < baseline + 1) {
    fail(
      `total_milk did not increase: baseline=${baseline}, now=${row.total_milk}`,
    );
  }
  console.log(
    `[step B] ${myName} appears with total_milk=${row.total_milk} (>= baseline+1=${baseline + 1})`,
  );

  // Step C — second round under the SAME name, expect accumulation.
  const c2 = new Client(WS_BASE);
  const room2 = await c2.joinOrCreate('milk-dreams', { name: myName });
  await wait(300);
  const before = row.total_milk;
  const me2 = room2.state.players.get(room2.sessionId);
  if (!me2) fail('second self schema not hydrated');
  if (me2.name !== myName) {
    fail(`server changed our name on rejoin: got='${me2.name}'`);
  }
  room2.send('pose', { x: goal0.x, z: goal0.z, yaw: 0 });
  await wait(100);
  room2.send('claim_delivery', { x: goal0.x, z: goal0.z });
  await wait(2500);
  await room2.leave();
  entries = await fetchEntries();
  const after = entries.find((e) => e.name === myName);
  if (!after || after.total_milk < before + 1) {
    fail(
      `accumulation broke: before=${before}, after=${after?.total_milk}`,
    );
  }
  console.log(
    `[step C] accumulated across rounds: before=${before}, after=${after.total_milk}`,
  );

  console.log('[smoke-leaderboard] PASS');
  process.exit(0);
} catch (err) {
  console.error('[smoke-leaderboard] FAIL:', err);
  process.exit(1);
} finally {
  if (!exited) {
    child.kill('SIGTERM');
    await wait(200);
  }
}

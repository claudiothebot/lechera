// Phase-6 smoke test: mandatory display name + spawn ring + reconnect.
//
// Boots its own dedicated server on port `MD_SMOKE_PORT` (default 2571)
// with shrunk phase durations (60 s round / 5 s scoreboard) so the
// reconnect grace window can be exercised without making the test
// drag. Uses the same spawn-and-control pattern as the other Phase-X
// smoke scripts (see `smoke-rounds.mjs` / `smoke-leaderboard.mjs`).
//
// Validates, in order:
//   A. Custom name. Client passes `{ name: 'Marta' }` in joinOrCreate.
//      Schema reflects the sanitised name.
//   B. Missing name → JOIN REJECTED. (The modal makes this impossible
//      from the real client, but we exercise the server contract.)
//   C. Too-short name (< MIN_NAME_LENGTH) → JOIN REJECTED.
//   D. Sanitisation. Control chars + zero-width + leading/trailing
//      whitespace + > MAX_NAME_LENGTH input → cleaned + truncated and
//      ACCEPTED (still well above MIN_NAME_LENGTH).
//   E. Spawn ring. Three accepted clients all land inside the annulus
//      and at distinct positions.
//   F. Reconnect. Player joins with name 'Reco', delivers, leaves
//      while phase is 'playing', re-joins with same name within TTL
//      → litresDelivered restored, dreamIndex reset to 0.
//   G. Different name does NOT inherit the cached score (keying is
//      by name, not by some looser identity).
//
// Constants come from `@milk-dreams/shared` so any future tweak to
// the spawn ring or name bounds is picked up automatically.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import {
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  SPAWN_RING_INNER_M,
  SPAWN_RING_OUTER_M,
  SPAWN_X,
  SPAWN_Z,
  goalFor,
} from '@milk-dreams/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.MD_SMOKE_PORT ?? 2571);
const WS_BASE = `ws://127.0.0.1:${PORT}`;
const HTTP_BASE = `http://127.0.0.1:${PORT}`;

const GOAL_0 = goalFor(0);

function spawnServer() {
  const child = spawn(
    'pnpm',
    ['exec', 'tsx', 'src/index.ts'],
    {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(PORT),
        // Long round/scoreboard so we can drive the test deterministically
        // around player joins/leaves without phase transitions racing.
        MD_ROUND_MS: '60000',
        MD_SCOREBOARD_MS: '5000',
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

async function waitForHealth(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${HTTP_BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not come up within ${timeoutMs}ms`);
}

async function joinAs(options) {
  const client = new Client(WS_BASE);
  const room = await client.joinOrCreate('milk-dreams', options ?? {});
  // Wait one tick of state so `players` populates with our own entry.
  await new Promise((r) => setTimeout(r, 250));
  const me = room.state.players.get(room.sessionId);
  if (!me) throw new Error('self schema not hydrated after join');
  return { client, room, me };
}

async function expectJoinReject(options, label) {
  try {
    const { room } = await joinAs(options);
    await room.leave();
    fail(`${label}: expected join to be rejected, but it succeeded`);
  } catch (err) {
    // Colyseus surfaces the server-side throw as an Error with the
    // message; we only check that *some* error fired so we don't
    // couple the test to the exact wording.
    console.log(
      `[${label}] join correctly rejected: ${(err && err.message) || err}`,
    );
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function fail(msg) {
  console.error(`[smoke-phase6] FAIL: ${msg}`);
  process.exit(1);
}

const child = spawnServer();
let exited = false;
child.on('exit', (code) => {
  exited = true;
  if (code !== 0 && code !== null) {
    console.error(`[smoke-phase6] server exited early code=${code}`);
  }
});

try {
  await waitForHealth();

  // ---------------------------------------------------------------
  // Step A — custom name accepted verbatim.
  // ---------------------------------------------------------------
  const a = await joinAs({ name: 'Marta' });
  if (a.me.name !== 'Marta') {
    fail(`step A: expected name='Marta', got '${a.me.name}'`);
  }
  console.log(`[step A] custom name accepted: ${a.me.name}`);

  // ---------------------------------------------------------------
  // Step B — missing name rejected.
  // ---------------------------------------------------------------
  await expectJoinReject(undefined, 'step B');

  // ---------------------------------------------------------------
  // Step C — name shorter than MIN_NAME_LENGTH rejected.
  // (Choose a length that's < MIN even after sanitisation.)
  // ---------------------------------------------------------------
  const tooShort = 'a'.repeat(Math.max(1, MIN_NAME_LENGTH - 1));
  await expectJoinReject({ name: tooShort }, 'step C');

  // ---------------------------------------------------------------
  // Step D — dirty but long-enough input gets sanitised + accepted.
  // Input has control chars, a zero-width space, a newline, leading
  // and trailing whitespace, and is well above MAX_NAME_LENGTH.
  // ---------------------------------------------------------------
  const dirty = '  \tBig \u200BNasty\nName Way Too Long For The Tag  ';
  const d = await joinAs({ name: dirty });
  if (d.me.name.length < MIN_NAME_LENGTH || d.me.name.length > MAX_NAME_LENGTH) {
    fail(
      `step D: bad sanitised length (${d.me.name.length}) -> '${d.me.name}'`,
    );
  }
  if (/[\n\r\t\u200B]/.test(d.me.name)) {
    fail(`step D: control chars survived sanitisation -> '${d.me.name}'`);
  }
  if (d.me.name.startsWith(' ') || d.me.name.endsWith(' ')) {
    fail(`step D: whitespace not trimmed -> '${d.me.name}'`);
  }
  console.log(`[step D] sanitised '${dirty.trim()}' -> '${d.me.name}'`);

  // ---------------------------------------------------------------
  // Step E — spawn ring distribution.
  // We need three concurrent clients; recycle A + D and spin up one
  // more to keep the test runtime tight.
  // ---------------------------------------------------------------
  const e3 = await joinAs({ name: 'Third' });
  const positions = [a.me, d.me, e3.me].map((p) => ({ x: p.x, z: p.z }));
  for (const [i, p] of positions.entries()) {
    const r = distance(p, { x: SPAWN_X, z: SPAWN_Z });
    if (r < SPAWN_RING_INNER_M - 1e-6 || r > SPAWN_RING_OUTER_M + 1e-6) {
      fail(
        `step E: spawn[${i}]=(${p.x.toFixed(2)},${p.z.toFixed(2)}) ` +
          `radius=${r.toFixed(2)} outside [${SPAWN_RING_INNER_M},${SPAWN_RING_OUTER_M}]`,
      );
    }
  }
  const allDifferent =
    distance(positions[0], positions[1]) > 0.05 &&
    distance(positions[0], positions[2]) > 0.05 &&
    distance(positions[1], positions[2]) > 0.05;
  if (!allDifferent) {
    fail(`step E: spawn positions duplicated: ${JSON.stringify(positions)}`);
  }
  console.log(
    `[step E] 3 spawns distributed in ring: ` +
      positions.map((p) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' '),
  );

  await a.room.leave();
  await d.room.leave();
  await e3.room.leave();
  await new Promise((r) => setTimeout(r, 200));

  // ---------------------------------------------------------------
  // Step F — reconnect within TTL preserves litresDelivered.
  // ---------------------------------------------------------------
  const reco1 = await joinAs({ name: 'Reco' });
  if (reco1.me.name !== 'Reco') fail('step F: name not set on first join');
  reco1.room.send('claim_delivery', { x: GOAL_0.x, z: GOAL_0.z });
  await new Promise((r) => setTimeout(r, 250));
  if (reco1.me.litresDelivered !== 1) {
    fail(
      `step F: expected litresDelivered=1 after delivery, got ${reco1.me.litresDelivered}`,
    );
  }
  await reco1.room.leave();
  await new Promise((r) => setTimeout(r, 800)); // well inside TTL=30s
  const reco2 = await joinAs({ name: 'Reco' });
  if (reco2.me.litresDelivered !== 1) {
    fail(
      `step F: reconnect lost score; expected litresDelivered=1 got ${reco2.me.litresDelivered}`,
    );
  }
  if (reco2.me.dreamIndex !== 0) {
    fail(
      `step F: reconnect should respawn at dreamIndex=0 (got ${reco2.me.dreamIndex})`,
    );
  }
  console.log(
    `[step F] reconnect preserved litresDelivered=${reco2.me.litresDelivered} (dreamIndex reset to 0)`,
  );
  await reco2.room.leave();

  // ---------------------------------------------------------------
  // Step G — different name does NOT inherit the cached score.
  // ---------------------------------------------------------------
  const stranger = await joinAs({ name: 'Stranger' });
  if (stranger.me.litresDelivered !== 0) {
    fail(
      `step G: stranger inherited score: ${stranger.me.litresDelivered}`,
    );
  }
  console.log(`[step G] different name starts at 0 (no cross-name leak)`);
  await stranger.room.leave();

  console.log('[smoke-phase6] PASS');
  process.exit(0);
} catch (err) {
  console.error('[smoke-phase6] FAIL:', err);
  process.exit(1);
} finally {
  if (!exited) {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
  }
}

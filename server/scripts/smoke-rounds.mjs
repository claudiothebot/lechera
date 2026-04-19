// Phase-4 smoke test: verify the round lifecycle on a server tuned for
// fast iterations (3-second round, 1.5-second scoreboard).
//
// Steps:
//  1. Spawn server with MD_ROUND_MS=3000, MD_SCOREBOARD_MS=1500.
//  2. Connect a client; observe initial phase='playing'.
//  3. Claim one delivery so the player has a non-zero dreamIndex.
//  4. Wait for phase → 'scoreboard'. Assert dreamIndex still preserved.
//  5. Wait for phase → 'playing' (next round). Assert dreamIndex reset to 0.
//  6. Assert roundNumber incremented.
//
// Run from the workspace root:
//   `node server/scripts/smoke-rounds.mjs`
// (the spawned server uses port 2568 to avoid colliding with the dev server)

import { Client, getStateCallbacks } from '@colyseus/sdk';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = 2568;
const ENDPOINT = `ws://localhost:${PORT}`;

// Same as DREAM_GOALS[0] in server/src/game/dreams.ts.
const GOAL_0 = { x: 0, z: -30 };

// Boot a dedicated server so the phase durations don't disrupt a parallel
// dev session on the default 2567.
const server = spawn(
  'npx',
  ['tsx', 'src/index.ts'],
  {
    cwd: 'server',
    env: {
      ...process.env,
      PORT: String(PORT),
      MD_ROUND_MS: '3000',
      MD_SCOREBOARD_MS: '1500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverReady = false;
const serverLog = [];
const onLine = (chunk) => {
  const text = chunk.toString();
  serverLog.push(text);
  if (!serverReady && text.includes('listening on')) serverReady = true;
};
server.stdout.on('data', onLine);
server.stderr.on('data', onLine);

const cleanup = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

const fail = (msg) => {
  console.error(`[smoke-rounds] FAIL: ${msg}`);
  console.error('\n--- server log ---');
  console.error(serverLog.join(''));
  cleanup();
  process.exit(1);
};

// Wait until the dedicated server is ready (or timeout).
const waitForReady = async () => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (serverReady) return;
    await wait(50);
  }
  fail('server did not become ready in 5s');
};
await waitForReady();

const client = new Client(ENDPOINT);
const room = await client.joinOrCreate('milk-dreams');
const $ = getStateCallbacks(room);

const phaseLog = [];
$(room.state).listen(
  'phase',
  (value) => {
    phaseLog.push({
      phase: value,
      roundNumber: room.state.roundNumber,
      at: Date.now(),
    });
  },
  true,
);

const self = await new Promise((resolve) => {
  $(room.state).players.onAdd((p, sid) => {
    if (sid === room.sessionId) resolve(p);
  });
});

console.log(
  `[init] phase=${room.state.phase} round=${room.state.roundNumber} dream=${self.dreamIndex}`,
);
if (room.state.phase !== 'playing') fail(`expected initial phase=playing`);

// Step 3: claim one delivery so we have something to display in scoreboard.
room.send('claim_delivery', { x: GOAL_0.x, z: GOAL_0.z });
await wait(300);
if (self.dreamIndex !== 1) {
  fail(`delivery not registered (dreamIndex=${self.dreamIndex})`);
}
console.log(`[step] delivered -> dream=${self.dreamIndex}`);

const startedRound = room.state.roundNumber;

// Step 4: wait for phase → scoreboard (round was 3s; we already burned ~0.4s).
console.log('[wait] for scoreboard…');
await wait(3200);
if (room.state.phase !== 'scoreboard') {
  fail(`expected scoreboard, got phase=${room.state.phase}`);
}
if (self.dreamIndex !== 1) {
  fail(`scoreboard zeroed dreamIndex prematurely (=${self.dreamIndex})`);
}
console.log(
  `[step] scoreboard phase reached, dream preserved (=${self.dreamIndex})`,
);

// Step 5: wait for phase → playing.
console.log('[wait] for next round…');
await wait(1800);
if (room.state.phase !== 'playing') {
  fail(`expected playing, got phase=${room.state.phase}`);
}
if (self.dreamIndex !== 0) {
  fail(`new round did not reset dreamIndex (=${self.dreamIndex})`);
}
if (room.state.roundNumber <= startedRound) {
  fail(
    `roundNumber did not advance (was ${startedRound}, now ${room.state.roundNumber})`,
  );
}
console.log(
  `[step] new round started: round=${room.state.roundNumber}, dream reset to ${self.dreamIndex}`,
);

await room.leave();
cleanup();
console.log(`[smoke-rounds] PASS (transitions: ${phaseLog.map((e) => e.phase).join(' -> ')})`);
process.exit(0);

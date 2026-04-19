// Phase-3 smoke test: verify server-authoritative delivery.
//
//  1. Spawn two clients A and B.
//  2. A claims at the wrong position → server must reject (no dreamIndex bump).
//  3. A claims at the goal for dreamIndex 0 (= [0, -30]) → server must accept,
//     A's dreamIndex becomes 1, litres becomes 2.
//  4. B's view of A must reflect the same dreamIndex/litres bump (state sync).
//  5. B's own dreamIndex must remain 0 (independent dreams).
//
// Run from the workspace root: `node server/scripts/smoke-delivery.mjs`.
// Requires the dev server to be running on `MP_ENDPOINT` (default 2567).
import { Client, getStateCallbacks } from '@colyseus/sdk';

const endpoint = process.env.MP_ENDPOINT ?? 'ws://localhost:2567';

// Must match `DREAM_GOALS[0]` in server/src/game/dreams.ts.
const GOAL_0 = { x: 0, z: -30 };

async function spawnClient(label) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('milk-dreams');
  const players = new Map(); // sessionId -> player schema view (live)

  const $ = getStateCallbacks(room);
  $(room.state).players.onAdd((player, sessionId) => {
    players.set(sessionId, player);
    console.log(
      `[${label}] +${sessionId} ${player.name} hue=${player.colorHue.toFixed(2)} dream=${player.dreamIndex} litres=${player.litres}`,
    );
  });
  $(room.state).players.onRemove((_player, sessionId) => {
    players.delete(sessionId);
  });

  return { client, room, players, label };
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const a = await spawnClient('A');
await wait(200);
const b = await spawnClient('B');
await wait(400);

const aSelf = a.players.get(a.room.sessionId);
const bSelf = b.players.get(b.room.sessionId);
const aFromB = b.players.get(a.room.sessionId);

if (!aSelf || !bSelf || !aFromB) {
  console.error('[smoke-delivery] FAIL: state not hydrated');
  process.exit(1);
}

console.log(
  `[init] A.dreamIndex=${aSelf.dreamIndex} litres=${aSelf.litres} ; B.dreamIndex=${bSelf.dreamIndex}`,
);

// 1. Reject: claim from far away.
a.room.send('claim_delivery', { x: 50, z: 50 });
await wait(300);
if (aSelf.dreamIndex !== 0) {
  console.error('[smoke-delivery] FAIL: bogus claim was accepted');
  process.exit(1);
}
console.log('[step 1] reject far claim — OK (still dreamIndex=0)');

// 2. Accept: claim exactly at goal.
a.room.send('claim_delivery', { x: GOAL_0.x, z: GOAL_0.z });
await wait(300);
if (aSelf.dreamIndex !== 1) {
  console.error(
    `[smoke-delivery] FAIL: valid claim not accepted (dreamIndex=${aSelf.dreamIndex})`,
  );
  process.exit(1);
}
if (aSelf.litres !== 2) {
  console.error(
    `[smoke-delivery] FAIL: litres did not advance (litres=${aSelf.litres})`,
  );
  process.exit(1);
}
console.log(
  `[step 2] valid claim accepted — A.dreamIndex=${aSelf.dreamIndex} litres=${aSelf.litres}`,
);

// 3. State propagated to B's view.
if (aFromB.dreamIndex !== 1 || aFromB.litres !== 2) {
  console.error(
    `[smoke-delivery] FAIL: B did not see A's bump (B-view of A: dream=${aFromB.dreamIndex} litres=${aFromB.litres})`,
  );
  process.exit(1);
}
console.log("[step 3] B's view of A reflects the bump — OK");

// 4. B remains independent.
if (bSelf.dreamIndex !== 0) {
  console.error(
    `[smoke-delivery] FAIL: B's dreamIndex moved (=${bSelf.dreamIndex})`,
  );
  process.exit(1);
}
console.log('[step 4] B remained on dreamIndex=0 — OK (independent dreams)');

await a.room.leave();
await b.room.leave();
console.log('[smoke-delivery] PASS');
process.exit(0);

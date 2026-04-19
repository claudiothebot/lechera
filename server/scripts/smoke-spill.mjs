// Phase-4.5 smoke test: verify soft-spill semantics.
//
//  1. Spawn one client A.
//  2. A delivers at goal 0 → dreamIndex=1, litres=2, litresDelivered=1
//     (banked the 1 L jar we were carrying BEFORE the bump).
//  3. A delivers at goal 1 → dreamIndex=2, litres=3, litresDelivered=3
//     (1 + 2). This proves accumulation across a clean chain.
//  4. A reports a spill → dreamIndex=0, litres=1, litresDelivered=3.
//     The dream chain rewinds but the running total is preserved.
//  5. A delivers at goal 0 again (back at the small jug) →
//     dreamIndex=1, litres=2, litresDelivered=4 (3 + 1). This is the
//     whole point of soft-spill: the player keeps competing.
//  6. Duplicate spill report at dreamIndex=0 is a no-op (idempotent).
//
// Run from the workspace root with the dev server running on
// `MP_ENDPOINT` (default 2567): `node server/scripts/smoke-spill.mjs`.
import { Client, getStateCallbacks } from '@colyseus/sdk';
import { goalFor } from '@milk-dreams/shared';

const endpoint = process.env.MP_ENDPOINT ?? 'ws://localhost:2567';

const GOAL_0 = goalFor(0);
const GOAL_1 = goalFor(1);

async function spawnClient(label) {
  const client = new Client(endpoint);
  // Names are mandatory (Phase 6) — pass the script label as the
  // display name (always >= 3 chars in this script).
  const room = await client.joinOrCreate('milk-dreams', {
    name: `Spill-${label}`,
  });
  const players = new Map();

  const $ = getStateCallbacks(room);
  $(room.state).players.onAdd((player, sessionId) => {
    players.set(sessionId, player);
    console.log(
      `[${label}] +${sessionId} ${player.name} dream=${player.dreamIndex} litres=${player.litres} delivered=${player.litresDelivered}`,
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

function fail(message) {
  console.error(`[smoke-spill] FAIL: ${message}`);
  process.exit(1);
}

const a = await spawnClient('A');
await wait(400);

const aSelf = a.players.get(a.room.sessionId);
if (!aSelf) fail('state not hydrated');

console.log(
  `[init] A.dreamIndex=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
);
if (aSelf.dreamIndex !== 0 || aSelf.litres !== 1 || aSelf.litresDelivered !== 0) {
  fail(
    `unexpected initial state: dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
  );
}

// Step 2 — first delivery: bank 1 L (the size we were carrying).
a.room.send('claim_delivery', { x: GOAL_0.x, z: GOAL_0.z });
await wait(300);
if (aSelf.dreamIndex !== 1 || aSelf.litres !== 2 || aSelf.litresDelivered !== 1) {
  fail(
    `delivery #1 wrong: dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
  );
}
console.log(
  `[step 2] delivery #1 banked — dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
);

// Step 3 — second delivery: bank 2 L on top.
a.room.send('claim_delivery', { x: GOAL_1.x, z: GOAL_1.z });
await wait(300);
if (aSelf.dreamIndex !== 2 || aSelf.litres !== 3 || aSelf.litresDelivered !== 3) {
  fail(
    `delivery #2 wrong: dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
  );
}
console.log(
  `[step 3] delivery #2 banked — dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
);

// Step 4 — soft-spill: rewind chain, keep total.
a.room.send('report_spill', {});
await wait(300);
if (aSelf.dreamIndex !== 0 || aSelf.litres !== 1 || aSelf.litresDelivered !== 3) {
  fail(
    `spill wrong: dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
  );
}
console.log(
  `[step 4] spill rewound chain, kept total — dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
);

// Step 5 — deliver again from the small jug.
a.room.send('claim_delivery', { x: GOAL_0.x, z: GOAL_0.z });
await wait(300);
if (aSelf.dreamIndex !== 1 || aSelf.litres !== 2 || aSelf.litresDelivered !== 4) {
  fail(
    `post-spill delivery wrong: dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
  );
}
console.log(
  `[step 5] post-spill delivery accumulated — dream=${aSelf.dreamIndex} litres=${aSelf.litres} delivered=${aSelf.litresDelivered}`,
);

// Step 6 — idempotent: send a delivery, then spill twice. Second spill
// must be a no-op (already at dreamIndex 0).
a.room.send('claim_delivery', { x: GOAL_1.x, z: GOAL_1.z }); // dream 1 -> 2
await wait(200);
a.room.send('report_spill', {}); // dream 2 -> 0
await wait(200);
const totalAfterFirstSpill = aSelf.litresDelivered;
a.room.send('report_spill', {}); // already at 0, must be no-op
await wait(200);
if (aSelf.dreamIndex !== 0 || aSelf.litresDelivered !== totalAfterFirstSpill) {
  fail(
    `duplicate spill mutated state: dream=${aSelf.dreamIndex} delivered=${aSelf.litresDelivered}`,
  );
}
console.log(
  `[step 6] duplicate spill is a no-op — delivered stays at ${aSelf.litresDelivered}`,
);

await a.room.leave();
console.log('[smoke-spill] PASS');
process.exit(0);

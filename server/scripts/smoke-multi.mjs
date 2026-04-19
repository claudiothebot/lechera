// Phase-2 smoke test: spawn two clients, verify each one observes the
// OTHER via the 0.17 `getStateCallbacks` API and receives `colorHue`.
// Run from the workspace root: `node server/scripts/smoke-multi.mjs`.
import { Client, getStateCallbacks } from '@colyseus/sdk';

const endpoint = process.env.MP_ENDPOINT ?? 'ws://localhost:2567';

async function spawnClient(label) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('milk-dreams');
  const seen = new Map(); // sessionId -> {name, colorHue}

  const $ = getStateCallbacks(room);
  $(room.state).players.onAdd((player, sessionId) => {
    seen.set(sessionId, { name: player.name, colorHue: player.colorHue });
    console.log(
      `[${label}] sees ${sessionId} -> ${player.name} hue=${player.colorHue.toFixed(2)}`,
    );
  });
  $(room.state).players.onRemove((_player, sessionId) => {
    console.log(`[${label}] lost ${sessionId}`);
    seen.delete(sessionId);
  });

  return { client, room, seen, label };
}

const a = await spawnClient('A');
console.log(`[A] joined as ${a.room.sessionId}`);

// Slight stagger so the second join lands as a separate patch.
await new Promise((r) => setTimeout(r, 250));

const b = await spawnClient('B');
console.log(`[B] joined as ${b.room.sessionId}`);

await new Promise((r) => setTimeout(r, 750));

const aSeesB = a.seen.has(b.room.sessionId);
const bSeesA = b.seen.has(a.room.sessionId);

console.log('---');
console.log(`A sees B? ${aSeesB ? 'YES' : 'no'}`);
console.log(`B sees A? ${bSeesA ? 'YES' : 'no'}`);
console.log(`A's view of B has hue: ${a.seen.get(b.room.sessionId)?.colorHue}`);
console.log(`B's view of A has hue: ${b.seen.get(a.room.sessionId)?.colorHue}`);

await a.room.leave();
await b.room.leave();

if (aSeesB && bSeesA) {
  console.log('[smoke-multi] PASS');
  process.exit(0);
} else {
  console.error('[smoke-multi] FAIL: clients did not observe each other');
  process.exit(1);
}

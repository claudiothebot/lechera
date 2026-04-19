// Quick smoke test: connect once, send one pose, log assigned name, leave.
// Run from the workspace root: `node server/scripts/smoke-client.mjs`.
import { Client } from '@colyseus/sdk';

const endpoint = process.env.MP_ENDPOINT ?? 'ws://localhost:2567';
const client = new Client(endpoint);

try {
  const room = await client.joinOrCreate('milk-dreams');
  console.log(`[smoke] joined room ${room.roomId} as session ${room.sessionId}`);

  await new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    room.onStateChange((state) => {
      const me = state.players?.get(room.sessionId);
      if (me?.name) {
        console.log(`[smoke] server assigned name: ${me.name}`);
        room.send('pose', { x: 1.5, z: -2.5, yaw: 0.7 });
        // Give the broadcast a moment to flush, then bail.
        setTimeout(finish, 250);
      }
    });
    setTimeout(() => {
      console.warn('[smoke] timed out waiting for state');
      finish();
    }, 3000);
  });

  await room.leave();
  console.log('[smoke] left cleanly');
  process.exit(0);
} catch (err) {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
}

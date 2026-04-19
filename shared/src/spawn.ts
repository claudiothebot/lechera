import type { Goal2D } from './dreams.js';

/**
 * Spawn point + ring distribution shared between client and server.
 *
 * The client renders a cosmetic marker at the same XZ coordinates
 * (see `client/game/level.ts:spawn`). When the room places a new
 * (or reconnecting) player the server picks a random offset inside a
 * disc around this point so 10 lecheras at the same instant don't
 * materialise on a single pixel. The client teleports to the
 * server-authoritative pose on first hydration.
 *
 * Ring sized to match the painted marker (outer radius 3.0 m on the
 * ground) with a small margin so the avatar's body never visibly
 * clips the edge. With 10 players × π·PLAYER_RADIUS² ≈ 6.4 m² of
 * total footprint inside an annulus of area π·(2.6² − 0.5²) ≈ 20.4
 * m², density is ~31 % — tight but never an actual pile-up. Two
 * players landing within 2 × PLAYER_RADIUS of each other is fine:
 * Phase 6d player-player collision pushes them apart on the next
 * frame.
 *
 * Sizing history (kept here as documentation):
 *   - `[1.0, 3.0]` first iteration. Looked broken because the
 *     visible marker was only 1.5 m radius — lecheras spawned
 *     outside the painted circle.
 *   - `[0.3, 1.2]` to fit inside the original 1.5 m marker.
 *     Mathematically too cramped for ~10 players (~6.4 m² of
 *     footprint inside ~4.2 m² of ring → guaranteed overlap, ugly
 *     spawn-time bumping).
 *   - `[0.5, 2.6]` paired with a 3.0 m visible marker — area budget
 *     is finally proportional to the player count.
 */
export const SPAWN_X = 0;
export const SPAWN_Z = 20;
export const SPAWN_RING_INNER_M = 0.5;
export const SPAWN_RING_OUTER_M = 2.6;

/**
 * Pick a uniformly random point inside the spawn annulus. Sampling
 * the radius via `sqrt(u)` over [inner², outer²] keeps the
 * distribution area-uniform, which avoids a visible bias toward the
 * inner edge that the naive `lerp(inner, outer, u)` would produce.
 */
export function spawnPositionInRing(): Goal2D {
  const angle = Math.random() * Math.PI * 2;
  const r2Min = SPAWN_RING_INNER_M * SPAWN_RING_INNER_M;
  const r2Max = SPAWN_RING_OUTER_M * SPAWN_RING_OUTER_M;
  const r = Math.sqrt(r2Min + Math.random() * (r2Max - r2Min));
  return {
    x: SPAWN_X + Math.cos(angle) * r,
    z: SPAWN_Z + Math.sin(angle) * r,
  };
}

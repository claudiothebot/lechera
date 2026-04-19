/**
 * Dreams catalog (positions + radii) shared between client and server.
 *
 * The client owns the AESTHETIC progression on top of these positions
 * (dream names, reward animals, jug scale, balance multipliers — see
 * `client/game/progression.ts`). The server only cares about the spatial
 * + numeric facts: where each goal is, how close you must be to claim
 * it, and how many litres you carry at each step. Putting those facts
 * here makes both sides import from a SINGLE source so reordering or
 * adding a goal can never silently desync server-side validation from
 * client-side rendering.
 *
 * Endless mode wraps via `index % length` — the server validates the
 * cycled position correctly because both sides resolve `goalFor` from
 * this list.
 */

/**
 * 2D world point. Y is implicit (always ground level) for goals,
 * spawn, and any other "position on the meadow".
 */
export interface Goal2D {
  readonly x: number;
  readonly z: number;
}

/**
 * Goal positions on the XZ plane, used in order. Endless mode wraps
 * via `index % length`. Reordering this array is a BREAKING change
 * because per-index visuals on the client (animal at the goal, dream
 * name) are aligned by index — see `NAMED_DREAMS` and `DREAM_ANIMALS`
 * in `client/game/progression.ts`.
 */
export const DREAM_GOALS: ReadonlyArray<Goal2D> = [
  { x: 0, z: -30 },
  { x: 28, z: -8 },
  { x: 20, z: 22 },
  { x: -24, z: 12 },
  { x: -22, z: -22 },
  { x: 10, z: 30 },
  { x: -32, z: -2 },
];

/**
 * Acceptance radius for a delivery, in metres. The client uses this
 * to decide when to fire the in-radius branch; the server uses it
 * (plus `DELIVERY_TOLERANCE`) to validate `claim_delivery` events.
 */
export const GOAL_RADIUS = 2.5;

/**
 * Slack the server adds on top of `GOAL_RADIUS` when validating a
 * delivery claim, in metres. Absorbs the ~100 ms render-behind
 * interpolation + the 50 ms patch interval — the client may
 * legitimately think it's inside the radius a frame before the
 * server schema would agree.
 */
export const DELIVERY_TOLERANCE = 0.75;

/**
 * Resolve the goal position for a given 0-based dream index. Wraps
 * for endless mode. Idempotent and pure — safe to call inside hot
 * paths (e.g. per-frame distance check on the client, per-message
 * validation on the server).
 */
export function goalFor(index: number): Goal2D {
  return DREAM_GOALS[index % DREAM_GOALS.length]!;
}

/**
 * Litres carried for a given dream index. Mirrors the client's
 * "litres = index + 1" semantics: at index 0 you're carrying 1 jar,
 * at index 1 (after the first delivery) you're carrying 2 jars, etc.
 * The HUD reads this verbatim, so an off-by-one here would be visible.
 */
export function litresFor(index: number): number {
  return index + 1;
}

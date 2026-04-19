/**
 * Server-side mirror of the client's `progression.ts` static data.
 *
 * Right now this duplicates the names + goal positions arrays from the
 * client (see `lechera/src/game/progression.ts`). It MUST stay in sync
 * with the client copy: clients derive every visual (animal at goal,
 * dream label, jug scale, balance multipliers) from `dreamIndex` alone,
 * and the server only validates positions against `goalFor(index)`.
 *
 * When we promote a `shared/` workspace package (probably alongside
 * Phase 5 — the leaderboard adds enough shared types to justify it),
 * this module disappears in favour of `import { goalFor } from
 * '@milk-dreams/shared'`.
 */

/**
 * Goal positions on the XZ plane, used in order. Endless mode wraps via
 * `index % length`. Values match `DREAM_GOALS` in the client.
 */
export const DREAM_GOALS: ReadonlyArray<readonly [number, number]> = [
  [0, -30],
  [28, -8],
  [20, 22],
  [-24, 12],
  [-22, -22],
  [10, 30],
  [-32, -2],
];

/**
 * Acceptance radius for a delivery, in metres. Matches the client's
 * `PROGRESSION_GOAL_RADIUS`. Server adds a small tolerance on top
 * (`DELIVERY_TOLERANCE`) to absorb the ~100 ms render-behind interpolation
 * + the 50 ms patch interval — the client may legitimately think it's
 * inside the radius a frame before the server schema would agree.
 */
export const GOAL_RADIUS = 2.5;
export const DELIVERY_TOLERANCE = 0.75;

export function goalFor(index: number): { x: number; z: number } {
  const xz = DREAM_GOALS[index % DREAM_GOALS.length]!;
  return { x: xz[0], z: xz[1] };
}

/**
 * Litres carried for a given dream index. Mirrors the client's
 * `litres = index + 1` semantics: at index 0 you're carrying 1 jar,
 * at index 1 (after the first delivery) you're carrying 2 jars, etc.
 * The HUD reads this verbatim, so an off-by-one here would be visible.
 */
export function litresFor(index: number): number {
  return index + 1;
}

import * as THREE from 'three';
import { DREAM_GOALS, GOAL_RADIUS } from '@milk-dreams/shared';
import type { AnimalKey } from './levelAnimals';

/**
 * Progression = the chain of dreams that escalates from the classic
 * fable (eggs → cow) into modern aspirations (Ferrari, mansion). Every
 * successful delivery raises the litre count, moves the goal elsewhere
 * on the map and makes the jug harder (bigger, heavier, tips sooner).
 *
 * After the named dreams we enter an endless mode whose curve keeps
 * applying the same formulas, capped at safe maxima. A 3-minute timer
 * (owned by main.ts) eventually kills every run anyway.
 */

/**
 * Ordering of the milkmaid's daydream. Starts with the classic folk-tale
 * chain (eggs → cow) and keeps escalating into modern aspirations
 * (Ferrari, mansion) — each delivery is a bigger dream and a harder run.
 */
const NAMED_DREAMS: readonly string[] = [
  'Eggs',
  'Hens',
  'Pig',
  'Calf',
  'Cow',
  'Ferrari',
  'Mansion',
];

/**
 * Reward shown on the goal spot for each dream, aligned with
 * NAMED_DREAMS. In endless mode we cycle through this list, so the
 * player sees every reward repeat rather than a single "final" one.
 */
const DREAM_ANIMALS: readonly AnimalKey[] = [
  'eggs',
  'chicken',
  'pig',
  'calf',
  'cow',
  'ferrari',
  'mansion',
];

export interface DreamConfig {
  /** 0-based delivery index. 0 = before first delivery. */
  readonly index: number;
  /** Human-readable name of the dream we're currently carrying milk for. */
  readonly dreamName: string;
  /** Litres of milk currently on the character's head. */
  readonly litres: number;
  /** True once we've gone past the 5 named dreams. */
  readonly isEndless: boolean;
  /** World position of the current goal. */
  readonly goal: THREE.Vector3;
  /** Uniform scale applied to the jug visual. */
  readonly jugScale: number;
  /** Stability multiplier (lower = wobblier / "heavier" jug). */
  readonly stabilityScale: number;
  /** Inertia multiplier for `jugBalance` (higher = swings more on accel). */
  readonly inertiaScale: number;
  /** Damping multiplier for `jugBalance` (lower = harder to settle). */
  readonly dampingScale: number;
  /** Spill threshold multiplier (lower = tips sooner). */
  readonly spillThresholdScale: number;
  /** Player-correction multiplier (lower = arrow keys fix less). */
  readonly correctionScale: number;
  /** Key of the reward animal to display on the goal spot. */
  readonly animalKey: AnimalKey;
}

export interface Progression {
  readonly current: DreamConfig;
  /** Advance after a successful delivery and return the new current dream. */
  advance(): DreamConfig;
  /**
   * Force-set the current dream index, bypassing local advance. Used in
   * multiplayer mode where the server is the source of truth: every
   * accepted delivery arrives as a schema patch, the client just calls
   * `setIndex(serverIndex)` and re-applies the dream visuals.
   *
   * Idempotent: calling with the same `index` is a no-op (returns the
   * current dream without rebuilding it).
   */
  setIndex(index: number): DreamConfig;
  reset(): void;
}

export function createProgression(): Progression {
  let index = 0;
  let current = makeDream(index);

  return {
    get current() {
      return current;
    },
    advance() {
      index += 1;
      current = makeDream(index);
      return current;
    },
    setIndex(next: number) {
      const safe = Math.max(0, Math.floor(next));
      if (safe === index) return current;
      index = safe;
      current = makeDream(index);
      return current;
    },
    reset() {
      index = 0;
      current = makeDream(index);
    },
  };
}

/**
 * Build the config for a given 0-based delivery index.
 *
 * Tuning choices (all multipliers of 1.0 at n=0):
 *  - jug scale   +12 %/n, cap 2.2× (visual only, never crushes the Lechera)
 *  - stability   −18 %/n, floor 0.25× — main "feel" lever: a low-stability
 *                jug keeps swaying even without player motion and makes
 *                every correction lag behind
 *  - inertia     +50 %/n, cap 4.0×  — every WASD input shoves the jug
 *                much further in late dreams; combined with the higher
 *                base `INERTIA_GAIN`, this reads as "the jug has its
 *                own momentum and I'm just a host"
 *  - damping     −15 %/n, floor 0.30× — oscillations barely decay in
 *                late dreams; the jug keeps sloshing after every move
 *  - spill       −10 %/n, floor 0.45× — less tolerance before tipping
 *  - correction  −20 %/n, floor 0.15× — arrow keys fix less at higher
 *                levels, so the player has to ANTICIPATE sway rather
 *                than react to it. This is what actually makes the
 *                endgame require skill instead of button-mashing.
 *
 * The curve is deliberately steep:
 *   Eggs (n=0):   baseline — noticeable sway but easy to correct
 *   Hens (n=1):   ~50 % more inertia, 20 % less correction
 *   Pig (n=2):    inertia 2×, correction down to 60 %
 *   Calf (n=3):   jug feels loose, every turn is a liability
 *   Cow (n=4):    another game entirely — you plan the route first
 *   Endless (n≥5):  floors kick in, but n=5 is already near-bottom on
 *                   most scales, so endless stays brutal without
 *                   becoming "impossible with extra steps"
 */

/**
 * Uniform jug visual scale for a 0-based dream index. Matches
 * `DreamConfig.jugScale` / `player.jugAnchor` in single-player and
 * multiplayer remotes.
 */
export function jugScaleForDreamIndex(index: number): number {
  const n = Math.max(0, index);
  return Math.min(1.0 + 0.12 * n, 2.2);
}

function makeDream(index: number): DreamConfig {
  const isEndless = index >= NAMED_DREAMS.length;
  const cyclicIdx = index % NAMED_DREAMS.length;
  const name = NAMED_DREAMS[cyclicIdx]!;
  // Named progression cycles eggs→mansion; endless runs show a money bag
  // at the goal while dream names still rotate for the subtitle.
  const animalKey = isEndless ? 'moneybag' : DREAM_ANIMALS[cyclicIdx]!;

  const goalXZ = DREAM_GOALS[index % DREAM_GOALS.length]!;
  const goal = new THREE.Vector3(goalXZ.x, 0, goalXZ.z);

  const n = index;
  const jugScale = jugScaleForDreamIndex(n);
  const stabilityScale = Math.max(1.0 - 0.18 * n, 0.25);
  const inertiaScale = Math.min(1.0 + 0.5 * n, 4.0);
  const dampingScale = Math.max(1.0 - 0.15 * n, 0.3);
  const spillThresholdScale = Math.max(1.0 - 0.1 * n, 0.45);
  const correctionScale = Math.max(1.0 - 0.2 * n, 0.15);

  return {
    index,
    dreamName: isEndless ? `Endless · ${name}` : name,
    litres: index + 1,
    isEndless,
    goal,
    jugScale,
    stabilityScale,
    inertiaScale,
    dampingScale,
    spillThresholdScale,
    correctionScale,
    animalKey,
  };
}

/**
 * Re-exported from `@milk-dreams/shared` so callers can keep
 * importing it from the progression module (its historical home)
 * without reaching for the shared package directly.
 */
export const PROGRESSION_GOAL_RADIUS = GOAL_RADIUS;

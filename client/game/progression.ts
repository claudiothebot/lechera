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
 * applying the same formulas, capped at safe maxima. The HUD names that
 * phase as chasing cash (goal prop is always the money bag). A 3-minute
 * timer (owned by main.ts) eventually kills every run anyway.
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
  /**
   * 0 = easy baseline, 1 = hardest tuned feel. `jugBalance.setConfig`
   * derives stability / inertia / damping / spill / correction from this
   * single number — edit `DREAM_DIFFICULTY_PEAK_INDEX` below to change how
   * fast the game ramps up, and the lerps inside `jugBalance.ts` to change
   * how the hardest state actually feels.
   */
  readonly difficulty: number;
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
 * Dream index at which `difficulty` reaches 1.0 (the hardest tuned feel).
 * Anything past this index stays clamped at 1.0. Lower values = steeper
 * ramp; higher values = gentler ramp. The actual physics of easy vs hard
 * live in `client/game/jugBalance.ts` (`scalesForDifficulty`).
 */
const DREAM_DIFFICULTY_PEAK_INDEX = 4;

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
  // at the goal with a cash label (index % NAMED is only for difficulty curve).
  const animalKey = isEndless ? 'moneybag' : DREAM_ANIMALS[cyclicIdx]!;

  const goalXZ = DREAM_GOALS[index % DREAM_GOALS.length]!;
  const goal = new THREE.Vector3(goalXZ.x, 0, goalXZ.z);

  const n = index;
  const jugScale = jugScaleForDreamIndex(n);
  const difficulty = Math.min(1, n / DREAM_DIFFICULTY_PEAK_INDEX);

  return {
    index,
    // Past the named chain we're chasing the money bag — surfacing the
    // cycled animal name (e.g. "Endless · Eggs") on top of a money-bag
    // goal was confusing, so endless runs read simply as "Endless".
    dreamName: isEndless ? 'Endless' : name,
    litres: index + 1,
    isEndless,
    goal,
    jugScale,
    difficulty,
    animalKey,
  };
}

/** Emoji for the reward just obtained at this dream index (toast / HUD flair). */
export function rewardEmojiForDreamIndex(index: number): string {
  const safe = Math.max(0, Math.floor(index));
  const isEndless = safe >= NAMED_DREAMS.length;
  const cyclicIdx = safe % NAMED_DREAMS.length;
  const key: AnimalKey = isEndless ? 'moneybag' : DREAM_ANIMALS[cyclicIdx]!;
  const map: Record<AnimalKey, string> = {
    eggs: '🥚',
    chicken: '🐔',
    pig: '🐷',
    calf: '🐮',
    cow: '🐄',
    ferrari: '🏎️',
    mansion: '🏰',
    moneybag: '💰',
  };
  return map[key];
}

/**
 * Re-exported from `@milk-dreams/shared` so callers can keep
 * importing it from the progression module (its historical home)
 * without reaching for the shared package directly.
 */
export const PROGRESSION_GOAL_RADIUS = GOAL_RADIUS;

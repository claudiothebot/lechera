/**
 * Jug balance: 2D tilt model expressed in camera-relative frame.
 *
 * Tilt state is two angles from vertical:
 *  - tiltForward: positive = jug leans in the camera's forward direction.
 *  - tiltRight: positive = jug leans to the camera's right.
 *
 * The caller is responsible for projecting world-space motion and bump
 * directions onto the camera frame before passing them in. This way the
 * player feels the jug tilt in their view space, not in the character's
 * local space, which would flip when the character turns.
 *
 * Dynamics: stable damped pendulum + movement inertia + bumps + input.
 */

// -----------------------------------------------------------------------
// Feel constants (edit here to change the overall game feel).
// -----------------------------------------------------------------------

/** Restoring torque per radian of tilt (rad/s²). */
const STABILITY = 4.0;
/** Angular damping coefficient (higher = settles faster). */
const ANGULAR_DAMPING = 1.5;
/** How strongly character acceleration pushes the jug (rad per m/s²). */
const INERTIA_GAIN = 0.16;
/** How strongly a bump kicks the jug (rad per m/s of impulse). */
const BUMP_GAIN = 0.28;
/** Arrow-key corrective torque while held (rad/s²). */
const PLAYER_CORRECTION = 4.5;

/**
 * Hard cap on combined tilt magnitude (forward+right in rad) before spill.
 * `normalizedTilt` divides by this, so the HUD bar scales with the
 * configured spill limit.
 */
export const MAX_TILT = (70 * Math.PI) / 180;

// -----------------------------------------------------------------------
// Difficulty curve.
//
// A single `difficulty ∈ [0, 1]` controls how wobbly the jug feels. At 0
// the jug is the easy baseline; at 1 it is the late-game "another game
// entirely" state. Everything else (inertia, damping, correction, spill)
// is derived from this one number via the lerps below — edit the two
// endpoint values of each lerp to change the overall feel of the game.
// -----------------------------------------------------------------------

interface InternalScales {
  /** Restoring force multiplier (<1 = wobblier / "heavier"). */
  readonly stability: number;
  /** Inertia multiplier (higher = swings more on accel). */
  readonly inertia: number;
  /** Damping multiplier (<1 = oscillations last longer). */
  readonly damping: number;
  /** MAX_TILT multiplier (<1 = spills sooner). */
  readonly spill: number;
  /** Player-correction multiplier (<1 = arrows fix less). */
  readonly correction: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function scalesForDifficulty(difficulty: number): InternalScales {
  const d = Math.min(1, Math.max(0, difficulty));
  return {
    // Easy →  Hard
    stability: lerp(1.0, 0.6, d),
    inertia: lerp(1.0, 2.2, d),
    damping: lerp(1.0, 0.55, d),
    spill: lerp(1.0, 0.7, d),
    correction: lerp(1.0, 0.55, d),
  };
}

// -----------------------------------------------------------------------

export interface BumpInput {
  /** Bump component along camera forward (positive = pushed forward). */
  forward: number;
  /** Bump component along camera right (positive = pushed right). */
  right: number;
}

export interface JugBalanceInput {
  /**
   * Total horizontal acceleration felt by the jug in camera frame (m/s²).
   * The caller is expected to include BOTH the character's linear accel
   * AND a yaw-inertia contribution (turning the head tugs the jug
   * sideways); here we don't distinguish them because they both multiply
   * `inertiaScale` identically.
   */
  camAccelForward: number;
  camAccelRight: number;
  /** Bumps this frame, already decomposed in camera frame. */
  bumps: readonly BumpInput[];
  /** Player input, camera-relative. +1 forward = UP arrow. */
  inputForward: number;
  inputRight: number;
}

/**
 * Runtime config. A single `difficulty` knob scales all the physics
 * levers together via `scalesForDifficulty` (see above). Pass 0 for the
 * easy baseline, 1 for the hardest tuned state. Anything outside [0, 1]
 * is clamped.
 */
export interface JugBalanceConfig {
  /** 0 = easy baseline, 1 = late-game. Default 0. */
  difficulty?: number;
  /**
   * When true, tilt is clamped at the spill threshold instead of failing.
   * For playtesting levels without game-over on spill.
   */
  invincible?: boolean;
}

export interface JugBalance {
  readonly tiltForward: number;
  readonly tiltRight: number;
  readonly tiltMagnitude: number;
  readonly normalizedTilt: number;
  readonly isSpilled: boolean;
  /** Currently-effective MAX_TILT (after difficulty scaling). */
  readonly maxTilt: number;
  update(dt: number, input: JugBalanceInput): void;
  reset(): void;
  setConfig(config: JugBalanceConfig): void;
}

export function createJugBalance(initial: JugBalanceConfig = {}): JugBalance {
  let tiltForward = 0;
  let tiltRight = 0;
  let velForward = 0;
  let velRight = 0;
  let spilled = false;

  let scales = scalesForDifficulty(initial.difficulty ?? 0);
  let invincible = initial.invincible ?? false;

  function effectiveMaxTilt() {
    return MAX_TILT * scales.spill;
  }

  return {
    get tiltForward() {
      return tiltForward;
    },
    get tiltRight() {
      return tiltRight;
    },
    get tiltMagnitude() {
      return Math.hypot(tiltForward, tiltRight);
    },
    get normalizedTilt() {
      return Math.min(1, Math.hypot(tiltForward, tiltRight) / effectiveMaxTilt());
    },
    get isSpilled() {
      return spilled;
    },
    get maxTilt() {
      return effectiveMaxTilt();
    },
    update(dt, inp) {
      if (spilled) return;

      const stability = STABILITY * scales.stability;
      const restoreF = -stability * tiltForward;
      const restoreR = -stability * tiltRight;

      const inertiaF = -inp.camAccelForward * INERTIA_GAIN * scales.inertia;
      const inertiaR = -inp.camAccelRight * INERTIA_GAIN * scales.inertia;

      const correctF = inp.inputForward * PLAYER_CORRECTION * scales.correction;
      const correctR = inp.inputRight * PLAYER_CORRECTION * scales.correction;

      velForward += (restoreF + inertiaF + correctF) * dt;
      velRight += (restoreR + inertiaR + correctR) * dt;

      // Exponential damping of angular velocity.
      const damping = Math.exp(-ANGULAR_DAMPING * scales.damping * dt);
      velForward *= damping;
      velRight *= damping;

      // Bumps: injected angular impulses per-axis. Bumps scale with
      // inertia too — a heavier jug takes a harder slap from the same hit.
      for (const b of inp.bumps) {
        velForward += b.forward * BUMP_GAIN * scales.inertia;
        velRight += b.right * BUMP_GAIN * scales.inertia;
      }

      tiltForward += velForward * dt;
      tiltRight += velRight * dt;

      const mag = Math.hypot(tiltForward, tiltRight);
      const maxT = effectiveMaxTilt();
      if (invincible) {
        if (mag > maxT) {
          const s = maxT / mag;
          tiltForward *= s;
          tiltRight *= s;
          velForward *= s;
          velRight *= s;
        }
      } else if (mag >= maxT) {
        spilled = true;
      }
    },
    reset() {
      tiltForward = 0;
      tiltRight = 0;
      velForward = 0;
      velRight = 0;
      spilled = false;
    },
    setConfig(config) {
      if (config.difficulty !== undefined) {
        scales = scalesForDifficulty(config.difficulty);
      }
      if (config.invincible !== undefined) invincible = config.invincible;
    },
  };
}

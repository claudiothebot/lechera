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

/**
 * Restoring force ("gravity pulling the jug back upright"). Lowered from
 * the initial 6.0 because a strong restoring force makes even large
 * tilts snap back in ~0.5s, which reads as "the jug is glued to the
 * head". With 4.0 the natural frequency drops to ~2 rad/s (3s period),
 * so tilts linger long enough for the player to feel them.
 */
const STABILITY = 4.0;
/**
 * Angular damping. Lower = oscillations last longer after a kick. At the
 * old value (2.5) a single sway decayed in <1s. At 1.5 the jug keeps
 * rocking for 2-3s, turning "walk + stop" into something you have to
 * actually manage.
 */
const ANGULAR_DAMPING = 1.5;
/**
 * How strongly the character's horizontal acceleration tilts the jug.
 * Tuning history:
 *   0.012 → glued to the head, movement invisible.
 *   0.028 → barely noticeable tilt, easy to correct.
 *   0.070 → visible but damped out in a second.
 *   0.160 → current: sprinting at dream 1 kicks the jug ~25° and it
 *           takes 2-3s to settle. In late dreams (inertiaScale up to
 *           4×) any careless motion spills.
 * This is the single biggest "feel" lever — bump only if the previous
 * values still felt understated.
 */
const INERTIA_GAIN = 0.16;
const BUMP_GAIN = 0.28;
/**
 * Player's arrow-key corrective torque (base magnitude). Progressively
 * lowered: 9.0 → 6.5 → 4.5. Even at dream 1 the player has to start
 * counter-swaying ahead of their own movement; they can't just press
 * an arrow at the last second and zero it out. Scaled further per dream
 * via `correctionScale`.
 */
const PLAYER_CORRECTION = 4.5;

/**
 * Hard cap on combined tilt magnitude (forward+right in rad) before spill.
 * Was 55° — bumped to ~70° so the jug has to lean visibly farther before
 * failing; `normalizedTilt` divides by this, so the HUD bar also reads
 * "roomier" for the same sway.
 */
export const MAX_TILT = (70 * Math.PI) / 180;

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
 * Per-level difficulty multipliers. All default to 1.0 and can be updated
 * at runtime via `setConfig` when the progression advances.
 *
 * Tuning notes:
 *  - `stabilityScale` is the strongest perceived lever: it scales the
 *    restoring force that pulls the jug upright, so lowering it makes the
 *    jug feel heavier and "wobbly" even without the player moving.
 *  - `inertiaScale` on its own is drowned out by PLAYER_CORRECTION, so it
 *    needs to combine with reduced stability to actually bite.
 *  - `dampingScale` controls how quickly angular velocity decays; lowering
 *    it keeps oscillations alive longer after a bump.
 */
export interface JugBalanceConfig {
  /** Scales the restoring force toward vertical (<1 = wobblier / heavier). */
  stabilityScale?: number;
  /** Scales inertia pushback from movement acceleration. */
  inertiaScale?: number;
  /** Scales angular damping (<1 means the jug takes longer to settle). */
  dampingScale?: number;
  /** Scales MAX_TILT (<1 means the jug spills sooner). */
  spillThresholdScale?: number;
  /**
   * Scales the player's corrective torque from the arrow keys (<1 means
   * the jug resists being yanked upright, so the player has to anticipate
   * the sway instead of reacting to it). Paired with rising `inertiaScale`
   * this is what makes late-game runs feel like carrying a loose jar.
   */
  correctionScale?: number;
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
  /** Currently-effective MAX_TILT (after config scaling). */
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

  let stabilityScale = initial.stabilityScale ?? 1;
  let inertiaScale = initial.inertiaScale ?? 1;
  let dampingScale = initial.dampingScale ?? 1;
  let spillThresholdScale = initial.spillThresholdScale ?? 1;
  let correctionScale = initial.correctionScale ?? 1;
  let invincible = initial.invincible ?? false;

  function effectiveMaxTilt() {
    return MAX_TILT * spillThresholdScale;
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

      // Restoring force pulls tilt back toward vertical. Scaling this is
      // the single most noticeable difficulty knob: a jug with 60 % of the
      // base stability feels visibly "heavier" and keeps swaying even while
      // the player stands still.
      const stability = STABILITY * stabilityScale;
      const restoreF = -stability * tiltForward;
      const restoreR = -stability * tiltRight;

      // Movement inertia: acceleration pushes the jug opposite to motion.
      const inertiaF = -inp.camAccelForward * INERTIA_GAIN * inertiaScale;
      const inertiaR = -inp.camAccelRight * INERTIA_GAIN * inertiaScale;

      // Player corrective torque from arrow keys. Scaled per-level so the
      // player's ability to snap the jug back shrinks as progression
      // advances (late-game runs reward anticipation, not reaction).
      const correctF = inp.inputForward * PLAYER_CORRECTION * correctionScale;
      const correctR = inp.inputRight * PLAYER_CORRECTION * correctionScale;

      velForward += (restoreF + inertiaF + correctF) * dt;
      velRight += (restoreR + inertiaR + correctR) * dt;

      // Exponential damping of angular velocity.
      const damping = Math.exp(-ANGULAR_DAMPING * dampingScale * dt);
      velForward *= damping;
      velRight *= damping;

      // Bumps: injected angular impulses per-axis. Bumps scale with inertia
      // too: a heavier jug takes a harder slap from the same bump.
      for (const b of inp.bumps) {
        velForward += b.forward * BUMP_GAIN * inertiaScale;
        velRight += b.right * BUMP_GAIN * inertiaScale;
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
      if (config.stabilityScale !== undefined)
        stabilityScale = config.stabilityScale;
      if (config.inertiaScale !== undefined) inertiaScale = config.inertiaScale;
      if (config.dampingScale !== undefined) dampingScale = config.dampingScale;
      if (config.spillThresholdScale !== undefined)
        spillThresholdScale = config.spillThresholdScale;
      if (config.correctionScale !== undefined)
        correctionScale = config.correctionScale;
      if (config.invincible !== undefined) invincible = config.invincible;
    },
  };
}

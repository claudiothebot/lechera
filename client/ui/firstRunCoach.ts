/**
 * First-run “live” coaching for desktop: short tips that advance when the
 * player actually moves, uses balance input, then sees a short goal HUD
 * hint. UI-only — gameplay does not read this module. Completion is
 * in-memory only (refresh starts the coach over).
 */
const MOVE_SPEED_THRESHOLD = 0.2;
/**
 * After move + balance, the player has often walked toward the goal; if we
 * end step 3 as soon as they’re “kind of close”, the strip never paints.
 * We only auto-dismiss on distance once step 3 has been visible for
 * `STEP3_MIN_SHOW_SEC`, and only when they’re *near* a delivery (not mid-field).
 */
const STEP3_MIN_SHOW_SEC = 2.8;
/** Metres to goal — must be within this to end step 3 early (after min show). */
const GOAL_DIST_END_COACH_M = 14;
const STEP3_MAX_ACTIVE_SEC = 11;

const lines = {
  move: 'W / S walk · A / D turn — try it now',
  balance: 'Use the arrow keys to keep the milk from spilling',
  goalWithMinimap: 'Follow your dream on the radar',
  goalNoMinimap: 'Follow the glowing marker toward your dream',
} as const;

export type FirstRunCoachVisual =
  | 'move'
  | 'arrows'
  | 'dreamhud'
  /** Minimap off — only the dream preview appears top-right. */
  | 'dreamonly'
  | 'none';

export interface FirstRunCoachView {
  text: string | null;
  visual: FirstRunCoachVisual;
}

export interface FirstRunCoachContext {
  /** Uncapped frame delta; used for the step-3 active-time timer. */
  dt: number;
  isDesktop: boolean;
  /**
   * When true, tips are hidden and timers do not advance (instructions /
   * story / scoreboard / name modal, etc.).
   */
  blocked: boolean;
  hasMinimap: boolean;
  /** False when `?coach=0` disables the feature. */
  active: boolean;
  playerSpeed: number;
  /** Sum of |tiltForward| + |tiltRight| from input axes. */
  balanceInput: number;
  distanceToGoal: number;
  litresDelivered: number;
}

const state = {
  move: false,
  balance: false,
  inStep3: false,
  step3ActiveSec: 0,
};

let finished = false;

/**
 * Call once at boot from `main` after query params are known.
 */
export function initFirstRunCoach(options: { disabled: boolean }): void {
  if (options.disabled) {
    finished = true;
    return;
  }
  finished = false;
  state.move = false;
  state.balance = false;
  state.inStep3 = false;
  state.step3ActiveSec = 0;
}

function complete(): void {
  finished = true;
  state.inStep3 = false;
  state.step3ActiveSec = 0;
}

const hidden: FirstRunCoachView = { text: null, visual: 'none' };

/**
 * @returns What to show in the bottom coach strip; `text: null` hides it.
 */
export function updateFirstRunCoach(ctx: FirstRunCoachContext): FirstRunCoachView {
  if (!ctx.active) return hidden;
  if (!ctx.isDesktop) return hidden;
  if (finished) return hidden;

  if (ctx.playerSpeed > MOVE_SPEED_THRESHOLD) state.move = true;
  if (ctx.balanceInput > 0.02) state.balance = true;

  if (!state.move) {
    if (!ctx.blocked) {
      return { text: lines.move, visual: 'move' };
    }
    return hidden;
  }
  if (!state.balance) {
    if (!ctx.blocked) {
      return { text: lines.balance, visual: 'arrows' };
    }
    return hidden;
  }

  if (!state.inStep3) {
    state.inStep3 = true;
    state.step3ActiveSec = 0;
  }

  if (ctx.blocked) {
    return hidden;
  }

  state.step3ActiveSec += ctx.dt;

  if (
    state.step3ActiveSec >= STEP3_MIN_SHOW_SEC &&
    ctx.distanceToGoal < GOAL_DIST_END_COACH_M
  ) {
    complete();
    return hidden;
  }

  if (state.step3ActiveSec >= STEP3_MAX_ACTIVE_SEC) {
    complete();
    return hidden;
  }

  return {
    text: ctx.hasMinimap ? lines.goalWithMinimap : lines.goalNoMinimap,
    visual: ctx.hasMinimap ? 'dreamhud' : 'dreamonly',
  };
}

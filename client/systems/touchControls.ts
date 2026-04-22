/**
 * Two virtual joysticks for mobile: one per screen side. The left stick
 * feeds the move axes (forward / turn); the right stick feeds the jug
 * balance axes. Both report analogue values in [-1, 1], so the gameplay
 * code (which already reads the input as floats) doesn't care whether
 * the signal came from WASD, a gamepad, or a thumb drag.
 *
 * Design decisions:
 *
 * - **Dynamic-centre joystick**: the stick base appears where the
 *   finger first lands inside its zone, not at a fixed anchor. This is
 *   the modern default on mobile action games — it tolerates thumbs
 *   that start from any position and doesn't force the player to aim
 *   at a corner.
 * - **Per-pointer capture via `setPointerCapture`**: each zone stores
 *   its own `pointerId`, so a second simultaneous touch in the other
 *   zone gets its own stick. Without this, iOS Safari would route a
 *   multi-touch move event to whichever element the physical finger
 *   hovered over, breaking diagonal input.
 * - **No dependency on `body.is-touch`**: we gate on `isTouchDevice()`
 *   via the zones being present and styled. Desktop keeps the zones
 *   display:none via CSS, so they never receive pointerdown even if
 *   the script somehow ran on a mouse user.
 *
 * The factory returns `null` if the DOM elements aren't present. That
 * way the input system can treat touch as strictly additive — miss any
 * part of the markup and you fall back to keyboard transparently.
 */
import { isTouchDevice } from '../app/device';

/** Radius (CSS pixels) of maximum thumb travel from its origin. */
const MAX_RADIUS_PX = 60;
/**
 * Normalised dead zone. Below this magnitude on each axis we clamp to
 * 0 so a resting thumb doesn't feed a trickle of input into the
 * balance system (it would unbalance the jug for free).
 */
const DEAD_ZONE = 0.12;

export interface TouchStickState {
  /** Normalised horizontal: -1 left, +1 right. */
  readonly x: number;
  /** Normalised vertical: +1 up (forward), -1 down (screen Y is inverted). */
  readonly y: number;
  /** True while a pointer is captured on this stick. */
  readonly active: boolean;
}

export interface TouchControls {
  readonly left: TouchStickState;
  readonly right: TouchStickState;
  /** Fires the first time any stick goes active (used for HUD "engaged"). */
  onEngage(callback: () => void): void;
  dispose(): void;
}

interface MutableStickState {
  x: number;
  y: number;
  active: boolean;
}

/**
 * Wire a single joystick on top of a zone element. The stick visual
 * (`stickEl` containing `.touch-stick__thumb`) is positioned inside the
 * zone on pointerdown and tracks the delta from the touch origin, with
 * the thumb clamped to `MAX_RADIUS_PX`.
 */
function attachStick(
  zone: HTMLElement,
  stickEl: HTMLElement,
  onStart: () => void,
): { state: MutableStickState; dispose: () => void } {
  const thumbEl = stickEl.querySelector<HTMLElement>('.touch-stick__thumb');
  if (!thumbEl) {
    throw new Error('touch-stick: .touch-stick__thumb not found inside stick');
  }
  const state: MutableStickState = { x: 0, y: 0, active: false };
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;

  const reset = (): void => {
    state.x = 0;
    state.y = 0;
    state.active = false;
    stickEl.classList.remove('is-active');
    thumbEl.style.transform = 'translate(-50%, -50%)';
  };

  const apply = (clientX: number, clientY: number): void => {
    let dx = clientX - startX;
    let dy = clientY - startY;
    const mag = Math.hypot(dx, dy);
    if (mag > MAX_RADIUS_PX) {
      dx = (dx / mag) * MAX_RADIUS_PX;
      dy = (dy / mag) * MAX_RADIUS_PX;
    }
    // Thumb travels relative to its resting centre (stick is positioned
    // at the touch origin, thumb is centred inside it). Using a
    // translate percentage + pixel offset keeps the -50%/-50% centring
    // trick intact regardless of thumb size.
    thumbEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    let nx = dx / MAX_RADIUS_PX;
    // Screen Y grows downward; the gameplay axis treats "up" as positive.
    let ny = -dy / MAX_RADIUS_PX;
    if (Math.abs(nx) < DEAD_ZONE) nx = 0;
    if (Math.abs(ny) < DEAD_ZONE) ny = 0;
    state.x = nx;
    state.y = ny;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (pointerId !== null) return;
    // preventDefault to stop iOS Safari from synthesising a subsequent
    // mouse event / deciding the touch was a text selection attempt.
    e.preventDefault();
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    // Position the stick visual at the touch point within the zone.
    const rect = zone.getBoundingClientRect();
    stickEl.style.left = `${e.clientX - rect.left}px`;
    stickEl.style.top = `${e.clientY - rect.top}px`;
    stickEl.classList.add('is-active');
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers throw if the element is detached; a subsequent
      // pointermove will still work without explicit capture.
    }
    state.active = true;
    onStart();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    apply(e.clientX, e.clientY);
  };

  const onPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    try {
      zone.releasePointerCapture(e.pointerId);
    } catch {
      // Capture may already be gone (e.g., pointercancel after blur).
    }
    reset();
  };

  zone.addEventListener('pointerdown', onPointerDown);
  zone.addEventListener('pointermove', onPointerMove);
  zone.addEventListener('pointerup', onPointerEnd);
  zone.addEventListener('pointercancel', onPointerEnd);

  return {
    state,
    dispose() {
      zone.removeEventListener('pointerdown', onPointerDown);
      zone.removeEventListener('pointermove', onPointerMove);
      zone.removeEventListener('pointerup', onPointerEnd);
      zone.removeEventListener('pointercancel', onPointerEnd);
      if (pointerId !== null) {
        try {
          zone.releasePointerCapture(pointerId);
        } catch {
          // best effort
        }
      }
    },
  };
}

export function createTouchControls(): TouchControls | null {
  if (!isTouchDevice()) return null;
  const zoneLeft = document.getElementById('touch-zone-left');
  const zoneRight = document.getElementById('touch-zone-right');
  const stickLeft = document.getElementById('touch-stick-left');
  const stickRight = document.getElementById('touch-stick-right');
  if (!zoneLeft || !zoneRight || !stickLeft || !stickRight) return null;

  let engageCallback: (() => void) | null = null;
  let hasEngaged = false;
  const fireEngage = (): void => {
    if (hasEngaged) return;
    hasEngaged = true;
    engageCallback?.();
  };

  const leftHandle = attachStick(zoneLeft, stickLeft, fireEngage);
  const rightHandle = attachStick(zoneRight, stickRight, fireEngage);

  return {
    left: leftHandle.state,
    right: rightHandle.state,
    onEngage(callback) {
      engageCallback = callback;
      // If a pointer landed before the subscriber attached (possible if
      // the player started a touch while input was being constructed),
      // fire immediately so nothing gets swallowed.
      if (hasEngaged) callback();
    },
    dispose() {
      leftHandle.dispose();
      rightHandle.dispose();
    },
  };
}

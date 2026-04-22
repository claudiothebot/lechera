import { isTouchDevice } from '../app/device';
import { createTouchControls, type TouchControls } from './touchControls';

export interface InputAxes {
  /** WASD: +1 forward (world -Z), -1 back. */
  moveForward: number;
  /** WASD: +1 right (world +X), -1 left. */
  moveRight: number;
  /** Arrows: +1 up (tilts jug in character's forward direction), -1 down. */
  tiltForward: number;
  /** Arrows: +1 right (tilts jug in character's right direction), -1 left. */
  tiltRight: number;
}

export interface InputSystem {
  readonly axes: InputAxes;
  /** True only while the player holds the free-look button. */
  readonly isFreeLook: boolean;
  /**
   * True once the player has interacted with the game (any movement or
   * free-look input). Used by the HUD to fade the help hint away.
   */
  readonly hasEngaged: boolean;
  update(): void;
  /** Mouse delta since last call. Accumulates only while free-look is held. */
  consumeLookDelta(): { dx: number; dy: number };
  consumeRestart(): boolean;
  /**
   * Queue a restart from outside the input system (e.g. a tap-to-
   * restart button on game-over for touch devices, where there's no
   * `R` key to press). Consumed by `consumeRestart()` next frame.
   */
  queueRestart(): void;
  /**
   * Returns `true` once per Space / Enter press, consuming the queued
   * event. The HUD uses this to toggle the instructions panel. Both
   * keys are otherwise unbound in gameplay — Enter is wired alongside
   * Space because it's the reflex key most players reach for on a
   * "press any key" overlay.
   */
  consumeToggleHelp(): boolean;
  dispose(): void;
}

export function createInputSystem(canvas: HTMLCanvasElement): InputSystem {
  const keys = new Set<string>();
  const axes: InputAxes = {
    moveForward: 0,
    moveRight: 0,
    tiltForward: 0,
    tiltRight: 0,
  };
  let lookDx = 0;
  let lookDy = 0;
  let freeLook = false;
  let freeLookPointerId: number | null = null;
  let restartQueued = false;
  let toggleHelpQueued = false;
  let engaged = false;

  const markEngaged = () => {
    engaged = true;
  };

  // Touch controls are opt-in per device. On desktop this is `null` so
  // the entire rest of this file behaves exactly as before. On touch
  // it's the two-joystick rig, wired to the same axes via `update()`
  // below.
  const touch: TouchControls | null = createTouchControls();
  touch?.onEngage(markEngaged);
  const isTouch = touch !== null;

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === 'r') restartQueued = true;
    // Space / Enter toggles the instructions panel. Neither counts as
    // "engagement" — opening help shouldn't fade the hint pill; that
    // should only happen when the player actually starts playing
    // (WASD / arrows / mouse look).
    //
    // Guard against swallowing Enter while the name modal (or any
    // future form input) has focus: if the event came from a text
    // field, the player is typing their name, not toggling help.
    const target = e.target as HTMLElement | null;
    const isTypingIntoForm =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    if (
      !isTypingIntoForm &&
      (k === ' ' ||
        e.key === 'Space' ||
        e.code === 'Space' ||
        e.key === 'Enter' ||
        e.code === 'Enter')
    ) {
      toggleHelpQueued = true;
      e.preventDefault();
    }
    if (k.startsWith('arrow') || k === 'w' || k === 'a' || k === 's' || k === 'd') {
      markEngaged();
    }
    // Arrow keys would otherwise scroll the page.
    if (k.startsWith('arrow')) e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  };

  const onPointerDown = (e: PointerEvent) => {
    // Left button only (button === 0). We intentionally DON'T request a
    // pointer lock: the mouse stays visible, free-look is a modal hold.
    if (e.button !== 0) return;
    freeLook = true;
    freeLookPointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    markEngaged();
  };

  const endFreeLook = (pointerId?: number) => {
    if (pointerId !== undefined && pointerId !== freeLookPointerId) return;
    freeLook = false;
    if (freeLookPointerId !== null) {
      try {
        canvas.releasePointerCapture(freeLookPointerId);
      } catch {
        // Element may already have lost capture on blur/tab-switch.
      }
      freeLookPointerId = null;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    endFreeLook(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!freeLook) return;
    lookDx += e.movementX;
    lookDy += e.movementY;
  };

  const onPointerCancel = (e: PointerEvent) => {
    endFreeLook(e.pointerId);
  };

  const onBlur = () => {
    keys.clear();
    endFreeLook();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Free-look (hold LMB to orbit) is a desktop affordance. On touch
  // devices the camera stays auto-follow — the thumbs are already
  // reserved for move + balance, and capturing the canvas for a third
  // "drag to look" gesture would collide with both joysticks. Skipping
  // the canvas pointerdown listener entirely on touch is the simplest
  // way to avoid accidental free-look triggers when a finger lands
  // outside either zone (e.g., above the sticks on the playfield).
  if (!isTouch) {
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointercancel', onPointerCancel);
  }
  window.addEventListener('blur', onBlur);

  return {
    axes,
    get isFreeLook() {
      return freeLook;
    },
    get hasEngaged() {
      return engaged;
    },
    update() {
      // Keyboard first — zero unless a key is held.
      let moveF = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      let moveR = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      let tiltF =
        (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
      let tiltR =
        (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
      // Touch override: if a stick is actively captured, its values
      // win — even when the normalised output is 0 inside the dead
      // zone. That way a player who has rested their thumb on the
      // stick but isn't pushing gets a clean zero, rather than
      // inheriting a stale WASD read from a Bluetooth keyboard that
      // happens to share the device.
      if (touch) {
        if (touch.left.active) {
          moveF = touch.left.y;
          moveR = touch.left.x;
        }
        if (touch.right.active) {
          tiltF = touch.right.y;
          tiltR = touch.right.x;
        }
      }
      axes.moveForward = moveF;
      axes.moveRight = moveR;
      axes.tiltForward = tiltF;
      axes.tiltRight = tiltR;
    },
    consumeLookDelta() {
      const result = { dx: lookDx, dy: lookDy };
      lookDx = 0;
      lookDy = 0;
      return result;
    },
    consumeRestart() {
      if (restartQueued) {
        restartQueued = false;
        return true;
      }
      return false;
    },
    queueRestart() {
      restartQueued = true;
    },
    consumeToggleHelp() {
      if (toggleHelpQueued) {
        toggleHelpQueued = false;
        return true;
      }
      return false;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (!isTouch) {
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointercancel', onPointerCancel);
      }
      window.removeEventListener('blur', onBlur);
      touch?.dispose();
    },
  };
}

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
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointercancel', onPointerCancel);
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
      axes.moveForward =
        (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      axes.moveRight = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      axes.tiltForward =
        (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
      axes.tiltRight =
        (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0);
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
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onBlur);
    },
  };
}

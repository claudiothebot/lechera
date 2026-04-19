import * as THREE from 'three';

/**
 * Third-person auto-follow camera.
 *
 * Mental model:
 *   - There is always a "follow yaw" = π − character.facing. That parks the
 *     camera behind the character no matter how she turns, and the yaw
 *     stays glued to her orientation (not to the player's gameplay inputs).
 *   - A pair of `yawOffset` / `pitchOffset` accumulators sit on top. They
 *     grow while the player holds the free-look button (mouse drag), and
 *     they decay back to 0 when released — so the camera "snaps back
 *     behind" on its own. This means the gameplay reference frame
 *     (character facing) is ALWAYS what WASD/arrows resolve against, even
 *     during free-look, and the player can't accidentally break the
 *     controls by looking around.
 *
 * Pitch has absolute clamps (MIN/MAX_PITCH); the offset is saturated so the
 * total pitch never leaves that window. Yaw is free (no wrap — accumulates
 * in radians, the cosine/sine don't care).
 */
const DEFAULT_DISTANCE = 5.0;
const DEFAULT_HEIGHT = 2.75;
/** Point on the player the camera looks at (metres above feet). ~upper chest. */
const LOOK_HEIGHT = 1.35;
const POS_LAMBDA = 8.0;
const LOOK_LAMBDA = 10.0;
/**
 * How fast free-look offsets decay back to 0 after releasing the mouse
 * button. λ=5 ≈ 200 ms to fade. Slow enough to feel like an easing, fast
 * enough that the player doesn't lose their bearings.
 */
const OFFSET_DECAY_LAMBDA = 5.0;
const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -0.25;
const MAX_PITCH = 0.9;
const DEFAULT_PITCH = 0.22;

export interface CameraRig {
  /**
   * Drive the camera for one frame.
   *
   * @param target        World position the camera should frame (player feet / root).
   * @param playerFacing  Character facing in radians (`atan2(vx, vz)`). Used to
   *                      compute the follow yaw.
   * @param freeLook      True while the player is actively holding the look button.
   *                      While true, mouse deltas accumulate; while false, any
   *                      accumulated offset decays back to 0.
   * @param mouseDx/mouseDy Pixel deltas since last frame. Ignored if `freeLook` is false.
   */
  update(
    dt: number,
    target: THREE.Vector3,
    playerFacing: number,
    freeLook: boolean,
    mouseDx: number,
    mouseDy: number,
  ): void;
}

export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  let yawOffset = 0;
  let pitchOffset = 0;

  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const currentLook = new THREE.Vector3();
  let initialized = false;

  function computeDesiredFromAngles(
    target: THREE.Vector3,
    y: number,
    p: number,
    outPos: THREE.Vector3,
    outLook: THREE.Vector3,
  ) {
    const horizDist = DEFAULT_DISTANCE * Math.cos(p);
    const vertDist = DEFAULT_HEIGHT + DEFAULT_DISTANCE * Math.sin(p);
    outPos.set(
      target.x - Math.sin(y) * horizDist,
      target.y + vertDist,
      target.z + Math.cos(y) * horizDist,
    );
    outLook.set(target.x, target.y + LOOK_HEIGHT, target.z);
  }

  return {
    update(dt, target, playerFacing, freeLook, mouseDx, mouseDy) {
      if (freeLook) {
        yawOffset -= mouseDx * MOUSE_SENSITIVITY;
        pitchOffset -= mouseDy * MOUSE_SENSITIVITY;
      } else {
        // Smooth return-to-rest. Exponential toward 0 so the spring feel
        // matches the position damping elsewhere.
        const t = 1 - Math.exp(-OFFSET_DECAY_LAMBDA * dt);
        yawOffset -= yawOffset * t;
        pitchOffset -= pitchOffset * t;
      }

      // Clamp the TOTAL pitch to the allowed window so dragging down too
      // far stops at floor level instead of flipping the camera upside-
      // down. Saturating the offset (not the total) keeps the clamp in
      // sync with pitch base changes if they ever happen.
      const totalPitch = clamp(
        DEFAULT_PITCH + pitchOffset,
        MIN_PITCH,
        MAX_PITCH,
      );
      pitchOffset = totalPitch - DEFAULT_PITCH;

      // π − facing parks the camera directly behind the character. See
      // module header for the derivation.
      const followYaw = Math.PI - playerFacing;
      const finalYaw = followYaw + yawOffset;
      const finalPitch = DEFAULT_PITCH + pitchOffset;

      computeDesiredFromAngles(
        target,
        finalYaw,
        finalPitch,
        desiredPos,
        desiredLook,
      );

      if (!initialized) {
        camera.position.copy(desiredPos);
        currentLook.copy(desiredLook);
        initialized = true;
      } else {
        damp3(camera.position, desiredPos, POS_LAMBDA, dt);
        damp3(currentLook, desiredLook, LOOK_LAMBDA, dt);
      }
      camera.lookAt(currentLook);
    },
  };
}

function damp3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  lambda: number,
  dt: number,
): void {
  const t = 1 - Math.exp(-lambda * dt);
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
  current.z += (target.z - current.z) * t;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

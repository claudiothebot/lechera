import * as THREE from 'three';
import {
  WORLD_BOUNDARY_CENTER,
  WORLD_BOUNDARY_RADIUS_M,
  type Obstacle,
} from './level';

/**
 * Half-width of the cylindrical body used for collision against world
 * obstacles. Exported because Phase 6d (player ↔ player collision)
 * wraps remote players as `Obstacle` AABBs sized at this radius so the
 * collision diameter between two lecheras equals 2 × PLAYER_RADIUS,
 * matching their visual footprint.
 */
export const PLAYER_RADIUS = 0.45;
const MAX_SPEED = 4.5;
/** Backward speed cap (S key). Lower than forward = classic tank convention. */
const MAX_BACK_SPEED = 2.5;
const ACCEL = 9.0;
const DECEL = 8.0;
/**
 * Maximum intentional turn rate when A/D is fully held (rad/s). Tank
 * controls: the player rotates the character directly; facing is NOT
 * derived from velocity. 2.5 rad/s ≈ 360° in 2.5 s — deliberate enough
 * that you can't flick-spin the jug, fast enough that repositioning
 * doesn't feel sluggish.
 */
const TURN_RATE = 2.5;

const BODY_HEIGHT = 1.4;
/** World-space Y of the top-of-head pivot. */
export const HEAD_Y = BODY_HEIGHT + 0.05;

export interface BumpEvent {
  /** Magnitude of lost speed on impact (m/s). */
  impulse: number;
  /** World-space direction the impulse pushes the player. */
  dirX: number;
  dirZ: number;
}

export interface PlayerUpdateResult {
  position: THREE.Vector3;
  /** World-space horizontal acceleration this frame (m/s^2). */
  worldAccelX: number;
  worldAccelZ: number;
  bumps: readonly BumpEvent[];
  speed: number;
  /** Current character facing (rad, world yaw around +Y). */
  facing: number;
  /**
   * Rate of change of `facing` this frame (rad/s). Used by main.ts to
   * feed a yaw-induced inertial disturbance into the jug balance: when
   * the Lechera turns her body, the jug on her head lags behind.
   */
  angularVelocity: number;
}

export interface Player {
  readonly group: THREE.Group;
  readonly jugAnchor: THREE.Group;
  readonly result: PlayerUpdateResult;
  /**
   * Replace the empty placeholder under `group` with the loaded character
   * root (see loadCharacter).
   */
  setVisual(object: THREE.Object3D): void;
  /** Replace the empty jug placeholder with a loaded model (see loadJugModel). */
  setJugVisual(object: THREE.Object3D): void;
  reset(position: THREE.Vector3): void;
  /**
   * Tank controls:
   *   - `inputForward` (W/S): ±1 drives velocity along the character's
   *     CURRENT facing (no strafe). Backward speed is capped lower than
   *     forward.
   *   - `inputTurn`    (A/D): ±1 rotates the character at TURN_RATE.
   *     A = left, D = right. Rotation is independent of movement, so the
   *     Lechera can pivot in place.
   *
   * Facing is now a state machine variable, not a derivative of velocity.
   * That removes the camera "whip" that world-relative WASD produced and
   * makes every turn a deliberate, jug-disturbing act — which the balance
   * system taxes via YAW_INERTIA_GAIN in main.ts.
   */
  update(
    dt: number,
    inputForward: number,
    inputTurn: number,
    obstacles: readonly Obstacle[],
  ): PlayerUpdateResult;
}

export function createPlayer(scene: THREE.Scene, spawn: THREE.Vector3): Player {
  // Body group: everything that rotates with player facing.
  const group = new THREE.Group();
  group.name = 'player';

  // Empty placeholder: the real GLB is installed before the first render
  // (see main.ts) so we never flash procedural geometry at boot.
  const placeholder = new THREE.Group();
  placeholder.name = 'player-placeholder';
  group.add(placeholder);

  let currentVisual: THREE.Object3D = placeholder;

  group.position.copy(spawn);
  group.position.y = 0;
  scene.add(group);

  // Jug anchor is an independent scene node so its rotation lives in world
  // frame, decoupled from the player's facing. The main loop keeps its
  // position synced to the top of the head.
  const jugAnchor = new THREE.Group();
  jugAnchor.name = 'jugAnchor';

  const jugPlaceholder = new THREE.Group();
  jugPlaceholder.name = 'jug-placeholder';
  jugAnchor.add(jugPlaceholder);

  let jugVisual: THREE.Object3D = jugPlaceholder;

  jugAnchor.position.set(spawn.x, HEAD_Y, spawn.z);
  scene.add(jugAnchor);

  const velocity = new THREE.Vector3();
  const prevVelocity = new THREE.Vector3();
  const moveIntent = new THREE.Vector3();
  // Spawn facing -Z (toward the goal), not toward the camera.
  let facing = Math.PI;
  group.rotation.y = facing + Math.PI;

  const result: PlayerUpdateResult = {
    position: group.position,
    worldAccelX: 0,
    worldAccelZ: 0,
    bumps: [],
    speed: 0,
    facing,
    angularVelocity: 0,
  };

  function reset(position: THREE.Vector3) {
    group.position.copy(position);
    group.position.y = 0;
    velocity.set(0, 0, 0);
    prevVelocity.set(0, 0, 0);
    facing = Math.PI;
    group.rotation.y = facing + Math.PI;
    jugAnchor.position.set(position.x, HEAD_Y, position.z);
    jugAnchor.quaternion.identity();
    result.worldAccelX = 0;
    result.worldAccelZ = 0;
    result.speed = 0;
    result.bumps = [];
    result.facing = facing;
    result.angularVelocity = 0;
  }

  function update(
    dt: number,
    inputForward: number,
    inputTurn: number,
    obstacles: readonly Obstacle[],
  ): PlayerUpdateResult {
    const prevFacing = facing;

    // Rotate first so movement uses the up-to-date facing. Clamp input in
    // case the caller passes a gamepad axis that exceeds [-1, 1].
    const turn = Math.max(-1, Math.min(1, inputTurn));
    // Negative: D (+1) decreases facing, which rotates the character toward
    // +X from the default north (-Z) — matches what players label "right".
    facing = wrapAngle(facing - turn * TURN_RATE * dt);

    // Character's forward vector from facing. Using the same sign
    // convention as reset() / rotation.y — facing = π means -Z (north).
    const forwardX = Math.sin(facing);
    const forwardZ = Math.cos(facing);

    // Clamp forward input and apply asymmetric speed cap (backward is
    // slower). This is speed only — direction is always "character forward".
    const fwd = Math.max(-1, Math.min(1, inputForward));
    const maxForThisFrame = fwd >= 0 ? MAX_SPEED : MAX_BACK_SPEED;
    const targetSpeed = fwd * maxForThisFrame;

    prevVelocity.copy(velocity);
    moveIntent.set(forwardX * targetSpeed, 0, forwardZ * targetSpeed);
    const delta = moveIntent.sub(velocity);
    // Accelerate if trying to move, decelerate if coasting (input == 0).
    const rate = Math.abs(fwd) > 0.01 ? ACCEL : DECEL;
    const maxStep = rate * dt;
    if (delta.length() > maxStep) delta.setLength(maxStep);
    velocity.add(delta);

    const next = group.position.clone().addScaledVector(velocity, dt);

    const bumps: BumpEvent[] = [];
    for (const ob of obstacles) {
      const dx = next.x - ob.center.x;
      const dz = next.z - ob.center.z;
      const clampedX = Math.max(-ob.halfX, Math.min(ob.halfX, dx));
      const clampedZ = Math.max(-ob.halfZ, Math.min(ob.halfZ, dz));
      const closestX = ob.center.x + clampedX;
      const closestZ = ob.center.z + clampedZ;
      const diffX = next.x - closestX;
      const diffZ = next.z - closestZ;
      const distSq = diffX * diffX + diffZ * diffZ;
      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const nx = diffX / dist;
        const nz = diffZ / dist;
        const push = PLAYER_RADIUS - dist;
        next.x += nx * push;
        next.z += nz * push;

        // Player-frame velocity component INTO the obstacle. Used to
        // kill our own velocity along the contact normal — only WE
        // ever move under our own control on this client, so the
        // velocity correction always uses our absolute velocity.
        const vn = velocity.x * nx + velocity.z * nz;
        if (vn < 0) {
          velocity.x -= vn * nx;
          velocity.z -= vn * nz;
        }

        // Bump intensity is driven by the RELATIVE velocity at the
        // contact point. For a static obstacle (default vel = 0)
        // this collapses to `vn` — no behaviour change. For a moving
        // obstacle (a remote player ramming into us) it captures the
        // closing speed even when we're stationary, so the jug
        // shakes on both sides of a player ↔ player collision.
        const obVelX = ob.velocityX ?? 0;
        const obVelZ = ob.velocityZ ?? 0;
        const vrelN =
          (velocity.x - obVelX) * nx + (velocity.z - obVelZ) * nz;
        if (vrelN < -0.3) {
          // Bump direction matches the impact axis (`-n` points from
          // the contact point INTO the obstacle, which is where the
          // jug's inertia wants to lag behind on the player taking
          // the hit). Magnitude scales with closing speed.
          bumps.push({ impulse: -vrelN, dirX: -nx, dirZ: -nz });
        }
      }
    }

    // Hard world boundary: keep the player inside the playable disc
    // around `WORLD_BOUNDARY_CENTER`. Trees / horizon scenery sit at and
    // past this radius (`loadLevelTrees`), so visually the player is
    // walled in by the forest. Clamp BEFORE writing `group.position` so
    // the next-frame collision pass sees the clamped position too.
    const bx = next.x - WORLD_BOUNDARY_CENTER.x;
    const bz = next.z - WORLD_BOUNDARY_CENTER.y;
    const bdist = Math.hypot(bx, bz);
    const maxR = WORLD_BOUNDARY_RADIUS_M - PLAYER_RADIUS;
    if (bdist > maxR) {
      // Project back onto the boundary circle. Also kill the radial
      // component of velocity so we don't accumulate "trying to push
      // through the wall" energy frame after frame.
      const k = maxR / bdist;
      next.x = WORLD_BOUNDARY_CENTER.x + bx * k;
      next.z = WORLD_BOUNDARY_CENTER.y + bz * k;
      const nrx = bx / bdist;
      const nrz = bz / bdist;
      const vRadial = velocity.x * nrx + velocity.z * nrz;
      if (vRadial > 0) {
        velocity.x -= vRadial * nrx;
        velocity.z -= vRadial * nrz;
      }
    }

    group.position.x = next.x;
    group.position.z = next.z;
    group.position.y = 0;

    group.rotation.y = facing + Math.PI;

    const speed = Math.hypot(velocity.x, velocity.z);
    const dtSafe = Math.max(dt, 1e-4);
    result.worldAccelX = (velocity.x - prevVelocity.x) / dtSafe;
    result.worldAccelZ = (velocity.z - prevVelocity.z) / dtSafe;
    result.speed = speed;
    result.bumps = bumps;
    result.facing = facing;
    // wrapAngle() keeps the delta in (-π, π] so a wrap from +π to -π
    // doesn't register as a near-2π spike in angular velocity.
    result.angularVelocity = wrapAngle(facing - prevFacing) / dtSafe;

    return result;
  }

  function setVisual(object: THREE.Object3D) {
    if (currentVisual === object) return;
    group.remove(currentVisual);
    group.add(object);
    currentVisual = object;
  }

  function setJugVisual(object: THREE.Object3D) {
    if (jugVisual === object) return;
    jugAnchor.remove(jugVisual);
    jugAnchor.add(object);
    jugVisual = object;
  }

  return {
    group,
    jugAnchor,
    result,
    setVisual,
    setJugVisual,
    reset,
    update,
  };
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

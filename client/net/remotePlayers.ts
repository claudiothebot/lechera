/**
 * Phase 2b — render other players as cloned Lecheras.
 *
 * Design notes:
 *  - Each remote owns a `SkeletonUtils.clone` of the Lechera GLB plus a
 *    cloned (and tinted) jug. Jug scale follows `view.dreamIndex` via
 *    `jugScaleForDreamIndex` (same curve as the local `jugAnchor`). They
 *    share GPU geometry with the local player via the
 *    `CharacterSource`/`JugSource` cache, but get their own bones, mixer
 *    and materials so animation/tint are isolated.
 *  - Snapshot interpolation: every remote renders ~100 ms behind the
 *    latest received pose. The buffer is filled when `view.x/y/yaw`
 *    changes (i.e. when a Colyseus patch lands and updates the schema
 *    in-place). At our 20 Hz patch rate the buffer holds ~5 samples.
 *  - Walk speed is derived from the interpolated pose delta, not from
 *    the network — that way the animation always matches what we're
 *    actually rendering, including the smoothing.
 *  - Name tag: sprite + canvas-rendered pill in the player's color.
 *    Mounted on the head bone so it follows the head height even when
 *    the GLB scale or rig differs from our assumptions.
 *  - Local player is filtered out by `multiplayer.ts`; this module
 *    never sees self.
 */
import * as THREE from 'three';

import {
  createCharacterInstance,
  type Character,
  type CharacterSource,
} from '../game/character';
import { jugScaleForDreamIndex } from '../game/progression';
import {
  createJugInstance,
  type JugSource,
} from '../game/jugModel';
import type {
  MultiplayerHandle,
  RemotePlayerView,
} from './multiplayer';

/** How far in the past we render remotes, in ms. ~2× the patch interval. */
const INTERP_DELAY_MS = 100;
/** Hard cap on snapshot history; ~1 s of buffer at 20 Hz. */
const MAX_SNAPSHOTS = 24;
/** Target body height for cloned Lecheras (matches local player). */
const BODY_HEIGHT = 1.68;
/** Reference walk speed at which the clip plays at native rate. */
const WALK_SPEED_REFERENCE = 4.5;
/**
 * Base jug height before `jugScaleForDreamIndex` (must match `main.ts`
 * `JUG_TARGET_HEIGHT`).
 */
const JUG_TARGET_HEIGHT = 0.42;
/** Vertical extra lift above the head bone so the jug sits on the skull. */
const JUG_EXTRA_LIFT_Y = 0.08;
/** Lift of the name tag above the jug, in metres. */
const NAME_TAG_LIFT = 0.42;
/**
 * Must match `player.ts`: the gameplay `facing` angle is sent as network
 * `yaw`, but the local body group uses `group.rotation.y = facing +
 * Math.PI` so the GLB faces the right way. Remotes need the same offset
 * or other players appear facing backward when you look at them head-on.
 */
const BODY_GROUP_YAW_OFFSET = Math.PI;
/** Sprite world height of the name tag. Width derives from canvas aspect. */
const NAME_TAG_WORLD_HEIGHT = 0.28;
/**
 * Lowpass coefficient for animation speed. Higher = snappier, lower =
 * smoother. With 20 Hz patches and 60 Hz render, 0.25 keeps the walk
 * animation responsive but kills single-frame jitter from quantized
 * positions.
 */
const SPEED_SMOOTH = 0.25;

interface PoseSnapshot {
  /** Client receive time in ms (performance.now). */
  t: number;
  x: number;
  z: number;
  yaw: number;
}

interface RemoteAvatar {
  sessionId: string;
  view: RemotePlayerView;
  group: THREE.Group;
  character: Character;
  jug: THREE.Object3D;
  /** Live pose buffer, ascending by `t`. */
  snapshots: PoseSnapshot[];
  /** Last rendered position, for walk-speed estimation. */
  lastX: number;
  lastZ: number;
  smoothedSpeed: number;
  /** Name currently shown on the floating label, for redraw debounce. */
  shownName: string;
  nameSprite: THREE.Sprite;
  nameTexture: THREE.CanvasTexture;
}

export interface RemotePlayersManager {
  /** Call once per frame from the main loop. */
  update(dt: number): void;
  /** Snapshot of remote positions for systems like the minimap. */
  positions(): Array<{ sessionId: string; x: number; z: number; hue: number }>;
  /** Tear down all visuals and listeners. Idempotent. */
  dispose(): void;
}

export interface RemotePlayersOptions {
  scene: THREE.Scene;
  multi: MultiplayerHandle;
  /** Cached Lechera source — shared with the local player. */
  characterSource: CharacterSource;
  /** Cached jug source — shared with the local player. */
  jugSource: JugSource;
}

export function createRemotePlayers(
  opts: RemotePlayersOptions,
): RemotePlayersManager {
  const { scene, multi, characterSource, jugSource } = opts;
  const avatars = new Map<string, RemoteAvatar>();
  const tmpJugWorld = new THREE.Vector3();
  let disposed = false;

  const unsubscribe = multi.subscribeRemotePlayers({
    onAdd: (sessionId, view) => {
      if (disposed) return;
      if (avatars.has(sessionId)) return;
      const avatar = createAvatar(sessionId, view, characterSource, jugSource);
      avatars.set(sessionId, avatar);
      scene.add(avatar.group);
      // Seed the buffer with the current pose so the first frame doesn't
      // snap from the origin.
      avatar.snapshots.push({
        t: performance.now(),
        x: view.x,
        z: view.z,
        yaw: view.yaw,
      });
    },
    onRemove: (sessionId) => {
      const avatar = avatars.get(sessionId);
      if (!avatar) return;
      scene.remove(avatar.group);
      disposeAvatar(avatar);
      avatars.delete(sessionId);
    },
  });

  function update(dt: number): void {
    if (disposed) return;
    const now = performance.now();
    const renderTime = now - INTERP_DELAY_MS;

    for (const avatar of avatars.values()) {
      // Push a fresh snapshot when the live view actually changed,
      // skipping duplicates (which would break the binary-style search).
      const view = avatar.view;
      const last = avatar.snapshots[avatar.snapshots.length - 1];
      if (
        !last ||
        last.x !== view.x ||
        last.z !== view.z ||
        last.yaw !== view.yaw
      ) {
        avatar.snapshots.push({
          t: now,
          x: view.x,
          z: view.z,
          yaw: view.yaw,
        });
        if (avatar.snapshots.length > MAX_SNAPSHOTS) {
          avatar.snapshots.shift();
        }
      }

      const pose = sampleAt(avatar.snapshots, renderTime);

      // Walk-speed estimate from the interpolated delta. Using the
      // RENDERED motion (not the raw network) keeps the animation in
      // sync with what the player actually sees.
      const dxRender = pose.x - avatar.lastX;
      const dzRender = pose.z - avatar.lastZ;
      const instantSpeed = dt > 1e-6
        ? Math.hypot(dxRender, dzRender) / dt
        : 0;
      avatar.smoothedSpeed +=
        (instantSpeed - avatar.smoothedSpeed) * SPEED_SMOOTH;
      avatar.lastX = pose.x;
      avatar.lastZ = pose.z;

      avatar.group.position.set(pose.x, 0, pose.z);
      avatar.group.rotation.y = pose.yaw + BODY_GROUP_YAW_OFFSET;

      avatar.character.tick(dt, avatar.smoothedSpeed);

      // Anchor the jug on the cloned head bone every frame (the bone
      // moves with the walk animation, so the jug needs to follow).
      // `getJugWorldPosition` returns WORLD coords, but the jug is
      // parented under `avatar.group`, which is already translated to
      // (pose.x, 0, pose.z) and rotated by `pose.yaw`. We must convert
      // the world point into the group's local frame before assigning
      // — otherwise the jug ends up at roughly 2× the pose offset and
      // detached from the body. `worldToLocal` mutates the input vec.
      // Make sure the group's matrix reflects the new pose first.
      avatar.group.updateMatrixWorld(true);
      avatar.character.getJugWorldPosition(tmpJugWorld);
      tmpJugWorld.y += JUG_EXTRA_LIFT_Y;
      avatar.group.worldToLocal(tmpJugWorld);
      avatar.jug.position.copy(tmpJugWorld);
      // No explicit jug yaw: the jug inherits `avatar.group`'s rotation
      // automatically (parented under it). Setting it again would
      // double-rotate.

      applyRemoteJugProgression(avatar);

      if (avatar.view.name && avatar.view.name !== avatar.shownName) {
        redrawNameTag(avatar);
      }
    }
  }

  function positions(): ReturnType<RemotePlayersManager['positions']> {
    const out: ReturnType<RemotePlayersManager['positions']> = [];
    for (const avatar of avatars.values()) {
      out.push({
        sessionId: avatar.sessionId,
        x: avatar.group.position.x,
        z: avatar.group.position.z,
        hue: avatar.view.colorHue,
      });
    }
    return out;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    for (const avatar of avatars.values()) {
      scene.remove(avatar.group);
      disposeAvatar(avatar);
    }
    avatars.clear();
  }

  return { update, positions, dispose };
}

// -----------------------------------------------------------------------------
// Visual factory — cloned Lechera + cloned jug + sprite name tag
// -----------------------------------------------------------------------------

function createAvatar(
  sessionId: string,
  view: RemotePlayerView,
  characterSource: CharacterSource,
  jugSource: JugSource,
): RemoteAvatar {
  const group = new THREE.Group();
  group.name = `remote-${sessionId}`;
  group.position.set(view.x, 0, view.z);
  group.rotation.y = view.yaw + BODY_GROUP_YAW_OFFSET;

  // Tint: pastel multiplier in HSL space. Saturation/lightness chosen
  // empirically — strong enough to read identity at a glance, soft
  // enough that the underlying Lechera texture (skin, dress) survives.
  const tint = new THREE.Color().setHSL(view.colorHue, 0.45, 0.85);

  const character = createCharacterInstance(characterSource, {
    targetHeight: BODY_HEIGHT,
    rotateYToMatchPlayerFront: true,
    walkSpeedReference: WALK_SPEED_REFERENCE,
    tintColor: tint,
  });
  group.add(character.root);

  // Jug: mirror the local-player anchoring (parented under the same
  // group, repositioned every frame from the cloned head bone). We
  // use a slightly stronger tint so the jug reads as "their" jug at
  // a distance.
  const jugTint = new THREE.Color().setHSL(view.colorHue, 0.55, 0.78);
  const jug = createJugInstance(jugSource, {
    targetHeight: JUG_TARGET_HEIGHT,
    tintColor: jugTint,
  });
  group.add(jug);

  // Name tag: sprite anchored above the jug area in local space. Y is
  // refreshed in `applyRemoteJugProgression` as `dreamIndex` scales the jug.
  const { sprite, texture } = createNameTag(view.name || '...', view.colorHue);
  group.add(sprite);

  const avatar: RemoteAvatar = {
    sessionId,
    view,
    group,
    character,
    jug,
    snapshots: [],
    lastX: view.x,
    lastZ: view.z,
    smoothedSpeed: 0,
    shownName: view.name,
    nameSprite: sprite,
    nameTexture: texture,
  };
  applyRemoteJugProgression(avatar);
  return avatar;
}

/** Match local player: `jug.scale` from server `dreamIndex`; lift name tag with jug top. */
function applyRemoteJugProgression(avatar: RemoteAvatar): void {
  const s = jugScaleForDreamIndex(avatar.view.dreamIndex);
  avatar.jug.scale.setScalar(s);
  avatar.nameSprite.position.y = BODY_HEIGHT + JUG_TARGET_HEIGHT * s + NAME_TAG_LIFT;
}

function disposeAvatar(avatar: RemoteAvatar): void {
  avatar.character.dispose();
  // Jug we own (cloned with tint), so its materials are clones too —
  // walk and dispose them. Geometry is shared with the source, leave it.
  avatar.jug.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  avatar.nameTexture.dispose();
  (avatar.nameSprite.material as THREE.SpriteMaterial).dispose();
}

// -----------------------------------------------------------------------------
// Name tag (canvas → CanvasTexture → SpriteMaterial)
// -----------------------------------------------------------------------------

/**
 * Canvas resolution for the floating name tag. 320 × 64 comfortably
 * holds the longest allowed name (18 chars from
 * `MAX_NAME_LENGTH` × ~14 px per glyph at the base 28 px font ≈
 * 250 px) with breathing room for accents / wider glyphs. We still
 * auto-shrink the font in `drawNameToCanvas` for pathological cases
 * (e.g. all wide characters), but the wider canvas means the
 * shrink rarely kicks in in practice.
 */
const NAME_TAG_PX_WIDTH = 320;
const NAME_TAG_PX_HEIGHT = 64;
/** Inner horizontal padding the text must NEVER cross (matches the pill stroke). */
const NAME_TAG_PADDING_PX = 18;
/** Base / max font size. We shrink from here until the text fits. */
const NAME_TAG_BASE_FONT_PX = 28;
/** Lower bound — below this the text is unreadable, just clip. */
const NAME_TAG_MIN_FONT_PX = 16;

function createNameTag(
  name: string,
  hue: number,
): { sprite: THREE.Sprite; texture: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = NAME_TAG_PX_WIDTH;
  canvas.height = NAME_TAG_PX_HEIGHT;
  drawNameToCanvas(canvas, name, hue);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const aspect = NAME_TAG_PX_WIDTH / NAME_TAG_PX_HEIGHT;
  sprite.scale.set(NAME_TAG_WORLD_HEIGHT * aspect, NAME_TAG_WORLD_HEIGHT, 1);
  return { sprite, texture };
}

function redrawNameTag(avatar: RemoteAvatar): void {
  const map = (avatar.nameSprite.material as THREE.SpriteMaterial).map;
  if (!map) return;
  const canvas = map.image as HTMLCanvasElement | undefined;
  if (!canvas) return;
  drawNameToCanvas(canvas, avatar.view.name, avatar.view.colorHue);
  avatar.nameTexture.needsUpdate = true;
  avatar.shownName = avatar.view.name;
}

function drawNameToCanvas(
  canvas: HTMLCanvasElement,
  name: string,
  hue: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const radius = h / 2;
  const fill = hslToCss(hue, 0.55, 0.32, 0.85);
  const border = hslToCss(hue, 0.6, 0.7, 0.95);
  roundedRect(ctx, 4, 4, w - 8, h - 8, radius - 4);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = '#fdfaf2';
  // Auto-shrink the font so long names (up to MAX_NAME_LENGTH from
  // the shared name module) never overflow the pill. We start at the
  // base size and step down 2 px at a time until the rendered text
  // fits within the safe inner width, bounded below so unreadable
  // tags still render at the minimum size (and clip).
  const safeWidth = w - NAME_TAG_PADDING_PX * 2;
  let fontPx = NAME_TAG_BASE_FONT_PX;
  while (fontPx > NAME_TAG_MIN_FONT_PX) {
    ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    if (ctx.measureText(name).width <= safeWidth) break;
    fontPx -= 2;
  }
  // Final assignment guards the case where we exited the loop at
  // exactly NAME_TAG_MIN_FONT_PX (the loop body sets `font` before
  // the check, but only when the previous size didn't fit).
  ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, h / 2);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hslToCss(h: number, s: number, l: number, a = 1): string {
  return `hsla(${(h * 360).toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a})`;
}

// -----------------------------------------------------------------------------
// Snapshot interpolation
// -----------------------------------------------------------------------------

function sampleAt(
  snapshots: PoseSnapshot[],
  targetT: number,
): PoseSnapshot {
  if (snapshots.length === 0) {
    return { t: targetT, x: 0, z: 0, yaw: 0 };
  }
  if (targetT <= snapshots[0]!.t) return snapshots[0]!;
  const newest = snapshots[snapshots.length - 1]!;
  if (targetT >= newest.t) return newest;
  for (let i = snapshots.length - 1; i > 0; i--) {
    const a = snapshots[i - 1]!;
    const b = snapshots[i]!;
    if (a.t <= targetT && targetT <= b.t) {
      const span = b.t - a.t;
      const u = span > 0 ? (targetT - a.t) / span : 0;
      return {
        t: targetT,
        x: a.x + (b.x - a.x) * u,
        z: a.z + (b.z - a.z) * u,
        yaw: lerpAngle(a.yaw, b.yaw, u),
      };
    }
  }
  return newest;
}

/** Shortest-arc lerp between two angles (radians). */
function lerpAngle(a: number, b: number, u: number): number {
  const TWO_PI = Math.PI * 2;
  let diff = ((b - a) % TWO_PI + TWO_PI) % TWO_PI;
  if (diff > Math.PI) diff -= TWO_PI;
  return a + diff * u;
}

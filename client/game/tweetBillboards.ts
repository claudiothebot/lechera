import * as THREE from 'three';
import type { Obstacle } from './level';
import type { BillboardModel, BillboardScreenPose } from './billboardModel';
import { renderTweetToCanvas, type Tweet } from './tweetCanvas';

/**
 * Place a set of tweet-carrying billboards in the scene and wire up click →
 * open-in-new-tab behaviour.
 *
 * Architecture:
 *  - One billboard instance per placement (clones of the same GLB template).
 *  - A child `PlaneGeometry` sits on the billboard's configured screen face,
 *    textured with a per-tweet `CanvasTexture` (see `tweetCanvas.ts`).
 *  - Clicks are detected via raycasting against those planes, with a small
 *    down/up drag threshold so the existing "hold LMB to free-look"
 *    behaviour in `input.ts` is unaffected.
 *
 * The manager is fully self-contained — `main.ts` only needs to call
 * `createTweetBillboards(...)` and (optionally) `manager.dispose()` on
 * teardown.
 */

export interface TweetBillboardPlacement {
  /** World-space position of the billboard's footprint centre (min-Y at 0). */
  position: THREE.Vector3;
  /**
   * World-space direction the sign should face. The billboard is rotated
   * about Y so that the model's auto-detected screen normal aligns with
   * this direction. Only the XZ components are used (Y is ignored). Default
   * is +X.
   */
  facing?: THREE.Vector3;
  /** Tweet to show on this billboard. */
  tweet: Tweet;
  /** Optional per-placement override of the screen-plane pose. */
  screen?: Partial<BillboardScreenPose>;
}

export interface TweetBillboardsOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  billboard: BillboardModel;
  placements: TweetBillboardPlacement[];
  /**
   * Max cursor movement in CSS px between pointerdown and pointerup that
   * still counts as a "click". Anything above is treated as a drag (free-
   * look) and the tweet is not opened. Default 6 px.
   */
  clickDragThresholdPx?: number;
  /**
   * Max time in ms between pointerdown and pointerup that counts as a click.
   * Default 400 ms.
   */
  clickTimeThresholdMs?: number;
  /**
   * When true (default), a second screen quad faces the opposite direction
   * so the tweet reads from both sides of the panel. Shares one texture /
   * material between both meshes.
   */
  doubleSided?: boolean;
}

export interface TweetBillboardsManager {
  /** Scene graph root of all billboards, already added to the scene. */
  group: THREE.Group;
  /** Remove listeners and dispose of textures/materials/geometries. */
  dispose(): void;
}

/**
 * World-space axis-aligned footprints for the billboard GLB at each
 * placement (Y rotation expanded into a conservative AABB on XZ). Pass to
 * `level.addObstacles` so the Lechera collides like with houses.
 */
export function buildBillboardCollisionObstacles(
  model: BillboardModel,
  placements: readonly TweetBillboardPlacement[],
): Obstacle[] {
  const out: Obstacle[] = [];
  for (const placement of placements) {
    const yaw = billboardPlacementYaw(model, placement);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const halfXw = model.halfX * Math.abs(c) + model.halfZ * Math.abs(s);
    const halfZw = model.halfX * Math.abs(s) + model.halfZ * Math.abs(c);

    const visual = new THREE.Group();
    visual.name = `billboard-collider-${placement.tweet.id}`;

    out.push({
      center: new THREE.Vector3(
        placement.position.x,
        model.halfY,
        placement.position.z,
      ),
      halfX: halfXw,
      halfZ: halfZw,
      halfY: model.halfY,
      visual,
    });
  }
  return out;
}

function billboardPlacementYaw(
  model: BillboardModel,
  placement: TweetBillboardPlacement,
): number {
  const screen: BillboardScreenPose = {
    offset: placement.screen?.offset?.clone() ?? model.screen.offset.clone(),
    normal: placement.screen?.normal?.clone() ?? model.screen.normal.clone(),
    width: placement.screen?.width ?? model.screen.width,
    height: placement.screen?.height ?? model.screen.height,
  };
  const worldFacing =
    placement.facing?.clone().setY(0) ?? new THREE.Vector3(1, 0, 0);
  if (worldFacing.lengthSq() <= 1e-6) return 0;
  worldFacing.normalize();
  const localNormal = screen.normal.clone().setY(0);
  const localAngle = Math.atan2(localNormal.x, localNormal.z);
  const worldAngle = Math.atan2(worldFacing.x, worldFacing.z);
  return worldAngle - localAngle;
}

interface BillboardEntry {
  tweet: Tweet;
  /** Outward-facing quad (same side as `BillboardModel` screen normal). */
  front: THREE.Mesh;
  /** Opposite-facing quad; `null` when `doubleSided` is false. */
  back: THREE.Mesh | null;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  geometry: THREE.PlaneGeometry;
}

export function createTweetBillboards(
  options: TweetBillboardsOptions,
): TweetBillboardsManager {
  const {
    scene,
    camera,
    renderer,
    billboard,
    placements,
    clickDragThresholdPx = 6,
    clickTimeThresholdMs = 400,
    doubleSided = true,
  } = options;

  const group = new THREE.Group();
  group.name = 'tweet-billboards';
  scene.add(group);

  const entries: BillboardEntry[] = [];
  const hitPlanes: THREE.Mesh[] = [];

  for (const placement of placements) {
    const entry = buildBillboard(billboard, placement, doubleSided);
    group.add(entry.root);
    entries.push(entry.entry);
    hitPlanes.push(entry.entry.front);
    if (entry.entry.back) hitPlanes.push(entry.entry.back);
  }

  // Click detection. We want to coexist with the existing "hold LMB to
  // free-look" input: the input system already takes pointerdown on the
  // canvas, so we mirror that and use down/up drag magnitude + elapsed
  // time to classify the gesture as a click. No stopPropagation — the
  // free-look handler still gets its events, unchanged.
  const dom = renderer.domElement;
  let downX = 0;
  let downY = 0;
  let downT = 0;
  let downButton = -1;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    downButton = 0;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || downButton !== 0) return;
    downButton = -1;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - downT;
    if (dist > clickDragThresholdPx) return;
    if (dt > clickTimeThresholdMs) return;
    maybeOpenTweetAt(e);
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function maybeOpenTweetAt(e: PointerEvent) {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitPlanes, false);
    if (hits.length === 0) return;
    const first = hits[0];
    if (!first) return;
    const tweet = first.object.userData.tweet as Tweet | undefined;
    if (!tweet) return;
    window.open(tweet.url, '_blank', 'noopener,noreferrer');
  }

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', () => {
    downButton = -1;
  });

  return {
    group,
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
      scene.remove(group);
      for (const entry of entries) {
        entry.geometry.dispose();
        entry.material.dispose();
        entry.texture.dispose();
      }
    },
  };
}

/** Half-offset between front/back quads along the screen normal (metres). */
const SCREEN_QUAD_SEPARATION_M = 0.004;

function buildBillboard(
  model: BillboardModel,
  placement: TweetBillboardPlacement,
  doubleSided: boolean,
): { root: THREE.Object3D; entry: BillboardEntry } {
  const root = new THREE.Group();
  root.position.copy(placement.position).setY(0);

  const screen: BillboardScreenPose = {
    offset: placement.screen?.offset?.clone() ?? model.screen.offset.clone(),
    normal: placement.screen?.normal?.clone() ?? model.screen.normal.clone(),
    width: placement.screen?.width ?? model.screen.width,
    height: placement.screen?.height ?? model.screen.height,
  };

  // Rotate the root so the model's local sign normal aligns with the
  // requested world-facing direction. Using atan2 on XZ components keeps
  // the billboard upright; Y of `facing` is ignored. This decouples call
  // sites from the model's internal axis convention — if Meshy exports a
  // different asset with a different forward axis, only `billboardModel`
  // changes.
  const worldFacing = placement.facing?.clone().setY(0) ?? new THREE.Vector3(1, 0, 0);
  if (worldFacing.lengthSq() > 1e-6) {
    worldFacing.normalize();
    const localNormal = screen.normal.clone().setY(0);
    const localAngle = Math.atan2(localNormal.x, localNormal.z);
    const worldAngle = Math.atan2(worldFacing.x, worldFacing.z);
    root.rotation.y = worldAngle - localAngle;
  }

  const visual = model.instance();
  root.add(visual);

  const aspect = screen.width / screen.height;

  const canvas = renderTweetToCanvas(
    placement.tweet,
    { aspect },
    () => {
      // Second pass after async image loads: flag texture dirty so the GPU
      // re-uploads the updated pixels on the next frame.
      texture.needsUpdate = true;
    },
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Canvas is not power-of-two; linear-linear filtering avoids mipmap
  // warnings and keeps text crisp at this camera distance.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
    transparent: false,
  });

  const geometry = new THREE.PlaneGeometry(screen.width, screen.height);
  const normal = screen.normal.clone().normalize();

  const front = new THREE.Mesh(geometry, material);
  front.name = `tweet-screen-front-${placement.tweet.id}`;
  front.userData.tweet = placement.tweet;

  // Orient so +Z matches `screen.normal`; nudge along ±normal so the two
  // quads don't z-fight when double-sided.
  const from = new THREE.Vector3(0, 0, 1);
  const qFront = new THREE.Quaternion().setFromUnitVectors(from, normal);
  front.quaternion.copy(qFront);
  front.position.copy(screen.offset).addScaledVector(normal, SCREEN_QUAD_SEPARATION_M);

  let back: THREE.Mesh | null = null;
  if (doubleSided) {
    back = front.clone();
    back.name = `tweet-screen-back-${placement.tweet.id}`;
    back.userData.tweet = placement.tweet;
    const qBack = new THREE.Quaternion().setFromUnitVectors(
      from,
      normal.clone().negate(),
    );
    back.quaternion.copy(qBack);
    // `screen.offset` sits on the *front* outer face. A second quad only
    // 4 mm behind was still inside the mesh — the rear face must sit past
    // the panel thickness along `-normal` (see `BillboardModel.panelThicknessM`).
    back.position
      .copy(screen.offset)
      .addScaledVector(normal, -(model.panelThicknessM + SCREEN_QUAD_SEPARATION_M));
    root.add(back);
  }

  // Parent the quads as siblings of the scaled visual wrapper (under the
  // same `root`), NOT as children of it: `model.screen.offset` is already in
  // post-scale metres, so re-applying the wrapper's scale would push the
  // plane off the board. Sharing `root` still inherits the per-placement
  // rotationY/position, which is what we want.
  root.add(front);

  return {
    root,
    entry: {
      tweet: placement.tweet,
      front,
      back,
      canvas,
      texture,
      material,
      geometry,
    },
  };
}

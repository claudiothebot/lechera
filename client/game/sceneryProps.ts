import * as THREE from 'three';
import {
  getDefaultColliderPresets,
  stampSceneryObstacle,
  type ColliderPresets,
} from './colliderPresets';
import type { Level, Obstacle } from './level';
import type { SceneryPropKind } from './levelDefinition';
import { loadTreeModel, type TreeModel } from './treeModel';

const SPECS: Record<SceneryPropKind, { url: string }> = {
  haystack: { url: '/models/prop-haystack-opt.glb' },
  cart: { url: '/models/prop-cart-opt.glb' },
  well: { url: '/models/prop-well-opt.glb' },
};

/** Human-friendly labels for the editor's kind picker. */
export const SCENERY_PROP_LABELS: Record<SceneryPropKind, string> = {
  haystack: 'Haystack',
  cart: 'Cart',
  well: 'Well',
};

const modelCache = new Map<SceneryPropKind, TreeModel>();

async function getSceneryModel(kind: SceneryPropKind): Promise<TreeModel> {
  let m = modelCache.get(kind);
  if (!m) {
    const spec = SPECS[kind];
    m = await loadTreeModel(spec.url, { castShadow: true, worldScale: 1 });
    modelCache.set(kind, m);
  }
  return m;
}

/**
 * Place authored scenery props (hay cart, well, haystack) at the
 * positions from the level definition and register each one as a solid
 * AABB obstacle so the player bumps into them like houses / trees.
 *
 * Yaw-rotated props use a conservative axis-aligned box computed from
 * the rotated footprint to avoid per-frame OBB math — same approach
 * used for the tweet billboards (`buildBillboardCollisionObstacles`).
 * Per-type shrink vs mesh bounds is authored in `collider-presets.json`
 * (`footprintScaleXZ`, default 0.8).
 */
export async function loadLevelSceneryProps(
  level: Level,
  colliderPresets: ColliderPresets = getDefaultColliderPresets(),
): Promise<void> {
  // Preload one GLB per unique kind in parallel. `getSceneryModel` caches so
  // repeated kinds share a single network fetch; the prefetch here ensures
  // no kind waits serially on another kind (without this, the first cart
  // blocks the first well, which blocks the first haystack, etc.).
  const uniqueKinds = Array.from(new Set(level.definition.sceneryProps.map((sp) => sp.kind)));
  await Promise.all(uniqueKinds.map((kind) => getSceneryModel(kind)));

  const newObstacles: Obstacle[] = [];
  for (const sp of level.definition.sceneryProps) {
    const model = await getSceneryModel(sp.kind);
    const inst = model.instance();
    inst.position.set(sp.x, 0, sp.z);
    inst.rotation.y = sp.yaw;
    level.group.add(inst);

    const c = Math.cos(sp.yaw);
    const s = Math.sin(sp.yaw);
    const baseHalfX = model.halfX * Math.abs(c) + model.halfZ * Math.abs(s);
    const baseHalfZ = model.halfX * Math.abs(s) + model.halfZ * Math.abs(c);

    const ob: Obstacle = {
      center: new THREE.Vector3(sp.x, model.halfY, sp.z),
      halfX: baseHalfX,
      halfZ: baseHalfZ,
      halfY: model.halfY,
      visual: inst,
    };
    stampSceneryObstacle(ob, model, sp.kind, baseHalfX, baseHalfZ, colliderPresets);
    newObstacles.push(ob);
  }
  level.addObstacles(newObstacles);
}

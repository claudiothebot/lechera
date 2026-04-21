import * as THREE from 'three';
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
 * Shrink factor applied to the prop AABB when registering it as a
 * collider. Mesh bounds include decorative overhangs (cart handles, well
 * roof eaves, bits of hay sticking out) that feel unfair to collide
 * with: the player bumps thin air. 0.8 keeps the visual footprint
 * accurate but pulls the collision 20 % inwards — enough to make
 * collisions feel deliberate without letting the player clip through
 * the core of the prop.
 */
const PROP_COLLIDER_SHRINK = 0.8;

/**
 * Place authored scenery props (hay cart, well, haystack) at the
 * positions from the level definition and register each one as a solid
 * AABB obstacle so the player bumps into them like houses / trees.
 *
 * Yaw-rotated props use a conservative axis-aligned box computed from
 * the rotated footprint to avoid per-frame OBB math — same approach
 * used for the tweet billboards (`buildBillboardCollisionObstacles`).
 */
export async function loadLevelSceneryProps(level: Level): Promise<void> {
  const newObstacles: Obstacle[] = [];
  for (const sp of level.definition.sceneryProps) {
    const model = await getSceneryModel(sp.kind);
    const inst = model.instance();
    inst.position.set(sp.x, 0, sp.z);
    inst.rotation.y = sp.yaw;
    level.group.add(inst);

    const c = Math.cos(sp.yaw);
    const s = Math.sin(sp.yaw);
    const halfX = (model.halfX * Math.abs(c) + model.halfZ * Math.abs(s)) * PROP_COLLIDER_SHRINK;
    const halfZ = (model.halfX * Math.abs(s) + model.halfZ * Math.abs(c)) * PROP_COLLIDER_SHRINK;

    newObstacles.push({
      center: new THREE.Vector3(sp.x, model.halfY, sp.z),
      halfX,
      halfZ,
      halfY: model.halfY,
      visual: inst,
    });
  }
  level.addObstacles(newObstacles);
}

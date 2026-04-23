import type { Level, Obstacle, ObstacleColliderTuning } from './level';
import type { HouseVariantKind, SceneryPropKind, TreeVariantKind } from './levelDefinition';
import {
  HOUSE_VARIANT_KINDS,
  SCENERY_PROP_KINDS,
  TREE_VARIANT_KINDS,
} from './levelDefinition';
import type { HouseModel } from './houseModel';
import type { TreeModel } from './treeModel';
import type { BillboardModel } from './billboardModel';

const PRESETS_URL = '/colliders/collider-presets.json';

export const TWEET_BILLBOARD_PRESET_ID = 'tweet-billboard' as const;

export interface HouseColliderPreset {
  footprintScaleXZ: number;
  footprintScaleY: number;
}

export interface TreeColliderPreset {
  trunkRadiusScale: number;
}

export interface SceneryColliderPreset {
  footprintScaleXZ: number;
  footprintScaleY: number;
}

export interface BillboardColliderPreset {
  footprintScaleXZ: number;
  footprintScaleY: number;
}

export interface ColliderPresets {
  version: 1;
  houses: Record<HouseVariantKind, HouseColliderPreset>;
  trees: Record<TreeVariantKind, TreeColliderPreset>;
  sceneryProps: Record<SceneryPropKind, SceneryColliderPreset>;
  tweetBillboard: BillboardColliderPreset;
}

let cachedFetch: Promise<ColliderPresets> | null = null;

function houseDefaults(): ColliderPresets['houses'] {
  return Object.fromEntries(
    HOUSE_VARIANT_KINDS.map((k) => [k, { footprintScaleXZ: 1, footprintScaleY: 1 }]),
  ) as ColliderPresets['houses'];
}

function treeDefaults(): ColliderPresets['trees'] {
  return Object.fromEntries(
    TREE_VARIANT_KINDS.map((k) => [k, { trunkRadiusScale: 1 }]),
  ) as ColliderPresets['trees'];
}

function sceneryDefaults(): ColliderPresets['sceneryProps'] {
  return Object.fromEntries(
    SCENERY_PROP_KINDS.map((k) => [k, { footprintScaleXZ: 0.8, footprintScaleY: 1 }]),
  ) as ColliderPresets['sceneryProps'];
}

/** Built-in fallbacks; merged with `collider-presets.json` on load. */
export function getDefaultColliderPresets(): ColliderPresets {
  return {
    version: 1,
    houses: houseDefaults(),
    trees: treeDefaults(),
    sceneryProps: sceneryDefaults(),
    tweetBillboard: { footprintScaleXZ: 1, footprintScaleY: 1 },
  };
}

function clampNum(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function parseHouse(
  raw: unknown,
  defaults: ColliderPresets['houses'],
): ColliderPresets['houses'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Partial<ColliderPresets['houses']> = {};
  for (const k of HOUSE_VARIANT_KINDS) {
    const p = o[k];
    if (p && typeof p === 'object') {
      const q = p as Record<string, unknown>;
      out[k] = {
        footprintScaleXZ: clampNum(q.footprintScaleXZ, defaults[k]!.footprintScaleXZ),
        footprintScaleY: clampNum(q.footprintScaleY, defaults[k]!.footprintScaleY),
      };
    } else {
      out[k] = { ...defaults[k]! };
    }
  }
  return out as ColliderPresets['houses'];
}

function parseTree(
  raw: unknown,
  defaults: ColliderPresets['trees'],
): ColliderPresets['trees'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Partial<ColliderPresets['trees']> = {};
  for (const k of TREE_VARIANT_KINDS) {
    const p = o[k];
    if (p && typeof p === 'object') {
      const q = p as Record<string, unknown>;
      out[k] = {
        trunkRadiusScale: clampNum(q.trunkRadiusScale, defaults[k]!.trunkRadiusScale),
      };
    } else {
      out[k] = { ...defaults[k]! };
    }
  }
  return out as ColliderPresets['trees'];
}

function parseScenery(
  raw: unknown,
  defaults: ColliderPresets['sceneryProps'],
): ColliderPresets['sceneryProps'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Partial<ColliderPresets['sceneryProps']> = {};
  for (const k of SCENERY_PROP_KINDS) {
    const p = o[k];
    if (p && typeof p === 'object') {
      const q = p as Record<string, unknown>;
      out[k] = {
        footprintScaleXZ: clampNum(q.footprintScaleXZ, defaults[k]!.footprintScaleXZ),
        footprintScaleY: clampNum(q.footprintScaleY, defaults[k]!.footprintScaleY),
      };
    } else {
      out[k] = { ...defaults[k]! };
    }
  }
  return out as ColliderPresets['sceneryProps'];
}

function parseBillboard(
  raw: unknown,
  defaults: BillboardColliderPreset,
): BillboardColliderPreset {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    footprintScaleXZ: clampNum(p.footprintScaleXZ, defaults.footprintScaleXZ),
    footprintScaleY: clampNum(p.footprintScaleY, defaults.footprintScaleY),
  };
}

export function parseColliderPresetsJson(text: string): ColliderPresets {
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== 'object') return getDefaultColliderPresets();
  const o = data as Record<string, unknown>;
  if (o.version !== 1) {
    console.warn('[collider-presets] unknown version, using defaults+partial merge');
  }
  const d = getDefaultColliderPresets();
  return {
    version: 1,
    houses: parseHouse(o.houses, d.houses),
    trees: parseTree(o.trees, d.trees),
    sceneryProps: parseScenery(o.sceneryProps, d.sceneryProps),
    tweetBillboard: parseBillboard(o.tweetBillboard, d.tweetBillboard),
  };
}

export function serializeColliderPresets(p: ColliderPresets): string {
  return JSON.stringify(p, null, 2) + '\n';
}

export function cloneColliderPresets(p: ColliderPresets): ColliderPresets {
  return parseColliderPresetsJson(serializeColliderPresets(p));
}

export function fetchColliderPresets(): Promise<ColliderPresets> {
  if (!cachedFetch) {
    cachedFetch = (async () => {
      try {
        const res = await fetch(PRESETS_URL);
        if (!res.ok) throw new Error(String(res.status));
        return parseColliderPresetsJson(await res.text());
      } catch (err) {
        console.warn('[collider-presets] fetch failed, using built-in defaults', err);
        return getDefaultColliderPresets();
      }
    })();
  }
  return cachedFetch;
}

/** Clear cached fetch (e.g. editor saved new JSON, hot reload). */
export function clearColliderPresetsCache(): void {
  cachedFetch = null;
}

/**
 * Half-extents in world XZ of the axis-aligned box that encloses a
 * local-space horizontal rectangle (±localHalfX, ±localHalfZ) on the ground
 * after `rotation.y = yaw` (Three.js, radians).
 */
export function worldAabbHalfXzFromRotatedLocalRect(
  localHalfX: number,
  localHalfZ: number,
  yaw: number,
): { halfX: number; halfZ: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const corners: [number, number][] = [
    [localHalfX, localHalfZ],
    [localHalfX, -localHalfZ],
    [-localHalfX, localHalfZ],
    [-localHalfX, -localHalfZ],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    // Same R_y as Three.js: x' = x cos θ + z sin θ, z' = -x sin θ + z cos θ
    const wx = lx * c + lz * s;
    const wz = -lx * s + lz * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return {
    halfX: (maxX - minX) * 0.5,
    halfZ: (maxZ - minZ) * 0.5,
  };
}

function writeScaledFromTuning(ob: Obstacle, t: ObstacleColliderTuning, p: ColliderPresets) {
  if (t.category === 'tree') {
    const s = p.trees[t.variant as TreeVariantKind]?.trunkRadiusScale ?? 1;
    ob.halfX = t.baseHalfX * s;
    ob.halfZ = t.baseHalfZ * s;
    ob.halfY = t.baseHalfY;
    ob.houseFootprint2D = undefined;
  } else {
    let sXZ = 1;
    let sY = 1;
    if (t.category === 'house') {
      const e = p.houses[t.variant as HouseVariantKind];
      sXZ = e?.footprintScaleXZ ?? 1;
      sY = e?.footprintScaleY ?? 1;
    } else if (t.category === 'scenery') {
      const e = p.sceneryProps[t.variant as SceneryPropKind];
      sXZ = e?.footprintScaleXZ ?? 0.8;
      sY = e?.footprintScaleY ?? 1;
    } else {
      sXZ = p.tweetBillboard.footprintScaleXZ;
      sY = p.tweetBillboard.footprintScaleY;
    }
    if (t.category === 'house') {
      const lx = t.baseHalfX * sXZ;
      const lz = t.baseHalfZ * sXZ;
      const w = worldAabbHalfXzFromRotatedLocalRect(lx, lz, t.yaw ?? 0);
      ob.halfX = w.halfX;
      ob.halfZ = w.halfZ;
      ob.halfY = t.baseHalfY * sY;
      ob.center.y = ob.halfY;
      ob.houseFootprint2D = {
        localHalfX: lx,
        localHalfZ: lz,
        yaw: t.yaw ?? 0,
      };
    } else {
      ob.houseFootprint2D = undefined;
      ob.halfX = t.baseHalfX * sXZ;
      ob.halfZ = t.baseHalfZ * sXZ;
      ob.halfY = t.baseHalfY * sY;
      ob.center.y = ob.halfY;
    }
  }
}

export function reapplyAllColliderPresets(level: Level, presets: ColliderPresets): void {
  for (const ob of level.obstacles) {
    const t = ob.colliderTuning;
    if (!t) continue;
    writeScaledFromTuning(ob, t, presets);
  }
}

export function stampHouseObstacle(
  ob: Obstacle,
  model: HouseModel,
  variant: HouseVariantKind,
  presets: ColliderPresets,
  yaw: number,
): void {
  const t: ObstacleColliderTuning = {
    category: 'house',
    variant,
    baseHalfX: model.halfX,
    baseHalfZ: model.halfZ,
    baseHalfY: model.halfY,
    yaw,
  };
  ob.colliderTuning = t;
  writeScaledFromTuning(ob, t, presets);
}

export function stampSceneryObstacle(
  ob: Obstacle,
  model: TreeModel,
  kind: SceneryPropKind,
  baseHalfX: number,
  baseHalfZ: number,
  presets: ColliderPresets,
): void {
  const t: ObstacleColliderTuning = {
    category: 'scenery',
    variant: kind,
    baseHalfX,
    baseHalfZ,
    baseHalfY: model.halfY,
  };
  ob.colliderTuning = t;
  writeScaledFromTuning(ob, t, presets);
}

export function stampTreeTrunkObstacle(
  ob: Obstacle,
  model: TreeModel,
  variant: TreeVariantKind,
  trunkRadius: number,
  presets: ColliderPresets,
): void {
  const t: ObstacleColliderTuning = {
    category: 'tree',
    variant,
    baseHalfX: trunkRadius,
    baseHalfZ: trunkRadius,
    baseHalfY: model.halfY,
  };
  ob.colliderTuning = t;
  writeScaledFromTuning(ob, t, presets);
}

export function stampBillboardObstacle(
  ob: Obstacle,
  _model: BillboardModel,
  baseHalfX: number,
  baseHalfZ: number,
  baseHalfY: number,
  presets: ColliderPresets,
): void {
  const t: ObstacleColliderTuning = {
    category: 'billboard',
    variant: TWEET_BILLBOARD_PRESET_ID,
    baseHalfX,
    baseHalfZ,
    baseHalfY,
  };
  ob.colliderTuning = t;
  writeScaledFromTuning(ob, t, presets);
}

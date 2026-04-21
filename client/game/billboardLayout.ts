import * as THREE from 'three';
import type { Obstacle } from './level';
import type {
  BillboardPlacementDefinition,
  LevelDefinition,
  LevelPathDefinition,
} from './levelDefinition';
import type { Tweet } from './tweetCanvas';
import type { TweetBillboardPlacement } from './tweetBillboards';

/**
 * Billboards are now fully authored (explicit placements in the level
 * definition, edited via `levelEditor.ts`). This module exposes two
 * things:
 *  - `buildBillboardPlacements`: convert the stored placements into
 *    runtime `TweetBillboardPlacement`s consumable by `tweetBillboards.ts`.
 *  - `generateBillboardPlacements`: one-click seed used by the editor's
 *    "Auto-generate" action, so authors can start from a scatter and
 *    then tweak individual positions by hand. This is the only place
 *    where the old scatter logic still lives.
 */

function billboardHash01(i: number, salt: number, seedBase: number): number {
  const t = Math.sin(i * 12.9898 + salt * 78.233 + seedBase) * 43758.5453;
  return t - Math.floor(t);
}

function samplePathCentreline(
  path: LevelPathDefinition,
  spacingMetres: number,
): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    path.waypoints.map((wp) => new THREE.Vector3(wp.x, 0, wp.z)),
    false,
    'catmullrom',
    0.5,
  );
  const samples = Math.max(8, Math.round(curve.getLength() / spacingMetres));
  return curve
    .getSpacedPoints(samples)
    .map((p) => new THREE.Vector2(p.x, p.z));
}

/**
 * Convert authored `BillboardPlacementDefinition[]` + a tweets array
 * into `TweetBillboardPlacement[]` for `tweetBillboards.ts`.
 */
export function buildBillboardPlacements(
  definition: LevelDefinition,
  _obstacles: readonly Obstacle[],
  _goals: readonly { x: number; z: number }[],
  tweets: readonly Tweet[],
  _spawn: { x: number; z: number },
): TweetBillboardPlacement[] {
  const placements = definition.billboards;
  return placements.map((p, i) => {
    const tweetIdx = p.tweetIndex ?? i;
    const tweet = tweets[tweetIdx % tweets.length] ?? tweets[0];
    if (!tweet) {
      throw new Error('[billboards] no tweets available');
    }
    return {
      position: new THREE.Vector3(p.x, 0, p.z),
      facing: new THREE.Vector3(Math.cos(p.yaw), 0, Math.sin(p.yaw)),
      tweet,
    };
  });
}

/**
 * Default scatter options used by the editor's "Auto-generate" action.
 * Matches the old procedural layout constants that used to live in the
 * level definition, moved here as code since billboards are authored now.
 */
const AUTO_GENERATE_DEFAULTS = {
  count: 10,
  playArea: { minX: -30, maxX: 30, minZ: -36, maxZ: 22 },
  minSpacingM: 12,
  pathClearM: 4,
  spawnClearM: 6,
  goalClearM: 4,
  houseClearM: 6,
  spawnFacingMinDistM: 9,
  spawnFacingMaxDistM: 14,
};

function billboardSiteOk(
  x: number,
  z: number,
  placed: readonly THREE.Vector2[],
  pathSamples: readonly THREE.Vector2[],
  obstacles: readonly Obstacle[],
  goals: readonly { x: number; z: number }[],
  spawn: { x: number; z: number },
): boolean {
  const rules = AUTO_GENERATE_DEFAULTS;
  const pathClearSq = rules.pathClearM * rules.pathClearM;
  for (const s of pathSamples) {
    const dx = x - s.x;
    const dz = z - s.y;
    if (dx * dx + dz * dz < pathClearSq) return false;
  }

  const dxs = x - spawn.x;
  const dzs = z - spawn.z;
  if (dxs * dxs + dzs * dzs < rules.spawnClearM * rules.spawnClearM) return false;

  for (const g of goals) {
    const dx = x - g.x;
    const dz = z - g.z;
    if (dx * dx + dz * dz < rules.goalClearM * rules.goalClearM) return false;
  }

  for (const o of obstacles) {
    const dx = x - o.center.x;
    const dz = z - o.center.z;
    const minD =
      o.halfX > 2.5 || o.halfZ > 2.5 ? rules.houseClearM : Math.max(1.5, o.halfX * 2);
    if (dx * dx + dz * dz < minD * minD) return false;
  }

  const minSq = rules.minSpacingM * rules.minSpacingM;
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.y;
    if (dx * dx + dz * dz < minSq) return false;
  }
  return true;
}

/**
 * Deterministic scatter used by the editor's "Auto-generate" action.
 * Writes a full `BillboardPlacementDefinition[]` which the editor then
 * lets the author tweak by hand. Not used at gameplay runtime.
 */
export function generateBillboardPlacements(
  definition: LevelDefinition,
  obstacles: readonly Obstacle[],
  goals: readonly { x: number; z: number }[],
  tweets: readonly Tweet[],
  spawn: { x: number; z: number },
): BillboardPlacementDefinition[] {
  const rules = AUTO_GENERATE_DEFAULTS;
  const picks = tweets.slice(0, rules.count);
  const placed: THREE.Vector2[] = [];
  const out: BillboardPlacementDefinition[] = [];
  const pathSamples: THREE.Vector2[] = definition.pavedPaths.flatMap((pp) =>
    samplePathCentreline(pp, 1.2),
  );

  for (let i = 0; i < picks.length; i++) {
    let chosen: { x: number; z: number; yaw: number } | null = null;

    if (i === 0) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const seed = attempt * 113 + 7;
        const r0 = billboardHash01(seed, 0, rules.count);
        const r1 = billboardHash01(seed, 1, rules.count);
        const r2 = billboardHash01(seed, 2, rules.count);
        const dist =
          rules.spawnFacingMinDistM +
          r0 * (rules.spawnFacingMaxDistM - rules.spawnFacingMinDistM);
        const side = r1 < 0.5 ? -1 : 1;
        const offAxis = (0.27 + r2 * 0.6) * side;
        const angle = -Math.PI / 2 + offAxis;
        const x = spawn.x + Math.cos(angle) * dist;
        const z = spawn.z + Math.sin(angle) * dist;
        if (!billboardSiteOk(x, z, placed, pathSamples, obstacles, goals, spawn)) continue;
        const fx = spawn.x - x;
        const fz = spawn.z - z;
        const yaw = Math.atan2(fz, fx);
        chosen = { x, z, yaw };
        break;
      }
    } else {
      for (let attempt = 0; attempt < 200; attempt++) {
        const seed = i * 1009 + attempt * 89 + 31;
        const rx = billboardHash01(seed, 0, rules.count);
        const rz = billboardHash01(seed, 1, rules.count);
        const ry = billboardHash01(seed, 2, rules.count);
        const x =
          rules.playArea.minX + rx * (rules.playArea.maxX - rules.playArea.minX);
        const z =
          rules.playArea.minZ + rz * (rules.playArea.maxZ - rules.playArea.minZ);
        if (!billboardSiteOk(x, z, placed, pathSamples, obstacles, goals, spawn)) continue;
        chosen = { x, z, yaw: ry * Math.PI * 2 };
        break;
      }
    }

    if (!chosen) {
      const side = i % 2 === 0 ? -1 : 1;
      const yaw = billboardHash01(i, 99, rules.count) * Math.PI * 2;
      chosen = { x: side * 14, z: 16 - i * 7.5, yaw };
    }

    placed.push(new THREE.Vector2(chosen.x, chosen.z));
    out.push({
      x: chosen.x,
      z: chosen.z,
      yaw: chosen.yaw,
      tweetIndex: i,
    });
  }

  return out;
}

import * as THREE from 'three';
import type { Obstacle } from './level';
import type {
  BillboardPlacementDefinition,
  LevelDefinition,
  LevelPathDefinition,
} from './levelDefinition';
import type { Tweet } from './tweetCanvas';
import type { TweetBillboardPlacement } from './tweetBillboards';

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

function billboardSiteOk(
  x: number,
  z: number,
  placed: readonly THREE.Vector2[],
  pathSamples: readonly THREE.Vector2[],
  obstacles: readonly Obstacle[],
  goals: readonly { x: number; z: number }[],
  spawn: { x: number; z: number },
  definition: LevelDefinition,
): boolean {
  const rules = definition.billboards;
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

function buildManualPlacements(
  definition: LevelDefinition,
  tweets: readonly Tweet[],
): TweetBillboardPlacement[] {
  const placements = definition.billboards.placements;
  return placements.map((p, i) => ({
    position: new THREE.Vector3(p.x, 0, p.z),
    facing: new THREE.Vector3(Math.cos(p.yaw), 0, Math.sin(p.yaw)),
    tweet: tweets[p.tweetIndex ?? (i % tweets.length)] ?? tweets[i % tweets.length] ?? tweets[0]!,
  }));
}

export function buildBillboardPlacements(
  definition: LevelDefinition,
  obstacles: readonly Obstacle[],
  goals: readonly { x: number; z: number }[],
  tweets: readonly Tweet[],
  spawn: { x: number; z: number },
): TweetBillboardPlacement[] {
  if (definition.billboards.mode === 'manual') {
    return buildManualPlacements(definition, tweets);
  }

  const picks = tweets.slice(0, definition.billboards.count);
  const placed: THREE.Vector2[] = [];
  const out: TweetBillboardPlacement[] = [];
  const pathSamples: THREE.Vector2[] = [
    ...samplePathCentreline(definition.mainPath, 1.4),
    ...definition.pavedPaths.flatMap((pp) => samplePathCentreline(pp, 1.2)),
  ];

  for (let i = 0; i < picks.length; i++) {
    const tweet = picks[i]!;
    let chosen: { x: number; z: number; facing: THREE.Vector3 } | null = null;

    if (i === 0) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const seed = attempt * 113 + 7;
        const r0 = billboardHash01(seed, 0, definition.billboards.count);
        const r1 = billboardHash01(seed, 1, definition.billboards.count);
        const r2 = billboardHash01(seed, 2, definition.billboards.count);
        const dist =
          definition.billboards.spawnFacingMinDistM +
          r0 *
            (definition.billboards.spawnFacingMaxDistM -
              definition.billboards.spawnFacingMinDistM);
        const side = r1 < 0.5 ? -1 : 1;
        const offAxis = (0.27 + r2 * 0.6) * side;
        const angle = -Math.PI / 2 + offAxis;
        const x = spawn.x + Math.cos(angle) * dist;
        const z = spawn.z + Math.sin(angle) * dist;
        if (!billboardSiteOk(x, z, placed, pathSamples, obstacles, goals, spawn, definition)) {
          continue;
        }
        const fx = spawn.x - x;
        const fz = spawn.z - z;
        const flen = Math.hypot(fx, fz) || 1;
        chosen = {
          x,
          z,
          facing: new THREE.Vector3(fx / flen, 0, fz / flen),
        };
        break;
      }
    } else {
      for (let attempt = 0; attempt < 200; attempt++) {
        const seed = i * 1009 + attempt * 89 + 31;
        const rx = billboardHash01(seed, 0, definition.billboards.count);
        const rz = billboardHash01(seed, 1, definition.billboards.count);
        const ry = billboardHash01(seed, 2, definition.billboards.count);
        const x =
          definition.billboards.playArea.minX +
          rx * (definition.billboards.playArea.maxX - definition.billboards.playArea.minX);
        const z =
          definition.billboards.playArea.minZ +
          rz * (definition.billboards.playArea.maxZ - definition.billboards.playArea.minZ);
        if (!billboardSiteOk(x, z, placed, pathSamples, obstacles, goals, spawn, definition)) {
          continue;
        }
        const yaw = ry * Math.PI * 2;
        chosen = {
          x,
          z,
          facing: new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)),
        };
        break;
      }
    }

    if (!chosen) {
      const side = i % 2 === 0 ? -1 : 1;
      const yaw = billboardHash01(i, 99, definition.billboards.count) * Math.PI * 2;
      chosen = {
        x: side * 14,
        z: 16 - i * 7.5,
        facing: new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)),
      };
    }

    placed.push(new THREE.Vector2(chosen.x, chosen.z));
    out.push({
      position: new THREE.Vector3(chosen.x, 0, chosen.z),
      facing: chosen.facing,
      tweet,
    });
  }

  return out;
}

export function seedManualBillboardsFromProcedural(
  definition: LevelDefinition,
  obstacles: readonly Obstacle[],
  goals: readonly { x: number; z: number }[],
  tweets: readonly Tweet[],
  spawn: { x: number; z: number },
): BillboardPlacementDefinition[] {
  return buildBillboardPlacements(
    {
      ...definition,
      billboards: {
        ...definition.billboards,
        mode: 'procedural',
      },
    },
    obstacles,
    goals,
    tweets,
    spawn,
  ).map((placement, i) => ({
    x: placement.position.x,
    z: placement.position.z,
    yaw: Math.atan2(
      (placement.facing ?? new THREE.Vector3(1, 0, 0)).z,
      (placement.facing ?? new THREE.Vector3(1, 0, 0)).x,
    ),
    tweetIndex: i,
  }));
}

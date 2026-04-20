export interface LevelPoint {
  x: number;
  z: number;
}

export interface LevelBounds2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LevelPathDefinition {
  width: number;
  yLift?: number;
  waypoints: LevelPoint[];
}

export interface HouseSlotDefinition {
  x: number;
  z: number;
  yaw: number;
  halfX: number;
  halfZ: number;
  halfY: number;
}

export interface WorldBoundaryDefinition {
  centerX: number;
  centerZ: number;
  radius: number;
}

export interface TreeScatterDefinition {
  count: number;
  bounds: LevelBounds2;
  footprintM: number;
  minSpacingM: number;
  mainPathClearM: number;
  pavedPathClearM: number;
  spawnClearM: number;
  houseClearM: number;
  obstacleClearM: number;
}

export type BillboardMode = 'procedural' | 'manual';

export interface BillboardPlacementDefinition {
  x: number;
  z: number;
  yaw: number;
  tweetIndex?: number;
}

export interface BillboardScatterDefinition {
  mode: BillboardMode;
  count: number;
  placements: BillboardPlacementDefinition[];
  playArea: LevelBounds2;
  minSpacingM: number;
  pathClearM: number;
  spawnClearM: number;
  goalClearM: number;
  houseClearM: number;
  spawnFacingMinDistM: number;
  spawnFacingMaxDistM: number;
}

export interface LevelDefinition {
  version: 1;
  groundSize: number;
  mainPath: LevelPathDefinition;
  pavedPaths: LevelPathDefinition[];
  houseSlots: HouseSlotDefinition[];
  worldBoundary: WorldBoundaryDefinition;
  treeScatter: TreeScatterDefinition;
  billboards: BillboardScatterDefinition;
}

export const DEFAULT_LEVEL_DEFINITION: LevelDefinition = {
  version: 1,
  groundSize: 1200,
  mainPath: {
    width: 3.2,
    yLift: 0.01,
    waypoints: [
      { x: 0, z: 20 },
      { x: 1.0, z: 14 },
      { x: -0.5, z: 6 },
      { x: 1.5, z: 0 },
      { x: -0.5, z: -10 },
      { x: 0.5, z: -18 },
      { x: -1.0, z: -24 },
      { x: 0, z: -30 },
    ],
  },
  pavedPaths: [
    {
      width: 2.0,
      yLift: 0.04,
      waypoints: [
        { x: -7, z: 20 },
        { x: -3, z: 20 },
        { x: 3, z: 20 },
        { x: 7, z: 20 },
      ],
    },
    {
      width: 2.0,
      yLift: 0.04,
      waypoints: [
        { x: 1, z: 15 },
        { x: 6, z: 12 },
        { x: 14, z: 9 },
        { x: 22, z: 7 },
        { x: 30, z: 5.5 },
      ],
    },
    {
      width: 2.0,
      yLift: 0.04,
      waypoints: [
        { x: -1, z: 15 },
        { x: -6, z: 13 },
        { x: -14, z: 11 },
        { x: -24, z: 9 },
        { x: -32, z: 7.5 },
      ],
    },
  ],
  houseSlots: [
    { x: -34, z: 38, yaw: 0, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: 28, z: 32, yaw: Math.PI / 2, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: -38, z: 8, yaw: Math.PI, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: 36, z: 5, yaw: (3 * Math.PI) / 2, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: -40, z: -18, yaw: 0, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: 32, z: -38, yaw: Math.PI / 2, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: -18, z: -44, yaw: Math.PI, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: 40, z: -12, yaw: (3 * Math.PI) / 2, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
    { x: -12, z: -28, yaw: 0, halfX: 1.2, halfZ: 1.2, halfY: 1.0 },
  ],
  worldBoundary: {
    centerX: 0,
    centerZ: -5,
    radius: 55,
  },
  treeScatter: {
    count: 8,
    bounds: { minX: -34, maxX: 34, minZ: -42, maxZ: 26 },
    footprintM: 7.5,
    minSpacingM: 4.0,
    mainPathClearM: 3.5,
    pavedPathClearM: 2.5,
    spawnClearM: 4.5,
    houseClearM: 5.5,
    obstacleClearM: 4.5,
  },
  billboards: {
    mode: 'procedural',
    count: 10,
    placements: [],
    playArea: { minX: -30, maxX: 30, minZ: -36, maxZ: 22 },
    minSpacingM: 12,
    pathClearM: 4,
    spawnClearM: 6,
    goalClearM: 4,
    houseClearM: 6,
    spawnFacingMinDistM: 9,
    spawnFacingMaxDistM: 14,
  },
};

export function cloneLevelDefinition(definition: LevelDefinition): LevelDefinition {
  return JSON.parse(JSON.stringify(definition)) as LevelDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function point(value: unknown, fallback: LevelPoint): LevelPoint {
  if (!isRecord(value)) return { ...fallback };
  return {
    x: num(value.x, fallback.x),
    z: num(value.z, fallback.z),
  };
}

function bounds(value: unknown, fallback: LevelBounds2): LevelBounds2 {
  if (!isRecord(value)) return { ...fallback };
  return {
    minX: num(value.minX, fallback.minX),
    maxX: num(value.maxX, fallback.maxX),
    minZ: num(value.minZ, fallback.minZ),
    maxZ: num(value.maxZ, fallback.maxZ),
  };
}

function path(value: unknown, fallback: LevelPathDefinition): LevelPathDefinition {
  if (!isRecord(value)) {
    return {
      width: fallback.width,
      yLift: fallback.yLift,
      waypoints: fallback.waypoints.map((wp) => ({ ...wp })),
    };
  }
  const rawWaypoints = Array.isArray(value.waypoints) ? value.waypoints : fallback.waypoints;
  const waypoints = rawWaypoints.map((wp, i) => point(wp, fallback.waypoints[i] ?? fallback.waypoints.at(-1)!));
  return {
    width: Math.max(0.25, num(value.width, fallback.width)),
    yLift: num(value.yLift, fallback.yLift ?? 0.01),
    waypoints: waypoints.length >= 2 ? waypoints : fallback.waypoints.map((wp) => ({ ...wp })),
  };
}

function houseSlot(value: unknown, fallback: HouseSlotDefinition): HouseSlotDefinition {
  if (!isRecord(value)) return { ...fallback };
  return {
    x: num(value.x, fallback.x),
    z: num(value.z, fallback.z),
    yaw: num(value.yaw, fallback.yaw),
    halfX: Math.max(0.1, num(value.halfX, fallback.halfX)),
    halfZ: Math.max(0.1, num(value.halfZ, fallback.halfZ)),
    halfY: Math.max(0.1, num(value.halfY, fallback.halfY)),
  };
}

function billboardPlacement(
  value: unknown,
  fallback: BillboardPlacementDefinition,
): BillboardPlacementDefinition {
  if (!isRecord(value)) return { ...fallback };
  return {
    x: num(value.x, fallback.x),
    z: num(value.z, fallback.z),
    yaw: num(value.yaw, fallback.yaw),
    tweetIndex: Math.max(0, Math.round(num(value.tweetIndex, fallback.tweetIndex ?? 0))),
  };
}

export function normalizeLevelDefinition(value: unknown): LevelDefinition {
  const fallback = DEFAULT_LEVEL_DEFINITION;
  if (!isRecord(value)) return cloneLevelDefinition(fallback);

  const mainPath = path(value.mainPath, fallback.mainPath);
  const rawPaved = Array.isArray(value.pavedPaths) ? value.pavedPaths : fallback.pavedPaths;
  const pavedPaths = rawPaved.map((pp, i) => path(pp, fallback.pavedPaths[i] ?? fallback.pavedPaths.at(-1)!));

  const rawHouseSlots = Array.isArray(value.houseSlots) ? value.houseSlots : fallback.houseSlots;
  const houseSlots = rawHouseSlots.map((slot, i) =>
    houseSlot(slot, fallback.houseSlots[i] ?? fallback.houseSlots.at(-1)!),
  );

  const worldBoundary = isRecord(value.worldBoundary)
    ? {
        centerX: num(value.worldBoundary.centerX, fallback.worldBoundary.centerX),
        centerZ: num(value.worldBoundary.centerZ, fallback.worldBoundary.centerZ),
        radius: Math.max(1, num(value.worldBoundary.radius, fallback.worldBoundary.radius)),
      }
    : { ...fallback.worldBoundary };

  const treeScatter = isRecord(value.treeScatter)
    ? {
        count: Math.max(0, Math.round(num(value.treeScatter.count, fallback.treeScatter.count))),
        bounds: bounds(value.treeScatter.bounds, fallback.treeScatter.bounds),
        footprintM: Math.max(0.5, num(value.treeScatter.footprintM, fallback.treeScatter.footprintM)),
        minSpacingM: Math.max(0.1, num(value.treeScatter.minSpacingM, fallback.treeScatter.minSpacingM)),
        mainPathClearM: Math.max(
          0,
          num(value.treeScatter.mainPathClearM, fallback.treeScatter.mainPathClearM),
        ),
        pavedPathClearM: Math.max(
          0,
          num(value.treeScatter.pavedPathClearM, fallback.treeScatter.pavedPathClearM),
        ),
        spawnClearM: Math.max(0, num(value.treeScatter.spawnClearM, fallback.treeScatter.spawnClearM)),
        houseClearM: Math.max(0, num(value.treeScatter.houseClearM, fallback.treeScatter.houseClearM)),
        obstacleClearM: Math.max(
          0,
          num(value.treeScatter.obstacleClearM, fallback.treeScatter.obstacleClearM),
        ),
      }
    : { ...fallback.treeScatter, bounds: { ...fallback.treeScatter.bounds } };

  let billboards = cloneLevelDefinition(fallback).billboards;
  if (isRecord(value.billboards)) {
    const mode = value.billboards.mode === 'manual' ? 'manual' : 'procedural';
    const rawPlacements = Array.isArray(value.billboards.placements)
      ? value.billboards.placements
      : fallback.billboards.placements;
    billboards = {
      mode,
      count: Math.max(0, Math.round(num(value.billboards.count, fallback.billboards.count))),
      placements: rawPlacements.map((p, i) =>
        billboardPlacement(
          p,
          fallback.billboards.placements[i] ?? { x: 0, z: 0, yaw: 0, tweetIndex: i },
        ),
      ),
      playArea: bounds(value.billboards.playArea, fallback.billboards.playArea),
      minSpacingM: Math.max(0.1, num(value.billboards.minSpacingM, fallback.billboards.minSpacingM)),
      pathClearM: Math.max(0, num(value.billboards.pathClearM, fallback.billboards.pathClearM)),
      spawnClearM: Math.max(0, num(value.billboards.spawnClearM, fallback.billboards.spawnClearM)),
      goalClearM: Math.max(0, num(value.billboards.goalClearM, fallback.billboards.goalClearM)),
      houseClearM: Math.max(0, num(value.billboards.houseClearM, fallback.billboards.houseClearM)),
      spawnFacingMinDistM: Math.max(
        0,
        num(value.billboards.spawnFacingMinDistM, fallback.billboards.spawnFacingMinDistM),
      ),
      spawnFacingMaxDistM: Math.max(
        0,
        num(value.billboards.spawnFacingMaxDistM, fallback.billboards.spawnFacingMaxDistM),
      ),
    };
  }

  return {
    version: 1,
    groundSize: Math.max(10, num(value.groundSize, fallback.groundSize)),
    mainPath,
    pavedPaths,
    houseSlots,
    worldBoundary,
    treeScatter,
    billboards,
  };
}

export function levelDefinitionToJson(definition: LevelDefinition): string {
  return JSON.stringify(definition, null, 2);
}

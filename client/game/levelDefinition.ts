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

/** Canonical house variants. Kept as a string union here (and not imported
 * from `houseModel.ts`) so this file remains dependency-free and can be
 * consumed by the server / shared code without pulling three. The canonical
 * list + URLs + labels live in `houseModel.ts`. */
export type HouseVariantKind = 'iberian-village' | 'rustic-spanish' | 'dairy-shed';

export const HOUSE_VARIANT_KINDS: readonly HouseVariantKind[] = [
  'iberian-village',
  'rustic-spanish',
  'dairy-shed',
];

export interface HouseSlotDefinition {
  x: number;
  z: number;
  yaw: number;
  halfX: number;
  halfZ: number;
  halfY: number;
  /** Which GLB to instantiate for this slot. Optional for forward-compat:
   * older JSON files without the field fall back to a round-robin-by-index
   * default so visuals don't regress until the level is resaved. */
  variant?: HouseVariantKind;
}

export interface WorldBoundaryDefinition {
  centerX: number;
  centerZ: number;
  radius: number;
}

/** Canonical tree variants. Each maps to an optimised GLB in `/models/`. */
export type TreeVariantKind = 'olive' | 'poplar' | 'poplar-alt';

export const TREE_VARIANT_KINDS: readonly TreeVariantKind[] = [
  'olive',
  'poplar',
  'poplar-alt',
];

export interface TreePlacementDefinition {
  x: number;
  z: number;
  yaw: number;
  variant: TreeVariantKind;
}

export type SceneryPropKind = 'haystack' | 'cart' | 'well';

export const SCENERY_PROP_KINDS: readonly SceneryPropKind[] = [
  'haystack',
  'cart',
  'well',
];

export interface SceneryPropDefinition {
  kind: SceneryPropKind;
  x: number;
  z: number;
  yaw: number;
}

export interface BillboardPlacementDefinition {
  x: number;
  z: number;
  yaw: number;
  /** Index into the tweets array supplied at runtime. Wraps with modulo if OOB. */
  tweetIndex?: number;
}

export interface LevelDefinition {
  version: 1;
  groundSize: number;
  pavedPaths: LevelPathDefinition[];
  houseSlots: HouseSlotDefinition[];
  worldBoundary: WorldBoundaryDefinition;
  /** Explicit tree placements (edited in the level editor). */
  trees: TreePlacementDefinition[];
  /** Explicit tweet-billboard placements (edited in the level editor). */
  billboards: BillboardPlacementDefinition[];
  /** Decorative props; now also registered as collision obstacles at runtime. */
  sceneryProps: SceneryPropDefinition[];
}

export const DEFAULT_LEVEL_DEFINITION: LevelDefinition = {
  version: 1,
  groundSize: 1200,
  pavedPaths: [
    {
      width: 1.5,
      yLift: 0.04,
      waypoints: [
        { x: -23, z: 5 },
        { x: -20, z: 3 },
        { x: -17, z: 1 },
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
  trees: [
    { x: -22, z: 22, yaw: 0.0, variant: 'olive' },
    { x: 18, z: 18, yaw: 1.1, variant: 'poplar' },
    { x: -6, z: -32, yaw: 2.3, variant: 'poplar-alt' },
    { x: 22, z: -22, yaw: 0.7, variant: 'olive' },
  ],
  billboards: [
    { x: 10, z: -4, yaw: 2.6, tweetIndex: 0 },
    { x: -10, z: -4, yaw: 0.5, tweetIndex: 1 },
    { x: 20, z: 14, yaw: 2.2, tweetIndex: 2 },
    { x: -20, z: 14, yaw: 0.9, tweetIndex: 3 },
    { x: 24, z: -24, yaw: 2.8, tweetIndex: 4 },
    { x: -24, z: -24, yaw: 0.3, tweetIndex: 5 },
    { x: 4, z: -28, yaw: Math.PI / 2, tweetIndex: 6 },
    { x: -4, z: -28, yaw: -Math.PI / 2, tweetIndex: 7 },
    { x: 14, z: 4, yaw: Math.PI, tweetIndex: 8 },
    { x: -14, z: 4, yaw: 0, tweetIndex: 9 },
  ],
  sceneryProps: [
    { kind: 'haystack', x: -18, z: -16, yaw: 0.35 },
    { kind: 'cart', x: 24, z: -8, yaw: -1.0 },
    { kind: 'well', x: -30, z: 3, yaw: 0.55 },
  ],
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
  const waypoints = rawWaypoints.map((wp, i) =>
    point(wp, fallback.waypoints[i] ?? fallback.waypoints.at(-1)!),
  );
  return {
    width: Math.max(0.25, num(value.width, fallback.width)),
    yLift: num(value.yLift, fallback.yLift ?? 0.01),
    waypoints: waypoints.length >= 2 ? waypoints : fallback.waypoints.map((wp) => ({ ...wp })),
  };
}

function houseSlot(value: unknown, fallback: HouseSlotDefinition): HouseSlotDefinition {
  if (!isRecord(value)) return { ...fallback };
  const rawVariant = value.variant;
  const variant = HOUSE_VARIANT_KINDS.includes(rawVariant as HouseVariantKind)
    ? (rawVariant as HouseVariantKind)
    : fallback.variant;
  const slot: HouseSlotDefinition = {
    x: num(value.x, fallback.x),
    z: num(value.z, fallback.z),
    yaw: num(value.yaw, fallback.yaw),
    halfX: Math.max(0.1, num(value.halfX, fallback.halfX)),
    halfZ: Math.max(0.1, num(value.halfZ, fallback.halfZ)),
    halfY: Math.max(0.1, num(value.halfY, fallback.halfY)),
  };
  if (variant) slot.variant = variant;
  return slot;
}

/** Pick a house variant for a given slot, falling back to a round-robin by
 * index when the slot doesn't have one explicitly (legacy JSON). */
export function resolveHouseVariant(
  slot: HouseSlotDefinition | undefined,
  index: number,
): HouseVariantKind {
  if (slot?.variant && HOUSE_VARIANT_KINDS.includes(slot.variant)) return slot.variant;
  return HOUSE_VARIANT_KINDS[index % HOUSE_VARIANT_KINDS.length]!;
}

function treePlacement(
  value: unknown,
  fallback: TreePlacementDefinition,
): TreePlacementDefinition {
  if (!isRecord(value)) return { ...fallback };
  const rawVariant = value.variant;
  const variant = TREE_VARIANT_KINDS.includes(rawVariant as TreeVariantKind)
    ? (rawVariant as TreeVariantKind)
    : fallback.variant;
  return {
    x: num(value.x, fallback.x),
    z: num(value.z, fallback.z),
    yaw: num(value.yaw, fallback.yaw),
    variant,
  };
}

function sceneryProp(value: unknown, fallback: SceneryPropDefinition): SceneryPropDefinition {
  if (!isRecord(value)) return { ...fallback };
  const rawKind = value.kind;
  const kind = SCENERY_PROP_KINDS.includes(rawKind as SceneryPropKind)
    ? (rawKind as SceneryPropKind)
    : fallback.kind;
  return {
    kind,
    x: num(value.x, fallback.x),
    z: num(value.z, fallback.z),
    yaw: num(value.yaw, fallback.yaw),
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

/** Fallback used when an incoming JSON omits a variant on a legacy tree entry. */
function variantForIndex(i: number): TreeVariantKind {
  return TREE_VARIANT_KINDS[i % TREE_VARIANT_KINDS.length]!;
}

export function normalizeLevelDefinition(value: unknown): LevelDefinition {
  const fallback = DEFAULT_LEVEL_DEFINITION;
  if (!isRecord(value)) return cloneLevelDefinition(fallback);

  const rawPaved = Array.isArray(value.pavedPaths) ? value.pavedPaths : fallback.pavedPaths;
  const pavedPaths = rawPaved.map((pp, i) =>
    path(pp, fallback.pavedPaths[i] ?? fallback.pavedPaths.at(-1)!),
  );

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

  // Trees: accept the new explicit list, or legacy `treeScatter` (ignored
  // positionally — we just keep the fallback layout) so old JSON files
  // still load without crashing.
  let trees: TreePlacementDefinition[];
  if (Array.isArray(value.trees)) {
    trees = value.trees.map((t, i) =>
      treePlacement(t, {
        ...(fallback.trees[i] ?? {
          x: 0,
          z: 0,
          yaw: 0,
          variant: variantForIndex(i),
        }),
      }),
    );
  } else {
    trees = fallback.trees.map((t) => ({ ...t }));
  }

  // Billboards: accept the new flat array shape OR the legacy
  // `{ mode, placements, ... }` shape (in which case we just take the
  // `placements` array, regardless of mode). Old `procedural` data is
  // dropped — the editor is the source of truth now.
  let billboards: BillboardPlacementDefinition[];
  if (Array.isArray(value.billboards)) {
    billboards = value.billboards.map((b, i) =>
      billboardPlacement(b, fallback.billboards[i] ?? { x: 0, z: 0, yaw: 0, tweetIndex: i }),
    );
  } else if (
    isRecord(value.billboards) &&
    Array.isArray((value.billboards as { placements?: unknown }).placements)
  ) {
    const legacyPlacements = (value.billboards as { placements: unknown[] }).placements;
    billboards = legacyPlacements.map((b, i) =>
      billboardPlacement(b, fallback.billboards[i] ?? { x: 0, z: 0, yaw: 0, tweetIndex: i }),
    );
  } else {
    billboards = fallback.billboards.map((b) => ({ ...b }));
  }

  const rawScenery = Array.isArray(value.sceneryProps) ? value.sceneryProps : fallback.sceneryProps;
  const sceneryProps = rawScenery.map((sp, i) =>
    sceneryProp(sp, fallback.sceneryProps[i] ?? fallback.sceneryProps.at(-1)!),
  );

  return {
    version: 1,
    groundSize: Math.max(10, num(value.groundSize, fallback.groundSize)),
    pavedPaths,
    houseSlots,
    worldBoundary,
    trees,
    billboards,
    sceneryProps,
  };
}

export function levelDefinitionToJson(definition: LevelDefinition): string {
  return JSON.stringify(definition, null, 2);
}

// --- Re-exports of legacy names that older imports might still use. ---
// Intentionally empty: `TreeScatterDefinition`, `BillboardScatterDefinition`,
// `BillboardMode` and `BillboardPlacementDefinition`-from-scatter were
// removed. Any stragglers should now import `TreePlacementDefinition` /
// `BillboardPlacementDefinition` directly.

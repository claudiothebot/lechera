import * as THREE from 'three';
import {
  GOAL_RADIUS,
  SPAWN_X,
  SPAWN_Z,
  goalFor,
} from '@milk-dreams/shared';
import { loadPbrMaterial } from '../render/textures';
import { loadHouseModel } from './houseModel';
import {
  DEFAULT_LEVEL_DEFINITION,
  type HouseSlotDefinition,
  type LevelDefinition,
  type LevelPathDefinition,
} from './levelDefinition';
import { loadTreeModel } from './treeModel';

export interface Level {
  definition: LevelDefinition;
  group: THREE.Group;
  spawn: THREE.Vector3;
  /** Current goal. Mutated in place by `setGoalPosition`. */
  goal: THREE.Vector3;
  goalRadius: number;
  obstacles: readonly Obstacle[];
  /** Original house placeholders only; stable across later tree/billboard additions. */
  houseObstacles: readonly Obstacle[];
  /** Big horizontal plane (grass). Exposed so we can swap its material async. */
  ground: THREE.Mesh;
  /** Curved ribbon from spawn → goal (dirt path). */
  path: PathMesh;
  /**
   * Optional decorative paving-stone paths branching off the main dirt
   * path. Purely visual (no collision); we keep the meshes here so
   * `loadLevelTextures` can swap their placeholder material for the
   * shared paving-stones PBR set in one place.
   */
  pavedPaths: readonly PathMesh[];
  /**
   * Empty scene node that always sits at the current goal position. The
   * main loop parents the "reward animal" (eggs, chicken, etc.) under it
   * so it moves with the goal for free on dream transitions.
   */
  goalAnchor: THREE.Group;
  /**
   * Move the goal to a new XZ position. Updates both the goal vector and
   * the visible ring marker (and the goalAnchor) without rebuilding the
   * level.
   */
  setGoalPosition(position: THREE.Vector3): void;
  /**
   * Append collision volumes (e.g. tweet billboards loaded after `createLevel`).
   * Player + minimap see them on the next frame; `visual` may be an empty
   * group if there is no extra mesh to show.
   */
  addObstacles(extra: readonly Obstacle[]): void;
}

export interface PathMesh {
  mesh: THREE.Mesh;
  /** Total arc length of the path in metres (for texture tiling). */
  length: number;
  /** Path width in metres (for texture tiling). */
  width: number;
}

export interface Obstacle {
  /** World-space center on XZ plane. Y is center of the box. */
  center: THREE.Vector3;
  /** Half extents on XZ (box is axis-aligned for v0). */
  halfX: number;
  halfZ: number;
  /** Half height for visual only (collision is 2D on XZ). */
  halfY: number;
  /**
   * Optional world-space horizontal velocity (m/s). Defaults to 0
   * (static obstacle). Used by the player collision to compute the
   * RELATIVE velocity at impact so a moving obstacle (e.g. a remote
   * player ramming into us) produces a jug bump even when we're
   * standing still — symmetric "I bumped you / you bumped me"
   * behaviour without any extra round-trip.
   */
  velocityX?: number;
  velocityZ?: number;
  /**
   * Visual mesh/group parented under `level.group`. Starts as a
   * placeholder box; `loadLevelHouses` swaps it for a house model
   * once the GLB resolves.
   */
  visual: THREE.Object3D;
}

/**
 * Defaults re-exported for gameplay modules that still use the shipped
 * authored layout. The editor can load alternative definitions, but the
 * runtime player clamp continues to use the canonical default layout
 * until spawn/goal/boundary authoring is made multiplayer-aware.
 */
export const WORLD_BOUNDARY_CENTER = new THREE.Vector2(
  DEFAULT_LEVEL_DEFINITION.worldBoundary.centerX,
  DEFAULT_LEVEL_DEFINITION.worldBoundary.centerZ,
);
export const WORLD_BOUNDARY_RADIUS_M = DEFAULT_LEVEL_DEFINITION.worldBoundary.radius;

/** How many texture repeats per metre. Grass is coarse; dirt slightly tighter. */
const GRASS_TILES_PER_METRE = 0.2;
const PATH_TILES_PER_METRE = 0.35;
/**
 * Paving stones: physical tile is ~1.25 m × 2.5 m on the ambientCG
 * scan. We tighten the repeat a touch (0.6 tiles/m) so individual
 * cobbles read at a believable size when the player walks past.
 */
const PAVING_TILES_PER_METRE = 0.6;

function tupleWaypoints(path: LevelPathDefinition): ReadonlyArray<readonly [number, number]> {
  return path.waypoints.map((wp) => [wp.x, wp.z] as const);
}

/** Tiny soft dot for Points billboards — keeps glow very subtle vs harsh squares. */
function createSparkleDotTexture(): THREE.CanvasTexture {
  const s = 48;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.48);
  g.addColorStop(0, 'rgba(255, 248, 230, 0.95)');
  g.addColorStop(0.25, 'rgba(255, 240, 210, 0.35)');
  g.addColorStop(1, 'rgba(255, 240, 210, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStaticRingSparkles(
  ringR: number,
  count: number,
  color: number,
  dotTex: THREE.Texture,
  opts: { maxY: number; opacity: number; size: number },
): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 3) * 0.11;
    positions[i * 3] = Math.cos(a) * ringR;
    positions[i * 3 + 1] = (((i * 0.6180339887) % 1) * 0.85 + 0.05) * opts.maxY;
    positions[i * 3 + 2] = Math.sin(a) * ringR;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: dotTex,
    color,
    size: opts.size,
    sizeAttenuation: true,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pts = new THREE.Points(geom, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  pts.userData.disposeManaged = true;
  return pts;
}

export function createLevel(definition: LevelDefinition = DEFAULT_LEVEL_DEFINITION): Level {
  const group = new THREE.Group();
  group.name = 'level';

  // Placeholder grass colour until the PBR material loads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(definition.groundSize, definition.groundSize),
    new THREE.MeshStandardMaterial({
      color: 0x4a5a3a,
      roughness: 0.95,
      metalness: 0.0,
      name: 'ground-placeholder',
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  ground.userData.disposeManaged = true;
  group.add(ground);

  const path = buildCurvedPath(
    tupleWaypoints(definition.mainPath),
    definition.mainPath.width,
    definition.mainPath.yLift ?? 0.01,
  );
  group.add(path.mesh);

  const pavedPaths: PathMesh[] = definition.pavedPaths.map((pp) =>
    buildCurvedPath(tupleWaypoints(pp), pp.width, pp.yLift ?? 0.04),
  );
  for (const pp of pavedPaths) group.add(pp.mesh);

  const spawn = new THREE.Vector3(SPAWN_X, 0, SPAWN_Z);
  const goal0 = goalFor(0);
  const goal = new THREE.Vector3(goal0.x, 0, goal0.z);
  const goalRadius = GOAL_RADIUS;

  // Goal marker: just a ring (no filled disc), matching the style of the
  // spawn circle. An optional "reward animal" gets parented under
  // `goalAnchor` by main.ts — it's what really tells the player where to
  // go, the ring is a subtle "step onto here" affordance.
  /** Inner / outer radii: keep the band narrow (~half the old 12% width). */
  const goalRingInner = goalRadius * 0.955;
  const goalRingOuter = goalRadius;
  const goalRing = new THREE.Mesh(
    new THREE.RingGeometry(goalRingInner, goalRingOuter, 48),
    new THREE.MeshBasicMaterial({
      color: 0xf1d28d,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  goalRing.rotation.x = -Math.PI / 2;
  goalRing.position.copy(goal).setY(0.05);
  goalRing.name = 'goal-ring';
  goalRing.userData.disposeManaged = true;
  group.add(goalRing);

  const dotTex = createSparkleDotTexture();
  const goalRingR = (goalRingInner + goalRingOuter) * 0.5;
  const goalSparkles = createStaticRingSparkles(
    goalRingR,
    18,
    0xfff3dd,
    dotTex,
    { maxY: 0.38, opacity: 0.2, size: 2.1 },
  );
  goalSparkles.name = 'goal-sparkles';

  const goalSparkGroup = new THREE.Group();
  goalSparkGroup.name = 'goal-spark-group';
  goalSparkGroup.position.copy(goal).setY(0.04);
  goalSparkGroup.add(goalSparkles);
  group.add(goalSparkGroup);

  const goalAnchor = new THREE.Group();
  goalAnchor.name = 'goal-anchor';
  goalAnchor.position.copy(goal).setY(0);
  group.add(goalAnchor);

  function setGoalPosition(position: THREE.Vector3) {
    goal.copy(position).setY(0);
    goalRing.position.set(position.x, 0.05, position.z);
    goalSparkGroup.position.set(position.x, 0.04, position.z);
    goalAnchor.position.set(position.x, 0, position.z);
  }

  // Houses scattered across the grass plane (not hugging the path) so the
  // world reads as open countryside with occasional buildings. Positions
  // stay |x| ≫ path width and clear `DREAM_GOALS` in progression.ts once
  // `loadLevelHouses` applies the real ~7m footprint. Placeholder halfX/halfZ
  // are only used until then.
  const houseObstacles: Obstacle[] = definition.houseSlots.map((slot) =>
    makeBox(
      group,
      new THREE.Vector3(slot.x, 0, slot.z),
      slot.halfX,
      slot.halfZ,
      slot.halfY,
    ),
  );
  const obstacles: Obstacle[] = [...houseObstacles];

  // The painted disc on the ground has to be big enough to comfortably
  // hold ~10 lecheras at spawn time without them piling up on top of
  // each other. Single-player only ever has one occupant so this used
  // to be a thin 1.4 m ring (cosmetic only). Phase 6b made the server
  // pick a random spawn inside this disc, so the visual now defines
  // the area budget too: with 10 players × π·PLAYER_RADIUS² ≈ 6.4 m²
  // of footprint, a 3 m radius disc (~28 m²) gives ~22 % density —
  // tight but never an actual pile-up. The Phase 6d player-player
  // collision pushes any residual overlaps apart on the next frame.
  // Keep the visual style minimal (thin ring, low opacity) so the
  // larger marker doesn't dominate the meadow.
  const spawnRingInner = 2.94;
  const spawnRingOuter = 3.0;
  const spawnMarker = new THREE.Mesh(
    new THREE.RingGeometry(spawnRingInner, spawnRingOuter, 64),
    new THREE.MeshBasicMaterial({
      color: 0x7f8cff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  spawnMarker.rotation.x = -Math.PI / 2;
  spawnMarker.position.copy(spawn).setY(0.04);
  spawnMarker.userData.disposeManaged = true;
  group.add(spawnMarker);

  const spawnRingMid = (spawnRingInner + spawnRingOuter) * 0.5 * 0.92;
  const spawnSparkles = createStaticRingSparkles(
    spawnRingMid,
    14,
    0xc8d8ff,
    dotTex,
    { maxY: 0.32, opacity: 0.18, size: 2.0 },
  );
  spawnSparkles.name = 'spawn-sparkles';
  const spawnSparkGroup = new THREE.Group();
  spawnSparkGroup.name = 'spawn-spark-group';
  spawnSparkGroup.position.copy(spawn).setY(0.035);
  spawnSparkGroup.add(spawnSparkles);
  group.add(spawnSparkGroup);

  function addObstacles(extra: readonly Obstacle[]) {
    for (const o of extra) {
      obstacles.push(o);
    }
  }

  return {
    definition,
    group,
    spawn,
    goal,
    goalRadius,
    obstacles,
    houseObstacles,
    ground,
    path,
    pavedPaths,
    goalAnchor,
    setGoalPosition,
    addObstacles,
  };
}

/**
 * Load grass + dirt PBR materials and swap them into the level.
 * Kicked off from main.ts after `createLevel()`; gameplay runs with placeholder
 * colours until this resolves.
 */
export async function loadLevelTextures(
  level: Level,
  renderer: THREE.WebGLRenderer,
): Promise<void> {
  const [grass, dirt, paving] = await Promise.all([
    // Grass: we intentionally skip the roughness map. Grass003's roughness
    // map has bright (shiny) pockets that, under the HDRI sun, read as
    // "wet" / liquid spots — completely wrong for a matte meadow. Flat
    // roughness = 1.0 keeps the lighting purely diffuse, and the normal
    // map still provides the grass surface detail.
    loadPbrMaterial(
      renderer,
      {
        color: '/textures/grass003/Grass003_1K-JPG_Color.jpg',
        normal: '/textures/grass003/Grass003_1K-JPG_NormalGL.jpg',
      },
      {
        tilesPerMetre: GRASS_TILES_PER_METRE,
        normalScale: 0.8,
        roughness: 1.0,
        name: 'grass',
      },
    ),
    loadPbrMaterial(
      renderer,
      {
        color: '/textures/ground037/Ground037_1K-JPG_Color.jpg',
        normal: '/textures/ground037/Ground037_1K-JPG_NormalGL.jpg',
        roughness: '/textures/ground037/Ground037_1K-JPG_Roughness.jpg',
      },
      {
        tilesPerMetre: PATH_TILES_PER_METRE,
        normalScale: 0.7,
        name: 'dirt-path',
      },
    ),
    loadPbrMaterial(
      renderer,
      {
        color: '/textures/pavingstones138/PavingStones138_2K-JPG_Color.jpg',
        normal: '/textures/pavingstones138/PavingStones138_2K-JPG_NormalGL.jpg',
        roughness: '/textures/pavingstones138/PavingStones138_2K-JPG_Roughness.jpg',
      },
      {
        tilesPerMetre: PAVING_TILES_PER_METRE,
        normalScale: 0.9,
        name: 'paving-stones',
      },
    ),
  ]);

  grass.setPlaneSize(level.definition.groundSize, level.definition.groundSize);
  const oldGround = level.ground.material as THREE.Material;
  level.ground.material = grass.material;
  oldGround.dispose();

  // Path UVs are normalised 0..1 across width and 0..1 along length, so
  // we pass the real dimensions here to drive the texture repeat.
  dirt.setPlaneSize(level.path.width, level.path.length);
  // Match the placeholder's polygon offset (see `buildCurvedPath`) so
  // the textured dirt also wins the z-test against the grass plane.
  dirt.material.polygonOffset = true;
  dirt.material.polygonOffsetFactor = -2;
  dirt.material.polygonOffsetUnits = -2;
  const oldPath = level.path.mesh.material as THREE.Material;
  level.path.mesh.material = dirt.material;
  oldPath.dispose();

  // Each paving spur has its own length, so it gets its own material
  // instance with cloned textures — Texture#clone shares the GPU
  // image and only duplicates the per-instance transform (`repeat`,
  // `offset`, etc.), so this is essentially free. Polygon offset
  // gives the stones a tiny depth-buffer bias toward the camera so
  // they reliably win the z-test against the grass plane on any GPU.
  for (const pp of level.pavedPaths) {
    const mat = paving.material.clone();
    if (paving.material.map) mat.map = paving.material.map.clone();
    if (paving.material.normalMap) mat.normalMap = paving.material.normalMap.clone();
    if (paving.material.roughnessMap)
      mat.roughnessMap = paving.material.roughnessMap.clone();

    const repeatU = PAVING_TILES_PER_METRE * pp.width;
    const repeatV = PAVING_TILES_PER_METRE * pp.length;
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap]) {
      if (!tex) continue;
      tex.repeat.set(repeatU, repeatV);
      tex.needsUpdate = true;
    }

    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;

    const oldPp = pp.mesh.material as THREE.Material;
    pp.mesh.material = mat;
    oldPp.dispose();
  }
}

function makeBox(
  parent: THREE.Group,
  center: THREE.Vector3,
  halfX: number,
  halfZ: number,
  halfY: number,
): Obstacle {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfX * 2, halfY * 2, halfZ * 2),
    new THREE.MeshStandardMaterial({
      color: 0x3a3a4a,
      roughness: 0.85,
    }),
  );
  mesh.position.copy(center).setY(halfY);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.disposeManaged = true;
  parent.add(mesh);
  return {
    center: center.clone().setY(halfY),
    halfX,
    halfZ,
    halfY,
    visual: mesh,
  };
}

/**
 * URLs of every house variant we ship. The first entry is the original
 * thatched house (kept for backwards compat); the rest are the Apr-2026
 * Meshy-AI batch added for visual variety. Slots are assigned a variant
 * by `slot index % HOUSE_VARIANT_URLS.length` so the village reads as a
 * mix of building styles instead of a copy-paste.
 */
const HOUSE_VARIANT_URLS: readonly string[] = [
  '/models/house-opt.glb',
  '/models/house-2-opt.glb',
  '/models/house-3-opt.glb',
  '/models/house-4-opt.glb',
  '/models/house-tank-opt.glb',
];

/**
 * Swap each placeholder obstacle box for one of the loaded house variants
 * (round-robin by index), rotated by a different multiple of 90° for a
 * bit more variety. Collision AABBs (`halfX`, `halfZ`, `halfY`) and the
 * box-centre Y are updated from the chosen variant's footprint so the
 * player can't walk through walls of *any* of the houses.
 *
 * Runs async: gameplay starts on the placeholder boxes and upgrades
 * seamlessly once the GLBs resolve. Variants load in parallel so the
 * upgrade is a single pop, not a staggered cascade.
 */
export async function loadLevelHouses(level: Level): Promise<void> {
  const houses = await Promise.all(HOUSE_VARIANT_URLS.map((u) => loadHouseModel(u)));

  for (let i = 0; i < level.houseObstacles.length; i++) {
    const obstacle = level.houseObstacles[i];
    if (!obstacle) continue;

    const variant = houses[i % houses.length]!;
    const slot = level.definition.houseSlots[i];
    const instance = variant.instance();
    instance.position.set(obstacle.center.x, 0, obstacle.center.z);
    instance.rotation.y = slot?.yaw ?? 0;
    level.group.add(instance);

    const old = obstacle.visual as THREE.Mesh;
    level.group.remove(old);
    old.geometry?.dispose();
    const mat = old.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();

    obstacle.visual = instance;
    obstacle.halfX = variant.halfX;
    obstacle.halfZ = variant.halfZ;
    obstacle.halfY = variant.halfY;
    obstacle.center.y = variant.halfY;
  }
}

/**
 * Detailed tree variants used as standalone scatter inside the play
 * area. ~250 k triangles each — fine for a handful of close-up
 * instances; we deliberately don't have a "backdrop ring" anymore, so
 * the trees the player sees are always these detailed ones.
 */
const TREE_DETAILED_URLS: readonly string[] = [
  '/models/tree-1-opt.glb',
  '/models/tree-2-opt.glb',
];

/** Deterministic 0..1 pseudo-noise so scatter is irregular but stable. */
function treeHash01(i: number, salt: number): number {
  const t = Math.sin(i * 91.7517 + salt * 27.481 + 13.0) * 17317.5453;
  return t - Math.floor(t);
}

/**
 * Sample the centreline of a paving-path waypoint set into evenly-spaced
 * XZ points so we can quickly reject tree candidates that would sit on
 * the stones. We reuse the same Catmull-Rom curve `buildCurvedPath`
 * uses, so the sampled centre is exactly the visual centre.
 */
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
 * Reject a candidate tree centre that would block any path, sit on top
 * of the spawn / a goal / a house / an existing obstacle, or crowd
 * another tree.
 */
function treeSiteOk(
  x: number,
  z: number,
  placed: readonly THREE.Vector2[],
  obstacles: readonly Obstacle[],
  goalCenters: readonly { x: number; z: number }[],
  mainPathSamples: readonly THREE.Vector2[],
  pavedPathSamples: readonly THREE.Vector2[],
  spawn: THREE.Vector3,
  minSpacingSq: number,
  definition: LevelDefinition,
): boolean {
  const rules = definition.treeScatter;
  const mainPathClearSq = rules.mainPathClearM * rules.mainPathClearM;
  for (const s of mainPathSamples) {
    const dx = x - s.x;
    const dz = z - s.y;
    if (dx * dx + dz * dz < mainPathClearSq) return false;
  }
  const dxs = x - spawn.x;
  const dzs = z - spawn.z;
  if (dxs * dxs + dzs * dzs < rules.spawnClearM * rules.spawnClearM) return false;
  const pavedClearSq = rules.pavedPathClearM * rules.pavedPathClearM;
  for (const s of pavedPathSamples) {
    const dx = x - s.x;
    const dz = z - s.y;
    if (dx * dx + dz * dz < pavedClearSq) return false;
  }
  for (const g of goalCenters) {
    const dx = x - g.x;
    const dz = z - g.z;
    if (dx * dx + dz * dz < rules.obstacleClearM * rules.obstacleClearM) return false;
  }
  for (const o of obstacles) {
    const dx = x - o.center.x;
    const dz = z - o.center.z;
    // Houses are tagged by their bigger AABB → use the wider clearance.
    // Anything else (billboards, previously-placed trees) gets the
    // standard obstacle clearance.
    const minD = o.halfX > 2.5 || o.halfZ > 2.5 ? rules.houseClearM : rules.obstacleClearM;
    if (dx * dx + dz * dz < minD * minD) return false;
  }
  for (const p of placed) {
    const dx = x - p.x;
    const dz = z - p.y;
    if (dx * dx + dz * dz < minSpacingSq) return false;
  }
  return true;
}

/**
 * Scatter a small set of detailed trees across the play area to break
 * up the open grass without turning it into a forest. Each tree is
 * registered as an obstacle (trunk-sized collider) so the player can
 * brush the foliage but can't walk through the trunk.
 *
 * Notes:
 *  - All variants share geometry & materials via Three.js `clone(true)`;
 *    the GPU upload happens once per variant. With only ~8 instances,
 *    cloned meshes are simpler than `InstancedMesh` and let each tree
 *    pick its own variant + scale jitter trivially.
 *  - Placement is deterministic (hash-seeded) so reloads keep the same
 *    layout. No per-frame work.
 *
 * Runs async; gameplay continues without trees until the GLBs resolve.
 */
export async function loadLevelTrees(
  level: Level,
  goals: ReadonlyArray<{ x: number; z: number }>,
): Promise<void> {
  const treeScatter = level.definition.treeScatter;
  const foregroundVariants = await Promise.all(
    TREE_DETAILED_URLS.map((u) => loadTreeModel(u, treeScatter.footprintM)),
  );

  const minSpacingSq = treeScatter.minSpacingM * treeScatter.minSpacingM;

  // Sample every paving-stone spur so trees can avoid the stones —
  // 1.2 m spacing keeps the polyline approximation tight enough that
  // the clearance radius doesn't leak.
  const mainPathSamples = samplePathCentreline(level.definition.mainPath, 1.2);
  const pavedPathSamples: THREE.Vector2[] = [];
  for (const pp of level.definition.pavedPaths) {
    pavedPathSamples.push(...samplePathCentreline(pp, 1.2));
  }

  const foregroundCenters: THREE.Vector2[] = [];
  const newObstacles: Obstacle[] = [];

  for (let i = 0; i < treeScatter.count; i++) {
    const variant = foregroundVariants[i % foregroundVariants.length]!;
    let placed = false;

    for (let attempt = 0; attempt < 200; attempt++) {
      const seed = i * 1597 + attempt * 71 + 9;
      const rx = treeHash01(seed, 0);
      const rz = treeHash01(seed, 1);
      const x =
        treeScatter.bounds.minX +
        rx * (treeScatter.bounds.maxX - treeScatter.bounds.minX);
      const z =
        treeScatter.bounds.minZ +
        rz * (treeScatter.bounds.maxZ - treeScatter.bounds.minZ);

      if (
        !treeSiteOk(
          x,
          z,
          foregroundCenters,
          level.obstacles,
          goals,
          mainPathSamples,
          pavedPathSamples,
          level.spawn,
          minSpacingSq,
          level.definition,
        )
      ) {
        continue;
      }

      const yawSeed = i * 311 + 5;
      const yaw = treeHash01(yawSeed, 0) * Math.PI * 2;
      const scaleJitter = 0.85 + treeHash01(yawSeed, 1) * 0.35; // 0.85..1.20

      const instance = variant.instance();
      instance.position.set(x, 0, z);
      instance.rotation.y = yaw;
      instance.scale.multiplyScalar(scaleJitter);
      level.group.add(instance);

      foregroundCenters.push(new THREE.Vector2(x, z));
      // Collider hugs the trunk (not the crown) so the player can
      // brush the foliage without a hard wall. Scales with the tree
      // so a 1.2× tree gets a slightly chunkier trunk too.
      const trunkR = 0.7 * scaleJitter;
      newObstacles.push({
        center: new THREE.Vector3(x, variant.halfY * scaleJitter, z),
        halfX: trunkR,
        halfZ: trunkR,
        halfY: variant.halfY * scaleJitter,
        visual: instance,
      });
      placed = true;
      break;
    }

    if (!placed) {
      console.debug(`[trees] could not place foreground tree #${i}`);
    }
  }

  level.addObstacles(newObstacles);
}

/**
 * Build a horizontal ribbon mesh following a smooth curve through the given
 * XZ waypoints. Output UVs are normalised (u across width, v along length)
 * so the caller can set `texture.repeat` in terms of the real path size.
 */
function buildCurvedPath(
  waypoints: ReadonlyArray<readonly [number, number]>,
  width: number,
  yLift: number = 0.01,
): PathMesh {
  const curve = new THREE.CatmullRomCurve3(
    waypoints.map(([x, z]) => new THREE.Vector3(x, yLift, z)),
    false,
    'catmullrom',
    0.5,
  );

  // Sample density: roughly 2 samples per metre of arc length.
  const samples = Math.max(32, Math.round(curve.getLength() * 2));
  const pts: THREE.Vector3[] = curve.getSpacedPoints(samples);
  const N = pts.length;

  // First pass: compute accumulated arc length per sample so UVs can be
  // normalised in a second pass.
  const arc = new Float32Array(N);
  arc[0] = 0;
  for (let i = 1; i < N; i++) {
    const a = pts[i] as THREE.Vector3;
    const b = pts[i - 1] as THREE.Vector3;
    arc[i] = (arc[i - 1] as number) + a.distanceTo(b);
  }
  const totalLength = arc[N - 1] as number;

  const positions = new Float32Array(N * 2 * 3);
  const uvs = new Float32Array(N * 2 * 2);
  const normals = new Float32Array(N * 2 * 3);

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const halfW = width * 0.5;

  for (let i = 0; i < N; i++) {
    const p = pts[i] as THREE.Vector3;

    // Tangent via forward/backward differences (clamped at endpoints).
    if (i < N - 1) {
      const next = pts[i + 1] as THREE.Vector3;
      tangent.copy(next).sub(p).normalize();
    } else {
      const prev = pts[i - 1] as THREE.Vector3;
      tangent.copy(p).sub(prev).normalize();
    }

    // "Left" direction = up × tangent, in XZ plane.
    side.crossVectors(up, tangent).normalize();

    const lx = p.x + side.x * halfW;
    const lz = p.z + side.z * halfW;
    const rx = p.x - side.x * halfW;
    const rz = p.z - side.z * halfW;

    const base = i * 2 * 3;
    positions[base + 0] = lx;
    positions[base + 1] = yLift;
    positions[base + 2] = lz;
    positions[base + 3] = rx;
    positions[base + 4] = yLift;
    positions[base + 5] = rz;

    normals[base + 0] = 0;
    normals[base + 1] = 1;
    normals[base + 2] = 0;
    normals[base + 3] = 0;
    normals[base + 4] = 1;
    normals[base + 5] = 0;

    const v = totalLength > 0 ? (arc[i] as number) / totalLength : 0;
    const uvBase = i * 2 * 2;
    uvs[uvBase + 0] = 0;
    uvs[uvBase + 1] = v;
    uvs[uvBase + 2] = 1;
    uvs[uvBase + 3] = v;
  }

  const indices: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    // Wind triangles so their front faces point upward. The previous
    // order produced downward-facing quads, which disappeared under the
    // normal `FrontSide` culling of MeshStandardMaterial unless we forced
    // a debug DoubleSide material.
    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x8b6b4a,
    roughness: 0.92,
    metalness: 0.0,
    name: 'path-placeholder',
    // Polygon offset pulls path fragments toward the camera in
    // depth-buffer units only (invisible in world-space) so the path
    // wins the z-test against the grass plane at any view distance,
    // even on GPUs with low depth-buffer precision. Without it, the
    // ribbon at y=yLift can be lost to z-fighting once the grass
    // texture loads and the visible difference between path/ground
    // colour shrinks.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.name = 'path';
  mesh.userData.disposeManaged = true;

  return { mesh, length: totalLength, width };
}

import * as THREE from 'three';
import {
  GOAL_RADIUS,
  SPAWN_X,
  SPAWN_Z,
  goalFor,
} from '@milk-dreams/shared';
import { loadPbrMaterial } from '../render/textures';
import { HOUSE_VARIANT_URLS, loadHouseModel } from './houseModel';
import type { HouseModel } from './houseModel';
import {
  DEFAULT_LEVEL_DEFINITION,
  HOUSE_VARIANT_KINDS,
  resolveHouseVariant,
  type HouseVariantKind,
  type LevelDefinition,
  type LevelPathDefinition,
} from './levelDefinition';
import {
  loadTreeModel,
  TREE_SCATTER_WORLD_SCALE,
  TREE_VARIANT_SCATTER_SCALE,
  TREE_VARIANT_URLS,
} from './treeModel';
import type { InstancedTreePlacement, TreeModel } from './treeModel';
import type { TreeVariantKind } from './levelDefinition';

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
  /**
   * Decorative paving-stone ribbons on the grass. Purely visual (no
   * collision); meshes are kept here so `loadLevelTextures` can swap
   * placeholders for the shared paving-stones PBR set.
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

/** How many texture repeats per metre. Grass is coarse. */
const GRASS_TILES_PER_METRE = 0.2;
/**
 * Ground is still "one meadow", but we subdivide it so a far-north band can
 * be lifted into soft relief without affecting the flat playable centre.
 */
const GROUND_SEGMENTS = 160;
/**
 * Paving stones: physical tile is ~1.25 m × 2.5 m on the ambientCG
 * scan. We tighten the repeat a touch (0.6 tiles/m) so individual
 * cobbles read at a believable size when the player walks past.
 */
const PAVING_TILES_PER_METRE = 0.6;

function tupleWaypoints(path: LevelPathDefinition): ReadonlyArray<readonly [number, number]> {
  return path.waypoints.map((wp) => [wp.x, wp.z] as const);
}

/**
 * Terrain relief on the decorative ground plane. The playable area stays flat;
 * we raise a continuous *ring* of hills around it so the horizon reads as a
 * distant sierra in every direction instead of four isolated mounds at the
 * cardinal points.
 *
 * The shape is the product of three fields:
 *   - a radial profile (flat inside the play area, rising to a ridge, tapering
 *     before the ground edge),
 *   - an angular pattern (low-frequency peaks/valleys around the circle so it
 *     doesn't look like a doughnut),
 *   - high-frequency fbm noise for silhouette detail.
 *
 * PlaneGeometry lives in local XY before we rotate it onto the XZ ground:
 *   - local x -> world x
 *   - local y -> world -z
 *   - local z -> world y (height)
 *
 * So to sculpt the meadow we derive world z as `-localY`, then write the
 * height into local `z`.
 */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashNoise2D(x: number, z: number): number {
  const seed = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return fract(seed);
}

function valueNoise2D(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fract(x);
  const tz = fract(z);
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);

  const n00 = hashNoise2D(x0, z0);
  const n10 = hashNoise2D(x0 + 1, z0);
  const n01 = hashNoise2D(x0, z0 + 1);
  const n11 = hashNoise2D(x0 + 1, z0 + 1);

  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sz) * 2 - 1;
}

function fbmNoise2D(x: number, z: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let weight = 0;

  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(x * frequency, z * frequency) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return weight > 0 ? total / weight : 0;
}

function sculptGroundReliefAroundPlaySpace(
  geometry: THREE.PlaneGeometry,
  groundSize: number,
  playableCenterX: number,
  playableCenterZ: number,
  playableRadius: number,
): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const half = groundSize * 0.5;

  // Radial profile. The play area is flat; beyond a guard band the ground
  // rises into a ridge and tapers back down before the geometric border so
  // the mountain silhouette never clips against the skybox edge.
  const flatGuardStart = playableRadius + 70;
  const ridgePeakRadius = Math.min(playableRadius + 285, half - 120);
  const ridgeFadeRadius = Math.min(half - 50, ridgePeakRadius + 140);

  // Height budget (metres above the flat meadow).
  const baseRidgeHeight = 18;
  const peakAmp = 14; // low-frequency peaks/valleys around the ring
  const detailAmp = 6; // high-frequency ridge noise on top
  const valleyDepth = 9; // how far the gaps between peaks dip

  // Around the horizon we want roughly 8–12 major peaks. Using a
  // cos(freq * theta) modulated by another sine creates an uneven, natural
  // cadence instead of a perfectly periodic wave.
  const angularPeakFreq = 10;
  const angularWobbleFreq = 3;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = -pos.getY(i);
    const dx = x - playableCenterX;
    const dz = z - playableCenterZ;
    const dist = Math.hypot(dx, dz);

    if (dist <= flatGuardStart || dist >= ridgeFadeRadius) {
      pos.setZ(i, 0);
      continue;
    }

    // Radial mask: 0 at the guard, 1 at the ridge peak, back to 0 at fade.
    const rise = smoothstep(flatGuardStart, ridgePeakRadius, dist);
    const fall = 1 - smoothstep(ridgePeakRadius, ridgeFadeRadius, dist);
    const radialMask = rise * fall;
    if (radialMask <= 0) {
      pos.setZ(i, 0);
      continue;
    }

    const theta = Math.atan2(dz, dx);

    // Main ring cadence: ~10 peaks modulated by a slower wobble so they are
    // not evenly spaced. Mapped into [0,1] so it reads as a height factor.
    const peakWave =
      Math.cos(theta * angularPeakFreq + Math.sin(theta * angularWobbleFreq) * 0.9) * 0.5 + 0.5;

    // Periodic angular noise: sampling fbm on a small circle keeps the
    // pattern continuous across theta = ±π.
    const angularSampleRadius = 80;
    const ax = Math.cos(theta) * angularSampleRadius;
    const az = Math.sin(theta) * angularSampleRadius;
    const angularLumps = (fbmNoise2D(ax * 0.035, az * 0.035, 3) + 1) * 0.5;

    // Soft blend of both so no two peaks are exactly the same height.
    const peakShape = peakWave * 0.7 + angularLumps * 0.3;

    // Sharper crests from high-frequency ridge noise on world coords, so
    // the detail does not "rotate" with theta and looks like real terrain.
    const ridgeField = 1 - Math.abs(fbmNoise2D((x + 123.4) * 0.018, (z - 67.8) * 0.022, 4));
    const ridgeDetail = ridgeField * ridgeField;

    // Pull the valleys between major peaks a little lower than the base ridge.
    const valley = Math.max(0, 0.38 - peakShape) * valleyDepth;

    const height =
      radialMask *
      (baseRidgeHeight + peakAmp * peakShape + detailAmp * ridgeDetail - valley);

    pos.setZ(i, Math.max(0, height));
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/**
 * Soft "light column" rising from a circular ring. Replaces the old
 * scattered sparkle dots: a thin open cylinder at the ring radius with
 * additive blending and a vertical alpha gradient that fades from the
 * base (on the ring) up into nothing. Reads as a halo of light standing
 * off the aro rather than random glitter — more consistent with the
 * ring itself and easier on the eye.
 */
function createRingAuraColumn(
  ringR: number,
  color: number,
  opts: { height: number; opacity: number },
): THREE.Mesh {
  // Open-ended cylinder wall. DoubleSide so it glows from both inside
  // and outside — with additive blending this gives the column a bit
  // of visible thickness without needing two concentric shells.
  const geom = new THREE.CylinderGeometry(ringR, ringR, opts.height, 64, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opts.opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        // CylinderGeometry UVs run 0 at bottom → 1 at top; fade so the
        // base sits bright on the ring and the column dissolves as it
        // rises. The pow() curve keeps the base "grounded" and makes
        // the top taper quickly instead of a flat linear fade.
        float t = clamp(vUv.y, 0.0, 1.0);
        float a = pow(1.0 - t, 1.8);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(geom, mat);
  // Cylinder origin is at its centre, so lift by half-height to sit on
  // the ground plane. Caller positions the wrapping group at the ring.
  mesh.position.y = opts.height * 0.5;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.userData.disposeManaged = true;
  return mesh;
}

export function createLevel(definition: LevelDefinition = DEFAULT_LEVEL_DEFINITION): Level {
  const group = new THREE.Group();
  group.name = 'level';

  // Placeholder grass colour until the PBR material loads.
  const groundGeometry = new THREE.PlaneGeometry(
    definition.groundSize,
    definition.groundSize,
    GROUND_SEGMENTS,
    GROUND_SEGMENTS,
  );
  sculptGroundReliefAroundPlaySpace(
    groundGeometry,
    definition.groundSize,
    definition.worldBoundary.centerX,
    definition.worldBoundary.centerZ,
    definition.worldBoundary.radius,
  );
  const ground = new THREE.Mesh(
    groundGeometry,
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

  const goalRingR = (goalRingInner + goalRingOuter) * 0.5;
  const goalAura = createRingAuraColumn(goalRingR, 0xfff3dd, {
    height: 0.55,
    opacity: 0.32,
  });
  goalAura.name = 'goal-aura';

  const goalAuraGroup = new THREE.Group();
  goalAuraGroup.name = 'goal-aura-group';
  goalAuraGroup.position.copy(goal).setY(0.04);
  goalAuraGroup.add(goalAura);
  group.add(goalAuraGroup);

  const goalAnchor = new THREE.Group();
  goalAnchor.name = 'goal-anchor';
  goalAnchor.position.copy(goal).setY(0);
  group.add(goalAnchor);

  function setGoalPosition(position: THREE.Vector3) {
    goal.copy(position).setY(0);
    goalRing.position.set(position.x, 0.05, position.z);
    goalAuraGroup.position.set(position.x, 0.04, position.z);
    goalAnchor.position.set(position.x, 0, position.z);
  }

  // Houses scattered across the grass plane so the world reads as open
  // countryside with occasional buildings. Positions clear `DREAM_GOALS` in
  // progression.ts once
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

  const spawnRingMid = (spawnRingInner + spawnRingOuter) * 0.5;
  const spawnAura = createRingAuraColumn(spawnRingMid, 0xc8d8ff, {
    height: 0.45,
    opacity: 0.26,
  });
  spawnAura.name = 'spawn-aura';
  const spawnAuraGroup = new THREE.Group();
  spawnAuraGroup.name = 'spawn-aura-group';
  spawnAuraGroup.position.copy(spawn).setY(0.035);
  spawnAuraGroup.add(spawnAura);
  group.add(spawnAuraGroup);

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
    pavedPaths,
    goalAnchor,
    setGoalPosition,
    addObstacles,
  };
}

/**
 * Load grass + paving PBR materials and swap them into the level.
 * Kicked off from main.ts after `createLevel()`; gameplay runs with placeholder
 * colours until this resolves.
 */
export async function loadLevelTextures(
  level: Level,
  renderer: THREE.WebGLRenderer,
): Promise<void> {
  const [grass, paving] = await Promise.all([
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
 * Swap each placeholder obstacle box for the loaded house variant authored
 * on its slot (or a round-robin fallback for legacy slots without `variant`).
 * Collision AABBs (`halfX`, `halfZ`, `halfY`) and the box-centre Y are updated
 * from the chosen variant's footprint so the player can't walk through walls
 * of *any* of the houses.
 *
 * Runs async: gameplay starts on the placeholder boxes and upgrades
 * seamlessly once the GLBs resolve. Variants load in parallel so the
 * upgrade is a single pop, not a staggered cascade.
 */
export async function loadLevelHouses(level: Level): Promise<void> {
  const requestedVariants = level.definition.houseSlots.map((slot, i) =>
    resolveHouseVariant(slot, i),
  );
  const uniqueVariants = Array.from(
    new Set<HouseVariantKind>([...requestedVariants, ...HOUSE_VARIANT_KINDS]),
  );
  const modelEntries = await Promise.all(
    uniqueVariants.map(async (v) => [v, await loadHouseModel(HOUSE_VARIANT_URLS[v])] as const),
  );
  const models = new Map<HouseVariantKind, HouseModel>(modelEntries);

  for (let i = 0; i < level.houseObstacles.length; i++) {
    const obstacle = level.houseObstacles[i];
    if (!obstacle) continue;

    const variantKind = requestedVariants[i] ?? HOUSE_VARIANT_KINDS[0]!;
    const model = models.get(variantKind)!;
    const slot = level.definition.houseSlots[i];
    const instance = model.instance();
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
    obstacle.halfX = model.halfX;
    obstacle.halfZ = model.halfZ;
    obstacle.halfY = model.halfY;
    obstacle.center.y = model.halfY;
  }
}

export { loadLevelSceneryProps } from './sceneryProps';

/**
 * Instantiate trees at each authored `treePlacement` position. Each tree
 * registers a **trunk-sized** AABB obstacle so the player can brush the
 * foliage but can't walk through the trunk.
 *
 * Trees load in parallel once per distinct variant and are then placed with
 * `THREE.InstancedMesh`: one mesh per leaf in the GLB (trunk + foliage),
 * all placements of a variant sharing it. A scene with ~150 trees across 3
 * variants collapses from ~300 draw calls down to ~6, and per-instance work
 * is just a matrix composition instead of a deep clone. Gameplay continues
 * without trees until the GLBs resolve.
 *
 * `goals` is kept for API compatibility with the existing call site but
 * is unused: positions are fully authored now, no runtime avoidance.
 */
export async function loadLevelTrees(
  level: Level,
  _goals: ReadonlyArray<{ x: number; z: number }>,
): Promise<void> {
  const placements = level.definition.trees;
  if (placements.length === 0) return;

  const uniqueVariants = Array.from(new Set(placements.map((p) => p.variant))) as TreeVariantKind[];
  const modelPairs = await Promise.all(
    uniqueVariants.map(async (variant) => {
      const url = TREE_VARIANT_URLS[variant];
      // Scattered foliage doesn't need to receive shadows: the canopy sits
      // well above the player, and skipping the shadow-map sample on tens
      // of thousands of fragments per frame is a clear perf win.
      const variantScale = TREE_VARIANT_SCATTER_SCALE[variant];
      const model = await loadTreeModel(url, {
        receiveShadow: false,
        worldScale: TREE_SCATTER_WORLD_SCALE * variantScale,
      });
      return [variant, model] as const;
    }),
  );
  const models = new Map<TreeVariantKind, TreeModel>(modelPairs);

  // Trunk collider radius baseline (metres). Multiplied per variant by the
  // same scatter scale the visual mesh uses so a bigger tree also gets a
  // thicker trunk collider. Intentionally tight: brushing a tree should
  // only trigger when the player is effectively walking through the trunk.
  const TRUNK_COLLIDER_BASE = 0.16;
  // Chunk the forest so frustum culling can reject whole patches. One giant
  // InstancedMesh per variant keeps draw calls low, but it also means the
  // renderer ends up touching essentially every tree every frame because the
  // batch bounds span the full meadow. A ~24 m cell is still coarse enough to
  // keep the number of batches modest while small enough that off-camera
  // horizon rings get culled reliably.
  const TREE_INSTANCE_CHUNK_M = 24;

  // Bucket placements by variant + world cell so each batch stays local.
  // That restores meaningful frustum culling without falling all the way back
  // to one Object3D per tree.
  const placementsByChunk = new Map<
    string,
    {
      variant: TreeVariantKind;
      placements: InstancedTreePlacement[];
    }
  >();
  for (const p of placements) {
    if (!models.has(p.variant)) continue;
    const cellX = Math.floor(p.x / TREE_INSTANCE_CHUNK_M);
    const cellZ = Math.floor(p.z / TREE_INSTANCE_CHUNK_M);
    const key = `${p.variant}:${cellX}:${cellZ}`;
    let bucket = placementsByChunk.get(key);
    if (!bucket) {
      bucket = {
        variant: p.variant,
        placements: [],
      };
      placementsByChunk.set(key, bucket);
    }
    bucket.placements.push({ x: p.x, z: p.z, yaw: p.yaw });
  }

  const newObstacles: Obstacle[] = [];
  for (const { variant, placements: chunkPlacements } of placementsByChunk.values()) {
    const model = models.get(variant);
    if (!model) continue;
    const instancedGroup = model.createInstancedMeshes(chunkPlacements);
    level.group.add(instancedGroup);

    // Collision still uses one AABB per tree; the `visual` reference is
    // shared across the chunk (the obstacle system only uses `visual` to swap
    // placeholder boxes when a house GLB resolves, which trees never do, so
    // sharing is safe). Collider radius tracks the variant's scatter scale
    // so bigger-looking trees also feel thicker to walk into.
    const trunkR =
      TRUNK_COLLIDER_BASE * TREE_SCATTER_WORLD_SCALE * TREE_VARIANT_SCATTER_SCALE[variant];
    for (const p of chunkPlacements) {
      newObstacles.push({
        center: new THREE.Vector3(p.x, model.halfY, p.z),
        halfX: trunkR,
        halfZ: trunkR,
        halfY: model.halfY,
        visual: instancedGroup,
      });
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

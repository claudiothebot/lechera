import * as THREE from 'three';
import {
  GOAL_RADIUS,
  SPAWN_X,
  SPAWN_Z,
  goalFor,
} from '@milk-dreams/shared';
import { loadPbrMaterial } from '../render/textures';
import { loadHouseModel } from './houseModel';

export interface Level {
  group: THREE.Group;
  spawn: THREE.Vector3;
  /** Current goal. Mutated in place by `setGoalPosition`. */
  goal: THREE.Vector3;
  goalRadius: number;
  obstacles: readonly Obstacle[];
  /** Big horizontal plane (grass). Exposed so we can swap its material async. */
  ground: THREE.Mesh;
  /** Curved ribbon from spawn → goal (dirt path). */
  path: PathMesh;
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
 * Size in metres of the flat grass plane. Sized to frame the current
 * ~50m gameplay corridor with some margin, and to comfortably host
 * future 5–10 player multiplayer rounds without feeling like an empty
 * sea of grass past the village.
 */
const GROUND_SIZE = 100;

/** How many texture repeats per metre. Grass is coarse; dirt slightly tighter. */
const GRASS_TILES_PER_METRE = 0.2;
const PATH_TILES_PER_METRE = 0.35;

/**
 * Spawn → goal waypoints chosen to curve gently around the hand-placed
 * obstacles. Keep the path >= ~1m from any obstacle edge so the Lechera
 * can follow it without colliding.
 */
const PATH_WAYPOINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 20],
  [1.0, 14],
  [-0.5, 6],
  [1.5, 0],
  [-0.5, -10],
  [0.5, -18],
  [-1.0, -24],
  [0, -30],
];

const PATH_WIDTH = 3.2;

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
  return pts;
}

export function createLevel(): Level {
  const group = new THREE.Group();
  group.name = 'level';

  // Placeholder grass colour until the PBR material loads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
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
  group.add(ground);

  const path = buildCurvedPath(PATH_WAYPOINTS, PATH_WIDTH);
  group.add(path.mesh);

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
  const obstacles: Obstacle[] = [
    makeBox(group, new THREE.Vector3(-34, 0, 38), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(28, 0, 32), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(-38, 0, 8), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(36, 0, 5), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(-40, 0, -18), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(32, 0, -38), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(-18, 0, -44), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(40, 0, -12), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(-12, 0, -28), 1.2, 1.2, 1.0),
  ];

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
    group,
    spawn,
    goal,
    goalRadius,
    obstacles,
    ground,
    path,
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
  const [grass, dirt] = await Promise.all([
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
  ]);

  grass.setPlaneSize(GROUND_SIZE, GROUND_SIZE);
  const oldGround = level.ground.material as THREE.Material;
  level.ground.material = grass.material;
  oldGround.dispose();

  // Path UVs are normalised 0..1 across width and 0..1 along length, so
  // we pass the real dimensions here to drive the texture repeat.
  dirt.setPlaneSize(level.path.width, level.path.length);
  const oldPath = level.path.mesh.material as THREE.Material;
  level.path.mesh.material = dirt.material;
  oldPath.dispose();
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
 * Swap the placeholder obstacle boxes for a thatched village-house model.
 * Each obstacle slot gets a clone of the same house, rotated by a
 * different multiple of 90° for a touch of variety. Collision AABBs
 * (`halfX`, `halfZ`, `halfY`) and the box-centre Y are updated from the
 * real house footprint so the player can't walk through walls.
 *
 * Runs async: gameplay starts on the placeholder boxes and upgrades
 * seamlessly once the GLB resolves.
 */
export async function loadLevelHouses(level: Level): Promise<void> {
  const house = await loadHouseModel();

  for (let i = 0; i < level.obstacles.length; i++) {
    const obstacle = level.obstacles[i];
    if (!obstacle) continue;

    const instance = house.instance();
    instance.position.set(obstacle.center.x, 0, obstacle.center.z);
    instance.rotation.y = (i * Math.PI) / 2;
    level.group.add(instance);

    const old = obstacle.visual as THREE.Mesh;
    level.group.remove(old);
    old.geometry?.dispose();
    const mat = old.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();

    obstacle.visual = instance;
    obstacle.halfX = house.halfX;
    obstacle.halfZ = house.halfZ;
    obstacle.halfY = house.halfY;
    obstacle.center.y = house.halfY;
  }
}

/**
 * Build a horizontal ribbon mesh following a smooth curve through the given
 * XZ waypoints. Output UVs are normalised (u across width, v along length)
 * so the caller can set `texture.repeat` in terms of the real path size.
 */
function buildCurvedPath(
  waypoints: ReadonlyArray<readonly [number, number]>,
  width: number,
): PathMesh {
  // Sit the path a hair above the ground to avoid z-fighting.
  const yLift = 0.01;

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
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x8b6b4a,
    roughness: 0.92,
    metalness: 0.0,
    name: 'path-placeholder',
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.name = 'path';

  return { mesh, length: totalLength, width };
}

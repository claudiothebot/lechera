import * as THREE from 'three';
import { loadPbrMaterial } from '../render/textures';

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
}

/** Size in metres of the flat grass plane. */
const GROUND_SIZE = 200;

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

  const spawn = new THREE.Vector3(0, 0, 20);
  const goal = new THREE.Vector3(0, 0, -30);
  const goalRadius = 2.5;

  // Goal marker: just a ring (no filled disc), matching the style of the
  // spawn circle. An optional "reward animal" gets parented under
  // `goalAnchor` by main.ts — it's what really tells the player where to
  // go, the ring is a subtle "step onto here" affordance.
  const goalRing = new THREE.Mesh(
    new THREE.RingGeometry(goalRadius * 0.88, goalRadius, 48),
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

  const goalAnchor = new THREE.Group();
  goalAnchor.name = 'goal-anchor';
  goalAnchor.position.copy(goal).setY(0);
  group.add(goalAnchor);

  function setGoalPosition(position: THREE.Vector3) {
    goal.copy(position).setY(0);
    goalRing.position.set(position.x, 0.05, position.z);
    goalAnchor.position.set(position.x, 0, position.z);
  }

  const obstacles: Obstacle[] = [
    makeBox(group, new THREE.Vector3(-3, 0, 8), 1.2, 1.2, 1.0),
    makeBox(group, new THREE.Vector3(4, 0, -2), 1.5, 0.8, 0.8),
    makeBox(group, new THREE.Vector3(-2, 0, -14), 0.8, 2.0, 1.0),
    makeBox(group, new THREE.Vector3(3.5, 0, -22), 1.0, 1.0, 0.9),
  ];

  const spawnMarker = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.5, 32),
    new THREE.MeshBasicMaterial({
      color: 0x7f8cff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  spawnMarker.rotation.x = -Math.PI / 2;
  spawnMarker.position.copy(spawn).setY(0.04);
  group.add(spawnMarker);

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
  return { center: center.clone().setY(halfY), halfX, halfZ, halfY };
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

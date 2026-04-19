import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Reward animals placed on the current goal spot, three clones per dream
 * in the fable ("Eggs" → 3 baskets of eggs, "Hens" → 3 chickens, …).
 *
 * The models come from Meshy AI, optimized via `gltf-transform optimize`
 * into `/public/models/levels/*.glb` with meshopt + webp-compressed
 * textures, so each is well under ~1.4 MB.
 *
 * Design:
 *  - Each animal is loaded once, then cloned 3× into a "flock" group
 *    with a small deterministic formation. The same flock instance is
 *    returned across calls for a given key — main.ts just reparents it.
 *  - Every model is scaled so the largest axis matches `TARGET_SIZE_M`
 *    (consistent silhouette across animals despite them being modelled
 *    at arbitrary scales by the generator).
 *  - Feet sit at local y=0 of each clone so parenting under
 *    `level.goalAnchor` drops the flock on the ground.
 */

/**
 * Key of the "reward" that appears on the current goal. Historically all
 * rewards were animals from the fable (eggs → cow), and then the dream
 * escalates into "Ferrari" and "Mansion" — still uses this key type for
 * simplicity since the type is just a tag for "what to show at the goal".
 */
export type AnimalKey =
  | 'eggs'
  | 'chicken'
  | 'pig'
  | 'calf'
  | 'cow'
  | 'ferrari'
  | 'mansion'
  /** Endless-mode reward after the named dreams (single bag at the goal). */
  | 'moneybag';

const ANIMAL_URLS: Record<AnimalKey, string> = {
  eggs: '/models/levels/eggs.glb',
  chicken: '/models/levels/chicken.glb',
  pig: '/models/levels/pig.glb',
  calf: '/models/levels/calf.glb',
  cow: '/models/levels/cow.glb',
  ferrari: '/models/levels/ferrari.glb',
  mansion: '/models/levels/mansion.glb',
  moneybag: '/models/levels/money-bag.glb',
};

/**
 * Target max-axis size per reward in metres. Tuned by eye so the group
 * reads right next to the Lechera (~1.68 m tall). Ferrari is car-sized
 * (a bit longer than a cow). Mansion is intentionally bigger since it's
 * a building the player is "dreaming of owning" — and we only show 1
 * instance of it (see `FLOCK_COUNT`). Ferrari uses one larger car instead
 * of three small copies.
 */
const TARGET_SIZE_M: Record<AnimalKey, number> = {
  /** First phase — slightly larger baskets, tighter formation (see `formationFor`). */
  eggs: 0.64,
  chicken: 0.75,
  pig: 1.35,
  calf: 1.4,
  cow: 1.7,
  ferrari: 3.4,
  mansion: 3.5,
  /** Single bag at the goal in endless mode — large enough to read clearly. */
  moneybag: 3.0,
};

/**
 * How many clones to place at the goal per reward. 3 is the default
 * "flock" (eggs, chickens, etc.). Mansion is a single building because
 * three overlapping mansions would look absurd.
 */
const FLOCK_COUNT: Record<AnimalKey, number> = {
  eggs: 3,
  chicken: 3,
  pig: 3,
  calf: 3,
  cow: 3,
  ferrari: 1,
  mansion: 1,
  moneybag: 1,
};

/**
 * Positions (XZ, metres) + yaw (radians) + uniform scale multiplier for
 * the three clones per flock. Kept small (within ~1.3 m of the centre,
 * well inside goalRadius=2.5) so the player can still walk onto the ring
 * and the whole flock stays legible from a distance.
 *
 * Varied yaw and scale keep it from looking like a copy-paste row.
 */
const DEFAULT_FORMATION: ReadonlyArray<{
  x: number;
  z: number;
  yaw: number;
  scale: number;
}> = [
  { x: 0.0, z: -0.35, yaw: -0.25, scale: 1.05 },
  { x: -1.05, z: 0.45, yaw: 0.55, scale: 0.95 },
  { x: 0.95, z: 0.25, yaw: -1.0, scale: 1.0 },
];

/** Eggs only: pull the three baskets closer so the first phase reads as one cluster. */
const EGG_FORMATION: typeof DEFAULT_FORMATION = [
  { x: 0.0, z: -0.18, yaw: -0.22, scale: 1.05 },
  { x: -0.42, z: 0.24, yaw: 0.52, scale: 0.97 },
  { x: 0.4, z: 0.2, yaw: -0.95, scale: 1.0 },
];

function formationFor(key: AnimalKey) {
  return key === 'eggs' ? EGG_FORMATION : DEFAULT_FORMATION;
}

export interface LevelAnimals {
  /**
   * Returns the prepared root for the given animal key. The same object
   * is returned across calls — the caller is expected to parent it where
   * it needs to live (and to detach any previously parented sibling).
   */
  get(key: AnimalKey): THREE.Object3D;
  /** Best-effort disposal of all loaded GLBs. */
  dispose(): void;
}

export async function loadLevelAnimals(): Promise<LevelAnimals> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const keys = Object.keys(ANIMAL_URLS) as AnimalKey[];
  const entries = await Promise.all(
    keys.map(async (key) => {
      const url = ANIMAL_URLS[key];
      const gltf = await loader.loadAsync(url);
      const flock = buildFlock(gltf.scene, TARGET_SIZE_M[key], key);
      return [key, flock] as const;
    }),
  );

  const flocks = Object.fromEntries(entries) as Record<AnimalKey, THREE.Group>;

  return {
    get(key) {
      return flocks[key];
    },
    dispose() {
      for (const key of keys) {
        const flock = flocks[key];
        flock.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.isMesh) {
            m.geometry?.dispose();
            const mat = m.material as
              | THREE.Material
              | THREE.Material[]
              | undefined;
            if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
            else mat?.dispose();
          }
        });
      }
    },
  };
}

/**
 * Build the 3-clone flock for a single animal. Clones share geometry and
 * materials (Object3D.clone(true) does a deep hierarchy clone but keeps
 * Mesh.geometry/material references) so the GPU cost is ~1× the base
 * model. Good enough for static non-skinned Meshy exports; we'd need
 * SkeletonUtils.clone if we ever introduced animated animals here.
 */
function buildFlock(
  scene: THREE.Group,
  targetSize: number,
  key: AnimalKey,
): THREE.Group {
  const master = prepareAnimal(scene, targetSize);

  const flock = new THREE.Group();
  flock.name = `flock-${key}`;

  const formation = formationFor(key);
  const count = Math.min(FLOCK_COUNT[key], formation.length);
  if (count === 1) {
    // Single-instance rewards (e.g. mansion) sit centred on the goal,
    // not using a formation slot — otherwise the building would land off
    // to the side of the ring.
    flock.add(master);
    return flock;
  }

  for (let i = 0; i < count; i++) {
    const slot = formation[i]!;
    const clone = master.clone(true);
    clone.position.set(slot.x, 0, slot.z);
    clone.rotation.y = slot.yaw;
    clone.scale.multiplyScalar(slot.scale);
    flock.add(clone);
  }

  return flock;
}

/**
 * Uniform-scale the loaded GLTF scene so its largest axis equals
 * `targetSize`, then lift it so the min-y sits at local 0. Also turns
 * on shadow casting/receiving on every mesh (GLTFLoader leaves them off).
 */
function prepareAnimal(scene: THREE.Group, targetSize: number): THREE.Object3D {
  const wrapper = new THREE.Group();
  wrapper.add(scene);

  scene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(scene, true);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const largest = Math.max(size.x, size.y, size.z) || 1;
  const s = targetSize / largest;
  scene.scale.setScalar(s);

  scene.updateMatrixWorld(true);
  const scaledBbox = new THREE.Box3().setFromObject(scene, true);
  scene.position.y -= scaledBbox.min.y;

  return wrapper;
}

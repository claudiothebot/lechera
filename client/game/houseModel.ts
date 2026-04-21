import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Village house obstacle — GLB load + centre on XZ + ground at Y=0, then
 * optional world scale (below) on top of export size.
 */
/** Uniform scale on authored house size (+50 % vs raw GLB footprint). */
const HOUSE_WORLD_SCALE = 1.5;

/**
 * House variant GLB + label catalog. The canonical list of `HouseVariantKind`
 * ids lives in `levelDefinition.ts` (dependency-free, consumed by the level
 * JSON + editor). Adding a new variant is a 3-step process:
 *   1. Drop the optimised GLB in `public/models/house-*-opt.glb`.
 *   2. Extend `HouseVariantKind` + `HOUSE_VARIANT_KINDS` in `levelDefinition.ts`.
 *   3. Add a `HOUSE_VARIANT_URLS` / `HOUSE_VARIANT_LABELS` entry below.
 */
import type { HouseVariantKind } from './levelDefinition';

export const HOUSE_VARIANT_URLS: Record<HouseVariantKind, string> = {
  'iberian-village': '/models/house-iberian-village-opt.glb',
  'rustic-spanish': '/models/house-rustic-spanish-opt.glb',
  'dairy-shed': '/models/house-dairy-shed-opt.glb',
};

export const HOUSE_VARIANT_LABELS: Record<HouseVariantKind, string> = {
  'iberian-village': 'Iberian village',
  'rustic-spanish': 'Rustic Spanish',
  'dairy-shed': 'Dairy shed',
};

export interface HouseModel {
  /**
   * Stamp out a new instance. Its local origin sits at the XZ centre of
   * the footprint with min-Y at 0, so `instance.position.set(x, 0, z)`
   * drops it cleanly on the ground.
   */
  instance(): THREE.Object3D;
  halfX: number;
  halfZ: number;
  halfY: number;
}

export async function loadHouseModel(url = '/models/house-iberian-village-opt.glb'): Promise<HouseModel> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

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
  const centre = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(centre);

  scene.position.set(-centre.x, -bbox.min.y, -centre.z);

  const wrapper = new THREE.Group();
  wrapper.name = 'house';
  wrapper.add(scene);
  wrapper.scale.setScalar(HOUSE_WORLD_SCALE);

  const h = HOUSE_WORLD_SCALE;
  return {
    instance() {
      return wrapper.clone(true);
    },
    halfX: size.x * 0.5 * h,
    halfZ: size.z * 0.5 * h,
    halfY: size.y * 0.5 * h,
  };
}

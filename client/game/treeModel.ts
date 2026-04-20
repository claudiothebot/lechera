import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Static scenery tree — loaded from a Meshy-AI single-mesh GLB optimized
 * offline (simplify + 512 webp + meshopt) into `/public/models/tree-*-opt.glb`.
 *
 * Same pattern as `houseModel.ts`: load → centre on footprint → scale to
 * a target footprint → return an `instance()` factory that clones the
 * normalized template. Clones share geometry and materials, so N
 * placements only cost 1 GPU upload.
 *
 * Differences vs houses:
 *  - Larger default footprint (~8 m crown width) so close-up trees read
 *    as full trees, not bushes.
 *  - **No shadow casting** by default. Even for the small set we
 *    scatter (`TREE_FOREGROUND_COUNT` ≈ 8), full per-tree shadow maps
 *    tank the frame budget on integrated GPUs and add little to
 *    readability when the tree itself already reads as a vertical
 *    silhouette. Trees still *receive* shadows so the milkmaid /
 *    houses cast onto them correctly.
 */

export interface TreeModel {
  /** Local origin sits at the trunk base centre (XZ centroid, Y = 0). */
  instance(): THREE.Object3D;
  halfX: number;
  halfZ: number;
  halfY: number;
}

/**
 * Default target largest-XZ-axis size after scaling, in metres. Picked
 * so a grown tree reads as a real tree (~8 m crown ⇒ ~12–16 m tall
 * with the 1:1.5–1:2 aspect ratio of the Meshy exports). Override per
 * call when a particular variant should be smaller / larger.
 */
const DEFAULT_TARGET_FOOTPRINT_M = 8.0;

export async function loadTreeModel(
  url: string,
  targetFootprintM: number = DEFAULT_TARGET_FOOTPRINT_M,
): Promise<TreeModel> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

  scene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = true;
    }
  });

  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(scene, true);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(centre);

  const largestXZ = Math.max(size.x, size.z) || 1;
  const scale = targetFootprintM / largestXZ;

  scene.position.set(-centre.x, -bbox.min.y, -centre.z);

  const wrapper = new THREE.Group();
  wrapper.name = 'tree';
  wrapper.add(scene);
  wrapper.scale.setScalar(scale);

  return {
    instance() {
      return wrapper.clone(true);
    },
    halfX: size.x * scale * 0.5,
    halfZ: size.z * scale * 0.5,
    halfY: size.y * scale * 0.5,
  };
}


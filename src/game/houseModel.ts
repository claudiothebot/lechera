import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Village house obstacle — loaded from a Meshy-AI single-mesh GLB,
 * optimized offline (simplify + 1K webp + meshopt) into
 * `/public/models/house-opt.glb`.
 *
 * Because the source is a single mesh with no hierarchy, integration is
 * a straight GLB load + centre + scale to a target footprint. The
 * prepared template is cloned once per obstacle slot; clones share
 * geometry and materials (Three.js `Object3D.clone(true)` keeps mesh
 * refs), so N placements cost ~1 GPU upload.
 */

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

/**
 * Target largest-XZ-axis size after scaling, in metres. Big enough that
 * the houses read as real buildings framing the route rather than small
 * prop-sized obstacles.
 */
const TARGET_FOOTPRINT_M = 7.2;

export async function loadHouseModel(
  url = '/models/house-opt.glb',
): Promise<HouseModel> {
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

  const largestXZ = Math.max(size.x, size.z) || 1;
  const scale = TARGET_FOOTPRINT_M / largestXZ;

  // Two-level wrap: inner group re-centres the mesh on its footprint
  // and drops min-Y to 0; outer wrapper applies the uniform scale. This
  // way a later rotation about the wrapper's Y axis spins around the
  // footprint centre.
  scene.position.set(-centre.x, -bbox.min.y, -centre.z);

  const wrapper = new THREE.Group();
  wrapper.name = 'house';
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

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface LoadJugOptions {
  /** Target height in metres (resting on the anchor origin). */
  targetHeight?: number;
}

/**
 * Loads a jug prop for the gameplay anchor. Scales to `targetHeight` and
 * places the mesh so its bottom sits on y=0 in the anchor's local space.
 */
export async function loadJugModel(
  url: string,
  opts: LoadJugOptions = {},
): Promise<THREE.Object3D> {
  const { targetHeight = 0.22 } = opts;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);

  const root = new THREE.Group();
  root.name = 'jug-model';
  const model = gltf.scene;
  root.add(model);

  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  model.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(model, true);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const modelHeight = size.y || 1;
  const scale = targetHeight / modelHeight;
  model.scale.setScalar(scale);

  const scaledMinY = bbox.min.y * scale;
  model.position.y = -scaledMinY;

  return root;
}

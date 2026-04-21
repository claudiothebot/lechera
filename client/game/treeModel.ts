import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { TreeVariantKind } from './levelDefinition';

/**
 * Static scenery tree — GLB load + centre + ground at Y=0. **No uniform
 * scaling** (author size in the export). Optional `castShadow` for props.
 */

/** Canonical variant → optimised GLB path mapping. */
export const TREE_VARIANT_URLS: Record<TreeVariantKind, string> = {
  olive: '/models/tree-olive-opt.glb',
  poplar: '/models/tree-poplar-opt.glb',
  'poplar-alt': '/models/tree-poplar-2-opt.glb',
};

/** Human-friendly labels for the editor's variant picker. */
export const TREE_VARIANT_LABELS: Record<TreeVariantKind, string> = {
  olive: 'Olive',
  poplar: 'Poplar',
  'poplar-alt': 'Poplar (alt)',
};

export interface TreeModel {
  /** Local origin sits at the trunk base centre (XZ centroid, Y = 0). */
  instance(): THREE.Object3D;
  halfX: number;
  halfZ: number;
  halfY: number;
}

export interface LoadTreeModelOptions {
  /** Ground props usually cast shadows; trees stay off for perf. */
  castShadow?: boolean;
  /**
   * Extra uniform scale vs GLB (default **2** = +100 % for scattered trees).
   * Props use **1** so only trees grow.
   */
  worldScale?: number;
}

/** +100 % on export size for scattered trees (`loadLevelTrees`). Props pass `worldScale: 1`. */
export const TREE_SCATTER_WORLD_SCALE = 2;

export async function loadTreeModel(
  url: string,
  options: LoadTreeModelOptions = {},
): Promise<TreeModel> {
  const castShadow = options.castShadow ?? false;
  const worldScale = options.worldScale ?? TREE_SCATTER_WORLD_SCALE;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

  scene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = castShadow;
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
  wrapper.name = 'tree';
  wrapper.add(scene);
  wrapper.scale.setScalar(worldScale);

  const h = worldScale;
  return {
    instance() {
      return wrapper.clone(true);
    },
    halfX: size.x * 0.5 * h,
    halfZ: size.z * 0.5 * h,
    halfY: size.y * 0.5 * h,
  };
}


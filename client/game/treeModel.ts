import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { TreeVariantKind } from './levelDefinition';

/**
 * Static scenery tree — GLB load + centre + ground at Y=0. **No uniform
 * scaling** (author size in the export). Optional `castShadow` for props.
 *
 * Two code paths for placing in the world:
 *
 *   - `instance()`  → deep-clone of the model as a normal Object3D. Used by
 *                     one-off scenery (haystacks, carts, wells, billboards).
 *   - `createInstancedMeshes(placements)` → builds one THREE.InstancedMesh per
 *                     leaf mesh in the source GLB, collapsing N placements
 *                     into a handful of draw calls. Used by `loadLevelTrees`,
 *                     which routinely drops ~100+ trees around the meadow.
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

/**
 * Per-tree XZ placement used by the batched `createInstancedMeshes` path.
 * Heights are always baked to Y=0 at the trunk base by `loadTreeModel`.
 */
export interface InstancedTreePlacement {
  x: number;
  z: number;
  yaw: number;
}

export interface TreeModel {
  /** Local origin sits at the trunk base centre (XZ centroid, Y = 0). */
  instance(): THREE.Object3D;
  /**
   * Batched placement for scattered trees. Returns a THREE.Group holding one
   * InstancedMesh per leaf mesh in the source GLB (typically trunk + foliage),
   * with all placements baked into the instance matrix buffer. Always renders
   * (no CPU frustum culling) because the group-level bounds don't reflect the
   * scattered instance positions.
   */
  createInstancedMeshes(placements: ReadonlyArray<InstancedTreePlacement>): THREE.Group;
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

/** Leaf mesh + its matrix relative to a wrapper-at-origin reference frame. */
interface LeafMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  baseMatrix: THREE.Matrix4;
}

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

  // Compute world matrices relative to the wrapper (which is currently at
  // origin with only the worldScale applied). These encode the export's scene
  // offset + scale and are reused as the "base" matrix for every instance.
  wrapper.updateMatrixWorld(true);
  const leafMeshes: LeafMesh[] = [];
  wrapper.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    leafMeshes.push({
      geometry: mesh.geometry,
      material: mesh.material,
      baseMatrix: mesh.matrixWorld.clone(),
    });
  });

  const h = worldScale;
  return {
    instance() {
      return wrapper.clone(true);
    },
    createInstancedMeshes(placements) {
      const group = new THREE.Group();
      group.name = 'tree-instanced';
      if (placements.length === 0 || leafMeshes.length === 0) return group;

      const tmp = new THREE.Matrix4();
      const tmpPos = new THREE.Matrix4();
      const tmpRot = new THREE.Matrix4();

      for (const leaf of leafMeshes) {
        const im = new THREE.InstancedMesh(leaf.geometry, leaf.material, placements.length);
        im.castShadow = castShadow;
        im.receiveShadow = true;
        // The InstancedMesh's geometry bbox describes a single tree only, so
        // CPU frustum culling would drop the whole cluster whenever the first
        // instance sits off-screen. Rely on GPU rasterization culling instead.
        im.frustumCulled = false;

        for (let i = 0; i < placements.length; i++) {
          const p = placements[i]!;
          tmpPos.makeTranslation(p.x, 0, p.z);
          tmpRot.makeRotationY(p.yaw);
          tmp.multiplyMatrices(tmpPos, tmpRot).multiply(leaf.baseMatrix);
          im.setMatrixAt(i, tmp);
        }
        im.instanceMatrix.needsUpdate = true;
        group.add(im);
      }

      return group;
    },
    halfX: size.x * 0.5 * h,
    halfZ: size.z * 0.5 * h,
    halfY: size.y * 0.5 * h,
  };
}

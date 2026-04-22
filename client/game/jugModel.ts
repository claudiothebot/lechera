import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface LoadJugOptions {
  /** Target height in metres (resting on the anchor origin). */
  targetHeight?: number;
  /**
   * Optional multiplicative tint applied to a CLONE of the jug's
   * materials. Use desaturated colors so the underlying texture stays
   * readable (matches the character tint convention).
   */
  tintColor?: THREE.Color;
}

export interface JugSource {
  /** Original parsed scene. Treat as read-only — clone per instance. */
  readonly scene: THREE.Object3D;
}

const sourceCache = new Map<string, Promise<JugSource>>();

/** Fetch + parse the GLB once, cache the source. */
export function loadJugSource(url: string): Promise<JugSource> {
  const cached = sourceCache.get(url);
  if (cached) return cached;
  const p = (async (): Promise<JugSource> => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    // Meshy exports default to `doubleSided: true`. Force FrontSide on the
    // source so every clone/tint path inherits it (Material.clone() copies
    // `.side`, so tinted instances pay the single-sided cost too).
    gltf.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat) mat.side = THREE.FrontSide;
      }
    });
    return { scene: gltf.scene };
  })();
  sourceCache.set(url, p);
  return p;
}

/**
 * Build a fresh jug instance from a cached source. Geometry is shared
 * with the source (cheap, GPU-friendly); materials are cloned only when
 * a tint is requested, so untinted instances pay nothing extra.
 *
 * The returned `Object3D` follows the same anchor convention as the
 * original `loadJugModel`: scaled to `targetHeight` and positioned so
 * the jug's bottom sits on y=0 in its parent's local space.
 */
export function createJugInstance(
  source: JugSource,
  opts: LoadJugOptions = {},
): THREE.Object3D {
  const { targetHeight = 0.22, tintColor } = opts;

  const root = new THREE.Group();
  root.name = 'jug-model';

  // Plain `.clone(true)` is correct for the jug — there's no skinning,
  // no animation, just static meshes. Geometry refs are shared which is
  // what we want.
  const model = source.scene.clone(true);
  root.add(model);

  model.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (tintColor) {
      m.material = cloneAndTint(m.material, tintColor);
    }
  });

  // Same scale-to-height routine as the original loader. We compute the
  // bbox AFTER the clone (and after material setup) so the result is
  // identical to a fresh load.
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

/**
 * Convenience wrapper for the local player's call-site ergonomics.
 * Equivalent to `loadJugSource(url).then((s) => createJugInstance(s, opts))`.
 */
export async function loadJugModel(
  url: string,
  opts: LoadJugOptions = {},
): Promise<THREE.Object3D> {
  const source = await loadJugSource(url);
  return createJugInstance(source, opts);
}

function cloneAndTint(
  mat: THREE.Material | THREE.Material[],
  tint: THREE.Color,
): THREE.Material | THREE.Material[] {
  if (Array.isArray(mat)) return mat.map((m) => tintOne(m, tint));
  return tintOne(mat, tint);
}

function tintOne(mat: THREE.Material, tint: THREE.Color): THREE.Material {
  const cloned = mat.clone();
  const colored = cloned as THREE.Material & { color?: THREE.Color };
  if (colored.color && colored.color.isColor) {
    colored.color.multiply(tint);
  }
  return cloned;
}

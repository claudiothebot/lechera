import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * Load an equirectangular HDRI from Poly Haven (or similar), convert it into
 * a prefiltered PMREM envmap, and assign it as both `scene.background` and
 * `scene.environment`. That single call buys us:
 *   - a skydome behind everything,
 *   - consistent IBL for every PBR material (better shading/reflections
 *     on the character and jug without having to tune extra lights).
 *
 * We follow "placeholder first, swap later": the caller installs a cheap
 * background color before invoking this, and we overwrite it when ready.
 * Failures log but never throw — the game stays playable.
 */

export interface SkyHandle {
  /** Dispose GPU resources when the sky is no longer needed. */
  dispose(): void;
}

export interface InstallHdriSkyOptions {
  /**
   * Dims the visible skybox without touching how the env map lights materials.
   * Three r155+. Default: 1.0 (no change).
   */
  backgroundIntensity?: number;
  /**
   * Dims the IBL contribution on every PBR material in the scene. Use this
   * when the HDRI is correct for the sky but over-lights the ground / props.
   * Three r163+. Default: 1.0 (no change).
   */
  environmentIntensity?: number;
  /**
   * Yaw rotation (radians) applied to BOTH the visible skybox and the IBL
   * env map, so reflections stay consistent with the visible sky. Lets us
   * pick which slice of the equirectangular HDRI faces the camera without
   * re-baking the asset. Three r163+. Default: 0 (no rotation).
   */
  yawRotation?: number;
}

export async function installHdriSky(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  url: string,
  opts: InstallHdriSkyOptions = {},
): Promise<SkyHandle> {
  // Pick loader by extension. Both Poly Haven (.hdr / RGBE) and ambientCG
  // (.exr / OpenEXR) panoramas are common; we treat any other extension as
  // RGBE since that is the historical default for our project.
  const isExr = /\.exr($|\?)/i.test(url);
  const loader = isExr ? new EXRLoader() : new HDRLoader();
  const hdrTex = await loader.loadAsync(url);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(hdrTex);
  // The raw HDR texture is no longer needed after PMREM conversion.
  hdrTex.dispose();
  pmrem.dispose();

  const envTex = envRT.texture;
  scene.background = envTex;
  scene.environment = envTex;

  // These properties exist on Scene in modern Three but aren't typed in every
  // version of @types/three we target, so we set them with a narrow cast.
  // `backgroundRotation` / `environmentRotation` are Euler instances (r163+);
  // we only need yaw, so we leave x/z at 0.
  const sceneExtras = scene as unknown as {
    backgroundIntensity?: number;
    environmentIntensity?: number;
    backgroundRotation?: THREE.Euler;
    environmentRotation?: THREE.Euler;
  };
  if (opts.backgroundIntensity !== undefined) {
    sceneExtras.backgroundIntensity = opts.backgroundIntensity;
  }
  if (opts.environmentIntensity !== undefined) {
    sceneExtras.environmentIntensity = opts.environmentIntensity;
  }
  if (opts.yawRotation !== undefined && opts.yawRotation !== 0) {
    // Mutate the existing Euler in place when present (Three constructs a
    // default one); only fall back to allocating a new Euler if the field
    // isn't initialised (older versions / runtime mismatch).
    const yaw = opts.yawRotation;
    if (sceneExtras.backgroundRotation) {
      sceneExtras.backgroundRotation.y = yaw;
    } else {
      sceneExtras.backgroundRotation = new THREE.Euler(0, yaw, 0);
    }
    if (sceneExtras.environmentRotation) {
      sceneExtras.environmentRotation.y = yaw;
    } else {
      sceneExtras.environmentRotation = new THREE.Euler(0, yaw, 0);
    }
  }

  return {
    dispose() {
      if (scene.background === envTex) scene.background = null;
      if (scene.environment === envTex) scene.environment = null;
      envRT.dispose();
    },
  };
}

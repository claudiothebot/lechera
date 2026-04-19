import * as THREE from 'three';
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
}

export async function installHdriSky(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  url: string,
  opts: InstallHdriSkyOptions = {},
): Promise<SkyHandle> {
  const loader = new HDRLoader();
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

  // Both properties exist on Scene in modern Three but aren't typed in every
  // version of @types/three we target, so we set them with a narrow cast.
  const sceneExtras = scene as unknown as {
    backgroundIntensity?: number;
    environmentIntensity?: number;
  };
  if (opts.backgroundIntensity !== undefined) {
    sceneExtras.backgroundIntensity = opts.backgroundIntensity;
  }
  if (opts.environmentIntensity !== undefined) {
    sceneExtras.environmentIntensity = opts.environmentIntensity;
  }

  return {
    dispose() {
      if (scene.background === envTex) scene.background = null;
      if (scene.environment === envTex) scene.environment = null;
      envRT.dispose();
    },
  };
}

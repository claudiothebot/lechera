import * as THREE from 'three';
import type { AnimalKey, LevelAnimals } from '../game/levelAnimals';

/**
 * Per-reward HUD preview tuning (world clone is already scaled in levelAnimals).
 * yLift raises the mesh in frame; scaleMul enlarges slightly; camera pulls back
 * if needed so tall/wide models stay visible.
 */
const PREVIEW_TUNING: Partial<
  Record<
    AnimalKey,
    {
      yLift?: number;
      scaleMul?: number;
      cameraDistMul?: number;
      lookAtY?: number;
    }
  >
> = {
  ferrari: {
    yLift: 0.18,
    scaleMul: 1.1,
    cameraDistMul: 1.06,
    lookAtY: 0.14,
  },
  mansion: {
    yLift: 0.62,
    cameraDistMul: 1.14,
    lookAtY: 0.18,
  },
  moneybag: {
    yLift: 0.14,
    scaleMul: 1.12,
    cameraDistMul: 1.06,
    lookAtY: 0.13,
  },
};

/** Default vertical aim: sit reward a bit lower in frame (baskets etc. stay whole). */
const DEFAULT_LOOK_AT_Y = 0.11;

export interface DreamPreview {
  /** Swap the preview mesh; pass `null` for animals while GLBs still load. */
  setKey(key: AnimalKey, animals: LevelAnimals | null): void;
  /** Call once per frame after the main scene render. */
  render(dt: number): void;
  resize(): void;
  dispose(): void;
}

/**
 * Small offscreen-style WebGL view of the same reward models used at the goal.
 * Clones `levelAnimals.get(key)` so the world instance is untouched.
 */
export function createDreamPreview(canvas: HTMLCanvasElement): DreamPreview {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 40);

  const hemi = new THREE.HemisphereLight(0xc8daf0, 0x4a3a28, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff5e8, 0.95);
  sun.position.set(1.8, 2.8, 1.6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xa8c0e8, 0.35);
  fill.position.set(-1.5, 0.6, -1.2);
  scene.add(fill);

  let pivot: THREE.Group | null = null;
  let frameTuning = { cameraDistMul: 1, lookAtY: DEFAULT_LOOK_AT_Y };

  function clearPivot() {
    if (!pivot) return;
    scene.remove(pivot);
    pivot = null;
  }

  /**
   * Flocks at the goal use 3 copies for most rewards; the HUD only needs one.
   */
  function cloneSingleRewardInstance(flock: THREE.Object3D): THREE.Object3D {
    const root = flock.clone(true);
    if (root instanceof THREE.Group && root.children.length > 1) {
      const first = root.children[0];
      if (first) {
        return first.clone(true);
      }
    }
    return root;
  }

  function fitCloneToView(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    root.position.sub(center);
    root.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(root, true);
    box2.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    /** Slightly under 1.0 leaves air around tall props (eggs basket, etc.). */
    const target = 0.96;
    const s = target / maxDim;
    root.scale.multiplyScalar(s);
  }

  function frameCamera() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const fovRad = (camera.fov * Math.PI) / 180;
    const margin = 1.32;
    const halfH = (0.96 * margin) * 0.5;
    const baseDist = halfH / Math.tan(fovRad / 2);
    const dist = baseDist * frameTuning.cameraDistMul;
    camera.position.set(0, 0.16, dist);
    camera.near = Math.max(0.05, dist * 0.02);
    camera.far = dist * 5;
    camera.lookAt(0, frameTuning.lookAtY, 0);
  }

  function setKey(key: AnimalKey, animals: LevelAnimals | null) {
    clearPivot();
    if (!animals) {
      frameTuning = { cameraDistMul: 1, lookAtY: DEFAULT_LOOK_AT_Y };
      return;
    }

    const tune = PREVIEW_TUNING[key];
    frameTuning = {
      cameraDistMul: tune?.cameraDistMul ?? 1,
      lookAtY: tune?.lookAtY ?? DEFAULT_LOOK_AT_Y,
    };

    const clone = cloneSingleRewardInstance(animals.get(key));
    fitCloneToView(clone);
    if (tune?.scaleMul) {
      clone.scale.multiplyScalar(tune.scaleMul);
    }
    if (tune?.yLift) {
      clone.position.y += tune.yLift;
    }
    // Sit reward slightly lower in the HUD tile so tops aren’t clipped.
    clone.position.y -= 0.07;

    pivot = new THREE.Group();
    pivot.add(clone);
    scene.add(pivot);
    frameCamera();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    frameCamera();
  }

  function render(dt: number) {
    if (pivot) {
      pivot.rotation.y += dt * 0.28;
    }
    renderer.render(scene, camera);
  }

  const onResize = () => resize();

  window.addEventListener('resize', onResize);
  resize();

  return {
    setKey,
    render,
    resize,
    dispose() {
      window.removeEventListener('resize', onResize);
      clearPivot();
      renderer.dispose();
    },
  };
}

import * as THREE from 'three';
import {
  createCharacterInstance,
  type Character,
  type CharacterSource,
} from '../game/character';
import { createJugInstance, type JugSource } from '../game/jugModel';

/** Match `main.ts` so the HUD figure matches the in-game scale. */
const LECHERA_TARGET_HEIGHT_M = 1.5;
const JUG_TARGET_HEIGHT = 0.42 * (LECHERA_TARGET_HEIGHT_M / 1.68);
const JUG_EXTRA_LIFT_Y = 0.08;

export interface InstructionsPreview {
  /** Call while the instructions panel is visible (cheap when hidden — caller skips). */
  render(dt: number): void;
  resize(): void;
  dispose(): void;
}

function stripShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
}

/**
 * Small WebGL view of the same lechera + cántaro GLBs as gameplay.
 * No shadows / no environment — only hemisphere + directional fill.
 */
export function createInstructionsPreview(
  canvas: HTMLCanvasElement,
  characterSource: CharacterSource,
  jugSource: JugSource,
): InstructionsPreview {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 24);

  const hemi = new THREE.HemisphereLight(0xc8daf0, 0x4a3a28, 0.65);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff5e8, 1.0);
  key.position.set(1.2, 2.4, 2.0);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8b8e8, 0.4);
  rim.position.set(-1.8, 0.8, -1.2);
  scene.add(rim);

  const character: Character = createCharacterInstance(characterSource, {
    targetHeight: LECHERA_TARGET_HEIGHT_M,
    rotateYToMatchPlayerFront: true,
    walkSpeedReference: 4.5,
  });
  stripShadows(character.root);

  const jugRoot = createJugInstance(jugSource, {
    targetHeight: JUG_TARGET_HEIGHT,
  });
  stripShadows(jugRoot);

  const rig = new THREE.Group();
  rig.name = 'instructions-rig';
  rig.add(character.root);
  scene.add(rig);

  character.tick(0.016, 0);
  rig.updateMatrixWorld(true);
  const jugPos = new THREE.Vector3();
  character.getJugWorldPosition(jugPos);
  jugPos.y += JUG_EXTRA_LIFT_Y;

  const jugMount = new THREE.Group();
  jugMount.position.copy(jugPos);
  jugMount.add(jugRoot);
  rig.add(jugMount);

  stripShadows(rig);

  let lastCanvasW = -1;
  let lastCanvasH = -1;

  function frameCamera() {
    rig.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig, true);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    // Fit the rig's full HEIGHT in the viewport (height is the dominant
    // axis for a character+jug figure) and also check it fits in WIDTH
    // given the current aspect, picking whichever requires more distance.
    // This guarantees the feet + jug top both stay in frame regardless
    // of the canvas aspect ratio.
    const fovY = (camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
    const margin = 1.12;
    const distForHeight =
      (size.y * margin * 0.5) / Math.tan(fovY / 2);
    const distForWidth =
      (size.x * margin * 0.5) / Math.tan(fovX / 2);
    const dist = Math.max(distForHeight, distForWidth);
    // Character's visual front faces +Z in local space after the 180°
    // flip in `createCharacterInstance`, so placing the camera at -Z
    // gives us the front view.
    camera.position.set(center.x, center.y, center.z - dist);
    camera.near = Math.max(0.05, dist * 0.02);
    camera.far = dist * 6;
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    lastCanvasW = w;
    lastCanvasH = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frameCamera();
  }

  function render(dt: number) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w !== lastCanvasW || h !== lastCanvasH) {
      if (w >= 1 && h >= 1) {
        lastCanvasW = w;
        lastCanvasH = h;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        frameCamera();
      }
    }
    if (w < 1 || h < 1) return;
    character.tick(dt, 0);
    renderer.render(scene, camera);
  }

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();

  return {
    render,
    resize,
    dispose() {
      window.removeEventListener('resize', onResize);
      character.dispose();
      scene.clear();
      renderer.dispose();
    },
  };
}

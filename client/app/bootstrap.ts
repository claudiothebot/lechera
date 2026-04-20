import * as THREE from 'three';

export interface Bootstrap {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
}

export function createBootstrap(canvas: HTMLCanvasElement): Bootstrap {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  // Daylight-ish placeholder (matches the mean tone of our HDRI) so the sky
  // still reads well during the brief window before installHdriSky resolves.
  scene.background = new THREE.Color(0xa7c3d9);
  // No fog: the ground plane (`GROUND_SIZE` in `level.ts`) extends well past
  // the camera's far plane so its edge is never visible, and any fog tint
  // mismatched with the HDRI horizon reads as a bright haze band rather
  // than atmospheric depth. Without fog the distant grass simply meets the
  // sky at the geometric horizon, which is how real flat terrain looks.
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  return { renderer, scene, camera, canvas };
}

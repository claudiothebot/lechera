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
  // Linear fog: only a light atmospheric perspective on the *relief ring*
  // (ridge peaks sit ~300–400 m out). If `far` is too short or the colour is
  // as bright as the sky, distant hills hit 100 % fog and read as white
  // blobs. Keep `near` past gameplay (~55 m) so the village stays crisp;
  // push `far` past the ridge; tint muted blue-green so hills blend toward
  // haze, not toward paper-white.
  scene.fog = new THREE.Fog(0x8a9f90, 100, 420);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  return { renderer, scene, camera, canvas };
}

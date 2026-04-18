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
  scene.fog = new THREE.Fog(0xc7d8e5, 60, 180);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  return { renderer, scene, camera, canvas };
}

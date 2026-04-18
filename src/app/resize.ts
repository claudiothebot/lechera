import type * as THREE from 'three';

export interface ResizeHandle {
  install(): void;
  dispose(): void;
}

export function createResize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): ResizeHandle {
  const handle = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  return {
    install() {
      window.addEventListener('resize', handle);
      handle();
    },
    dispose() {
      window.removeEventListener('resize', handle);
    },
  };
}

import * as THREE from 'three';

export interface VibeJamPortalsOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  getPlayerObject: () => THREE.Object3D;
  getPlayerName: () => string | null;
  getPlayerColor: () => string | null;
  getPlayerSpeed: () => number;
  spawnPoint: { x: number; z: number };
  exitPosition: { x: number; z: number };
}

export interface VibeJamPortals {
  update(dt: number): void;
  dispose(): void;
}

const PORTAL_URL = 'https://vibej.am/portal/2026';
const TRIGGER_RADIUS_M = 1.35;
const RETURN_PORTAL_DELAY_MS = 4500;

export function cameFromVibeJamPortal(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('portal') === 'true' || params.get('portal') === '1';
}

export function createVibeJamPortals(
  options: VibeJamPortalsOptions,
): VibeJamPortals {
  const group = new THREE.Group();
  group.name = 'vibe-jam-portals';
  options.scene.add(group);

  const exitPortal = createPortalMesh({
    color: 0x2cff9f,
    label: 'Vibe Jam Portal',
    position: options.exitPosition,
  });
  group.add(exitPortal.root);

  const returnPortal =
    cameFromVibeJamPortal() && new URLSearchParams(window.location.search).get('ref')
      ? createPortalMesh({
          color: 0xff5c7a,
          label: 'Return Portal',
          position: options.spawnPoint,
        })
      : null;
  if (returnPortal) group.add(returnPortal.root);
  const returnPortalReadyAt = performance.now() + RETURN_PORTAL_DELAY_MS;

  const playerPos = new THREE.Vector3();
  let redirecting = false;

  return {
    update(dt) {
      if (redirecting) return;
      exitPortal.update(dt, options.camera);
      returnPortal?.update(dt, options.camera);

      options.getPlayerObject().getWorldPosition(playerPos);
      if (distanceXZ(playerPos, exitPortal.root.position) <= TRIGGER_RADIUS_M) {
        redirecting = true;
        window.location.href = buildExitUrl(options);
        return;
      }

      if (
        returnPortal &&
        performance.now() >= returnPortalReadyAt &&
        distanceXZ(playerPos, returnPortal.root.position) <= TRIGGER_RADIUS_M
      ) {
        const url = buildReturnUrl();
        if (url) {
          redirecting = true;
          window.location.href = url;
        }
      }
    },
    dispose() {
      options.scene.remove(group);
      disposeObject(group);
    },
  };
}

function buildExitUrl(options: VibeJamPortalsOptions): string {
  const params = new URLSearchParams(window.location.search);
  params.set('portal', 'true');
  params.set('ref', window.location.host);
  const name = options.getPlayerName()?.trim();
  if (name) params.set('username', name);
  const color = options.getPlayerColor()?.trim();
  if (color) params.set('color', color);
  const speed = options.getPlayerSpeed();
  if (Number.isFinite(speed) && speed > 0) {
    params.set('speed', speed.toFixed(2));
  }
  return `${PORTAL_URL}?${params.toString()}`;
}

function buildReturnUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref')?.trim();
  if (!ref) return null;
  params.set('portal', 'true');
  params.set('ref', window.location.host);
  const target = /^https?:\/\//i.test(ref) ? ref : `https://${ref}`;
  return `${target}${target.includes('?') ? '&' : '?'}${params.toString()}`;
}

function distanceXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function createPortalMesh(options: {
  color: number;
  label: string;
  position: { x: number; z: number };
}): {
  root: THREE.Group;
  update(dt: number, camera: THREE.Camera): void;
} {
  const root = new THREE.Group();
  root.position.set(options.position.x, 1.55, options.position.z);
  root.name = options.label.toLowerCase().replace(/\s+/g, '-');

  const color = new THREE.Color(options.color);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.08, 18, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    }),
  );
  root.add(ring);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.12, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  root.add(disc);

  const glow = new THREE.PointLight(color, 2.2, 6);
  glow.position.set(0, 0, 0.4);
  root.add(glow);

  const particles = createPortalParticles(color);
  root.add(particles);

  const label = createLabel(options.label, color);
  label.position.y = 1.75;
  root.add(label);

  return {
    root,
    update(dt, camera) {
      ring.rotation.z += dt * 0.85;
      disc.rotation.z -= dt * 0.35;
      particles.rotation.z -= dt * 0.55;
      root.lookAt(camera.position.x, root.position.y, camera.position.z);
    },
  };
}

function createPortalParticles(color: THREE.Color): THREE.Points {
  const count = 160;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const radius = 0.55 + Math.random() * 0.85;
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = Math.sin(a) * radius;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.28;
    const jitter = 0.75 + Math.random() * 0.25;
    colors[i * 3] = color.r * jitter;
    colors[i * 3 + 1] = color.g * jitter;
    colors[i * 3 + 2] = color.b * jitter;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
}

function createLabel(text: string, color: THREE.Color): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 42px Bungee, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(9, 8, 18, 0.88)';
    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 0.92),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  mesh.name = `${text.toLowerCase().replace(/\s+/g, '-')}-label`;
  return mesh;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  const maybeTextured = material as THREE.Material & { map?: THREE.Texture };
  maybeTextured.map?.dispose();
  material.dispose();
}

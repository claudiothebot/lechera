import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * `public/models/billboard-opt.glb` — screen rect + collision for tweet planes.
 * No option bag: tune the constants below if this mesh changes.
 */

export interface BillboardScreenPose {
  offset: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
}

export interface BillboardModel {
  instance(): THREE.Object3D;
  halfX: number;
  halfZ: number;
  halfY: number;
  screen: BillboardScreenPose;
  /** Wood depth (m) — rear tweet quad sits `panelThicknessM` behind the front face. */
  panelThicknessM: number;
}

// --- `billboard-opt.glb` tuning (single asset; edit here only) ---

const BILLBOARD_WORLD_SCALE = 2;
/** Grosor del panel de madera (m), cara delantera → trasera. */
const PANEL_THICKNESS_M = 0.07;
/**
 * Cara del cartel: normal local hacia fuera. Este GLB usa −Z como frente
 * (si sustituyes el modelo y el tweet sale al revés, cambia a `(0,0,1)` o ±X
 * y ajusta `offset.z` en una línea).
 */
const SCREEN_NORMAL = new THREE.Vector3(0, 0, -1);

const SCREEN_WIDTH_FRAC = 0.68;
const SCREEN_HEIGHT_FRAC = 0.43;
const SCREEN_CENTRE_Y_FRAC = 0.564;
const SCREEN_SCALE = 1;
const SCREEN_CENTER_OFFSET_X_M = -0.02;
const SCREEN_CENTER_OFFSET_ALONG_NORMAL_M = -0.06

// -----------------------------------------------------------------

export async function loadBillboardModel(
  url = '/models/billboard-opt.glb',
): Promise<BillboardModel> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

  scene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    // Meshy-exported GLBs ship with `doubleSided: true` by default, which
    // doubles the fragment shader cost on opaque geometry. Force FrontSide
    // here rather than editing the asset so a re-export can't regress it.
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (mat) mat.side = THREE.FrontSide;
    }
  });

  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(scene, true);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(centre);

  const scale = BILLBOARD_WORLD_SCALE;

  scene.position.set(-centre.x, -bbox.min.y, -centre.z);

  const wrapper = new THREE.Group();
  wrapper.name = 'billboard';
  wrapper.add(scene);
  wrapper.scale.setScalar(scale);

  const scaledW = size.x * scale;
  const scaledH = size.y * scale;
  const scaledD = size.z * scale;

  const yCenter = scaledH * SCREEN_CENTRE_Y_FRAC;
  const screenW = scaledW * SCREEN_WIDTH_FRAC * SCREEN_SCALE;
  const screenH = scaledH * SCREEN_HEIGHT_FRAC * SCREEN_SCALE;

  const normal = SCREEN_NORMAL.clone().normalize();
  const offset = new THREE.Vector3(SCREEN_CENTER_OFFSET_X_M, yCenter, 0).addScaledVector(
    normal,
    SCREEN_CENTER_OFFSET_ALONG_NORMAL_M,
  );

  return {
    instance() {
      return wrapper.clone(true);
    },
    halfX: scaledW * 0.5,
    halfZ: scaledD * 0.5,
    halfY: scaledH * 0.5,
    screen: {
      offset,
      normal,
      width: screenW,
      height: screenH,
    },
    panelThicknessM: PANEL_THICKNESS_M,
  };
}

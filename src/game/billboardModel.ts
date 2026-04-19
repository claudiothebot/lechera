import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Ancient-billboard obstacle/decoration, loaded from a Meshy-AI single-mesh GLB.
 * Same integration pattern as `houseModel.ts`: load once, centre on XZ, drop
 * min-Y to 0, scale to a target width, clone per placement. In addition to the
 * visual, the model exposes a *screen rect* — a local-space plane we later
 * attach a CanvasTexture plane to (see `tweetBillboards.ts`).
 *
 * The screen rect's pose is a guess: Meshy meshes are monolithic so we can't
 * query "the board face" directly. The defaults target the upper ~⅔ of the
 * bounding box facing local -Z, which matches a roadside signpost layout.
 * Tune from the call site once it's in the scene.
 */

export interface BillboardScreenPose {
  /** Local-space centre of the screen, in metres (post-scale). */
  offset: THREE.Vector3;
  /** Local-space outward normal of the screen. */
  normal: THREE.Vector3;
  /** Screen width in metres (post-scale). */
  width: number;
  /** Screen height in metres (post-scale). */
  height: number;
}

export interface BillboardModel {
  /**
   * Stamp out a new instance. Its local origin sits at the XZ centre of
   * the footprint with min-Y at 0, so `instance.position.set(x, 0, z)`
   * drops it cleanly on the ground.
   */
  instance(): THREE.Object3D;
  /** Collision AABB half-extents, used for roughly keeping players clear. */
  halfX: number;
  halfZ: number;
  halfY: number;
  /** Default screen pose; can be overridden per-instance from the call site. */
  screen: BillboardScreenPose;
  /**
   * Front face → back outer face along `-screen.normal` (metres, post-scale).
   * Used to place the rear tweet quad just past the wood so it is visible
   * from behind the panel.
   */
  panelThicknessM: number;
}

export type FrontAxis = '+z' | '-z' | '+x' | '-x';

export interface BillboardModelOptions {
  /**
   * Target largest-XZ-axis size after scaling, in metres. Default sized so a
   * roadside billboard reads at ~5–10m viewing distance without dwarfing the
   * milkmaid.
   */
  targetFootprintM?: number;
  /**
   * Fraction of the sign's in-plane width the screen occupies (0..1). The
   * remaining sliver accounts for the board's wooden frame.
   */
  screenWidthFrac?: number;
  /** Fraction of the sign's in-plane height the screen occupies (0..1). */
  screenHeightFrac?: number;
  /**
   * Vertical centre of the screen, expressed as a fraction of scaled bbox
   * height (0 = ground, 1 = top). 0.5 keeps the plane in the middle of the
   * sign face, which for this billboard sits between its two posts; bias
   * upward with 0.55+ once you've seen the shape of the actual board.
   */
  screenCentreYFrac?: number;
  /**
   * Which local axis the board's front face looks along. When omitted, the
   * loader picks the thinner of {X, Z} (i.e. the depth axis) automatically
   * and uses its negative as the forward direction. Override explicitly if
   * the text ends up on the back of the board — just flip the sign.
   */
  frontAxis?: FrontAxis;
  /**
   * Uniform scale on the computed screen width and height (1 = use fracs
   * as-is). Tuned so the card sits inside the wooden frame.
   */
  screenScale?: number;
  /**
   * How far past the bbox half-depth the screen sits: `1` = flush on the
   * face plane, `>1` = floats toward the viewer. Keep barely above 1 to
   * avoid z-fighting; lower = hugging the panel.
   */
  screenFaceEps?: number;
  /**
   * In-plane nudge toward the viewer's right (metres), along
   * `normalize(cross(worldUp, normal))`.
   */
  screenNudgeRightM?: number;
  /** Move the screen down along world +Y (subtracts from offset Y). */
  screenNudgeDownM?: number;
  /**
   * Extra fraction of the sign bbox *height* added to the screen, extending
   * **downward only** (the top edge stays where it was). 0.06–0.08 reads as
   * "a bit taller along the bottom" without climbing into the crossbar.
   */
  screenGrowDownFrac?: number;
  /**
   * Wood depth from the front screen anchor to the back of the panel. When
   * omitted, estimated from `min(scaledW, scaledD)` (clamped ~9–22 cm).
   */
  panelThicknessM?: number;
}

const DEFAULTS: Required<Omit<BillboardModelOptions, 'frontAxis' | 'panelThicknessM'>> = {
  targetFootprintM: 4.5,
  screenWidthFrac: 0.78,
  screenHeightFrac: 0.7,
  screenCentreYFrac: 0.5,
  /** ~15 % smaller than the previous 0.7 default (0.7 × 0.85). */
  screenScale: 0.595,
  screenFaceEps: 0.42,
  screenNudgeRightM: 0.08,
  screenNudgeDownM: 0.1,
  screenGrowDownFrac: 0.07,
};

export async function loadBillboardModel(
  url = '/models/billboard.glb',
  options: BillboardModelOptions = {},
): Promise<BillboardModel> {
  const opts = { ...DEFAULTS, ...options };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

  scene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  scene.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(scene, true);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(centre);

  const largestXZ = Math.max(size.x, size.z) || 1;
  const scale = opts.targetFootprintM / largestXZ;

  // One-off sanity log so tuning the screen pose is data-driven, not guessing.
  // Cheap (fires once per load), and the info you really want when the
  // screen plane lands somewhere unexpected.
  console.info(
    `[billboard] bbox size=${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m (raw), scale=${scale.toFixed(3)}`,
  );

  // Inner group re-centres the raw mesh on its footprint and drops min-Y to
  // 0; outer wrapper applies the uniform scale. Lets downstream code rotate
  // about the footprint centre without weird offsets.
  scene.position.set(-centre.x, -bbox.min.y, -centre.z);

  const wrapper = new THREE.Group();
  wrapper.name = 'billboard';
  wrapper.add(scene);
  wrapper.scale.setScalar(scale);

  const scaledW = size.x * scale;
  const scaledH = size.y * scale;
  const scaledD = size.z * scale;

  const thinXZ = Math.min(scaledW, scaledD);
  const panelThicknessM =
    opts.panelThicknessM ??
    THREE.MathUtils.clamp(thinXZ * 0.14, 0.16, 0.22);

  // Auto-detect the sign face when the caller didn't force one. For a flat
  // billboard the sign face is the bbox face with the largest area. The two
  // candidate pairs are ±X (area = Y·Z) and ±Z (area = X·Y); whichever is
  // larger, the depth is the OTHER horizontal axis. We pick the negative
  // direction by default because that's the glTF convention for "forward";
  // flip via `frontAxis: '+z'` / `'+x'` if this asset was exported the
  // other way (the symptom is the text appearing on the back face).
  const frontAxis: FrontAxis =
    opts.frontAxis ?? (size.x < size.z ? '-x' : '-z');

  const eps = opts.screenFaceEps;

  const normal = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const yCenter = scaledH * opts.screenCentreYFrac;
  let screenW: number;
  const growDown = scaledH * opts.screenGrowDownFrac;
  let screenH = scaledH * opts.screenHeightFrac + growDown;

  console.info(
    `[billboard] ${opts.frontAxis ? 'forced' : 'auto-detected'} frontAxis=${frontAxis}, panelThicknessM=${panelThicknessM.toFixed(3)}`,
  );

  switch (frontAxis) {
    case '+z':
      normal.set(0, 0, 1);
      offset.set(0, yCenter, scaledD * 0.5 * eps);
      screenW = scaledW * opts.screenWidthFrac;
      break;
    case '-z':
      normal.set(0, 0, -1);
      offset.set(0, yCenter, -scaledD * 0.5 * eps);
      screenW = scaledW * opts.screenWidthFrac;
      break;
    case '+x':
      normal.set(1, 0, 0);
      offset.set(scaledW * 0.5 * eps, yCenter, 0);
      screenW = scaledD * opts.screenWidthFrac;
      break;
    case '-x':
      normal.set(-1, 0, 0);
      offset.set(-scaledW * 0.5 * eps, yCenter, 0);
      screenW = scaledD * opts.screenWidthFrac;
      break;
  }

  // Viewer-right in the sign plane (Y-up world): cross(up, outward normal).
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal);
  if (right.lengthSq() > 1e-10) {
    right.normalize();
    offset.addScaledVector(right, opts.screenNudgeRightM);
  }
  offset.y -= opts.screenNudgeDownM;

  screenW *= opts.screenScale;
  screenH *= opts.screenScale;
  // Keep the top edge fixed while `growDown` adds height: shift centre down
  // by half the added world height.
  offset.y -= (growDown * opts.screenScale) / 2;

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
    panelThicknessM,
  };
}

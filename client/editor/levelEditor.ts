import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createBootstrap } from '../app/bootstrap';
import { createResize } from '../app/resize';
import {
  buildBillboardPlacements,
  generateBillboardPlacements,
} from '../game/billboardLayout';
import { EXAMPLE_TWEETS } from '../game/exampleTweets';
import {
  createLevel,
  loadLevelHouses,
  loadLevelTextures,
  loadLevelTrees,
  loadLevelSceneryProps,
  type Level,
} from '../game/level';
import {
  defaultLevelDefinition,
  loadDefaultLevelDefinition,
  loadLevelDefinitionFromUrl,
  parseLevelDefinitionJson,
  serializeLevelDefinition,
} from '../game/levelLoader';
import {
  cloneLevelDefinition,
  HOUSE_VARIANT_KINDS,
  resolveHouseVariant,
  SCENERY_PROP_KINDS,
  TREE_VARIANT_KINDS,
  type HouseSlotDefinition,
  type HouseVariantKind,
  type LevelDefinition,
  type SceneryPropKind,
  type TreeVariantKind,
} from '../game/levelDefinition';
import {
  ASSET_CATALOG,
  modeHasAssetCatalog,
  type AssetCatalogMode,
} from './assetCatalog';
import { loadBillboardModel } from '../game/billboardModel';
import {
  buildBillboardCollisionObstacles,
  createTweetBillboards,
  type TweetBillboardsManager,
} from '../game/tweetBillboards';
import {
  clearColliderPresetsCache,
  cloneColliderPresets,
  fetchColliderPresets,
  reapplyAllColliderPresets,
  serializeColliderPresets,
} from '../game/colliderPresets';
import { installHdriSky } from '../render/sky';
import { houseFootprintWorldCornersXz } from '../game/obb2dPlayerCollision';
import { mountColliderPresetForm } from './colliderPresetForm';
import { DREAM_GOALS, GOAL_RADIUS } from '@milk-dreams/shared';

type EditorMode = 'houses' | 'trees' | 'props' | 'billboards' | 'paving' | 'boundary';

type Selection =
  | { kind: 'house'; index: number }
  | { kind: 'paved-path-point'; pathIndex: number; pointIndex: number }
  | { kind: 'boundary-center' }
  | { kind: 'billboard'; index: number }
  | { kind: 'tree'; index: number }
  | { kind: 'prop'; index: number }
  | null;

interface PreviewState {
  level: Level;
  billboardManager: TweetBillboardsManager | null;
  colliderWireGroup: THREE.Group;
}

interface EditorUi {
  modeSelect: HTMLSelectElement;
  modeHint: HTMLElement;
  selectionLabel: HTMLElement;
  selectionDetails: HTMLElement;
  addKindField: HTMLElement;
  addKindSelect: HTMLSelectElement;
  addButton: HTMLButtonElement;
  deleteButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  saveStatus: HTMLElement;
  statusLabel: HTMLElement;
  advancedBoundaryRadius: HTMLInputElement;
  advancedAutoBillboards: HTMLButtonElement;
  advancedReset: HTMLButtonElement;
  advancedDownload: HTMLButtonElement;
  advancedImport: HTMLButtonElement;
  advancedJson: HTMLTextAreaElement;
  showDreamCircles: HTMLInputElement;
  showColliders: HTMLInputElement;
  colliderFields: HTMLElement;
  colliderSaveStatus: HTMLElement;
  colliderSaveButton: HTMLButtonElement;
}

const HELPER_HEIGHT_Y = 0.12;
const BILLBOARD_HELPER_Y = 1.0;
const DRAFT_STORAGE_KEY = 'milk-dreams/level-editor-draft/level-01';
const DREAM_CIRCLES_PREF_KEY = 'milk-dreams/level-editor-show-dream-circles';
const DREAM_CIRCLE_COLOR = 0xe84393;
/**
 * Lift the dream ring slightly higher than `HELPER_HEIGHT_Y` so it never
 * z-fights with paving-path helpers that also sit at that height, and
 * stays readable against the goal ring the runtime draws at y=0.05.
 */
const DREAM_CIRCLE_Y = 0.14;
const DREAM_CIRCLE_LABEL_Y = 1.8;

const MODE_LABELS: Record<EditorMode, string> = {
  houses: 'Houses',
  trees: 'Trees',
  props: 'Props (haystack / cart / well)',
  billboards: 'Billboards (tweets)',
  paving: 'Paving path',
  boundary: 'World boundary',
};

const MODE_HINTS: Record<EditorMode, string> = {
  houses: 'Arrows move (snap 0.5 m), ring rotates (snap 15°). Hold Shift for free motion.',
  trees: 'Arrows move (snap 0.5 m), ring rotates (snap 15°). Hold Shift for free motion.',
  props: 'Arrows move (snap 0.5 m), ring rotates (snap 15°). Hold Shift for free motion.',
  billboards: 'Arrows move, ring rotates. Hold Shift for free motion. Tweet index below.',
  paving:
    'Drag a paving point to move it (snap 0.5 m). Add inserts a point after the selected one.',
  boundary:
    'Drag the centre dot to reposition the world boundary. Radius is in Advanced.',
};

const ADD_LABELS: Record<EditorMode, string> = {
  houses: '+ Add house',
  trees: '+ Add tree',
  props: '+ Add prop',
  billboards: '+ Add billboard',
  paving: '+ Add point',
  boundary: '',
};

/**
 * Resolve the server HTTP base for the dev-only `POST /dev/level` save.
 * Reuses the same override convention as the game (`?mp=ws://host:port`
 * or `?save=http://host:port`). Falls back to `http://localhost:2567`.
 */
function resolveServerHttpBase(): string {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get('save');
  if (explicit) return explicit.replace(/\/$/, '');
  const mp = params.get('mp');
  if (mp) {
    if (mp.startsWith('wss://')) return 'https://' + mp.slice('wss://'.length).replace(/\/$/, '');
    if (mp.startsWith('ws://')) return 'http://' + mp.slice('ws://'.length).replace(/\/$/, '');
    return mp.replace(/\/$/, '');
  }
  return 'http://localhost:2567';
}

function makeUi(root: HTMLElement): EditorUi {
  root.innerHTML = `
    <div class="level-editor">
      <div class="level-editor__title">Level Editor</div>

      <label class="level-editor__field">
        <span>What to edit</span>
        <select id="level-editor-mode">
          <option value="houses">Houses</option>
          <option value="trees">Trees</option>
          <option value="props">Props (haystack / cart / well)</option>
          <option value="billboards">Billboards (tweets)</option>
          <option value="paving">Paving path</option>
          <option value="boundary">World boundary</option>
        </select>
      </label>
      <div id="level-editor-mode-hint" class="level-editor__hint"></div>

      <div class="level-editor__card">
        <div class="level-editor__card-title">Selection</div>
        <div id="level-editor-selection" class="level-editor__selection-label">Click an item in the scene</div>
        <div id="level-editor-selection-details"></div>
      </div>

      <div class="level-editor__add-row">
        <label id="level-editor-add-kind-field" class="level-editor__field level-editor__add-kind" hidden>
          <span>Type</span>
          <select id="level-editor-add-kind"></select>
        </label>
        <div class="level-editor__row">
          <button id="level-editor-add" type="button">+ Add</button>
          <button id="level-editor-delete" type="button">Delete</button>
        </div>
      </div>

      <div class="level-editor__save-bar">
        <div id="level-editor-save-status" class="level-editor__save-status">All changes saved</div>
        <button id="level-editor-save" type="button" class="level-editor__save-button">Save to file</button>
      </div>

      <label class="level-editor__field level-editor__field--inline">
        <input id="level-editor-show-dream-circles" type="checkbox" />
        <span>Show dream circles</span>
      </label>

      <details class="level-editor__advanced" id="level-editor-collider-details">
        <summary>Collider presets (global)</summary>
        <p class="level-editor__hint" style="margin:0.25rem 0 0.35rem; font-size:0.7rem; line-height:1.4;">
          Per object type, not per level. Scales the collision box vs mesh (or trunk radius for trees). Live on the 3D preview.
        </p>
        <label class="level-editor__field level-editor__field--inline">
          <input id="level-editor-show-colliders" type="checkbox" />
          <span>Show collision wireframes</span>
        </label>
        <div id="level-editor-collider-fields" class="level-editor__collider-fields"></div>
        <div class="level-editor__save-bar">
          <div id="level-editor-collider-save-status" class="level-editor__save-status">All preset changes saved</div>
          <button id="level-editor-collider-save" type="button" class="level-editor__save-button" disabled>Save presets</button>
        </div>
      </details>

      <details class="level-editor__advanced">
        <summary>Advanced</summary>
        <label class="level-editor__field">
          <span>World boundary radius (m)</span>
          <input id="level-editor-boundary-radius" type="number" step="0.5" min="1" />
        </label>
        <button id="level-editor-autobillboards" type="button">Auto-generate billboards</button>
        <div class="level-editor__row">
          <button id="level-editor-download" type="button">Download JSON</button>
          <button id="level-editor-import" type="button">Import from textarea</button>
        </div>
        <textarea id="level-editor-json" spellcheck="false" rows="8"></textarea>
        <button id="level-editor-reset" type="button" class="level-editor__danger">
          Reset to default layout
        </button>
      </details>

      <div id="level-editor-status" class="level-editor__status" aria-live="polite"></div>
    </div>
  `;

  const query = <T extends HTMLElement>(selector: string) => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`[editor] missing ${selector}`);
    return el;
  };

  return {
    modeSelect: query('#level-editor-mode'),
    modeHint: query('#level-editor-mode-hint'),
    selectionLabel: query('#level-editor-selection'),
    selectionDetails: query('#level-editor-selection-details'),
    addKindField: query('#level-editor-add-kind-field'),
    addKindSelect: query('#level-editor-add-kind'),
    addButton: query('#level-editor-add'),
    deleteButton: query('#level-editor-delete'),
    saveButton: query('#level-editor-save'),
    saveStatus: query('#level-editor-save-status'),
    statusLabel: query('#level-editor-status'),
    advancedBoundaryRadius: query('#level-editor-boundary-radius'),
    advancedAutoBillboards: query('#level-editor-autobillboards'),
    advancedReset: query('#level-editor-reset'),
    advancedDownload: query('#level-editor-download'),
    advancedImport: query('#level-editor-import'),
    advancedJson: query('#level-editor-json'),
    showDreamCircles: query('#level-editor-show-dream-circles'),
    showColliders: query('#level-editor-show-colliders'),
    colliderFields: query('#level-editor-collider-fields'),
    colliderSaveStatus: query('#level-editor-collider-save-status'),
    colliderSaveButton: query('#level-editor-collider-save'),
  };
}

function disposeMaterial(material: THREE.Material) {
  const maybeMaterial = material as THREE.Material & Record<string, unknown>;
  for (const value of Object.values(maybeMaterial)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!obj.userData.disposeManaged) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
  root.removeFromParent();
}

function circleLine(radius: number, color: number): THREE.LineLoop {
  const points: THREE.Vector3[] = [];
  const segments = 64;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
  line.userData.disposeManaged = true;
  return line;
}

/**
 * Fill `group` with one ring + numbered badge per dream goal, using the
 * shared `DREAM_GOALS` / `GOAL_RADIUS` constants. Pure visualisation —
 * dream positions are not editor-authored (see `shared/src/dreams.ts`).
 * Called once at boot; toggled via `group.visible`.
 */
function buildDreamCircles(group: THREE.Group) {
  DREAM_GOALS.forEach((goal, index) => {
    const ring = circleLine(GOAL_RADIUS, DREAM_CIRCLE_COLOR);
    ring.position.set(goal.x, DREAM_CIRCLE_Y, goal.z);
    // Draw the ring on top of the ground without the magenta line being
    // hidden by the runtime's goal ring / aura at the first dream.
    const ringMat = ring.material as THREE.LineBasicMaterial;
    ringMat.depthTest = false;
    ringMat.transparent = true;
    ring.renderOrder = 10;
    group.add(ring);

    const label = makeDreamLabel(index + 1);
    label.position.set(goal.x, DREAM_CIRCLE_LABEL_Y, goal.z);
    group.add(label);
  });
}

/**
 * Canvas-backed sprite showing the 1-based dream index. Sprite (not a
 * text mesh) so it always faces the camera as the orbit view rotates.
 */
function makeDreamLabel(n: number): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(232, 67, 147, 0.92)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 74px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), size / 2, size / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 1.6, 1);
  sprite.renderOrder = 11;
  return sprite;
}

function selectionSupportsRotation(selection: Selection): boolean {
  const k = selection?.kind;
  return k === 'house' || k === 'billboard' || k === 'tree' || k === 'prop';
}

function helperLabel(selection: Selection): string {
  if (!selection) return 'Click an item in the scene';
  switch (selection.kind) {
    case 'house':
      return `House #${selection.index + 1}`;
    case 'paved-path-point':
      return `Paving path ${selection.pathIndex + 1} — point ${selection.pointIndex + 1}`;
    case 'boundary-center':
      return 'World boundary centre';
    case 'billboard':
      return `Billboard #${selection.index + 1}`;
    case 'tree':
      return `Tree #${selection.index + 1}`;
    case 'prop':
      return `Prop #${selection.index + 1}`;
  }
}

function clampHelperObject(selection: Selection, object: THREE.Object3D, definition: LevelDefinition) {
  switch (selection?.kind) {
    case 'house': {
      const slot = definition.houseSlots[selection.index];
      if (!slot) return;
      object.position.y = slot.halfY;
      object.rotation.x = 0;
      object.rotation.z = 0;
      break;
    }
    case 'boundary-center':
    case 'paved-path-point':
      object.position.y = HELPER_HEIGHT_Y;
      object.rotation.set(0, 0, 0);
      break;
    case 'billboard':
      object.position.y = BILLBOARD_HELPER_Y;
      object.rotation.x = 0;
      object.rotation.z = 0;
      break;
    case 'tree':
    case 'prop':
      object.position.y = HELPER_HEIGHT_Y;
      object.rotation.x = 0;
      object.rotation.z = 0;
      break;
    default:
      break;
  }
}

async function loadInitialDefinition(): Promise<LevelDefinition> {
  const params = new URLSearchParams(window.location.search);
  const explicitUrl = params.get('level');
  if (explicitUrl) return loadLevelDefinitionFromUrl(explicitUrl);
  try {
    return await loadDefaultLevelDefinition();
  } catch {
    return defaultLevelDefinition();
  }
}

export async function bootLevelEditor(canvas: HTMLCanvasElement): Promise<void> {
  document.body.classList.add('editor-active');
  const root = document.querySelector<HTMLElement>('#level-editor-root');
  if (!root) throw new Error('Element #level-editor-root not found');

  const ui = makeUi(root);
  const { renderer, scene, camera } = createBootstrap(canvas);
  const resize = createResize(renderer, camera);
  resize.install();

  const ambient = new THREE.HemisphereLight(0xbfd8ef, 0x3a3424, 0.22);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff0d6, 1.1);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(sun);

  installHdriSky(renderer, scene, '/hdri/daysky_001b_2k.exr', {
    backgroundIntensity: 1.0,
    environmentIntensity: 0.5,
    yawRotation: 0,
  }).catch((err) => {
    console.error('[editor] failed to load HDRI', err);
  });

  camera.position.set(34, 30, 36);
  camera.lookAt(0, 0, -5);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0, -5);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.minDistance = 8;
  orbit.maxDistance = 140;

  // Editor is strictly top-down 2.5D. Three's `TransformControls` can only
  // show one gizmo mode at a time, so we use TWO instances attached to the
  // same object simultaneously:
  //   - `transformMove`: translate on XZ (arrows on the ground plane).
  //   - `transformRotate`: rotate around Y (the yaw ring above the object).
  // Making the ring noticeably larger than the arrows avoids pick ambiguity
  // when the cursor hovers near the centre. This replaces the old Move /
  // Rotate toggle where authors had to swap modes to rotate.
  // Snap steps for both gizmos and the rotate buttons below. Authors can
  // temporarily disable the snap by holding Shift while dragging — this is
  // a built-in behaviour of `TransformControls` once a snap value is set.
  // Kept out of the UI as constants so all rotation paths (ring + buttons)
  // agree on the same step size.
  const ROTATION_SNAP_RAD = THREE.MathUtils.degToRad(15);
  const TRANSLATION_SNAP_M = 0.5;

  const transformMove = new TransformControls(camera, renderer.domElement);
  transformMove.setSpace('world');
  transformMove.setMode('translate');
  transformMove.setTranslationSnap(TRANSLATION_SNAP_M);
  transformMove.showX = true;
  transformMove.showY = false;
  transformMove.showZ = true;
  scene.add(transformMove.getHelper());

  const transformRotate = new TransformControls(camera, renderer.domElement);
  transformRotate.setSpace('world');
  transformRotate.setMode('rotate');
  transformRotate.setRotationSnap(ROTATION_SNAP_RAD);
  transformRotate.showX = false;
  transformRotate.showY = true;
  transformRotate.showZ = false;
  transformRotate.size = 1.35;
  scene.add(transformRotate.getHelper());

  /** The mesh the two gizmos are currently attached to, for the shared
   *  "read transform back into the definition" helper. `null` when nothing
   *  is selected. */
  let attachedMesh: THREE.Object3D | null = null;

  const helpersGroup = new THREE.Group();
  helpersGroup.name = 'level-editor-helpers';
  scene.add(helpersGroup);

  const dreamCirclesGroup = new THREE.Group();
  dreamCirclesGroup.name = 'level-editor-dream-circles';
  scene.add(dreamCirclesGroup);
  buildDreamCircles(dreamCirclesGroup);
  const initialShowDreamCircles = (() => {
    try {
      return localStorage.getItem(DREAM_CIRCLES_PREF_KEY) === '1';
    } catch {
      return false;
    }
  })();
  dreamCirclesGroup.visible = initialShowDreamCircles;
  ui.showDreamCircles.checked = initialShowDreamCircles;

  const serverLoaded = await loadInitialDefinition();
  clearColliderPresetsCache();
  let workingPresets = cloneColliderPresets(await fetchColliderPresets());
  let savedColliderSerialized = serializeColliderPresets(workingPresets);
  let definition = cloneLevelDefinition(serverLoaded);
  /** Baseline we compare against to know if the editor has unsaved changes. */
  let savedSerialized = serializeLevelDefinition(serverLoaded);

  // Silently restore a local draft if it differs from what the server
  // served us. No modal / banner — the "Unsaved changes" indicator on
  // the Save bar is the only signal. Authors who want to throw the
  // draft away use "Reset to default layout" in Advanced, then Save.
  try {
    const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (rawDraft) {
      const draft = parseLevelDefinitionJson(rawDraft);
      if (serializeLevelDefinition(draft) !== savedSerialized) {
        definition = draft;
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }
  } catch (err) {
    console.warn('[editor] ignored invalid draft in localStorage', err);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  let currentMode: EditorMode = 'houses';
  let selected: Selection = null;
  let selectableMeshes: THREE.Mesh[] = [];
  let preview: PreviewState | null = null;
  let lastPointerDown: { x: number; y: number } | null = null;
  let buildRequestId = 0;
  let buildInFlight = false;
  const billboardModelPromise = loadBillboardModel();

  function setStatus(text: string) {
    ui.statusLabel.textContent = text;
  }

  function isDirty(): boolean {
    return serializeLevelDefinition(definition) !== savedSerialized;
  }

  function updateSaveBar() {
    const dirty = isDirty();
    ui.saveStatus.textContent = dirty ? '• Unsaved changes' : 'All changes saved';
    ui.saveStatus.classList.toggle('level-editor__save-status--dirty', dirty);
    ui.saveButton.disabled = !dirty;
  }

  function persistDraft() {
    try {
      if (isDirty()) {
        localStorage.setItem(DRAFT_STORAGE_KEY, serializeLevelDefinition(definition));
      } else {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('[editor] failed to persist draft', err);
    }
  }

  function syncFieldsFromDefinition() {
    ui.advancedBoundaryRadius.value = String(definition.worldBoundary.radius);
    ui.advancedJson.value = serializeLevelDefinition(definition);
    persistDraft();
    updateSaveBar();
  }

  function select(selection: Selection, object?: THREE.Object3D) {
    selected = selection;
    ui.selectionLabel.textContent = helperLabel(selection);
    if (selection && object) {
      attachedMesh = object;
      transformMove.attach(object);
      if (selectionSupportsRotation(selection)) transformRotate.attach(object);
      else transformRotate.detach();
    } else {
      attachedMesh = null;
      transformMove.detach();
      transformRotate.detach();
    }
    updateActionButtons();
    renderSelectionDetails();
  }

  function helperColor(selectedState: boolean, base: number): number {
    return selectedState ? 0xffd166 : base;
  }

  function clearHelpers() {
    // Dispose GPU resources for every child, then actually detach them from
    // the group. The previous implementation only called `disposeObjectTree`
    // on the group itself, which freed geometry/material memory but left
    // the mesh objects dangling inside `helpersGroup.children` — so the
    // old yellow house boxes kept rendering after switching modes.
    for (const child of helpersGroup.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(material)) material.forEach(disposeMaterial);
      else if (material) disposeMaterial(material);
    }
    helpersGroup.clear();
    selectableMeshes = [];
  }

  function makePointHelper(position: THREE.Vector3, color: number, selectionData: Selection) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 18, 14),
      new THREE.MeshBasicMaterial({
        color: helperColor(selected === selectionData ? true : false, color),
      }),
    );
    mesh.position.copy(position);
    mesh.userData.disposeManaged = true;
    mesh.userData.selection = selectionData;
    selectableMeshes.push(mesh);
    helpersGroup.add(mesh);
    return mesh;
  }

  function makeHouseHelper(slot: HouseSlotDefinition, index: number) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(slot.halfX * 2, slot.halfY * 2, slot.halfZ * 2),
      new THREE.MeshBasicMaterial({
        color: helperColor(selected?.kind === 'house' && selected.index === index, 0x8ecae6),
        transparent: true,
        opacity: 0.85,
      }),
    );
    mesh.position.set(slot.x, slot.halfY, slot.z);
    mesh.rotation.y = slot.yaw;
    mesh.userData.disposeManaged = true;
    mesh.userData.selection = { kind: 'house', index } satisfies Selection;
    selectableMeshes.push(mesh);
    helpersGroup.add(mesh);
  }

  function makeCylinderHelper(
    position: THREE.Vector3,
    yaw: number,
    color: number,
    selection: Selection,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 1.2, 18),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
      }),
    );
    mesh.position.copy(position);
    mesh.rotation.y = yaw;
    mesh.userData.disposeManaged = true;
    mesh.userData.selection = selection;
    selectableMeshes.push(mesh);
    helpersGroup.add(mesh);
    return mesh;
  }

  function rebuildHelpers() {
    clearHelpers();

    switch (currentMode) {
      case 'houses':
        definition.houseSlots.forEach((slot, index) => makeHouseHelper(slot, index));
        break;
      case 'paving':
        definition.pavedPaths.forEach((path, pathIndex) => {
          const baseColor = [0x06d6a0, 0x118ab2, 0xff9f1c][pathIndex % 3]!;
          path.waypoints.forEach((wp, pointIndex) => {
            makePointHelper(
              new THREE.Vector3(wp.x, HELPER_HEIGHT_Y, wp.z),
              baseColor,
              { kind: 'paved-path-point', pathIndex, pointIndex },
            );
          });
        });
        break;
      case 'boundary': {
        const center = new THREE.Vector3(
          definition.worldBoundary.centerX,
          HELPER_HEIGHT_Y,
          definition.worldBoundary.centerZ,
        );
        makePointHelper(center, 0xffd166, { kind: 'boundary-center' });
        const ring = circleLine(definition.worldBoundary.radius, 0xffd166);
        ring.position.set(
          definition.worldBoundary.centerX,
          HELPER_HEIGHT_Y * 0.5,
          definition.worldBoundary.centerZ,
        );
        helpersGroup.add(ring);
        break;
      }
      case 'billboards': {
        definition.billboards.forEach((placement, index) => {
          const color = helperColor(
            selected?.kind === 'billboard' && selected.index === index,
            0xf28482,
          );
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 1.6, 0.18),
            new THREE.MeshBasicMaterial({ color }),
          );
          mesh.position.set(placement.x, BILLBOARD_HELPER_Y, placement.z);
          mesh.rotation.y = placement.yaw;
          mesh.userData.disposeManaged = true;
          mesh.userData.selection = { kind: 'billboard', index } satisfies Selection;
          selectableMeshes.push(mesh);
          helpersGroup.add(mesh);
        });
        break;
      }
      case 'trees': {
        definition.trees.forEach((t, index) => {
          const color = helperColor(
            selected?.kind === 'tree' && selected.index === index,
            0x90be6d,
          );
          makeCylinderHelper(new THREE.Vector3(t.x, 0.6, t.z), t.yaw, color, {
            kind: 'tree',
            index,
          });
        });
        break;
      }
      case 'props': {
        definition.sceneryProps.forEach((p, index) => {
          const color = helperColor(
            selected?.kind === 'prop' && selected.index === index,
            0xf4a261,
          );
          makeCylinderHelper(new THREE.Vector3(p.x, 0.6, p.z), p.yaw, color, {
            kind: 'prop',
            index,
          });
        });
        break;
      }
    }

    if (selected) {
      const mesh = selectableMeshes.find((m) => {
        const sel = m.userData.selection as Selection | undefined;
        return JSON.stringify(sel) === JSON.stringify(selected);
      });
      if (mesh) select(selected, mesh);
      else select(null);
    } else {
      select(null);
    }
  }

  /**
   * Build a labelled `<select>` row backed by an options list. Shared by
   * every "pick a variant / kind" control so the editor stays consistent
   * regardless of asset category.
   */
  function appendSelectRow(
    label: string,
    options: ReadonlyArray<{ id: string; label: string }>,
    currentId: string,
    onChange: (id: string) => void,
  ) {
    const row = document.createElement('label');
    row.className = 'level-editor__field';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    row.appendChild(labelEl);
    const sel = document.createElement('select');
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === currentId) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(sel);
    ui.selectionDetails.appendChild(row);
  }

  /**
   * Append a row of 4 rotate-step buttons (↺90° / −15° / +15° / 90°↻).
   * Matches the 15° rotation snap on the gizmo ring so clicking a button
   * and dragging the ring both land on the same grid of angles.
   */
  function appendRotationButtons(getYaw: () => number, setYaw: (rad: number) => void) {
    const row = document.createElement('div');
    row.className = 'level-editor__field';
    const labelEl = document.createElement('span');
    labelEl.textContent = 'Rotate';
    row.appendChild(labelEl);

    const group = document.createElement('div');
    group.className = 'level-editor__rotate-buttons';

    const mk = (deltaDeg: number, label: string) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.className = 'level-editor__rotate-button';
      btn.title = `Rotate ${deltaDeg > 0 ? '+' : ''}${deltaDeg}°`;
      btn.addEventListener('click', () => {
        setYaw(getYaw() + (deltaDeg * Math.PI) / 180);
        syncFieldsFromDefinition();
        rebuildHelpers();
        void requestPreviewBuild();
      });
      group.appendChild(btn);
    };
    mk(-90, '↺ 90°');
    mk(-15, '−15°');
    mk(15, '+15°');
    mk(90, '90° ↻');

    row.appendChild(group);
    ui.selectionDetails.appendChild(row);
  }

  function renderSelectionDetails() {
    ui.selectionDetails.innerHTML = '';
    if (!selected) return;
    switch (selected.kind) {
      case 'house': {
        const slot = definition.houseSlots[selected.index];
        if (!slot) return;
        const current = resolveHouseVariant(slot, selected.index);
        appendSelectRow('Variant', ASSET_CATALOG.houses, current, (id) => {
          slot.variant = id as HouseVariantKind;
          syncFieldsFromDefinition();
          void requestPreviewBuild();
        });
        appendRotationButtons(
          () => slot.yaw,
          (rad) => {
            slot.yaw = rad;
          },
        );
        break;
      }
      case 'tree': {
        const placement = definition.trees[selected.index];
        if (!placement) return;
        appendSelectRow('Variant', ASSET_CATALOG.trees, placement.variant, (id) => {
          placement.variant = id as TreeVariantKind;
          syncFieldsFromDefinition();
          void requestPreviewBuild();
        });
        appendRotationButtons(
          () => placement.yaw,
          (rad) => {
            placement.yaw = rad;
          },
        );
        break;
      }
      case 'prop': {
        const placement = definition.sceneryProps[selected.index];
        if (!placement) return;
        appendSelectRow('Kind', ASSET_CATALOG.props, placement.kind, (id) => {
          placement.kind = id as SceneryPropKind;
          syncFieldsFromDefinition();
          void requestPreviewBuild();
        });
        appendRotationButtons(
          () => placement.yaw,
          (rad) => {
            placement.yaw = rad;
          },
        );
        break;
      }
      case 'billboard': {
        const placement = definition.billboards[selected.index];
        if (!placement) return;
        const row = document.createElement('label');
        row.className = 'level-editor__field';
        row.innerHTML = `<span>Tweet index</span>`;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = String(placement.tweetIndex ?? selected.index);
        input.addEventListener('change', () => {
          const next = Math.max(0, Math.round(Number(input.value) || 0));
          placement.tweetIndex = next;
          syncFieldsFromDefinition();
          void requestPreviewBuild();
        });
        row.appendChild(input);
        ui.selectionDetails.appendChild(row);
        appendRotationButtons(
          () => placement.yaw,
          (rad) => {
            placement.yaw = rad;
          },
        );
        break;
      }
      default:
        break;
    }
  }

  function updateDefinitionFromAttachedObject() {
    if (!selected || !attachedMesh) return;
    clampHelperObject(selected, attachedMesh, definition);
    switch (selected.kind) {
      case 'house': {
        const slot = definition.houseSlots[selected.index];
        if (!slot) return;
        slot.x = attachedMesh.position.x;
        slot.z = attachedMesh.position.z;
        slot.yaw = attachedMesh.rotation.y;
        break;
      }
      case 'paved-path-point': {
        const point = definition.pavedPaths[selected.pathIndex]?.waypoints[selected.pointIndex];
        if (!point) return;
        point.x = attachedMesh.position.x;
        point.z = attachedMesh.position.z;
        break;
      }
      case 'boundary-center':
        definition.worldBoundary.centerX = attachedMesh.position.x;
        definition.worldBoundary.centerZ = attachedMesh.position.z;
        break;
      case 'billboard': {
        const placement = definition.billboards[selected.index];
        if (!placement) return;
        placement.x = attachedMesh.position.x;
        placement.z = attachedMesh.position.z;
        placement.yaw = attachedMesh.rotation.y;
        break;
      }
      case 'tree': {
        const placement = definition.trees[selected.index];
        if (!placement) return;
        placement.x = attachedMesh.position.x;
        placement.z = attachedMesh.position.z;
        placement.yaw = attachedMesh.rotation.y;
        break;
      }
      case 'prop': {
        const placement = definition.sceneryProps[selected.index];
        if (!placement) return;
        placement.x = attachedMesh.position.x;
        placement.z = attachedMesh.position.z;
        placement.yaw = attachedMesh.rotation.y;
        break;
      }
    }
    syncFieldsFromDefinition();
  }

  async function disposePreview(prev: PreviewState | null) {
    if (!prev) return;
    prev.billboardManager?.dispose();
    scene.remove(prev.colliderWireGroup);
    for (const c of prev.colliderWireGroup.children) {
      const o = c as THREE.Mesh | THREE.Line;
      o.geometry?.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    }
    prev.colliderWireGroup.clear();
    disposeObjectTree(prev.level.group);
  }

  function updateColliderSaveBar() {
    const dirty = serializeColliderPresets(workingPresets) !== savedColliderSerialized;
    ui.colliderSaveStatus.textContent = dirty
      ? '• Unsaved collider changes'
      : 'All collider changes saved';
    ui.colliderSaveStatus.classList.toggle('level-editor__save-status--dirty', dirty);
    ui.colliderSaveButton.disabled = !dirty;
  }

  function rebuildColliderWireGroup(ps: PreviewState) {
    const g = ps.colliderWireGroup;
    for (const c of g.children) {
      const o = c as THREE.Mesh | THREE.Line;
      o.geometry?.dispose();
      const mat = o.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    }
    g.clear();
    g.visible = ui.showColliders.checked;
    if (!g.visible) return;
    const ringY = 0.1;
    for (const ob of ps.level.obstacles) {
      if (!ob.colliderTuning) continue;
      if (ob.houseFootprint2D) {
        const loopPts = houseFootprintWorldCornersXz(
          ob.center.x,
          ob.center.z,
          ob.houseFootprint2D,
        ).map(([x, z]) => new THREE.Vector3(x, ringY, z));
        const geom = new THREE.BufferGeometry().setFromPoints(loopPts);
        const line = new THREE.LineLoop(
          geom,
          new THREE.LineBasicMaterial({
            color: 0x2ec4b6,
            transparent: true,
            opacity: 0.95,
          }),
        );
        g.add(line);
        continue;
      }
      const box = new THREE.BoxGeometry(ob.halfX * 2, ob.halfY * 2, ob.halfZ * 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x2ec4b6,
        wireframe: true,
        transparent: true,
        opacity: 0.88,
      });
      const mesh = new THREE.Mesh(box, mat);
      mesh.position.copy(ob.center);
      g.add(mesh);
    }
  }

  const onColliderLive = () => {
    if (preview) {
      reapplyAllColliderPresets(preview.level, workingPresets);
      rebuildColliderWireGroup(preview);
    }
    updateColliderSaveBar();
  };
  mountColliderPresetForm(ui.colliderFields, workingPresets, onColliderLive);
  updateColliderSaveBar();

  async function saveColliderPresetsToServer() {
    if (serializeColliderPresets(workingPresets) === savedColliderSerialized) return;
    const body = serializeColliderPresets(workingPresets);
    const endpoint = `${resolveServerHttpBase()}/dev/collider-presets`;
    setStatus('Saving collider presets…');
    ui.colliderSaveButton.disabled = true;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText} ${text}`);
      }
      savedColliderSerialized = body;
      updateColliderSaveBar();
      setStatus('Saved to public/colliders/collider-presets.json');
    } catch (err) {
      console.error('[editor] collider preset save failed', err);
      setStatus(
        `Collider save failed — is the dev server on ${resolveServerHttpBase()}? See console.`,
      );
    } finally {
      updateColliderSaveBar();
    }
  }

  async function buildPreview(snapshot: LevelDefinition): Promise<PreviewState> {
    const level = createLevel(snapshot);
    await loadLevelTextures(level, renderer);
    await loadLevelHouses(level, workingPresets);
    await loadLevelTrees(level, DREAM_GOALS, workingPresets);
    await loadLevelSceneryProps(level, workingPresets);
    scene.add(level.group);
    const colliderWireGroup = new THREE.Group();
    colliderWireGroup.name = 'level-editor-collider-wires';
    scene.add(colliderWireGroup);
    const billboardModel = await billboardModelPromise;
    const placements = buildBillboardPlacements(
      snapshot,
      level.obstacles,
      DREAM_GOALS,
      EXAMPLE_TWEETS,
      { x: level.spawn.x, z: level.spawn.z },
    );
    level.addObstacles(buildBillboardCollisionObstacles(billboardModel, placements, workingPresets));
    const billboardManager = createTweetBillboards({
      scene,
      camera,
      renderer,
      billboard: billboardModel,
      placements,
      interactive: false,
    });
    return { level, billboardManager, colliderWireGroup };
  }

  async function requestPreviewBuild() {
    buildRequestId += 1;
    if (buildInFlight) return;
    buildInFlight = true;

    while (true) {
      const targetId = buildRequestId;
      const snapshot = cloneLevelDefinition(definition);
      let nextPreview: PreviewState | null = null;
      try {
        nextPreview = await buildPreview(snapshot);
      } catch (err) {
        console.error('[editor] preview build failed', err);
        if (nextPreview) await disposePreview(nextPreview);
        setStatus('Preview build failed. See console.');
        if (targetId === buildRequestId) break;
        continue;
      }

      if (targetId !== buildRequestId) {
        await disposePreview(nextPreview);
        continue;
      }

      const oldPreview = preview;
      preview = nextPreview;
      await disposePreview(oldPreview);
      if (preview) {
        reapplyAllColliderPresets(preview.level, workingPresets);
        rebuildColliderWireGroup(preview);
      }
      break;
    }

    buildInFlight = false;
  }

  /**
   * Rebuild the "Type" dropdown next to the Add button to match the
   * catalog for the current mode. Hidden for modes without a catalog
   * (paving, boundary, billboards).
   */
  function refreshAddKindPicker() {
    const hasCatalog = modeHasAssetCatalog(currentMode);
    ui.addKindField.hidden = !hasCatalog;
    if (!hasCatalog) {
      ui.addKindSelect.innerHTML = '';
      return;
    }
    const options = ASSET_CATALOG[currentMode as AssetCatalogMode];
    const previous = ui.addKindSelect.value;
    ui.addKindSelect.innerHTML = '';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.label;
      ui.addKindSelect.appendChild(o);
    }
    const match = options.find((o) => o.id === previous);
    ui.addKindSelect.value = match ? previous : (options[0]?.id ?? '');
  }

  function updateActionButtons() {
    const modeCanAdd = currentMode !== 'boundary';
    const canDelete =
      selected?.kind === 'house' ||
      selected?.kind === 'paved-path-point' ||
      selected?.kind === 'billboard' ||
      selected?.kind === 'tree' ||
      selected?.kind === 'prop';
    ui.addButton.disabled = !modeCanAdd;
    ui.addButton.textContent = ADD_LABELS[currentMode] || '+ Add';
    ui.deleteButton.disabled = !canDelete;
    refreshAddKindPicker();
  }

  function applyAddAction() {
    let nextSelection: Selection = null;
    switch (currentMode) {
      case 'houses': {
        const variant = (ui.addKindSelect.value || HOUSE_VARIANT_KINDS[0]) as HouseVariantKind;
        definition.houseSlots.push({
          x: 0,
          z: 0,
          yaw: 0,
          halfX: 1.2,
          halfZ: 1.2,
          halfY: 1.0,
          variant,
        });
        nextSelection = { kind: 'house', index: definition.houseSlots.length - 1 };
        break;
      }
      case 'paving': {
        const pathIndex = selected?.kind === 'paved-path-point' ? selected.pathIndex : 0;
        const path = definition.pavedPaths[pathIndex];
        if (!path) break;
        const index =
          selected?.kind === 'paved-path-point' ? selected.pointIndex + 1 : path.waypoints.length;
        const prev = path.waypoints[Math.max(0, index - 1)]!;
        const next = path.waypoints[Math.min(path.waypoints.length - 1, index)] ?? prev;
        path.waypoints.splice(index, 0, {
          x: (prev.x + next.x) * 0.5 + 1,
          z: (prev.z + next.z) * 0.5,
        });
        nextSelection = { kind: 'paved-path-point', pathIndex, pointIndex: index };
        break;
      }
      case 'billboards':
        definition.billboards.push({
          x: 0,
          z: 0,
          yaw: 0,
          tweetIndex: definition.billboards.length % EXAMPLE_TWEETS.length,
        });
        nextSelection = { kind: 'billboard', index: definition.billboards.length - 1 };
        break;
      case 'trees': {
        const variant = (ui.addKindSelect.value || TREE_VARIANT_KINDS[0]) as TreeVariantKind;
        definition.trees.push({ x: 0, z: 0, yaw: 0, variant });
        nextSelection = { kind: 'tree', index: definition.trees.length - 1 };
        break;
      }
      case 'props': {
        const kind = (ui.addKindSelect.value || SCENERY_PROP_KINDS[0]) as SceneryPropKind;
        definition.sceneryProps.push({ kind, x: 0, z: 0, yaw: 0 });
        nextSelection = { kind: 'prop', index: definition.sceneryProps.length - 1 };
        break;
      }
      default:
        break;
    }
    syncFieldsFromDefinition();
    selected = nextSelection;
    rebuildHelpers();
    void requestPreviewBuild();
  }

  function applyDeleteAction() {
    if (!selected) return;
    switch (selected.kind) {
      case 'house':
        definition.houseSlots.splice(selected.index, 1);
        break;
      case 'paved-path-point': {
        const path = definition.pavedPaths[selected.pathIndex];
        if (path && path.waypoints.length > 2) {
          path.waypoints.splice(selected.pointIndex, 1);
        }
        break;
      }
      case 'billboard':
        definition.billboards.splice(selected.index, 1);
        break;
      case 'tree':
        definition.trees.splice(selected.index, 1);
        break;
      case 'prop':
        definition.sceneryProps.splice(selected.index, 1);
        break;
      default:
        return;
    }
    select(null);
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  }

  function autoGenerateBillboards() {
    if (!preview) {
      setStatus('Preview not ready yet — wait a second and retry.');
      return;
    }
    definition.billboards = generateBillboardPlacements(
      definition,
      preview.level.obstacles,
      DREAM_GOALS,
      EXAMPLE_TWEETS,
      { x: preview.level.spawn.x, z: preview.level.spawn.z },
    );
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  }

  async function saveToServer() {
    if (!isDirty()) return;
    const body = serializeLevelDefinition(definition);
    const endpoint = `${resolveServerHttpBase()}/dev/level`;
    setStatus('Saving…');
    ui.saveButton.disabled = true;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText} ${text}`);
      }
      savedSerialized = body;
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      updateSaveBar();
      setStatus('Saved to public/levels/level-01.json');
    } catch (err) {
      console.error('[editor] save failed', err);
      setStatus(
        `Save failed — is the dev server running on ${resolveServerHttpBase()}? See console.`,
      );
      updateSaveBar();
    }
  }

  function updateModeHint() {
    ui.modeHint.textContent = MODE_HINTS[currentMode];
    ui.modeSelect.title = MODE_LABELS[currentMode];
  }

  ui.modeSelect.addEventListener('change', () => {
    currentMode = ui.modeSelect.value as EditorMode;
    updateModeHint();
    rebuildHelpers();
    updateActionButtons();
  });
  ui.addButton.addEventListener('click', applyAddAction);
  ui.deleteButton.addEventListener('click', applyDeleteAction);
  ui.saveButton.addEventListener('click', () => {
    void saveToServer();
  });
  ui.showDreamCircles.addEventListener('change', () => {
    const on = ui.showDreamCircles.checked;
    dreamCirclesGroup.visible = on;
    try {
      localStorage.setItem(DREAM_CIRCLES_PREF_KEY, on ? '1' : '0');
    } catch {
      // Private-mode or quota errors are non-fatal — the toggle still
      // works for the current session, just doesn't persist.
    }
  });

  ui.showColliders.addEventListener('change', () => {
    if (preview) rebuildColliderWireGroup(preview);
  });
  ui.colliderSaveButton.addEventListener('click', () => {
    void saveColliderPresetsToServer();
  });

  ui.advancedAutoBillboards.addEventListener('click', autoGenerateBillboards);
  ui.advancedReset.addEventListener('click', () => {
    if (!confirm('Reset the level to the built-in default layout? Unsaved edits will be lost.')) {
      return;
    }
    definition = defaultLevelDefinition();
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  });
  ui.advancedBoundaryRadius.addEventListener('change', () => {
    definition.worldBoundary.radius = Math.max(
      1,
      Number(ui.advancedBoundaryRadius.value) || 1,
    );
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  });
  ui.advancedDownload.addEventListener('click', () => {
    const blob = new Blob([serializeLevelDefinition(definition)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'level-01.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded level JSON');
  });
  ui.advancedImport.addEventListener('click', () => {
    try {
      definition = parseLevelDefinitionJson(ui.advancedJson.value);
      syncFieldsFromDefinition();
      rebuildHelpers();
      void requestPreviewBuild();
      setStatus('Imported JSON from textarea');
    } catch (err) {
      console.error('[editor] invalid JSON import', err);
      setStatus('Import failed. Check the JSON and try again.');
    }
  });

  // Both translate and rotate gizmos share the same handlers: live-update
  // the definition on `objectChange`, and on drag-end commit (rebuild helpers
  // + rebuild preview). We also gate OrbitControls on the combined drag
  // state so the camera doesn't pan while the user is rotating.
  let dragCount = 0;
  const onDraggingChanged = (event: { value: unknown }) => {
    const dragging = event.value === true;
    dragCount += dragging ? 1 : -1;
    if (dragCount < 0) dragCount = 0;
    orbit.enabled = dragCount === 0;
    if (!dragging && dragCount === 0) {
      updateDefinitionFromAttachedObject();
      syncFieldsFromDefinition();
      rebuildHelpers();
      void requestPreviewBuild();
    }
  };
  const onObjectChange = () => {
    updateDefinitionFromAttachedObject();
    syncFieldsFromDefinition();
  };
  transformMove.addEventListener('dragging-changed', onDraggingChanged);
  transformMove.addEventListener('objectChange', onObjectChange);
  transformRotate.addEventListener('dragging-changed', onDraggingChanged);
  transformRotate.addEventListener('objectChange', onObjectChange);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (event) => {
    lastPointerDown = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!lastPointerDown) return;
    const dx = event.clientX - lastPointerDown.x;
    const dy = event.clientY - lastPointerDown.y;
    lastPointerDown = null;
    if (Math.hypot(dx, dy) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(selectableMeshes, false)[0];
    if (!hit) {
      select(null);
      return;
    }
    select(hit.object.userData.selection as Selection, hit.object);
  });

  updateModeHint();
  syncFieldsFromDefinition();
  rebuildHelpers();
  updateActionButtons();
  await requestPreviewBuild();

  const loadingEl = document.getElementById('loading-screen');
  loadingEl?.classList.add('hidden');
  setStatus('');

  renderer.setAnimationLoop(() => {
    orbit.update();
    renderer.render(scene, camera);
  });
}

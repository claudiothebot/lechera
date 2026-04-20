import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createBootstrap } from '../app/bootstrap';
import { createResize } from '../app/resize';
import { buildBillboardPlacements, seedManualBillboardsFromProcedural } from '../game/billboardLayout';
import { EXAMPLE_TWEETS } from '../game/exampleTweets';
import {
  createLevel,
  loadLevelHouses,
  loadLevelTextures,
  loadLevelTrees,
  type Level,
} from '../game/level';
import {
  DEFAULT_LEVEL_PATH,
  defaultLevelDefinition,
  loadLevelDefinitionFromUrl,
  parseLevelDefinitionJson,
  serializeLevelDefinition,
} from '../game/levelLoader';
import {
  cloneLevelDefinition,
  type BillboardMode,
  type BillboardPlacementDefinition,
  type HouseSlotDefinition,
  type LevelDefinition,
} from '../game/levelDefinition';
import { loadBillboardModel } from '../game/billboardModel';
import {
  createTweetBillboards,
  type TweetBillboardsManager,
} from '../game/tweetBillboards';
import { installHdriSky } from '../render/sky';
import { DREAM_GOALS } from '@milk-dreams/shared';

type EditorMode = 'houses' | 'path' | 'paving' | 'boundary' | 'billboards' | 'trees';
type EditorTransformMode = 'translate' | 'rotate';

type Selection =
  | { kind: 'house'; index: number }
  | { kind: 'main-path-point'; pointIndex: number }
  | { kind: 'paved-path-point'; pathIndex: number; pointIndex: number }
  | { kind: 'boundary-center' }
  | { kind: 'billboard'; index: number }
  | null;

interface PreviewState {
  level: Level;
  billboardManager: TweetBillboardsManager | null;
}

interface EditorUi {
  root: HTMLElement;
  modeSelect: HTMLSelectElement;
  transformSelect: HTMLSelectElement;
  selectionLabel: HTMLElement;
  addButton: HTMLButtonElement;
  deleteButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  rebuildButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  downloadButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  jsonArea: HTMLTextAreaElement;
  statusLabel: HTMLElement;
  boundaryRadiusInput: HTMLInputElement;
  treeCountInput: HTMLInputElement;
  treeMinXInput: HTMLInputElement;
  treeMaxXInput: HTMLInputElement;
  treeMinZInput: HTMLInputElement;
  treeMaxZInput: HTMLInputElement;
  billboardModeSelect: HTMLSelectElement;
  billboardCountInput: HTMLInputElement;
}

const HELPER_HEIGHT_Y = 0.12;
const BILLBOARD_HELPER_Y = 1.0;

function makeUi(root: HTMLElement): EditorUi {
  root.innerHTML = `
    <div class="level-editor">
      <div class="level-editor__title">Level Editor</div>
      <div class="level-editor__row">
        <label class="level-editor__field">
          <span>Mode</span>
          <select id="level-editor-mode">
            <option value="houses">Houses</option>
            <option value="path">Path</option>
            <option value="paving">Paving</option>
            <option value="boundary">Boundary</option>
            <option value="billboards">Billboards</option>
            <option value="trees">Trees</option>
          </select>
        </label>
        <label class="level-editor__field">
          <span>Transform</span>
          <select id="level-editor-transform">
            <option value="translate">Translate</option>
            <option value="rotate">Rotate</option>
          </select>
        </label>
      </div>
      <div id="level-editor-selection" class="level-editor__selection">No selection</div>
      <div class="level-editor__row">
        <button id="level-editor-add" type="button">Add</button>
        <button id="level-editor-delete" type="button">Delete</button>
        <button id="level-editor-reset" type="button">Reset</button>
        <button id="level-editor-rebuild" type="button">Rebuild</button>
      </div>
      <div class="level-editor__section">
        <div class="level-editor__section-title">Boundary</div>
        <label class="level-editor__field">
          <span>Radius</span>
          <input id="level-editor-boundary-radius" type="number" step="0.5" min="1" />
        </label>
      </div>
      <div class="level-editor__section">
        <div class="level-editor__section-title">Trees</div>
        <div class="level-editor__grid">
          <label class="level-editor__field"><span>Count</span><input id="level-editor-tree-count" type="number" step="1" min="0" /></label>
          <label class="level-editor__field"><span>Min X</span><input id="level-editor-tree-minx" type="number" step="0.5" /></label>
          <label class="level-editor__field"><span>Max X</span><input id="level-editor-tree-maxx" type="number" step="0.5" /></label>
          <label class="level-editor__field"><span>Min Z</span><input id="level-editor-tree-minz" type="number" step="0.5" /></label>
          <label class="level-editor__field"><span>Max Z</span><input id="level-editor-tree-maxz" type="number" step="0.5" /></label>
        </div>
      </div>
      <div class="level-editor__section">
        <div class="level-editor__section-title">Billboards</div>
        <div class="level-editor__grid">
          <label class="level-editor__field">
            <span>Mode</span>
            <select id="level-editor-billboard-mode">
              <option value="procedural">Procedural</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label class="level-editor__field">
            <span>Count</span>
            <input id="level-editor-billboard-count" type="number" step="1" min="0" />
          </label>
        </div>
      </div>
      <div class="level-editor__section">
        <div class="level-editor__section-title">JSON</div>
        <div class="level-editor__row">
          <button id="level-editor-export" type="button">Copy JSON</button>
          <button id="level-editor-download" type="button">Download</button>
          <button id="level-editor-import" type="button">Import</button>
        </div>
        <textarea id="level-editor-json" spellcheck="false"></textarea>
      </div>
      <div id="level-editor-status" class="level-editor__status" aria-live="polite"></div>
    </div>
  `;

  const query = <T extends HTMLElement>(selector: string) => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`[editor] missing ${selector}`);
    return el;
  };

  return {
    root,
    modeSelect: query('#level-editor-mode'),
    transformSelect: query('#level-editor-transform'),
    selectionLabel: query('#level-editor-selection'),
    addButton: query('#level-editor-add'),
    deleteButton: query('#level-editor-delete'),
    resetButton: query('#level-editor-reset'),
    rebuildButton: query('#level-editor-rebuild'),
    exportButton: query('#level-editor-export'),
    downloadButton: query('#level-editor-download'),
    importButton: query('#level-editor-import'),
    jsonArea: query('#level-editor-json'),
    statusLabel: query('#level-editor-status'),
    boundaryRadiusInput: query('#level-editor-boundary-radius'),
    treeCountInput: query('#level-editor-tree-count'),
    treeMinXInput: query('#level-editor-tree-minx'),
    treeMaxXInput: query('#level-editor-tree-maxx'),
    treeMinZInput: query('#level-editor-tree-minz'),
    treeMaxZInput: query('#level-editor-tree-maxz'),
    billboardModeSelect: query('#level-editor-billboard-mode'),
    billboardCountInput: query('#level-editor-billboard-count'),
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

function boundsRectLine(
  bounds: LevelDefinition['treeScatter']['bounds'],
  color: number,
): THREE.LineLoop {
  const points = [
    new THREE.Vector3(bounds.minX, 0, bounds.minZ),
    new THREE.Vector3(bounds.maxX, 0, bounds.minZ),
    new THREE.Vector3(bounds.maxX, 0, bounds.maxZ),
    new THREE.Vector3(bounds.minX, 0, bounds.maxZ),
  ];
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
  line.userData.disposeManaged = true;
  return line;
}

function helperLabel(selection: Selection): string {
  if (!selection) return 'No selection';
  switch (selection.kind) {
    case 'house':
      return `House ${selection.index + 1}`;
    case 'main-path-point':
      return `Main path point ${selection.pointIndex + 1}`;
    case 'paved-path-point':
      return `Paving ${selection.pathIndex + 1}, point ${selection.pointIndex + 1}`;
    case 'boundary-center':
      return 'World boundary center';
    case 'billboard':
      return `Billboard ${selection.index + 1}`;
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
    case 'main-path-point':
    case 'paved-path-point':
      object.position.y = HELPER_HEIGHT_Y;
      object.rotation.set(0, 0, 0);
      break;
    case 'billboard':
      object.position.y = BILLBOARD_HELPER_Y;
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
  if (explicitUrl) {
    return loadLevelDefinitionFromUrl(explicitUrl);
  }
  try {
    return await loadLevelDefinitionFromUrl(DEFAULT_LEVEL_PATH);
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

  const transform = new TransformControls(camera, renderer.domElement);
  transform.setSpace('world');
  scene.add(transform.getHelper());

  const helpersGroup = new THREE.Group();
  helpersGroup.name = 'level-editor-helpers';
  scene.add(helpersGroup);

  let definition = await loadInitialDefinition();
  let currentMode: EditorMode = 'houses';
  let currentTransformMode: EditorTransformMode = 'translate';
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

  function syncFieldsFromDefinition() {
    ui.boundaryRadiusInput.value = String(definition.worldBoundary.radius);
    ui.treeCountInput.value = String(definition.treeScatter.count);
    ui.treeMinXInput.value = String(definition.treeScatter.bounds.minX);
    ui.treeMaxXInput.value = String(definition.treeScatter.bounds.maxX);
    ui.treeMinZInput.value = String(definition.treeScatter.bounds.minZ);
    ui.treeMaxZInput.value = String(definition.treeScatter.bounds.maxZ);
    ui.billboardModeSelect.value = definition.billboards.mode;
    ui.billboardCountInput.value = String(definition.billboards.count);
    ui.jsonArea.value = serializeLevelDefinition(definition);
  }

  function updateTransformMode() {
    const selectionKind = selected?.kind;
    const canRotate = selectionKind === 'house' || selectionKind === 'billboard';
    const nextMode = canRotate ? currentTransformMode : 'translate';
    transform.setMode(nextMode);
    transform.showX = true;
    transform.showY = false;
    transform.showZ = true;
    if (nextMode === 'rotate') {
      transform.showX = false;
      transform.showZ = false;
      transform.showY = true;
    }
  }

  function select(selection: Selection, object?: THREE.Object3D) {
    selected = selection;
    ui.selectionLabel.textContent = helperLabel(selection);
    if (selection && object) {
      transform.attach(object);
    } else {
      transform.detach();
    }
    updateTransformMode();
    updateActionButtons();
  }

  function helperColor(selectedState: boolean, base: number): THREE.ColorRepresentation {
    return selectedState ? 0xffd166 : base;
  }

  function clearHelpers() {
    disposeObjectTree(helpersGroup);
    scene.add(helpersGroup);
    selectableMeshes = [];
  }

  function makePointHelper(position: THREE.Vector3, color: number, selectionData: Selection) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 18, 14),
      new THREE.MeshBasicMaterial({ color: helperColor(selected === selectionData ? true : false, color) }),
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

  function rebuildHelpers() {
    clearHelpers();

    switch (currentMode) {
      case 'houses':
        definition.houseSlots.forEach((slot, index) => makeHouseHelper(slot, index));
        break;
      case 'path':
        definition.mainPath.waypoints.forEach((wp, pointIndex) => {
          makePointHelper(
            new THREE.Vector3(wp.x, HELPER_HEIGHT_Y, wp.z),
            0xef476f,
            { kind: 'main-path-point', pointIndex },
          );
        });
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
        ring.position.set(definition.worldBoundary.centerX, HELPER_HEIGHT_Y * 0.5, definition.worldBoundary.centerZ);
        helpersGroup.add(ring);
        break;
      }
      case 'billboards': {
        if (definition.billboards.mode === 'manual') {
          definition.billboards.placements.forEach((placement, index) => {
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(1.6, 1.6, 0.18),
              new THREE.MeshBasicMaterial({
                color: helperColor(selected?.kind === 'billboard' && selected.index === index, 0xf28482),
              }),
            );
            mesh.position.set(placement.x, BILLBOARD_HELPER_Y, placement.z);
            mesh.rotation.y = placement.yaw;
            mesh.userData.disposeManaged = true;
            mesh.userData.selection = { kind: 'billboard', index } satisfies Selection;
            selectableMeshes.push(mesh);
            helpersGroup.add(mesh);
          });
        }
        break;
      }
      case 'trees': {
        const rect = boundsRectLine(definition.treeScatter.bounds, 0x90be6d);
        rect.position.y = HELPER_HEIGHT_Y * 0.5;
        helpersGroup.add(rect);
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

  function updateDefinitionFromAttachedObject() {
    if (!selected || !transform.object) return;
    clampHelperObject(selected, transform.object, definition);
    switch (selected.kind) {
      case 'house': {
        const slot = definition.houseSlots[selected.index];
        if (!slot) return;
        slot.x = transform.object.position.x;
        slot.z = transform.object.position.z;
        slot.yaw = transform.object.rotation.y;
        break;
      }
      case 'main-path-point': {
        const point = definition.mainPath.waypoints[selected.pointIndex];
        if (!point) return;
        point.x = transform.object.position.x;
        point.z = transform.object.position.z;
        break;
      }
      case 'paved-path-point': {
        const point = definition.pavedPaths[selected.pathIndex]?.waypoints[selected.pointIndex];
        if (!point) return;
        point.x = transform.object.position.x;
        point.z = transform.object.position.z;
        break;
      }
      case 'boundary-center':
        definition.worldBoundary.centerX = transform.object.position.x;
        definition.worldBoundary.centerZ = transform.object.position.z;
        break;
      case 'billboard': {
        const placement = definition.billboards.placements[selected.index];
        if (!placement) return;
        placement.x = transform.object.position.x;
        placement.z = transform.object.position.z;
        placement.yaw = transform.object.rotation.y;
        break;
      }
    }
    syncFieldsFromDefinition();
  }

  async function disposePreview(prev: PreviewState | null) {
    if (!prev) return;
    prev.billboardManager?.dispose();
    disposeObjectTree(prev.level.group);
  }

  async function buildPreview(snapshot: LevelDefinition): Promise<PreviewState> {
    const level = createLevel(snapshot);
    await loadLevelTextures(level, renderer);
    await loadLevelHouses(level);
    await loadLevelTrees(level, DREAM_GOALS);
    scene.add(level.group);
    const billboardModel = await billboardModelPromise;
    const placements = buildBillboardPlacements(
      snapshot,
      level.obstacles,
      DREAM_GOALS,
      EXAMPLE_TWEETS,
      { x: level.spawn.x, z: level.spawn.z },
    );
    const billboardManager = createTweetBillboards({
      scene,
      camera,
      renderer,
      billboard: billboardModel,
      placements,
      interactive: false,
    });
    return { level, billboardManager };
  }

  async function requestPreviewBuild() {
    buildRequestId += 1;
    if (buildInFlight) return;
    buildInFlight = true;

    while (true) {
      const targetId = buildRequestId;
      const snapshot = cloneLevelDefinition(definition);
      setStatus('Building preview…');
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
      setStatus('Preview ready');
      break;
    }

    buildInFlight = false;
  }

  function updateActionButtons() {
    const canAddPoint =
      currentMode === 'houses' ||
      currentMode === 'path' ||
      currentMode === 'paving' ||
      currentMode === 'billboards';
    const canDelete =
      selected?.kind === 'house' ||
      selected?.kind === 'main-path-point' ||
      selected?.kind === 'paved-path-point' ||
      selected?.kind === 'billboard';
    ui.addButton.disabled = !canAddPoint;
    ui.deleteButton.disabled = !canDelete;
  }

  function applyAddAction() {
    switch (currentMode) {
      case 'houses':
        definition.houseSlots.push({
          x: 0,
          z: 0,
          yaw: 0,
          halfX: 1.2,
          halfZ: 1.2,
          halfY: 1.0,
        });
        break;
      case 'path': {
        const points = definition.mainPath.waypoints;
        const index = selected?.kind === 'main-path-point' ? selected.pointIndex + 1 : points.length;
        const prev = points[Math.max(0, index - 1)]!;
        const next = points[Math.min(points.length - 1, index)] ?? prev;
        points.splice(index, 0, {
          x: (prev.x + next.x) * 0.5 + 1,
          z: (prev.z + next.z) * 0.5,
        });
        break;
      }
      case 'paving': {
        const pathIndex = selected?.kind === 'paved-path-point' ? selected.pathIndex : 0;
        const path = definition.pavedPaths[pathIndex];
        if (!path) break;
        const index = selected?.kind === 'paved-path-point' ? selected.pointIndex + 1 : path.waypoints.length;
        const prev = path.waypoints[Math.max(0, index - 1)]!;
        const next = path.waypoints[Math.min(path.waypoints.length - 1, index)] ?? prev;
        path.waypoints.splice(index, 0, {
          x: (prev.x + next.x) * 0.5 + 1,
          z: (prev.z + next.z) * 0.5,
        });
        break;
      }
      case 'billboards': {
        if (definition.billboards.mode !== 'manual') break;
        definition.billboards.placements.push({
          x: 0,
          z: 0,
          yaw: 0,
          tweetIndex: definition.billboards.placements.length % EXAMPLE_TWEETS.length,
        });
        break;
      }
      default:
        break;
    }
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  }

  function applyDeleteAction() {
    if (!selected) return;
    switch (selected.kind) {
      case 'house':
        definition.houseSlots.splice(selected.index, 1);
        break;
      case 'main-path-point':
        if (definition.mainPath.waypoints.length > 2) {
          definition.mainPath.waypoints.splice(selected.pointIndex, 1);
        }
        break;
      case 'paved-path-point': {
        const path = definition.pavedPaths[selected.pathIndex];
        if (path && path.waypoints.length > 2) {
          path.waypoints.splice(selected.pointIndex, 1);
        }
        break;
      }
      case 'billboard':
        definition.billboards.placements.splice(selected.index, 1);
        break;
      default:
        return;
    }
    select(null);
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  }

  function setBillboardMode(mode: BillboardMode) {
    definition.billboards.mode = mode;
    if (mode === 'manual' && definition.billboards.placements.length === 0 && preview) {
      definition.billboards.placements = seedManualBillboardsFromProcedural(
        definition,
        preview.level.obstacles,
        DREAM_GOALS,
        EXAMPLE_TWEETS,
        { x: preview.level.spawn.x, z: preview.level.spawn.z },
      );
    }
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  }

  ui.modeSelect.addEventListener('change', () => {
    currentMode = ui.modeSelect.value as EditorMode;
    rebuildHelpers();
  });
  ui.transformSelect.addEventListener('change', () => {
    currentTransformMode = ui.transformSelect.value as EditorTransformMode;
    updateTransformMode();
  });
  ui.addButton.addEventListener('click', applyAddAction);
  ui.deleteButton.addEventListener('click', applyDeleteAction);
  ui.resetButton.addEventListener('click', () => {
    definition = defaultLevelDefinition();
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  });
  ui.rebuildButton.addEventListener('click', () => {
    void requestPreviewBuild();
  });
  ui.boundaryRadiusInput.addEventListener('change', () => {
    definition.worldBoundary.radius = Math.max(1, Number(ui.boundaryRadiusInput.value) || 1);
    syncFieldsFromDefinition();
    rebuildHelpers();
    void requestPreviewBuild();
  });
  for (const [input, setter] of [
    [ui.treeCountInput, (v: number) => (definition.treeScatter.count = Math.max(0, Math.round(v)))],
    [ui.treeMinXInput, (v: number) => (definition.treeScatter.bounds.minX = v)],
    [ui.treeMaxXInput, (v: number) => (definition.treeScatter.bounds.maxX = v)],
    [ui.treeMinZInput, (v: number) => (definition.treeScatter.bounds.minZ = v)],
    [ui.treeMaxZInput, (v: number) => (definition.treeScatter.bounds.maxZ = v)],
  ] as const) {
    input.addEventListener('change', () => {
      setter(Number(input.value) || 0);
      syncFieldsFromDefinition();
      rebuildHelpers();
      void requestPreviewBuild();
    });
  }
  ui.billboardModeSelect.addEventListener('change', () => {
    setBillboardMode(ui.billboardModeSelect.value as BillboardMode);
  });
  ui.billboardCountInput.addEventListener('change', () => {
    definition.billboards.count = Math.max(0, Math.round(Number(ui.billboardCountInput.value) || 0));
    syncFieldsFromDefinition();
    void requestPreviewBuild();
  });
  ui.exportButton.addEventListener('click', async () => {
    const text = serializeLevelDefinition(definition);
    ui.jsonArea.value = text;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('JSON copied to clipboard');
    } catch {
      setStatus('JSON prepared in the textarea');
    }
  });
  ui.downloadButton.addEventListener('click', () => {
    const blob = new Blob([serializeLevelDefinition(definition)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'level-01.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded level JSON');
  });
  ui.importButton.addEventListener('click', () => {
    try {
      definition = parseLevelDefinitionJson(ui.jsonArea.value);
      syncFieldsFromDefinition();
      rebuildHelpers();
      void requestPreviewBuild();
      setStatus('Imported JSON');
    } catch (err) {
      console.error('[editor] invalid JSON import', err);
      setStatus('Import failed. Check the JSON and try again.');
    }
  });

  transform.addEventListener('dragging-changed', (event) => {
    const dragging = event.value === true;
    orbit.enabled = !dragging;
    if (!dragging) {
      updateDefinitionFromAttachedObject();
      syncFieldsFromDefinition();
      rebuildHelpers();
      void requestPreviewBuild();
    }
  });
  transform.addEventListener('objectChange', () => {
    updateDefinitionFromAttachedObject();
    syncFieldsFromDefinition();
  });

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

  syncFieldsFromDefinition();
  rebuildHelpers();
  await requestPreviewBuild();

  const loadingEl = document.getElementById('loading-screen');
  loadingEl?.classList.add('hidden');
  setStatus('Editor ready');

  renderer.setAnimationLoop(() => {
    orbit.update();
    renderer.render(scene, camera);
  });
}

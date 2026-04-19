import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface Character {
  /** Root object to add to a parent (e.g. the player group). */
  readonly root: THREE.Object3D;
  /**
   * Height in player-group space from the ground (y=0) to the top of the
   * character AABB after scaling — fallback when no head bone is found.
   */
  readonly headLocalY: number;
  /**
   * World position for the gameplay jug (call after `tick()` this frame).
   */
  getJugWorldPosition(out: THREE.Vector3): void;
  /** Call every frame with the player's horizontal speed (m/s). */
  tick(dt: number, speed: number): void;
  dispose(): void;
}

export interface LoadCharacterOptions {
  /** Target body height in meters. Model is uniformly scaled to match. */
  targetHeight?: number;
  /**
   * If true, rotate the model 180° around Y so its visual front faces -Z
   * in local space (matching the rest of the player rig).
   */
  rotateYToMatchPlayerFront?: boolean;
  /** Name (or substring) of the walk animation clip to play. */
  walkClipName?: string;
  /** Reference walking speed at which the clip plays at its native rate. */
  walkSpeedReference?: number;
  /**
   * Optional per-instance multiplicative tint applied to every cloned
   * material's `.color`. Use a desaturated color (e.g. HSL with s≈0.3,
   * l≈0.85) for a subtle "team color" cast that doesn't kill the
   * underlying texture. Local player passes `undefined` (no tint).
   */
  tintColor?: THREE.Color;
}

/**
 * Cached source: the parsed GLTF scene + animation clips. Cloning happens
 * per instance via `createCharacterInstance` so the local player and
 * each remote share the underlying geometry/textures (memory + GPU
 * upload) but get their own bones, mixer and (optionally) materials.
 */
export interface CharacterSource {
  /** Original gltf.scene. Treat as read-only — clone it per instance. */
  readonly scene: THREE.Object3D;
  /** Animation clips. Already cleaned (scale tracks stripped). */
  readonly clips: readonly THREE.AnimationClip[];
}

/** URL → source promise; ensures we only fetch + parse the GLB once. */
const sourceCache = new Map<string, Promise<CharacterSource>>();

/**
 * Load the GLB once and cache the parsed source. Subsequent calls with
 * the same URL return the cached promise (no refetch, no reparse).
 *
 * Returned `scene` and `clips` MUST NOT be mutated — they're shared
 * across every instance. Use `createCharacterInstance` to get a fresh
 * scene graph with its own bones, mixer and materials.
 */
export function loadCharacterSource(url: string): Promise<CharacterSource> {
  const cached = sourceCache.get(url);
  if (cached) return cached;

  const p = (async (): Promise<CharacterSource> => {
    const loader = new GLTFLoader();
    // Required when the GLB uses EXT_meshopt_compression (e.g. after
    // gltf-transform optimize).
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);

    // Clean up clips ONCE on the source side. Per-instance mixers reuse
    // the same `AnimationClip` objects safely — clips are pure data.
    const clips = (gltf.animations ?? []).map((c) => {
      const cloned = c.clone();
      stripScaleTracks(cloned);
      return cloned;
    });

    return { scene: gltf.scene, clips };
  })();

  sourceCache.set(url, p);
  return p;
}

/**
 * Build a fresh, fully self-contained character instance from a cached
 * source. Each instance owns:
 *  - A `SkeletonUtils.clone` of the scene (own bones, own SkinnedMesh,
 *    own Object3D hierarchy).
 *  - Its own materials (cloned, so tinting one doesn't leak to others).
 *  - Its own `AnimationMixer` running on its own scene root.
 *
 * Synchronous: the source is already in memory after `loadCharacterSource`.
 * Costs a few ms per call (clone + walk).
 */
export function createCharacterInstance(
  source: CharacterSource,
  opts: LoadCharacterOptions = {},
): Character {
  const {
    targetHeight = 1.68,
    rotateYToMatchPlayerFront = true,
    walkClipName,
    walkSpeedReference = 4.5,
    tintColor,
  } = opts;

  // Wrap so we can control orientation/scale without mutating the cloned
  // scene root directly (makes disposal and debugging simpler).
  const root = new THREE.Group();
  root.name = 'character-root';

  // SkeletonUtils.clone is REQUIRED for SkinnedMesh — a plain `.clone()`
  // shares the skeleton across instances and they all end up posed
  // identically (or worse, NaN). This walks the hierarchy and rewires
  // bone references inside the cloned skeleton.
  const model = cloneSkinned(source.scene);
  root.add(model);

  // Per-instance material cloning. Without this, tinting one Lechera
  // would tint every Lechera (since `SkeletonUtils.clone` shares
  // materials by reference). Also flip on shadows (GLTFLoader leaves
  // them off).
  model.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (tintColor) {
      m.material = cloneMaterialAndTint(m.material, tintColor);
    }
  });

  // Normalize scale so the character matches the target body height.
  // `precise: true` is important for SkinnedMesh: the default path uses
  // the static geometry AABB, which is often huge vs. the posed mesh
  // and makes the character look microscopic after scaling.
  model.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(model, true);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const modelHeight = size.y || 1;
  const scale = targetHeight / modelHeight;
  model.scale.setScalar(scale);

  // Place the feet on y=0 of the local frame (root space).
  const scaledMinY = bbox.min.y * scale;
  model.position.y -= scaledMinY;

  if (rotateYToMatchPlayerFront) {
    model.rotation.y = Math.PI;
  }

  model.updateMatrixWorld(true);
  const bboxAfter = new THREE.Box3().setFromObject(root, true);
  const headLocalY = bboxAfter.max.y;

  // --- Animation wiring ----------------------------------------------------
  const mixer = new THREE.AnimationMixer(model);
  let walkAction: THREE.AnimationAction | null = null;

  const clip =
    (walkClipName
      ? source.clips.find((c) =>
          c.name.toLowerCase().includes(walkClipName.toLowerCase()),
        )
      : undefined) ?? source.clips[0];

  if (clip) {
    walkAction = mixer.clipAction(clip);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
    walkAction.clampWhenFinished = false;
    walkAction.weight = 0;
    walkAction.play();
  }

  const headBone = findHeadBone(model);
  /** Extra lift above the head bone (world Y) so the jug sits on the skull, not the neck. */
  const skullLiftY = 0.12;
  const fallbackLocal = new THREE.Vector3();

  function getJugWorldPosition(out: THREE.Vector3): void {
    if (headBone) {
      headBone.getWorldPosition(out);
      out.y += skullLiftY;
    } else {
      fallbackLocal.set(0, headLocalY, 0);
      root.localToWorld(fallbackLocal);
      out.copy(fallbackLocal);
    }
  }

  function tick(dt: number, speed: number): void {
    if (walkAction) {
      // Smoothly blend weight with speed so idle is still (pose held by
      // clip frame 0 at weight 0) and full-speed walk uses full weight.
      const targetWeight = Math.min(1, speed / walkSpeedReference);
      const blendRate = 8.0;
      const blend = 1 - Math.exp(-blendRate * dt);
      walkAction.weight += (targetWeight - walkAction.weight) * blend;

      // Tie playback rate to speed so steps look planted. We keep a
      // minimum rate so the animation doesn't fully stall while
      // blending out.
      const minRate = 0.35;
      const rate = Math.max(minRate, speed / walkSpeedReference);
      walkAction.timeScale = rate;
    }
    mixer.update(dt);
  }

  function dispose() {
    mixer.stopAllAction();
    root.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      // Geometry: SkeletonUtils.clone shares geometries with the source
      // (and across instances). Disposing here would break every other
      // live instance and eventually the source itself. Leave it alone;
      // it's freed when the source falls out of the cache (which we
      // don't do today — sources live as long as the page).
      if (tintColor) {
        // We OWN the cloned material. Safe to dispose.
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      }
    });
  }

  return { root, headLocalY, getJugWorldPosition, tick, dispose };
}

/**
 * Convenience wrapper kept for the local player's call-site ergonomics.
 * Equivalent to `loadCharacterSource(url).then((s) => createCharacterInstance(s, opts))`.
 */
export async function loadCharacter(
  url: string,
  opts: LoadCharacterOptions = {},
): Promise<Character> {
  const source = await loadCharacterSource(url);
  return createCharacterInstance(source, opts);
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

function cloneMaterialAndTint(
  mat: THREE.Material | THREE.Material[],
  tint: THREE.Color,
): THREE.Material | THREE.Material[] {
  if (Array.isArray(mat)) {
    return mat.map((m) => tintOne(m, tint));
  }
  return tintOne(mat, tint);
}

function tintOne(mat: THREE.Material, tint: THREE.Color): THREE.Material {
  const cloned = mat.clone();
  // MeshStandardMaterial / MeshPhysicalMaterial / MeshBasicMaterial all
  // expose `.color`. Multiplying lets the underlying texture stay
  // recognizable while shifting the overall hue toward the player's
  // identity color.
  const colored = cloned as THREE.Material & { color?: THREE.Color };
  if (colored.color && colored.color.isColor) {
    colored.color.multiply(tint);
  }
  return cloned;
}

function stripScaleTracks(clip: THREE.AnimationClip) {
  // Many DCC exports keyframe scale on bones; during walk that reads as
  // the character "inflating". Gameplay keeps uniform scale from the
  // mesh.
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  clip.resetDuration();
}

function findHeadBone(model: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  model.traverse((obj) => {
    if (found) return;
    const sk = obj as THREE.SkinnedMesh;
    if (!sk.isSkinnedMesh || !sk.skeleton) return;
    for (const bone of sk.skeleton.bones) {
      const n = bone.name.toLowerCase();
      if (
        /head/i.test(bone.name) &&
        !/headwear|forehead|handle/i.test(n)
      ) {
        found = bone;
        return;
      }
    }
  });
  return found;
}

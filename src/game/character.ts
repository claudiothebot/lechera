import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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
}

export async function loadCharacter(
  url: string,
  opts: LoadCharacterOptions = {},
): Promise<Character> {
  const {
    targetHeight = 1.68,
    rotateYToMatchPlayerFront = true,
    walkClipName,
    walkSpeedReference = 4.5,
  } = opts;

  const loader = new GLTFLoader();
  // Required when the GLB uses EXT_meshopt_compression (e.g. after gltf-transform optimize).
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);

  // Wrap so we can control orientation/scale without mutating the glTF root
  // directly (makes disposal and debugging simpler).
  const root = new THREE.Group();
  root.name = 'character-root';

  const model = gltf.scene;
  root.add(model);

  // Meshes need shadows enabled explicitly; GLTFLoader does not turn them on.
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  // Normalize scale so the character matches the target body height.
  // `precise: true` is important for SkinnedMesh: the default path uses the
  // static geometry AABB, which is often huge vs. the posed mesh and makes the
  // character look microscopic after scaling.
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

  const clips = gltf.animations ?? [];
  const clip =
    (walkClipName
      ? clips.find((c) =>
          c.name.toLowerCase().includes(walkClipName.toLowerCase()),
        )
      : undefined) ?? clips[0];

  if (clip) {
    // Many DCC exports keyframe scale on bones; during walk that reads as the
    // character "inflating". Gameplay keeps uniform scale from the mesh.
    stripScaleTracks(clip);
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
      // Smoothly blend weight with speed so idle is still (pose held by clip
      // frame 0 at weight 0) and full-speed walk uses full weight.
      const targetWeight = Math.min(1, speed / walkSpeedReference);
      const blendRate = 8.0;
      const blend = 1 - Math.exp(-blendRate * dt);
      walkAction.weight += (targetWeight - walkAction.weight) * blend;

      // Tie playback rate to speed so steps look planted. We keep a minimum
      // rate so the animation doesn't fully stall while blending out.
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
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      }
    });
  }

  return { root, headLocalY, getJugWorldPosition, tick, dispose };
}

function stripScaleTracks(clip: THREE.AnimationClip) {
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

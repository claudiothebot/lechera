import * as THREE from 'three';
import { createBootstrap } from './app/bootstrap';
import { createResize } from './app/resize';
import { createInputSystem } from './systems/input';
import { createLevel, loadLevelTextures } from './game/level';
import { createPlayer } from './game/player';
import { createJugBalance, type BumpInput } from './game/jugBalance';
import { loadCharacter, type Character } from './game/character';
import { loadJugModel } from './game/jugModel';
import { loadLevelAnimals, type LevelAnimals } from './game/levelAnimals';
import { createProgression } from './game/progression';
import { createCameraRig } from './render/cameraRig';
import { installHdriSky } from './render/sky';
import { createHud, type GameStatus } from './ui/hud';
import { createMinimap } from './ui/minimap';
import { installMusicLoop } from './audio/music';

/** Cántaro: tamaño base en metros y elevación extra sobre el punto de cabeza. */
const JUG_TARGET_HEIGHT = 0.42;
const JUG_EXTRA_LIFT_Y = 0.08;

/** Total run time in seconds. The Lechera has to deliver as much as she can before this runs out. */
const TOTAL_TIME_SECONDS = 180;

/**
 * Yaw → lateral-accel gain for the jug (m/s² per rad/s).
 *
 * When the Lechera turns her body (A/D in tank controls), a jug sitting
 * on her head lags behind. We model that as an extra lateral acceleration
 * on the jug in the character's frame, opposite to the turn direction.
 *
 * Tuning history: started at 6.0 when turns were velocity-derived and
 * could momentarily spike at TURN_RATE = 7 rad/s. With tank controls the
 * player directly sets the turn rate, capped at 2.5 rad/s, so the same
 * gain would produce ~0.36× the disturbance. Bumped to 15 to keep late-
 * game turns as punishing as before — a full A/D hold at max dream index
 * will generate > 50 m/s² of inertia (≈ 2× linear-sprint accel), making
 * careless pivots a reliable way to spill.
 */
const YAW_INERTIA_GAIN = 15.0;

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Canvas #game not found');

  const { renderer, scene, camera } = createBootstrap(canvas);
  const resize = createResize(renderer, camera);
  resize.install();

  // Kept as a subtle fill; the HDRI environment takes over most of the
  // ambient diffuse once installHdriSky resolves.
  const ambient = new THREE.HemisphereLight(0xbfd8ef, 0x3a3424, 0.18);
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

  const level = createLevel();
  scene.add(level.group);

  loadLevelTextures(level, renderer).catch((err) => {
    console.error('[level] failed to load ground textures', err);
  });

  installHdriSky(
    renderer,
    scene,
    '/hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    {
      backgroundIntensity: 0.75,
      environmentIntensity: 0.45,
    },
  ).catch((err) => {
    console.error('[sky] failed to load HDRI', err);
  });

  const player = createPlayer(scene, level.spawn);
  const cameraRig = createCameraRig(camera);
  const balance = createJugBalance();
  const input = createInputSystem(canvas);
  const hud = createHud();
  const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap');
  if (!minimapCanvas) throw new Error('Canvas #minimap not found');
  const minimap = createMinimap(minimapCanvas);
  const progression = createProgression();

  const loadingEl = document.getElementById('loading-screen');

  let character: Character;
  try {
    const [char, jugRoot] = await Promise.all([
      loadCharacter('/models/lechera-walk-opt.glb', {
        rotateYToMatchPlayerFront: true,
        walkSpeedReference: 4.5,
      }),
      loadJugModel('/models/cantaro-opt.glb', { targetHeight: JUG_TARGET_HEIGHT }),
    ]);
    character = char;
    player.setVisual(char.root);
    player.setJugVisual(jugRoot);
  } catch (err) {
    console.error('[assets] failed to load Lechera / cántaro GLB', err);
    if (loadingEl) {
      loadingEl.textContent =
        'No se pudieron cargar los modelos. Comprueba la red y recarga.';
      loadingEl.classList.add('loading-error');
    }
    return;
  }

  loadingEl?.classList.add('hidden');

  // Reward animals at the goal (eggs, chicken, pig, calf, cow). Loaded
  // async with a placeholder state: until they resolve, the goal is just
  // the ring. Once ready, we call applyCurrentDream(false) to drop the
  // right animal onto the current goal.
  let levelAnimals: LevelAnimals | null = null;
  loadLevelAnimals()
    .then((a) => {
      levelAnimals = a;
      applyCurrentDream(false);
    })
    .catch((err) => {
      console.error('[animals] failed to load reward animals', err);
    });

  const tiltAxis = new THREE.Vector3();
  const jugWorldPos = new THREE.Vector3();

  let status: GameStatus = 'playing';
  let timeRemaining = TOTAL_TIME_SECONDS;

  /**
   * Push the current dream (from `progression`) into every system that cares:
   * the goal marker, jug balance physics, jug visual scale and HUD.
   * Called both on boot (index 0) and every time the player successfully
   * delivers a jar of milk.
   */
  function applyCurrentDream(isDelivery: boolean) {
    const d = progression.current;

    level.setGoalPosition(d.goal);
    balance.setConfig({
      stabilityScale: d.stabilityScale,
      inertiaScale: d.inertiaScale,
      dampingScale: d.dampingScale,
      spillThresholdScale: d.spillThresholdScale,
      correctionScale: d.correctionScale,
    });
    // Every delivery also resets the balance: narratively the Lechera puts
    // one jar down and picks up a bigger one, so the tilt starts fresh.
    if (isDelivery) balance.reset();

    player.jugAnchor.scale.setScalar(d.jugScale);

    // Reparent the current flock (3 clones in formation) under the goal
    // anchor. Removing all existing children first handles both the
    // initial swap (no children yet) and subsequent dream transitions
    // (previous flock still parented). Flock instances are long-lived;
    // we just move them between the anchor and an unparented state.
    if (levelAnimals) {
      while (level.goalAnchor.children.length > 0) {
        level.goalAnchor.remove(level.goalAnchor.children[0]!);
      }
      level.goalAnchor.add(levelAnimals.get(d.animalKey));
    }

    hud.setLitres(d.litres);
    hud.setDream(d.dreamName, d.isEndless);
  }

  function restart() {
    progression.reset();
    player.reset(level.spawn);
    balance.reset();
    timeRemaining = TOTAL_TIME_SECONDS;
    status = 'playing';
    applyCurrentDream(false);
    hud.setStatus(status);
    hud.setTime(timeRemaining);
  }

  applyCurrentDream(false);
  hud.setStatus(status);
  hud.setTime(timeRemaining);

  const clock = new THREE.Clock();

  installMusicLoop('/assets/milk-dreams-bgm.mp3', 0.35);

  renderer.setAnimationLoop(() => {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);

    input.update();
    // Hide the controls hint once the player has engaged (pressed any
    // movement key or started free-looking). No pointer lock involved
    // anymore — the HUD just fades the help text out.
    hud.setLocked(input.hasEngaged);

    if (input.consumeRestart()) restart();

    if (status === 'playing') {
      // Countdown timer ticks in game time.
      timeRemaining = Math.max(0, timeRemaining - dt);
      hud.setTime(timeRemaining);

      const r = player.update(
        dt,
        input.axes.moveForward,
        input.axes.moveRight,
        level.obstacles,
      );

      // Drive the camera AFTER the player update so the follow yaw uses
      // this frame's facing (no one-frame lag when turning). Free-look
      // input is consumed here exclusively.
      const look = input.consumeLookDelta();
      cameraRig.update(
        dt,
        player.group.position,
        r.facing,
        input.isFreeLook,
        look.dx,
        look.dy,
      );

      // All balance-system projections use the CHARACTER frame, not the
      // camera. That's the whole point: the mouse can swing the camera
      // freely without rotating what "forward" means for inertia/arrows.
      // refYaw = π − facing reproduces the sign convention the old
      // camera-frame math used when the camera was parked behind the
      // character, so every existing formula downstream keeps working.
      const refYaw = Math.PI - r.facing;
      const sn = Math.sin(refYaw);
      const cs = Math.cos(refYaw);

      let camAccelForward = r.worldAccelX * sn + r.worldAccelZ * -cs;
      let camAccelRight = r.worldAccelX * cs + r.worldAccelZ * sn;

      // Yaw-induced inertia: the jug lags behind the character's rotation.
      // Direction: opposite to the character's local "right" vector (so a
      // right-turn pushes the jug to the character's left), magnitude
      // proportional to how fast `facing` is changing. We feed it as an
      // extra linear accel so `jugBalance` multiplies it by `inertiaScale`
      // of the current dream automatically — meaning a late-game turn
      // is dramatically more upsetting than an early-game one.
      const charRightWorldX = Math.cos(r.facing);
      const charRightWorldZ = -Math.sin(r.facing);
      const yawAccelWorldX =
        -charRightWorldX * r.angularVelocity * YAW_INERTIA_GAIN;
      const yawAccelWorldZ =
        -charRightWorldZ * r.angularVelocity * YAW_INERTIA_GAIN;
      camAccelForward += yawAccelWorldX * sn + yawAccelWorldZ * -cs;
      camAccelRight += yawAccelWorldX * cs + yawAccelWorldZ * sn;

      const bumps: BumpInput[] = r.bumps.map((b) => ({
        forward: (b.dirX * sn + b.dirZ * -cs) * b.impulse,
        right: (b.dirX * cs + b.dirZ * sn) * b.impulse,
      }));

      balance.update(dt, {
        camAccelForward,
        camAccelRight,
        bumps,
        inputForward: input.axes.tiltForward,
        inputRight: input.axes.tiltRight,
      });

      character.tick(dt, r.speed);

      const tf = balance.tiltForward;
      const tr = balance.tiltRight;
      const dx = tf * sn + tr * cs;
      const dz = tf * -cs + tr * sn;
      const mag = Math.hypot(dx, dz);

      if (mag > 1e-5) {
        tiltAxis.set(dz / mag, 0, -dx / mag);
        player.jugAnchor.quaternion.setFromAxisAngle(tiltAxis, mag);
      } else {
        player.jugAnchor.quaternion.identity();
      }

      character.getJugWorldPosition(jugWorldPos);
      jugWorldPos.y += JUG_EXTRA_LIFT_Y;
      player.jugAnchor.position.copy(jugWorldPos);

      const distance = player.group.position.distanceTo(level.goal);
      hud.setDistance(distance);
      hud.setBalance(balance.normalizedTilt);

      // End-of-run conditions, in priority order.
      if (balance.isSpilled) {
        status = 'spilled';
        hud.setStatus(status, {
          litresDelivered: progression.current.index,
          currentDream: progression.current.dreamName,
        });
      } else if (timeRemaining <= 0) {
        status = 'timeout';
        hud.setStatus(status, {
          litresDelivered: progression.current.index,
          currentDream: progression.current.dreamName,
        });
      } else if (distance < level.goalRadius) {
        // Successful delivery → advance progression, show toast, apply new
        // dream config. The character keeps their current position; the
        // goal moves somewhere else and the jug grows.
        // Fable logic: she arrives with milk, imagines trading it for the
        // reward of the current dream, then starts dreaming of the next.
        const obtained = progression.current.dreamName;
        progression.advance();
        applyCurrentDream(true);
        const nextName = progression.current.dreamName;
        hud.showToast(
          `¡Has conseguido ${obtained.toLowerCase()}! Ahora sueñas con ${nextName.toLowerCase()}`,
          2200,
        );
      }
    } else {
      // Game over: freeze simulation but keep the camera live so the
      // player can still orbit around the failure scene.
      const look = input.consumeLookDelta();
      cameraRig.update(
        dt,
        player.group.position,
        player.result.facing,
        input.isFreeLook,
        look.dx,
        look.dy,
      );
      hud.setBalance(balance.normalizedTilt);
    }

    // Minimap reflects whatever state we ended this frame in (playing or
    // frozen), so the radar is still informative on game-over screens.
    minimap.render({
      playerX: player.group.position.x,
      playerZ: player.group.position.z,
      facing: player.result.facing,
      goal: { x: level.goal.x, z: level.goal.z },
      spawn: { x: level.spawn.x, z: level.spawn.z },
      obstacles: level.obstacles,
    });

    renderer.render(scene, camera);
  });
}

void boot();

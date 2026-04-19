import * as THREE from 'three';
import { createBootstrap } from './app/bootstrap';
import { createResize } from './app/resize';
import { createInputSystem } from './systems/input';
import { createLevel, loadLevelHouses, loadLevelTextures } from './game/level';
import { createPlayer } from './game/player';
import { createJugBalance, type BumpInput } from './game/jugBalance';
import {
  createCharacterInstance,
  loadCharacterSource,
  type Character,
  type CharacterSource,
} from './game/character';
import {
  createJugInstance,
  loadJugSource,
  type JugSource,
} from './game/jugModel';
import { loadLevelAnimals, type LevelAnimals } from './game/levelAnimals';
import { createProgression } from './game/progression';
import { createCameraRig } from './render/cameraRig';
import { installHdriSky } from './render/sky';
import { createHud, type GameStatus } from './ui/hud';
import { createDreamPreview } from './ui/dreamPreview';
import { createMinimap } from './ui/minimap';
import { installMusicLoop } from './audio/music';
import {
  connectMultiplayer,
  OFFLINE_MULTIPLAYER_HANDLE,
  type MultiplayerHandle,
} from './net/multiplayer';
import { createRemotePlayers, type RemotePlayersManager } from './net/remotePlayers';
import type { ScoreboardEntry } from './ui/hud';

/** Cántaro: tamaño base en metros y elevación extra sobre el punto de cabeza. */
const JUG_TARGET_HEIGHT = 0.42;
const JUG_EXTRA_LIFT_Y = 0.08;

/** Total run time in seconds. The Lechera has to deliver as much as she can before this runs out. */
const TOTAL_TIME_SECONDS = 180;

/**
 * Playtest: never game-over from spilling (tilt clamps at max instead).
 * Set to `true` while tuning levels or rushing to late dreams.
 */
const DEBUG_INVINCIBLE = true;

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

  loadLevelHouses(level).catch((err) => {
    console.error('[level] failed to load house obstacles', err);
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
  const balance = createJugBalance({ invincible: DEBUG_INVINCIBLE });
  const input = createInputSystem(canvas);
  const hud = createHud();
  hud.setDebugInvincible(DEBUG_INVINCIBLE);
  const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap');
  if (!minimapCanvas) throw new Error('Canvas #minimap not found');
  const minimap = createMinimap(minimapCanvas);

  const dreamPreviewCanvas = document.querySelector<HTMLCanvasElement>(
    '#dream-preview-canvas',
  );
  if (!dreamPreviewCanvas) throw new Error('Canvas #dream-preview-canvas not found');
  const dreamPreview = createDreamPreview(dreamPreviewCanvas);
  const progression = createProgression();

  const loadingEl = document.getElementById('loading-screen');

  let character: Character;
  // Cached sources are reused by `remotePlayers` to clone an avatar per
  // remote without refetching the GLBs. Cache lookup is sync after the
  // first await, so creating extra instances later is cheap.
  let characterSource: CharacterSource;
  let jugSource: JugSource;
  try {
    const [charSrc, jugSrc] = await Promise.all([
      loadCharacterSource('/models/lechera-walk-opt.glb'),
      loadJugSource('/models/cantaro-opt.glb'),
    ]);
    characterSource = charSrc;
    jugSource = jugSrc;
    character = createCharacterInstance(characterSource, {
      rotateYToMatchPlayerFront: true,
      walkSpeedReference: 4.5,
    });
    const jugRoot = createJugInstance(jugSource, {
      targetHeight: JUG_TARGET_HEIGHT,
    });
    player.setVisual(character.root);
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

  if (DEBUG_INVINCIBLE) {
    queueMicrotask(() => {
      console.warn('[debug] DEBUG_INVINCIBLE: no fallo por derrame el cántaro');
    });
  }

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
      invincible: DEBUG_INVINCIBLE,
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

    hud.setMilkStats(d.litres, d.index);
    hud.setDreamLabel(d.dreamName);
    dreamPreview.setKey(d.animalKey, levelAnimals);
  }

  function restart() {
    // Position + balance are client-authoritative, always safe to reset.
    player.reset(level.spawn);
    balance.reset();
    timeRemaining = TOTAL_TIME_SECONDS;
    status = 'playing';
    // Progression is server-authoritative when online: the server keeps
    // your `dreamIndex` across an in-tab restart anyway (you only get
    // a new player number on a fresh WS connection). Resetting it
    // locally would desync the HUD until the next schema patch lands.
    // In offline mode we still need to rewind it ourselves.
    if (!serverProgressionLive) progression.reset();
    applyCurrentDream(false);
    hud.setStatus(status);
    hud.setTime(timeRemaining);
  }

  applyCurrentDream(false);
  hud.setStatus(status);
  hud.setTime(timeRemaining);

  const clock = new THREE.Clock();

  installMusicLoop('/assets/milk-dreams-bgm.mp3', 0.35);

  // Phase-1/2/3 multiplayer: best-effort connect, kicked off in the
  // background so a slow / unreachable server doesn't delay the game's
  // first frame. Until the handle resolves, `multi` is a no-op shim;
  // afterward, every frame's `sendPose` lands on the real connection,
  // `remotePlayers` starts spawning visuals for other players, and
  // delivery validation moves to the server.
  let multi: MultiplayerHandle = OFFLINE_MULTIPLAYER_HANDLE;
  let remotePlayers: RemotePlayersManager | null = null;
  /**
   * Phase 3 — connection state for the progression source of truth.
   *  - `false` (default): no server. Local progression decides everything.
   *  - `true`:            server-authoritative. Local advance() is never
   *    called from inside the goal-radius branch; we send `claim_delivery`
   *    instead and react to the schema callback that bumps `dreamIndex`.
   *
   * We flip on the first self-progression event so we don't enter the
   * online branch while the schema is still hydrating (would briefly
   * stop sending claims with no replacement source).
   */
  let serverProgressionLive = false;
  /**
   * Phase 4 — server-driven round lifecycle. While `false`, the local
   * `timeRemaining` timer ticks down as in single-player and the local
   * 'timeout' game-over fires when it reaches zero. While `true`, the
   * timer is read from `multi.round()` and the 'timeout' branch is
   * skipped — the server's phase transition (playing → scoreboard →
   * playing) drives everything instead.
   */
  let serverRoundLive = false;
  /**
   * Last server phase we acted on. `null` until the first round update
   * arrives. We compare against the incoming phase to detect transitions
   * (the only events that need side-effects: showing/hiding scoreboard,
   * resetting the local sim).
   */
  let lastServerPhase: 'playing' | 'scoreboard' | null = null;
  hud.setNetStatus('connecting', null);

  /**
   * Build the scoreboard entries for the current frame. Sorted by
   * `dreamIndex` desc; ties broken by name for stable rendering.
   * Capped at the top 8 to keep the panel readable on small screens.
   */
  function buildScoreboard(handle: MultiplayerHandle): ScoreboardEntry[] {
    const entries: ScoreboardEntry[] = [];
    const self = handle.selfView();
    if (self) {
      entries.push({
        name: self.name,
        deliveries: self.dreamIndex,
        colorHue: self.colorHue,
        isSelf: true,
      });
    }
    handle.remotePlayers().forEach((view) => {
      entries.push({
        name: view.name,
        deliveries: view.dreamIndex,
        colorHue: view.colorHue,
        isSelf: false,
      });
    });
    entries.sort((a, b) => {
      if (b.deliveries !== a.deliveries) return b.deliveries - a.deliveries;
      return a.name.localeCompare(b.name);
    });
    return entries.slice(0, 8);
  }
  void connectMultiplayer({
    onStatusChange: (status, name) => {
      hud.setNetStatus(status, name);
    },
  }).then((handle) => {
    multi = handle;
    hud.setNetStatus(handle.status(), handle.selfName());
    // Wire remote-player rendering. Safe to do unconditionally — the
    // manager subscribes through the handle, so an offline handle just
    // means "no remotes will ever appear" without throwing. Sources
    // are pre-cached above, so spawning a remote later is synchronous.
    remotePlayers = createRemotePlayers({
      scene,
      multi: handle,
      characterSource,
      jugSource,
    });

    // Phase 3 — react to server-driven progression changes for self.
    // Fires once on hydration with the current snapshot, then on every
    // accepted `claim_delivery`. Pose echoes ALSO fire onChange under
    // the hood, so we guard with a "did dreamIndex actually move?"
    // check before re-applying the dream (which is expensive: it
    // reparents flock animals, resets balance, etc).
    handle.subscribeSelfProgression({
      onChange: (snapshot) => {
        // First fire: take over from local progression.
        if (!serverProgressionLive) {
          serverProgressionLive = true;
          // Sync local index with server so any HUD already showing
          // stale local state catches up. Common path here: server
          // initial state is index 0, local is also 0 → no-op.
          if (progression.current.index !== snapshot.dreamIndex) {
            progression.setIndex(snapshot.dreamIndex);
            applyCurrentDream(false);
          }
          return;
        }
        // Subsequent fires: only act when dreamIndex changed (i.e. an
        // accepted delivery). The pose echo will fire onChange on
        // every patch but with the same dreamIndex; cheap to filter.
        if (snapshot.dreamIndex === progression.current.index) return;
        // Special case: the server resets `dreamIndex` to 0 at the
        // start of each round. That's not a "delivery", so skip the
        // toast — the round-transition branch handles its own UX.
        if (snapshot.dreamIndex === 0) {
          progression.setIndex(0);
          applyCurrentDream(false);
          return;
        }
        const obtained = progression.current.dreamName;
        progression.setIndex(snapshot.dreamIndex);
        applyCurrentDream(true);
        const nextName = progression.current.dreamName;
        hud.showToast(
          `¡Has conseguido ${obtained.toLowerCase()}! Ahora sueñas con ${nextName.toLowerCase()}`,
          2200,
        );
      },
    });

    // Phase 4 — react to round-lifecycle changes (3-min round ↔
    // 10-second scoreboard between rounds).
    handle.subscribeRound({
      onChange: (snapshot) => {
        // First server snapshot wins authority over the local timer.
        // From now on the render loop reads the deadline off
        // `handle.round()` and ignores the local `timeRemaining`.
        if (!serverRoundLive) serverRoundLive = true;

        const phaseChanged = snapshot.phase !== lastServerPhase;
        const wasNull = lastServerPhase === null;
        lastServerPhase = snapshot.phase;

        // Re-fires of the same phase (e.g. only `phaseEndsAt` changed)
        // don't need a transition effect — the per-frame countdown
        // picks the new deadline up automatically.
        if (!phaseChanged && !wasNull) return;

        if (snapshot.phase === 'scoreboard') {
          // Round just ended. Snapshot the standings and show the
          // overlay; the per-frame loop updates the countdown digit.
          const entries = buildScoreboard(handle);
          const remainingSec = Math.max(
            0,
            (snapshot.phaseEndsAtMs - performance.now()) / 1000,
          );
          hud.showScoreboard(entries, remainingSec);
        } else {
          // Transitioned (back) into a playing phase — also covers the
          // initial connect snapshot when we're already mid-round.
          hud.hideScoreboard();
          // Reset position + balance for the new round. Skip on the
          // very first snapshot if we're already 'playing': nothing
          // to reset, the player just spawned.
          if (!wasNull) restart();
        }
      },
    });
  });

  renderer.setAnimationLoop(() => {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);

    input.update();
    // Hide the controls hint once the player has engaged (pressed any
    // movement key or started free-looking). No pointer lock involved
    // anymore — the HUD just fades the help text out.
    hud.setLocked(input.hasEngaged);

    if (input.consumeRestart()) restart();

    // Phase 4 — pick the source of truth for the countdown timer:
    //  - online + round hydrated: derive seconds-left from the server
    //    deadline (already in client `performance.now()` ms space).
    //  - otherwise: tick the local timer in game time as before.
    const round = serverRoundLive ? multi.round() : null;
    if (round) {
      timeRemaining = Math.max(
        0,
        (round.phaseEndsAtMs - performance.now()) / 1000,
      );
      // While the scoreboard is up, the HUD's main timer freezes at 0:00
      // (we already swap to the scoreboard countdown for the live digit)
      // so it stops counting up the inter-round wait time.
      hud.setTime(round.phase === 'playing' ? timeRemaining : 0);
      if (round.phase === 'scoreboard') {
        hud.setScoreboardCountdown(timeRemaining);
      }
    }

    if (status === 'playing') {
      if (!round) {
        // Single-player / pre-hydration path.
        timeRemaining = Math.max(0, timeRemaining - dt);
        hud.setTime(timeRemaining);
      }

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
      // In MP, the local 'timeout' status is suppressed: the server's
      // round timer drives end-of-round state via the 'scoreboard'
      // phase, and triggering both would double up "se acabó el tiempo"
      // with the scoreboard overlay. Spill is still client-owned.
      if (balance.isSpilled) {
        status = 'spilled';
        hud.setStatus(status, {
          litresDelivered: progression.current.index,
          currentDream: progression.current.dreamName,
        });
      } else if (!serverRoundLive && timeRemaining <= 0) {
        status = 'timeout';
        hud.setStatus(status, {
          litresDelivered: progression.current.index,
          currentDream: progression.current.dreamName,
        });
      } else if (distance < level.goalRadius) {
        // Successful delivery. Two paths:
        //  - Online: send a `claim_delivery` to the server; it validates
        //    against its own goal table and bumps `dreamIndex`. The
        //    `subscribeSelfProgression` listener wired above is what
        //    actually advances the local progression + shows the toast,
        //    so we don't double-fire here. Throttling lives inside
        //    `sendDeliveryClaim`, so spamming this branch every frame
        //    while inside the radius is harmless.
        //  - Offline: keep the original local logic so single-player still
        //    works without a server.
        if (serverProgressionLive) {
          multi.sendDeliveryClaim({
            x: player.group.position.x,
            z: player.group.position.z,
            yaw: player.result.facing,
          });
        } else {
          // Fable logic: she arrives with milk, imagines trading it for
          // the reward of the current dream, then starts dreaming of
          // the next.
          const obtained = progression.current.dreamName;
          progression.advance();
          applyCurrentDream(true);
          const nextName = progression.current.dreamName;
          hud.showToast(
            `¡Has conseguido ${obtained.toLowerCase()}! Ahora sueñas con ${nextName.toLowerCase()}`,
            2200,
          );
        }
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

    // Multiplayer: ship our pose (rate-limited to 20 Hz internally),
    // then advance remote-player interpolation so their visuals catch
    // up to the latest network state. Both no-op when offline.
    multi.sendPose({
      x: player.group.position.x,
      z: player.group.position.z,
      yaw: player.result.facing,
    });
    remotePlayers?.update(dt);

    // Minimap reflects whatever state we ended this frame in (playing or
    // frozen), so the radar is still informative on game-over screens.
    minimap.render({
      playerX: player.group.position.x,
      playerZ: player.group.position.z,
      facing: player.result.facing,
      goal: { x: level.goal.x, z: level.goal.z },
      spawn: { x: level.spawn.x, z: level.spawn.z },
      obstacles: level.obstacles,
      remotes: remotePlayers?.positions(),
    });

    renderer.render(scene, camera);
    dreamPreview.render(dt);
  });
}

void boot();

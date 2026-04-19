import * as THREE from 'three';
import { createBootstrap } from './app/bootstrap';
import { createResize } from './app/resize';
import { createInputSystem } from './systems/input';
import { createLevel, loadLevelHouses, loadLevelTextures } from './game/level';
import { createPlayer, PLAYER_RADIUS } from './game/player';
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
import { loadBillboardModel } from './game/billboardModel';
import {
  buildBillboardCollisionObstacles,
  createTweetBillboards,
  type TweetBillboardPlacement,
} from './game/tweetBillboards';
import { EXAMPLE_TWEETS } from './game/exampleTweets';
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
import {
  fetchLeaderboard,
  httpEndpointFromWs,
  type LeaderboardEntry,
} from './net/leaderboard';
import type { AllTimeEntry, ScoreboardEntry } from './ui/hud';
import { getOrAskPlayerName } from './ui/nameModal';
import type { Obstacle } from './game/level';

/** Jug: base height in metres and extra lift above the head anchor. */
const JUG_TARGET_HEIGHT = 0.42;
const JUG_EXTRA_LIFT_Y = 0.08;

/** Total run time in seconds. The Lechera has to deliver as much as she can before this runs out. */
const TOTAL_TIME_SECONDS = 180;

/**
 * Playtest: never game-over from spilling (tilt clamps at max instead).
 * Set to `true` while tuning levels or rushing to late dreams.
 */
const DEBUG_INVINCIBLE = true;

function dreamAdvanceToast(obtained: string, nextName: string): string {
  return `You got ${obtained.toLowerCase()}! Now you dream of ${nextName.toLowerCase()}.`;
}

/**
 * Phase 4.5 — toast shown when a soft-spill resets the dream chain
 * mid-round (online only). Mirrors the SP "you spilled the milk" text
 * but framed as a continuation, not a game over.
 */
const SPILL_TOAST_TEXT =
  'You spilled the milk! Starting over with the small jar.';

/**
 * Cumulative litres delivered for a 0-based dream index reached by
 * a clean (no-spill) chain in single-player. Triangular sum of the
 * `litres = i + 1` series from the dreams catalog: 1 + 2 + ... + n =
 * n(n+1)/2 where n is the number of completed deliveries.
 *
 * Used as a fallback for SP and as the HUD seed before the server's
 * `litresDelivered` snapshot lands. In MP the canonical value is the
 * server's monotonically-tracked `litresDelivered` (which can diverge
 * from this formula when soft-spills are involved — that's the whole
 * point: spilling preserves the bank).
 */
function triangularLitresFor(index: number): number {
  const n = Math.max(0, Math.floor(index));
  return (n * (n + 1)) / 2;
}

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

/** Playtest: fewer billboards until tweet planes are optimized / instanced. */
const BILLBOARD_TWEET_COUNT = 10;

/**
 * Min centre distance in XZ between boards (~footprint + margin) so they
 * never spawn stacked.
 */
const BILLBOARD_MIN_SPACING_M = 12;

/** Deterministic 0..1 “noise” so scatter looks irregular but stable across reloads. */
function billboardHash01(i: number, salt: number): number {
  const t = Math.sin(i * 12.9898 + salt * 78.233 + BILLBOARD_TWEET_COUNT) * 43758.5453;
  return t - Math.floor(t);
}

/**
 * Tweet boards scattered off the path with **non-overlap**: each new spot
 * must clear `BILLBOARD_MIN_SPACING_M` from all previous (greedy + retries).
 * Still a bit irregular via hash jitter; fallback ladder if retries exhaust.
 */
function buildExampleTweetPlacements(): TweetBillboardPlacement[] {
  const picks = EXAMPLE_TWEETS.slice(0, BILLBOARD_TWEET_COUNT);
  const placed: THREE.Vector3[] = [];
  const minSq = BILLBOARD_MIN_SPACING_M * BILLBOARD_MIN_SPACING_M;
  const out: TweetBillboardPlacement[] = [];

  for (let i = 0; i < picks.length; i++) {
    const tweet = picks[i]!;
    const pos = new THREE.Vector3();
    let accepted = false;

    for (let attempt = 0; attempt < 96; attempt++) {
      const seed = i * 997 + attempt * 131;
      const r0 = billboardHash01(seed, 0);
      const r1 = billboardHash01(seed, 1);
      const r2 = billboardHash01(seed, 2);
      const side = r0 < 0.5 ? -1 : 1;
      const x =
        side * (8.5 + r1 * 10.5) + (billboardHash01(seed, 4) - 0.5) * 4.5;
      const z =
        18 -
        i * 6.5 -
        attempt * 0.035 +
        (r2 - 0.5) * 4.5 +
        Math.sin(seed * 0.061) * 3;

      pos.set(
        THREE.MathUtils.clamp(x, -42, 42),
        0,
        THREE.MathUtils.clamp(z, -40, 24),
      );

      if (placed.every((p) => pos.distanceToSquared(p) >= minSq)) {
        placed.push(pos.clone());
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      const side = i % 2 === 0 ? -1 : 1;
      pos.set(side * 12.5, 0, 16 - i * 7.5);
      let guard = 0;
      while (
        guard < 30 &&
        placed.some((p) => pos.distanceToSquared(p) < minSq)
      ) {
        guard += 1;
        pos.z -= 2.8;
        pos.x += (billboardHash01(i + guard, 9) - 0.5) * 2;
      }
      if (placed.some((p) => pos.distanceToSquared(p) < minSq)) {
        pos.z -= 18 + i * 2.5;
      }
      placed.push(pos.clone());
    }

    const sideFromX = pos.x < 0 ? -1 : 1;
    const baseYaw = sideFromX < 0 ? 0 : Math.PI;
    const yawJitter = (billboardHash01(i, 7) - 0.5) * 0.55;
    const ang = baseYaw + yawJitter;
    out.push({
      position: pos.clone(),
      facing: new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)),
      tweet,
    });
  }

  return out;
}

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
    console.error('[assets] failed to load milkmaid / jug GLB', err);
    if (loadingEl) {
      loadingEl.textContent =
        'Failed to load assets. Check your connection and reload.';
      loadingEl.classList.add('loading-error');
    }
    return;
  }

  loadingEl?.classList.add('hidden');

  if (DEBUG_INVINCIBLE) {
    queueMicrotask(() => {
      console.warn('[debug] DEBUG_INVINCIBLE: spills do not fail the run');
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

  // Roadside tweet-billboards (POC). Loaded async in the background so slow
  // fetches never block gameplay. Stubs live here for the POC; swap for a
  // real endpoint by replacing the array with a fetch result.
  loadBillboardModel()
    .then((billboardModel) => {
      const placements = buildExampleTweetPlacements();
      level.addObstacles(buildBillboardCollisionObstacles(billboardModel, placements));
      createTweetBillboards({
        scene,
        camera,
        renderer,
        billboard: billboardModel,
        placements,
      });
    })
    .catch((err) => {
      console.error('[billboards] failed to load billboard model', err);
    });

  const tiltAxis = new THREE.Vector3();
  const jugWorldPos = new THREE.Vector3();

  let status: GameStatus = 'playing';
  let timeRemaining = TOTAL_TIME_SECONDS;
  /** Offline / pre-hydration round label; online uses `multi.round().roundNumber`. */
  let localRoundCounter = 1;

  // Multiplayer state must be declared BEFORE `applyCurrentDream` /
  // `currentLitresDelivered` — those close over these `let` bindings. If
  // they sit below in the source, the first `applyCurrentDream` during
  // boot hits the temporal dead zone and throws
  // "Cannot access 'serverProgressionLive' before initialization".
  let multi: MultiplayerHandle = OFFLINE_MULTIPLAYER_HANDLE;
  let remotePlayers: RemotePlayersManager | null = null;
  let serverProgressionLive = false;
  /**
   * Phase 6d — scratch buffer reused every frame to feed the
   * concatenated `[level obstacles, remote players as obstacles]`
   * list into `player.update`. Pre-allocated so we don't churn GC at
   * 60 Hz with N rebuilt array literals.
   */
  const frameObstacles: Obstacle[] = [];
  /**
   * Phase 6d — pre-allocated `Obstacle` shells reused for remote
   * players. We only mutate `center.x` / `center.z` per frame; halfX,
   * halfZ, halfY and `visual` stay constant. This keeps the per-frame
   * cost of remote-player collision to a few field assignments per
   * remote, not an allocation.
   */
  const remoteObstaclePool: Obstacle[] = [];
  /**
   * Reusable invisible group used as the `visual` field of pooled
   * remote-player obstacles. The collision math in `player.ts` only
   * reads `center` / `halfX` / `halfZ`, so the visual is a formality
   * required by the `Obstacle` interface; sharing one group avoids N
   * dummy allocations.
   */
  const remoteObstacleVisual = new THREE.Group();
  remoteObstacleVisual.name = 'remote-obstacle-shell';
  /**
   * Per-session velocity tracker for remote players. We need each
   * remote's world-space velocity to feed `Obstacle.velocityX/Z` so
   * the player↔player collision in `player.ts` can fire a bump on
   * the SIDE THAT GETS HIT (otherwise only the rammer feels it).
   *
   * Pose patches arrive at 20 Hz but we render at 60 Hz, so a naive
   * "(curr - prev) / dt" derivative is 0 for ~2 of every 3 frames
   * and spikes on the third. Instead we measure the delta between
   * actual position changes and hold that velocity until the next
   * change. After 200 ms of no movement we collapse it to 0 so a
   * remote that stopped moving doesn't keep reporting their last
   * walk velocity for ever.
   */
  interface RemoteVelocityEntry {
    prevX: number;
    prevZ: number;
    velX: number;
    velZ: number;
    /** `performance.now()` of the most recent x/z change. */
    lastChangeMs: number;
  }
  const remoteVelocityCache = new Map<string, RemoteVelocityEntry>();
  /** Idle threshold after which a remote's tracked velocity decays to 0. */
  const REMOTE_VEL_IDLE_MS = 200;
  let serverRoundLive = false;
  let lastServerPhase: 'playing' | 'scoreboard' | null = null;

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

    hud.setMilkStats(d.litres, currentLitresDelivered());
    hud.setDreamLabel(d.dreamName);
    dreamPreview.setKey(d.animalKey, levelAnimals);
  }

  /**
   * Cumulative litres delivered this round (Phase 4.5). Online: the
   * server-tracked `litresDelivered` from the self schema (preserved
   * across soft-spills). Offline: derived from the local progression
   * via the triangular sum, since SP keeps the classic "spill = game
   * over" model and cannot accumulate beyond a clean chain.
   */
  function currentLitresDelivered(): number {
    if (serverProgressionLive) {
      const snap = multi.selfProgression();
      if (snap) return snap.litresDelivered;
    }
    return triangularLitresFor(progression.current.index);
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
    if (!serverRoundLive) localRoundCounter += 1;
    applyCurrentDream(false);
    hud.setStatus(status);
    hud.setTime(timeRemaining);
    const rv = serverRoundLive ? multi.round() : null;
    hud.setRound(rv?.roundNumber ?? localRoundCounter);
  }

  applyCurrentDream(false);
  hud.setStatus(status);
  hud.setTime(timeRemaining);
  hud.setRound(localRoundCounter);

  const clock = new THREE.Clock();

  installMusicLoop('/assets/milk-dreams-bgm.mp3', 0.35);

  // Phase-1/2/3 multiplayer: best-effort connect, kicked off in the
  // background so a slow / unreachable server doesn't delay the game's
  // first frame. Until the handle resolves, `multi` is a no-op shim;
  // afterward, every frame's `sendPose` lands on the real connection,
  // `remotePlayers` starts spawning visuals for other players, and
  // delivery validation moves to the server.
  hud.setNetStatus('connecting', null);

  /**
   * Phase 5 — derive the HTTP base URL for `/leaderboard` from the
   * Colyseus WebSocket endpoint. Captured once when the handle resolves
   * so we don't re-parse `window.location.search` every refresh.
   */
  let leaderboardHttpEndpoint: string | null = null;

  /**
   * Phase 5 — refresh the All-time Top 10 panel inside the open
   * scoreboard. Returns immediately if no HTTP endpoint is known
   * (offline / pre-connect), so the caller can wire it unconditionally
   * to the round-transition handler. Errors are swallowed inside
   * `fetchLeaderboard` (returns `[]` on failure).
   */
  async function refreshLeaderboard(handle: MultiplayerHandle): Promise<void> {
    if (!leaderboardHttpEndpoint) return;
    const entries = await fetchLeaderboard(leaderboardHttpEndpoint, 10);
    const mapped: AllTimeEntry[] = entries.map((e: LeaderboardEntry) => ({
      name: e.name,
      totalMilk: e.total_milk,
      roundsPlayed: e.rounds_played,
    }));
    hud.setAllTimeLeaderboard(mapped, handle.selfName());
  }

  /**
   * Build the scoreboard entries for the current frame. Sorted by
   * `litresDelivered` desc; ties broken by name for stable rendering.
   * Capped at the top 8 to keep the panel readable on small screens.
   */
  function buildScoreboard(handle: MultiplayerHandle): ScoreboardEntry[] {
    const entries: ScoreboardEntry[] = [];
    const self = handle.selfView();
    if (self) {
      entries.push({
        name: self.name,
        litresDelivered: self.litresDelivered,
        colorHue: self.colorHue,
        isSelf: true,
      });
    }
    handle.remotePlayers().forEach((view) => {
      entries.push({
        name: view.name,
        litresDelivered: view.litresDelivered,
        colorHue: view.colorHue,
        isSelf: false,
      });
    });
    entries.sort((a, b) => {
      if (b.litresDelivered !== a.litresDelivered) {
        return b.litresDelivered - a.litresDelivered;
      }
      return a.name.localeCompare(b.name);
    });
    return entries.slice(0, 8);
  }
  // Phase 6a — resolve the player's display name BEFORE opening the
  // WebSocket. The cached path (`localStorage` hit) is synchronous and
  // adds zero latency to first connect; the modal path blocks here
  // until the player enters a valid name (mandatory, min 3 chars).
  // The server uses the SAME validation, so any name accepted here is
  // accepted there.
  void getOrAskPlayerName().then((chosenName) =>
    connectMultiplayer({
      name: chosenName,
      onStatusChange: (status, name) => {
        // Hue isn't known yet at the first fire (self schema hasn't
        // hydrated). Once the self view lands, the
        // `subscribeSelfProgression` hook below re-fires with the
        // tint so the HUD name picks up the player's colour.
        hud.setNetStatus(status, name, multi.selfView()?.colorHue ?? null);
      },
    }),
  ).then((handle) => {
    multi = handle;
    hud.setNetStatus(
      handle.status(),
      handle.selfName(),
      handle.selfView()?.colorHue ?? null,
    );
    // Phase 5 — capture the HTTP origin sibling of the WS endpoint so
    // `refreshLeaderboard` knows where to fetch the all-time top from.
    // We always set it (even when offline) because a future reconnect
    // would still target the same origin.
    const ws = handle.endpoint();
    if (ws) leaderboardHttpEndpoint = httpEndpointFromWs(ws);
    // Phase 6b — server picks a spawn position inside an annulus
    // around the world spawn (avoids 10 lecheras stacking on top of
    // each other). Teleport the local character to that position the
    // first time the schema hydrates with our pose. Subsequent self
    // updates (pose echoes from our own `pose` sends) are ignored —
    // we don't want server-side pose to fight the client-predictive
    // movement model.
    if (handle.status() === 'online') {
      let teleportedToServerSpawn = false;
      const tryTeleport = () => {
        if (teleportedToServerSpawn) return;
        const self = handle.selfView();
        if (!self) return;
        teleportedToServerSpawn = true;
        // `self.x` / `self.z` come from `spawnPositionInRing()` on
        // the server. Y stays 0 — the player module clamps it.
        player.reset(new THREE.Vector3(self.x, 0, self.z));
      };
      // Self may already be in the schema by the time our `then`
      // runs; otherwise the next progression fire will land it.
      tryTeleport();
      handle.subscribeSelfProgression({
        onChange: () => tryTeleport(),
      });
    }
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
        // Refresh the HUD net badge with the current hue. The
        // initial `setNetStatus` upstream may have fired before our
        // self entry hydrated, in which case the hue was null and
        // the name showed in the default fg colour. The HUD setter
        // is idempotent (early-returns when status/name/hue all
        // match the last call), so re-firing every snapshot is
        // cheap.
        hud.setNetStatus(
          handle.status(),
          handle.selfName(),
          handle.selfView()?.colorHue ?? null,
        );
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
        // Special case: the server resets `dreamIndex` to 0 in two
        // situations:
        //   1) Round transition `scoreboard → playing` (Phase 4) —
        //      the round-overlay branch already handled the UX.
        //   2) Soft-spill ack (Phase 4.5) — the spill branch in the
        //      main loop already showed `SPILL_TOAST_TEXT` locally.
        // Either way we just rebuild visuals silently here. The
        // schema's `litresDelivered` is the authoritative running
        // total, so `applyCurrentDream` picking it up via
        // `currentLitresDelivered` keeps the HUD in sync.
        if (snapshot.dreamIndex === 0) {
          progression.setIndex(0);
          applyCurrentDream(false);
          return;
        }
        const obtained = progression.current.dreamName;
        progression.setIndex(snapshot.dreamIndex);
        applyCurrentDream(true);
        const nextName = progression.current.dreamName;
        hud.showToast(dreamAdvanceToast(obtained, nextName), 2200);
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
          // Phase 5 — kick off the all-time leaderboard fetch in the
          // background. The HUD shows a "Loading…" placeholder until
          // it lands; the await resolves to `[]` on any error so we
          // either render real data or "no data yet". The server's
          // INSERT for THIS round runs synchronously inside endRound
          // before the `phase` schema patch reaches us, so the fetch
          // includes the just-finished round's contributions.
          hud.setAllTimeLeaderboard(null, handle.selfName());
          void refreshLeaderboard(handle);
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

    hud.setRound(round ? round.roundNumber : localRoundCounter);

    if (status === 'playing') {
      if (!round) {
        // Single-player / pre-hydration path.
        timeRemaining = Math.max(0, timeRemaining - dt);
        hud.setTime(timeRemaining);
      }

      // Phase 6d — player ↔ player collision. Wrap every remote
      // player as an `Obstacle` AABB sized at PLAYER_RADIUS so the
      // collision diameter between two lecheras equals 2·PLAYER_RADIUS,
      // matching their visual footprint. Using AABBs (rather than a
      // dedicated circle path) lets us reuse the existing collision
      // code in `player.ts` unchanged — and it produces `bumps` events
      // that flow naturally into the jug balance, so a clash with
      // another lechera tilts your jug exactly like clashing with a
      // wall would.
      //
      // Each client resolves collision against the OTHER players
      // independently on its own local sim, so the apparent push is
      // roughly symmetric without the server having to mediate.
      // Cheap to do every frame: ~10 remotes × a handful of field
      // assignments.
      frameObstacles.length = 0;
      for (const ob of level.obstacles) frameObstacles.push(ob);
      const remotes = multi.remotePlayers();
      const nowMs = performance.now();
      let remoteIdx = 0;
      remotes.forEach((view, sessionId) => {
        let entry = remoteObstaclePool[remoteIdx];
        if (!entry) {
          entry = {
            center: new THREE.Vector3(),
            halfX: PLAYER_RADIUS,
            halfZ: PLAYER_RADIUS,
            halfY: 0.7,
            velocityX: 0,
            velocityZ: 0,
            visual: remoteObstacleVisual,
          };
          remoteObstaclePool[remoteIdx] = entry;
        }
        entry.center.set(view.x, 0, view.z);

        // Update / read the per-session velocity tracker. Velocity is
        // sampled across actual position changes (not per-frame
        // deltas) so the result is stable between 20 Hz patches.
        let velEntry = remoteVelocityCache.get(sessionId);
        if (!velEntry) {
          velEntry = {
            prevX: view.x,
            prevZ: view.z,
            velX: 0,
            velZ: 0,
            lastChangeMs: nowMs,
          };
          remoteVelocityCache.set(sessionId, velEntry);
        } else if (view.x !== velEntry.prevX || view.z !== velEntry.prevZ) {
          // Clamp the time window to a sensible minimum (10 ms) to
          // avoid huge spikes when patches happen to arrive very
          // close together.
          const elapsedSec = Math.max(0.01, (nowMs - velEntry.lastChangeMs) / 1000);
          velEntry.velX = (view.x - velEntry.prevX) / elapsedSec;
          velEntry.velZ = (view.z - velEntry.prevZ) / elapsedSec;
          velEntry.prevX = view.x;
          velEntry.prevZ = view.z;
          velEntry.lastChangeMs = nowMs;
        } else if (nowMs - velEntry.lastChangeMs > REMOTE_VEL_IDLE_MS) {
          velEntry.velX = 0;
          velEntry.velZ = 0;
        }
        entry.velocityX = velEntry.velX;
        entry.velocityZ = velEntry.velZ;

        frameObstacles.push(entry);
        remoteIdx += 1;
      });
      // Drop tracker entries for remotes that left the room so the
      // map doesn't grow unboundedly across long sessions.
      if (remoteVelocityCache.size > remotes.size) {
        for (const sessionId of remoteVelocityCache.keys()) {
          if (!remotes.has(sessionId)) remoteVelocityCache.delete(sessionId);
        }
      }

      const r = player.update(
        dt,
        input.axes.moveForward,
        input.axes.moveRight,
        frameObstacles,
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
      // phase, and triggering both would double up "time's up" messaging
      // with the scoreboard overlay. Spill behaviour ALSO branches on
      // mode (Phase 4.5):
      //  - SP: classic game-over screen (consistent with the fable —
      //    the milkmaid daydreams away her chance and loses everything).
      //  - MP: soft-spill. Reset balance + dream chain locally, tell the
      //    server (which rewinds `dreamIndex`/`litres` but KEEPS
      //    `litresDelivered`), and keep playing. Progression visuals
      //    catch up via the existing `subscribeSelfProgression`
      //    "snap-to-0" branch when the schema patch lands.
      if (balance.isSpilled) {
        if (serverProgressionLive) {
          balance.reset();
          multi.sendSpillReport();
          hud.showToast(SPILL_TOAST_TEXT, 2200);
        } else {
          status = 'spilled';
          hud.setStatus(status, {
            litresDelivered: currentLitresDelivered(),
            currentDream: progression.current.dreamName,
          });
        }
      } else if (!serverRoundLive && timeRemaining <= 0) {
        status = 'timeout';
        hud.setStatus(status, {
          litresDelivered: currentLitresDelivered(),
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
          hud.showToast(dreamAdvanceToast(obtained, nextName), 2200);
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

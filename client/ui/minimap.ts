import type { Obstacle } from '../game/level';

/**
 * Player-centric circular radar.
 *
 * World layer (obstacles, spawn, goal) rotates with the character so the
 * "up" direction on screen always matches the Lechera's facing. The
 * player arrow and the cardinal tick at the top are drawn on top and
 * never rotate — they are the stable anchor the player reads.
 *
 * Everything is pure Canvas 2D. With ~20 obstacles per frame this costs
 * well under a millisecond; no need for scene graphs or SVG.
 */

/** Radius in world metres visible from the centre to the edge of the radar. */
const RADAR_RADIUS_M = 40;
/** CSS pixel size of the circular canvas (square bounding box). */
const SIZE = 180;
/** Inset from the edge where clamped off-screen arrows are drawn. */
const EDGE_INSET = 10;

/** Goal-marker tuning (single source of truth for the "dream" on the radar). */
const GOAL_COLOR = '#ffd86b';
const GOAL_OUTLINE = 'rgba(10, 10, 18, 0.85)';
const GOAL_DOT_R = 5.5;
const GOAL_HALO_R = 13;
/** Pulse period (seconds) for the in-range attention ring. */
const GOAL_PULSE_PERIOD_S = 1.4;
/** Outer radius the pulse ring expands to at peak. */
const GOAL_PULSE_MAX_R = 22;

export interface MinimapRemote {
  /** World position of the remote player. */
  x: number;
  z: number;
  /** HSL hue in [0, 1) — drives the dot colour. */
  hue: number;
}

export interface MinimapState {
  playerX: number;
  playerZ: number;
  /** Character facing in radians (same convention as player.ts). */
  facing: number;
  goal: { x: number; z: number };
  spawn: { x: number; z: number };
  obstacles: readonly Obstacle[];
  /** Optional remote players to draw as colored dots. */
  remotes?: readonly MinimapRemote[];
}

export interface Minimap {
  render(state: MinimapState): void;
}

export function createMinimap(canvas: HTMLCanvasElement): Minimap {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Minimap: 2D context unavailable');
  }

  // Backing store scales with devicePixelRatio; CSS size stays in logical
  // pixels. After ctx.scale(dpr), we draw in logical pixel units.
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;
  ctx.scale(dpr, dpr);

  const metresToPx = SIZE / 2 / RADAR_RADIUS_M;

  function render(state: MinimapState) {
    ctx!.clearRect(0, 0, SIZE, SIZE);

    ctx!.save();
    ctx!.translate(SIZE / 2, SIZE / 2);

    // --- World layer: rotates with the player ---
    ctx!.save();
    // Derivation for `facing - π`:
    //   Canvas Y = world Z (both "down" in screen space when no rotation).
    //   Player's forward in world XZ = (sin facing, cos facing).
    //   We want that direction to land on canvas -Y (up). Solving
    //   (sin(f − α), cos(f − α)) = (0, −1) → f − α = π → α = f − π.
    ctx!.rotate(state.facing - Math.PI);

    // Obstacles (axis-aligned boxes). Drawn first so the goal / spawn sit on
    // top visually, in case the goal happens to land inside a box tint.
    //
    // Early-out on world-space distance before computing pixel coordinates:
    // the level now ships with ~100+ tree obstacles in the horizon ring, and
    // almost all of them sit well outside the radar radius every frame. The
    // corner-safe cutoff (radius · √2) keeps boxes whose centre is off-radar
    // but whose half-extents still poke into the visible disc.
    ctx!.fillStyle = 'rgba(205, 190, 160, 0.55)';
    const cullRadiusSq = RADAR_RADIUS_M * RADAR_RADIUS_M * 2;
    for (const ob of state.obstacles) {
      const dxM = ob.center.x - state.playerX;
      const dzM = ob.center.z - state.playerZ;
      if (dxM * dxM + dzM * dzM > cullRadiusSq) continue;
      const dx = dxM * metresToPx;
      const dz = dzM * metresToPx;
      const w = ob.halfX * 2 * metresToPx;
      const h = ob.halfZ * 2 * metresToPx;
      ctx!.fillRect(dx - w / 2, dz - h / 2, w, h);
    }

    // Spawn: small hollow ring as a "you came from here" anchor.
    const spawnDx = (state.spawn.x - state.playerX) * metresToPx;
    const spawnDz = (state.spawn.z - state.playerZ) * metresToPx;
    ctx!.strokeStyle = 'rgba(247, 244, 236, 0.55)';
    ctx!.lineWidth = 1.25;
    ctx!.beginPath();
    ctx!.arc(spawnDx, spawnDz, 4, 0, Math.PI * 2);
    ctx!.stroke();

    // Remote players: filled dots in the same color the world uses for
    // their avatar / name tag. Outside-radius remotes are clamped to the
    // edge so they still hint at "they're over there" instead of vanishing.
    if (state.remotes && state.remotes.length > 0) {
      const edgePx = SIZE / 2 - EDGE_INSET;
      for (const remote of state.remotes) {
        const rdx = (remote.x - state.playerX) * metresToPx;
        const rdz = (remote.z - state.playerZ) * metresToPx;
        const dist = Math.hypot(rdx, rdz);
        const inside = dist <= edgePx;
        const drawX = inside ? rdx : (rdx / (dist || 1)) * edgePx;
        const drawZ = inside ? rdz : (rdz / (dist || 1)) * edgePx;
        const fill = `hsla(${(remote.hue * 360).toFixed(0)}, 65%, 60%, ${inside ? 0.95 : 0.7})`;
        const stroke = `hsla(${(remote.hue * 360).toFixed(0)}, 70%, 25%, 0.9)`;
        ctx!.fillStyle = fill;
        ctx!.strokeStyle = stroke;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.arc(drawX, drawZ, inside ? 3.2 : 2.5, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.stroke();
      }
    }

    // Goal marker ("the dream"):
    //  - In-range: pulsing outer ring + filled halo + core dot, all with a
    //    dark outline so it pops against grass / obstacle tints.
    //  - Off-range: larger clamped arrow with dark outline.
    const goalDxWorld = state.goal.x - state.playerX;
    const goalDzWorld = state.goal.z - state.playerZ;
    const goalDist = Math.hypot(goalDxWorld, goalDzWorld);
    const goalDx = goalDxWorld * metresToPx;
    const goalDz = goalDzWorld * metresToPx;
    const edgePx = SIZE / 2 - EDGE_INSET;

    if (goalDist <= RADAR_RADIUS_M) {
      // Pulse: triangle wave in [0, 1] with period GOAL_PULSE_PERIOD_S.
      // Sine-based would give more "breathing" but a linear ramp reads as
      // a confident beacon pulse at low period.
      const t = performance.now() / 1000;
      const phase =
        ((t % GOAL_PULSE_PERIOD_S) + GOAL_PULSE_PERIOD_S) %
        GOAL_PULSE_PERIOD_S /
        GOAL_PULSE_PERIOD_S; // 0 → 1 → 0…
      const pulseR = GOAL_HALO_R + (GOAL_PULSE_MAX_R - GOAL_HALO_R) * phase;
      const pulseA = 0.55 * (1 - phase);
      ctx!.strokeStyle = `rgba(255, 216, 107, ${pulseA.toFixed(3)})`;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.arc(goalDx, goalDz, pulseR, 0, Math.PI * 2);
      ctx!.stroke();

      // Solid halo.
      ctx!.fillStyle = 'rgba(255, 216, 107, 0.28)';
      ctx!.beginPath();
      ctx!.arc(goalDx, goalDz, GOAL_HALO_R, 0, Math.PI * 2);
      ctx!.fill();

      // Core dot with dark outline for contrast against the map.
      ctx!.fillStyle = GOAL_COLOR;
      ctx!.strokeStyle = GOAL_OUTLINE;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.arc(goalDx, goalDz, GOAL_DOT_R, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.stroke();
    } else {
      const mag = Math.hypot(goalDx, goalDz) || 1;
      const ex = (goalDx / mag) * edgePx;
      const ez = (goalDz / mag) * edgePx;
      ctx!.save();
      ctx!.translate(ex, ez);
      // Triangle local apex at (0, -9) → we rotate so that apex points
      // along the outward direction (atan2(ez, ex) + π/2 brings -Y there).
      ctx!.rotate(Math.atan2(ez, ex) + Math.PI / 2);
      ctx!.fillStyle = GOAL_COLOR;
      ctx!.strokeStyle = GOAL_OUTLINE;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.moveTo(0, -9);
      ctx!.lineTo(7, 6);
      ctx!.lineTo(-7, 6);
      ctx!.closePath();
      ctx!.fill();
      ctx!.stroke();
      ctx!.restore();
    }

    ctx!.restore();

    // --- Overlay: screen-fixed ---

    // Cardinal tick at the top reinforces "up = the way the Lechera is facing".
    ctx!.strokeStyle = 'rgba(241, 210, 141, 0.55)';
    ctx!.lineWidth = 1.4;
    ctx!.beginPath();
    ctx!.moveTo(0, -SIZE / 2 + 4);
    ctx!.lineTo(0, -SIZE / 2 + 13);
    ctx!.stroke();

    // Player triangle at the centre, always pointing up. Scales with the
    // bigger radar so it doesn't read as a pinprick next to the goal halo.
    ctx!.fillStyle = '#f7f4ec';
    ctx!.beginPath();
    ctx!.moveTo(0, -8);
    ctx!.lineTo(6.5, 6);
    ctx!.lineTo(-6.5, 6);
    ctx!.closePath();
    ctx!.fill();
    ctx!.strokeStyle = 'rgba(10, 10, 18, 0.8)';
    ctx!.lineWidth = 1.2;
    ctx!.stroke();

    ctx!.restore();
  }

  return { render };
}

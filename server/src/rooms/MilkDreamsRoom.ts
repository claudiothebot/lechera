import { Room, type Client } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import {
  DELIVERY_TOLERANCE,
  GOAL_RADIUS,
  goalFor,
  litresFor,
} from '../game/dreams.js';

/**
 * One connected Lechera. Phase 3 added `dreamIndex` and `litres` so the
 * server is the source of truth for progression; everything visual on
 * the client (animal at the goal, dream label, jug scale, balance
 * multipliers) is derived locally from `dreamIndex`.
 */
export class Player extends Schema {
  name = '';
  x = 0;
  z = 0;
  yaw = 0;
  /**
   * Visual identity in [0, 1) (HSL hue). Picked at join from a small
   * palette so every client renders the same color for the same player
   * — no client-side hashing of `sessionId` (which would diverge if any
   * two clients ever computed the hash differently).
   */
  colorHue = 0;
  /**
   * 0-based count of successful deliveries IN THE CURRENT ROUND. Reset
   * to 0 by the server at the start of each round (see `startRound`).
   * Drives the entire dream "feel" via the client's local progression
   * table (goal position, jug scale, multipliers, reward animal).
   */
  dreamIndex = 0;
  /**
   * Litres currently being carried (the next jar size). Equals
   * `dreamIndex + 1` by construction; sent so HUDs of OTHER clients can
   * eventually show "Player X is on Y litres" in a leaderboard without
   * needing the dreams table.
   */
  litres = 1;
}
defineTypes(Player, {
  name: 'string',
  x: 'number',
  z: 'number',
  yaw: 'number',
  colorHue: 'number',
  dreamIndex: 'number',
  litres: 'number',
});

/**
 * Top-level room state. Phase 4 adds the round lifecycle: `phase`,
 * `phaseEndsAt`, `roundNumber`. All clients share these — they're how
 * we keep the 3-minute countdown + scoreboard window in sync without
 * each browser running its own timer.
 */
export class MilkDreamsState extends Schema {
  players = new MapSchema<Player>();
  /** 'playing' (round in progress) or 'scoreboard' (between-round). */
  phase = 'playing';
  /**
   * `Date.now()` value at which the current phase ends and the next
   * one begins. Clients convert this into their local `performance.now`
   * timeline (offset = `Date.now() - performance.now()`) so they can
   * count down without further server traffic. Drift over a 3-minute
   * round is in the millisecond range — irrelevant for a HUD timer.
   */
  phaseEndsAt = 0;
  /**
   * Increments on every transition into 'playing'. Lets clients detect
   * "we just started a new round" even if `phase` happens to bounce
   * through the same value (e.g. on hot-reload during dev). Starts at 0
   * so the first call to `startRound()` (in `onCreate`) lands on 1.
   */
  roundNumber = 0;
}
defineTypes(MilkDreamsState, {
  players: { map: Player },
  phase: 'string',
  phaseEndsAt: 'number',
  roundNumber: 'number',
});

interface PoseMessage {
  x: number;
  z: number;
  yaw: number;
}

interface ClaimDeliveryMessage {
  /** Position the client believed it was at when it claimed delivery. */
  x: number;
  z: number;
}

/**
 * Sequential player numbering, room-scoped. Resets per room instance,
 * which is fine while we have a single-room model.
 */
let nextPlayerNumber = 1;

/**
 * Color palette as HSL hues in [0, 1). Eight evenly-spread, distinct
 * colors. The Nth player to join takes palette[(N-1) % palette.length],
 * so the first eight players are guaranteed unique colors. Saturation
 * and lightness are picked client-side so we can keep the palette
 * compact on the wire.
 */
const PLAYER_HUE_PALETTE: readonly number[] = [
  0.02, // warm red
  0.10, // orange
  0.16, // amber
  0.32, // green
  0.50, // cyan
  0.60, // sky blue
  0.74, // indigo / violet
  0.88, // magenta
];

/**
 * Phase durations. Read once at room boot from env (so smoke tests can
 * shrink the round to a few seconds without rebuilding) with sane
 * production defaults. The 3-minute round comes from the original
 * single-player `TOTAL_TIME_SECONDS`; 10 s for scoreboard is enough to
 * read the top entries without dragging the cadence.
 */
const ROUND_DURATION_MS = Number(process.env.MD_ROUND_MS ?? 180_000);
const SCOREBOARD_DURATION_MS = Number(process.env.MD_SCOREBOARD_MS ?? 10_000);

export class MilkDreamsRoom extends Room<{ state: MilkDreamsState }> {
  // 0.17 pattern: state lives as a class field, no `setState()` needed.
  // Requires `useDefineForClassFields: false` so the assignment runs as
  // `this.state = ...` in the constructor (where Colyseus's prototype
  // setter on Room hooks change tracking) instead of an `Object.defineProperty`
  // that would shadow it.
  override state = new MilkDreamsState();

  private phaseTimer: NodeJS.Timeout | null = null;

  override onCreate(): void {
    // Broadcast accumulated patches at 20 Hz. Player input arrives at the
    // same rate from the client, so this matches naturally.
    this.setPatchRate(1000 / 20);

    this.onMessage('pose', (client, raw) => {
      const msg = raw as Partial<PoseMessage>;
      if (
        typeof msg?.x !== 'number' ||
        typeof msg?.z !== 'number' ||
        typeof msg?.yaw !== 'number'
      ) {
        return;
      }
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.x = msg.x;
      p.z = msg.z;
      p.yaw = msg.yaw;
    });

    /**
     * Phase 3 — server-authoritative delivery.
     *
     * The client sends its position when it thinks it has reached the
     * current dream's goal. The server checks the distance against its
     * own goal table and, if the claim is plausible, advances the
     * player's `dreamIndex` (and updates `litres`).
     *
     * Phase 4 — claims are silently ignored during the 'scoreboard'
     * phase. The visual is frozen (no goal marker logic on the client
     * either), but a misbehaving client could still send claims; we
     * just drop them so end-of-round scores stay clean.
     */
    this.onMessage('claim_delivery', (client, raw) => {
      if (this.state.phase !== 'playing') return;
      const msg = raw as Partial<ClaimDeliveryMessage>;
      if (typeof msg?.x !== 'number' || typeof msg?.z !== 'number') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      const goal = goalFor(p.dreamIndex);
      const dx = msg.x - goal.x;
      const dz = msg.z - goal.z;
      const distSq = dx * dx + dz * dz;
      const limit = GOAL_RADIUS + DELIVERY_TOLERANCE;
      if (distSq > limit * limit) {
        console.log(
          `[room] reject delivery ${client.sessionId} dreamIndex=${p.dreamIndex} ` +
            `dist=${Math.sqrt(distSq).toFixed(2)} > ${limit.toFixed(2)}`,
        );
        return;
      }

      p.dreamIndex += 1;
      p.litres = litresFor(p.dreamIndex);
      console.log(
        `[room] deliver  ${client.sessionId} -> dreamIndex=${p.dreamIndex} litres=${p.litres}`,
      );
    });

    // Bootstrap the first round. We do this AFTER message handlers are
    // registered so any join racing with onCreate already sees a sane
    // phase + phaseEndsAt in their initial state hydration.
    this.startRound();

    console.log(
      `[room] created milk-dreams (round=${ROUND_DURATION_MS}ms, scoreboard=${SCOREBOARD_DURATION_MS}ms)`,
    );
  }

  override onJoin(client: Client): void {
    const number = nextPlayerNumber++;
    const p = new Player();
    p.name = `Player ${number}`;
    p.colorHue = PLAYER_HUE_PALETTE[(number - 1) % PLAYER_HUE_PALETTE.length]!;
    p.dreamIndex = 0;
    p.litres = litresFor(0);
    this.state.players.set(client.sessionId, p);
    console.log(
      `[room] join  ${client.sessionId}  ->  ${p.name} (hue ${p.colorHue.toFixed(2)}) phase=${this.state.phase}`,
    );
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId}`);
  }

  override onDispose(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    console.log('[room] disposed');
  }

  /**
   * Begin a new playing phase. Called once from `onCreate` and then on
   * every `scoreboard → playing` transition. Resets every connected
   * player's progression to zero — by the time we get here the clients
   * already showed the scoreboard, so this is the visual "everyone goes
   * back to Huevos" beat.
   */
  private startRound(): void {
    this.state.players.forEach((p) => {
      p.dreamIndex = 0;
      p.litres = litresFor(0);
    });
    this.state.roundNumber += 1;
    this.state.phase = 'playing';
    this.state.phaseEndsAt = Date.now() + ROUND_DURATION_MS;
    console.log(
      `[room] round ${this.state.roundNumber} started (ends in ${Math.round(ROUND_DURATION_MS / 1000)}s)`,
    );
    this.phaseTimer = setTimeout(
      () => this.endRound(),
      ROUND_DURATION_MS,
    );
  }

  /**
   * End the current playing phase: flip into 'scoreboard'. We do NOT
   * touch player schemas here on purpose — the scoreboard renders from
   * the live `dreamIndex` values, and zeroing them out now would make
   * everyone display "0 deliveries" during the celebration.
   */
  private endRound(): void {
    this.state.phase = 'scoreboard';
    this.state.phaseEndsAt = Date.now() + SCOREBOARD_DURATION_MS;
    // Iterate via `forEach` because MapSchema in @colyseus/schema 4.x is
    // not a real Map (no spreadable iterator) — see Phase 2 notes in
    // MULTIPLAYER.md. `forEach` always works.
    const tops: string[] = [];
    this.state.players.forEach((p) => tops.push(`${p.name}=${p.dreamIndex}`));
    console.log(
      `[room] round ${this.state.roundNumber} ended -> scoreboard for ${Math.round(SCOREBOARD_DURATION_MS / 1000)}s ; ${tops.join(' ')}`,
    );
    this.phaseTimer = setTimeout(
      () => this.startRound(),
      SCOREBOARD_DURATION_MS,
    );
  }
}

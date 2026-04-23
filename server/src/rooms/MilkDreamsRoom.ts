import { Room, type AuthContext, type Client } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import geoip from 'geoip-lite';
import {
  DELIVERY_TOLERANCE,
  GOAL_RADIUS,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  goalFor,
  litresFor,
  normaliseCountryCode,
  sanitiseName,
  spawnPositionInRing,
} from '@milk-dreams/shared';
import { getLeaderboardStore } from '../persistence/supabase.js';

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
  /**
   * Phase 4.5 — cumulative litres successfully delivered THIS ROUND.
   * Monotonically increasing across deliveries; survives a spill (we
   * only reset `dreamIndex`/`litres` on spill, not the running total)
   * and only resets to 0 at `startRound`. This is the field the
   * scoreboard ranks by, not `dreamIndex`, because soft-spill makes
   * "current dream" a poor proxy for total contribution.
   */
  litresDelivered = 0;
  /**
   * Phase 7 — ISO 3166-1 alpha-2 country code resolved from the
   * client's IP in `onAuth`. Empty string when the lookup failed
   * (localhost, private network, VPN, unknown range) — the schema
   * doesn't allow `null` so we carry the "no data" sentinel as `''`.
   * The server uses this for the leaderboard upsert; the client
   * renders it as a flag next to the name when non-empty.
   */
  country = '';
}
defineTypes(Player, {
  name: 'string',
  x: 'number',
  z: 'number',
  yaw: 'number',
  colorHue: 'number',
  dreamIndex: 'number',
  litres: 'number',
  litresDelivered: 'number',
  country: 'string',
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
   *
   * In production the server seeds this field from the durable
   * `milk_dreams.round_counter` at boot, so a restart doesn't reset the
   * HUD label back to "Round 1". See `MilkDreamsRoom.onCreate`.
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
  /**
   * Legacy payload fields from the client. Still accepted on the wire
   * for compatibility, but ignored for validation: delivery authority
   * comes from the latest server-tracked pose (`Player.x/z`).
   */
  x?: number;
  z?: number;
}

/**
 * Phase 7 — auth payload shape we hand off from `onAuth` to `onJoin`
 * via Colyseus's `client.auth`. Geolocation happens exactly once (at
 * the HTTP upgrade, when we still have the request headers), so the
 * `country` resolved there is what we assign to the Player schema and
 * eventually upsert into Supabase.
 */
interface AuthData {
  /** ISO 3166-1 alpha-2 ('ES', 'US', ...) or empty string on failure. */
  country: string;
}

/**
 * Resolve a client IP from `AuthContext.ip` (which the ws-transport
 * populates from `x-real-ip` → `x-forwarded-for` → `socket.remoteAddress`
 * in that precedence order). Handles three real-world quirks:
 *   - `ip` is typed as `string | string[]` by Colyseus (node's `http`
 *     allows array headers). We take the first entry.
 *   - Comma-separated XFF chains (`"203.0.113.5, 10.0.0.1"`) — the
 *     original client is the leftmost entry.
 *   - IPv4-mapped IPv6 (`::ffff:1.2.3.4`) — strip the prefix so
 *     `geoip-lite` sees a plain IPv4 address (it supports both, but
 *     the mapped form is a 'v6' path and some ranges only have v4 data).
 */
function extractClientIp(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return null;
  const head = first.split(',')[0]?.trim();
  if (!head) return null;
  if (head.startsWith('::ffff:')) return head.slice('::ffff:'.length);
  return head;
}

/**
 * Resolve a client IP to an ISO 3166-1 alpha-2 country code using the
 * offline `geoip-lite` database. Returns `''` (empty string) on any
 * miss so callers never have to special-case `null`.
 *
 * `geoip-lite` ships with a GeoLite2 snapshot that's baked in at
 * install time and goes stale slowly — country assignments change on
 * the order of years, so a yearly `pnpm exec geoip-lite-update` is
 * more than enough maintenance for this casual game.
 */
function resolveCountryFromIp(ip: string | null): string {
  if (!ip) return '';
  try {
    const lookup = geoip.lookup(ip);
    return normaliseCountryCode(lookup?.country ?? null) ?? '';
  } catch {
    return '';
  }
}

/**
 * Phase 6 — join options. The client supplies the display name the
 * player typed in the welcome modal (cached in `localStorage` on its
 * end). The server re-runs the same validation as the client —
 * `sanitiseName` is shared via `@milk-dreams/shared` — and REJECTS
 * the join when the result is invalid. There is no auto "Player N"
 * fallback any more: the client modal blocks until the player picks
 * something valid, so any join that arrives without a usable name is
 * a misbehaving client and gets bounced.
 */
interface JoinOptions {
  name?: string;
}

/**
 * Reconnect grace window (Phase 6c). When a player leaves with a
 * non-zero `litresDelivered` during the playing phase, we cache their
 * round state under their name; if anyone joins with the same name
 * within this window we restore the cached state instead of starting
 * fresh. 30 s is enough to cover a tab refresh / a quick network
 * blip but short enough that a different person typing the same name
 * a minute later doesn't inherit a stranger's score.
 */
const RECONNECT_TTL_MS = 30_000;

/**
 * Cached state from a player who recently left, keyed by display name.
 * `dreamIndex` and `litres` are intentionally NOT preserved — the
 * reconnecting player respawns at index 0 (small jug, first goal) so
 * they don't materialise mid-jug-balance with no input history. Only
 * `litresDelivered` (the score field) is preserved.
 *
 * Lives at MODULE scope (not per-room) on purpose: Colyseus disposes
 * the room instance whenever the last player leaves, so a per-room
 * `Map` would be wiped exactly when we need it most (the "everyone
 * leaves and one person comes back" path is the canonical reconnect
 * scenario). The module is a singleton in the Node process, so it
 * survives room churn for as long as the server stays up — which is
 * the right scope: surviving a server restart would require the
 * Supabase persistence layer (`milk_dreams.rankings` is what makes
 * scores durable across restarts).
 */
interface ReconnectEntry {
  litresDelivered: number;
  /** Server `Date.now()` ms — used to expire entries past TTL. */
  leftAtMs: number;
}
const recentlyLeftByName = new Map<string, ReconnectEntry>();

/**
 * Color palette as HSL hues in [0, 1). Eight evenly-spread, distinct
 * colors. The Nth player to join (across the process lifetime) takes
 * `palette[N % palette.length]`, so the first eight players are
 * guaranteed unique colors. Saturation and lightness are picked
 * client-side so we can keep the palette compact on the wire.
 */
let nextColorIndex = 0;
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

  override async onCreate(): Promise<void> {
    // Broadcast accumulated patches at 20 Hz. Player input arrives at the
    // same rate from the client, so this matches naturally.
    this.setPatchRate(1000 / 20);

    // Seed the durable round counter BEFORE any message handlers or
    // the first `startRound()` call so the initial state hydrated to a
    // client racing us to connect already carries the right label.
    //
    // Reads are NOT gated on NODE_ENV: a dev server with SUPABASE_*
    // set sees the same counter value as production (so the HUD
    // reflects reality when QAing locally). Only writes are gated —
    // a dev round bumps the in-memory counter but not the durable row.
    // When persistence is fully disabled (no Supabase vars) the store
    // returns 0 and the first round lands on 1 as before. Failures
    // are swallowed inside the store and surface as 0, so a flaky
    // boot can't block the room.
    const store = getLeaderboardStore();
    const seed = await store.getRoundCounter();
    // `startRound` will `+= 1` immediately, so store the PRE-increment
    // value here. If the seed is 0 (disabled / failure) the first round
    // lands on 1 as it always has.
    this.state.roundNumber = seed;
    if (seed > 0) {
      console.log(`[room] seeded roundNumber from durable counter: ${seed}`);
    }

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
     * The client tells us "I think I delivered now". Validation uses the
     * latest pose the SERVER already has for that player (`p.x/z`), not
     * whatever coordinates came in with the claim payload, so a custom
     * client can't trivially farm score by sending goal coordinates
     * without ever moving.
     *
     * Phase 4 — claims are silently ignored during the 'scoreboard'
     * phase. The visual is frozen (no goal marker logic on the client
     * either), but a misbehaving client could still send claims; we
     * just drop them so end-of-round scores stay clean.
     */
    this.onMessage('claim_delivery', (client, raw) => {
      if (this.state.phase !== 'playing') return;
      const msg = raw as Partial<ClaimDeliveryMessage>;
      if (msg && typeof msg !== 'object') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      const goal = goalFor(p.dreamIndex);
      const dx = p.x - goal.x;
      const dz = p.z - goal.z;
      const distSq = dx * dx + dz * dz;
      const limit = GOAL_RADIUS + DELIVERY_TOLERANCE;
      if (distSq > limit * limit) {
        console.log(
          `[room] reject delivery ${client.sessionId} dreamIndex=${p.dreamIndex} ` +
            `serverDist=${Math.sqrt(distSq).toFixed(2)} > ${limit.toFixed(2)}`,
        );
        return;
      }

      // Phase 4.5: bank what we were CARRYING before bumping the index.
      // Order matters: `p.litres` here is the size of the jar we just
      // dropped off; after this line it becomes the next (bigger) one.
      p.litresDelivered += p.litres;
      p.dreamIndex += 1;
      p.litres = litresFor(p.dreamIndex);
      console.log(
        `[room] deliver  ${client.sessionId} -> dreamIndex=${p.dreamIndex} litres=${p.litres} total=${p.litresDelivered}`,
      );
    });

    /**
     * Phase 4.5 — soft-spill.
     *
     * Client tells us it spilled. We rewind the dream chain to 0 (small
     * jug, first goal) but KEEP `litresDelivered` so the round
     * contribution is preserved. This is what makes mid-round failure
     * non-terminal in MP: you lose your progression, not your standings.
     *
     * Idempotent: a duplicate report (or one from a client that's
     * already at index 0) is a no-op. Ignored during 'scoreboard' for
     * the same reason as `claim_delivery`.
     */
    this.onMessage('report_spill', (client) => {
      if (this.state.phase !== 'playing') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (p.dreamIndex === 0) return;
      const lostIdx = p.dreamIndex;
      p.dreamIndex = 0;
      p.litres = litresFor(0);
      console.log(
        `[room] spill    ${client.sessionId} -> reset dreamIndex (was ${lostIdx}) total=${p.litresDelivered}`,
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

  /**
   * Phase 7 — capture the player's country from their IP BEFORE the
   * join completes. `context.ip` comes from the ws-transport (set to
   * `x-real-ip` / `x-forwarded-for` / socket remote address, in that
   * order). Anything we return here lands on `client.auth` and is
   * available from `onJoin`.
   *
   * We keep the "name validation rejects the join" contract in
   * `onJoin` unchanged — `onAuth` is purely additive metadata. A
   * failed geoip lookup is NOT a join rejection: most local dev
   * traffic (127.0.0.1, LAN) won't resolve and that's fine; we store
   * an empty country and move on. The Supabase `record_contribution`
   * RPC treats null / empty as "don't overwrite the previous value",
   * so a single bad lookup can't blank an already-known country.
   */
  override onAuth(_client: Client, _options: unknown, context: AuthContext): AuthData {
    const ip = extractClientIp(context.ip);
    const country = resolveCountryFromIp(ip);
    if (ip && !country) {
      // Logged at info level because it's the common case in dev
      // (localhost) and not an error. Noisy in production would
      // indicate every client is unresolvable (DB missing / stale).
      console.log(`[room] geoip miss for ${ip}`);
    }
    return { country };
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    // Phase 6a — names are mandatory (min 3 chars). Validation is the
    // SAME function the client uses (`@milk-dreams/shared:sanitiseName`)
    // so any name accepted by the modal is also accepted here. Throw
    // on invalid: Colyseus surfaces the message to the client's
    // `joinOrCreate` promise reject path so the modal can show it.
    const name = sanitiseName(options?.name);
    if (name === null) {
      throw new Error(
        `Invalid name. Names must be ${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} characters after trimming.`,
      );
    }

    const colorIndex = nextColorIndex++;

    // `client.auth` carries the country we resolved in `onAuth`. The
    // cast captures our AuthData shape — Colyseus types it as `any`
    // since authorisation payloads are user-defined.
    const auth = (client.auth ?? { country: '' }) as AuthData;

    const p = new Player();
    p.name = name;
    p.colorHue =
      PLAYER_HUE_PALETTE[colorIndex % PLAYER_HUE_PALETTE.length]!;
    p.dreamIndex = 0;
    p.litres = litresFor(0);
    p.litresDelivered = 0;
    p.country = auth.country;

    // Phase 6b — spawn ring. Only used for the very first pose so that
    // 10 lecheras joining at once don't materialise on top of each
    // other; once the player starts moving, their pose is overwritten
    // by their own `pose` messages anyway.
    const spawn = spawnPositionInRing();
    p.x = spawn.x;
    p.z = spawn.z;
    // Face roughly toward the center of the spawn / first goal so
    // the camera doesn't drop behind a Lechera that's looking
    // outward. The client overwrites `yaw` on its first pose send.
    p.yaw = Math.PI;

    // Phase 6c — reconnect. If someone with this exact (sanitised)
    // name disconnected within the grace window, restore their round
    // contribution. We do NOT restore `dreamIndex` / `litres` — the
    // player respawns at the first dream so they don't appear with
    // a fragile late-game jug right after a refresh.
    const reconnect = recentlyLeftByName.get(name);
    if (reconnect && Date.now() - reconnect.leftAtMs <= RECONNECT_TTL_MS) {
      p.litresDelivered = reconnect.litresDelivered;
      recentlyLeftByName.delete(name);
      console.log(
        `[room] reconnect ${name} -> restored litresDelivered=${p.litresDelivered}`,
      );
    } else if (reconnect) {
      // TTL expired; clean up so the map doesn't grow forever.
      recentlyLeftByName.delete(name);
    }

    this.state.players.set(client.sessionId, p);
    console.log(
      `[room] join  ${client.sessionId}  ->  ${p.name} (hue ${p.colorHue.toFixed(2)}) ` +
        `spawn=(${p.x.toFixed(1)},${p.z.toFixed(1)}) country=${p.country || '??'} phase=${this.state.phase}`,
    );
  }

  override onLeave(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      // Phase 6c — only stash the round score for reconnect if there's
      // something WORTH preserving and we're mid-round. During the
      // scoreboard window everyone's about to be reset to 0 anyway,
      // so a reconnect would just re-zero them; skip the cache.
      if (p.litresDelivered > 0 && this.state.phase === 'playing') {
        recentlyLeftByName.set(p.name, {
          litresDelivered: p.litresDelivered,
          leftAtMs: Date.now(),
        });
      }
      // Lazy TTL sweep: cheap O(n) scan of an at-most-tens-of-entries
      // map; avoids a separate timer (which `tsx watch` would leak on
      // reload — see the hot-reload note in MULTIPLAYER.md).
      const cutoff = Date.now() - RECONNECT_TTL_MS;
      for (const [name, entry] of recentlyLeftByName) {
        if (entry.leftAtMs < cutoff) recentlyLeftByName.delete(name);
      }
    }
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
   * back to Eggs" moment.
   */
  private startRound(): void {
    this.state.players.forEach((p) => {
      p.dreamIndex = 0;
      p.litres = litresFor(0);
      p.litresDelivered = 0;
    });
    this.state.roundNumber += 1;
    this.state.phase = 'playing';
    this.state.phaseEndsAt = Date.now() + ROUND_DURATION_MS;
    console.log(
      `[room] round ${this.state.roundNumber} started (ends in ${Math.round(ROUND_DURATION_MS / 1000)}s)`,
    );
    // Persist the bump durably. Fire-and-forget for the same reason
    // `recordRoundContributions` is fire-and-forget in `endRound()`:
    // the round lifecycle must never stall behind Supabase. A failed
    // RPC drops a single round from the persistent total; the local
    // `state.roundNumber` remains correct for the current process.
    void getLeaderboardStore()
      .incrementRoundCounter()
      .catch((err) => {
        console.warn(
          `[room] background round-counter persist threw: ${(err as Error).message}`,
        );
      });
    this.phaseTimer = setTimeout(
      () => {
        void this.endRound();
      },
      ROUND_DURATION_MS,
    );
  }

  /**
   * End the current playing phase: flip into 'scoreboard'. We do NOT
   * touch player schemas here on purpose — the scoreboard renders from
   * the live `dreamIndex` values, and zeroing them out now would make
   * everyone display "0 deliveries" during the celebration.
   */
  private async endRound(): Promise<void> {
    // Iterate via `forEach` because MapSchema in @colyseus/schema 4.x is
    // not a real Map (no spreadable iterator) — see Phase 2 notes in
    // MULTIPLAYER.md. `forEach` always works.
    const tops: string[] = [];
    // Phase 5 — snapshot the round's contributions BEFORE startRound
    // zeroes out `litresDelivered`. Names are spoofable by design — see
    // `MULTIPLAYER.md` — so two different sessions claiming the same
    // name will accumulate into the same row. Acceptable for a casual
    // party game.
    const contributions: { name: string; litres: number; country: string | null }[] = [];
    this.state.players.forEach((p) => {
      tops.push(`${p.name}=${p.litresDelivered}L(d${p.dreamIndex})`);
      if (p.litresDelivered > 0) {
        contributions.push({
          name: p.name,
          litres: p.litresDelivered,
          // Pass null (not empty string) so the Postgres RPC's
          // coalesce keeps the previous value instead of overwriting
          // with empty. Phase 7 — see `record_contribution` DDL.
          country: p.country || null,
        });
      }
    });

    this.state.phase = 'scoreboard';
    this.state.phaseEndsAt = Date.now() + SCOREBOARD_DURATION_MS;
    console.log(
      `[room] round ${this.state.roundNumber} ended -> scoreboard for ${Math.round(SCOREBOARD_DURATION_MS / 1000)}s ; ${tops.join(' ')}`,
    );

    // Persistence is intentionally fire-and-forget: the round lifecycle
    // must never stall behind Supabase latency or outages. The store
    // swallows its own RPC errors/timeouts and resolves, so this is only
    // here to keep the sequencing explicit and make any unexpected throw
    // visible in logs.
    void getLeaderboardStore()
      .recordRoundContributions(contributions)
      .catch((err) => {
        console.warn(
          `[room] background leaderboard persist threw: ${(err as Error).message}`,
        );
      });

    this.phaseTimer = setTimeout(
      () => {
        // setTimeout doesn't await; wrap to surface any unexpected
        // error from startRound (which is sync today but may grow).
        void this.startRound();
      },
      SCOREBOARD_DURATION_MS,
    );
  }
}

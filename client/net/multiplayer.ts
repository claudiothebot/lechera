/**
 * Phase-1 multiplayer: open a Colyseus connection if reachable, expose
 * a tiny handle the main loop can use to broadcast our pose. No remote
 * rendering yet (that's Phase 2).
 *
 * Design notes:
 *  - Pure side-channel. The single-player game must keep working even if
 *    every method here is a no-op (server unreachable, server crashes
 *    mid-session, ...). Never throw out of `sendPose`.
 *  - 20 Hz send rate. The main loop calls `sendPose` every frame; we
 *    throttle internally so the rate is decoupled from FPS.
 *  - "Connecting" is a real state. The HUD shows it as a distinct badge
 *    while the WS handshake completes, so the player isn't left guessing.
 */
import { Client, Room, getStateCallbacks } from '@colyseus/sdk';
import { sanitiseName } from '@milk-dreams/shared';

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline';

/**
 * Minimal shape of a Player schema instance as the client sees it.
 * Mirrors `Player` in `server/src/rooms/MilkDreamsRoom.ts`. We do NOT
 * import the server class — that would couple the build and require a
 * shared package. As long as the field names match, Colyseus's runtime
 * schema decoding works regardless of declared types.
 *
 * Phase 3+ (server-authoritative state) will likely need enough new
 * fields here that promoting to a proper `shared/` package is worth it.
 */
export interface RemotePlayerView {
  name: string;
  x: number;
  z: number;
  yaw: number;
  /** HSL hue in [0, 1). */
  colorHue: number;
  /** 0-based count of successful deliveries (server-authoritative). */
  dreamIndex: number;
  /** Litres currently being carried (server-authoritative; equals dreamIndex + 1). */
  litres: number;
  /**
   * Phase 4.5 — cumulative litres delivered THIS ROUND. Survives a
   * spill (only `dreamIndex`/`litres` are rewound). The scoreboard
   * ranks by this number, not by `dreamIndex`.
   */
  litresDelivered: number;
  /**
   * Phase 7 — ISO 3166-1 alpha-2 from server `onAuth` geoip (e.g. `'ES'`).
   * Empty string when geolocation missed; HUD treats that as "no flag".
   */
  country: string;
}

export interface RemotePlayerEvents {
  /** A player (other than self) has appeared in the room. */
  onAdd(sessionId: string, view: RemotePlayerView): void;
  /** A player has left the room. */
  onRemove(sessionId: string): void;
}

/**
 * Snapshot of self-player progression as the server sees it. The fields
 * are read directly off the schema, so they update in place; capture
 * each value when needed rather than holding onto the object.
 */
export interface SelfProgressionView {
  dreamIndex: number;
  litres: number;
  /** Phase 4.5 — cumulative litres delivered this round (monotonic). */
  litresDelivered: number;
}

export interface SelfProgressionEvents {
  /**
   * Fired whenever the server's view of our progression changes — both
   * on initial hydration (so a late subscriber gets the current state)
   * and on every accepted delivery. Not fired for unrelated changes
   * like our own pose echo.
   */
  onChange(view: SelfProgressionView): void;
}

export type RoundPhase = 'playing' | 'scoreboard';

/**
 * Snapshot of the room's current round lifecycle state. `phaseEndsAtMs`
 * is in the CLIENT'S `performance.now()` timeline (already converted
 * from the server's `Date.now()` at receive time), so the main loop
 * can compute remaining time as
 *   `Math.max(0, snapshot.phaseEndsAtMs - performance.now())`.
 */
export interface RoundView {
  phase: RoundPhase;
  phaseEndsAtMs: number;
  roundNumber: number;
}

export interface RoundEvents {
  /**
   * Fired on the first hydration of round state and whenever any of
   * `phase`, `phaseEndsAt`, or `roundNumber` changes server-side.
   * Listeners typically branch on whether `phase` changed (transition
   * effects) and otherwise just re-read `phaseEndsAtMs` for the timer.
   */
  onChange(view: RoundView): void;
}

/** Default Colyseus dev endpoint. Override with `?mp=ws://host:port`. */
const DEFAULT_ENDPOINT = 'ws://localhost:2567';
const ROOM_NAME = 'milk-dreams';
const SEND_INTERVAL_MS = 1000 / 20; // 20 Hz
const CONNECT_TIMEOUT_MS = 2500;

export interface PoseSample {
  x: number;
  z: number;
  yaw: number;
}

export interface MultiplayerHandle {
  /** Latest connection status. Reactively updated as the WS evolves. */
  status(): ConnectionStatus;
  /** Server-assigned display name (e.g. "Player 7"). Null until connected. */
  selfName(): string | null;
  /** Server-assigned session id. Null until connected. */
  selfSessionId(): string | null;
  /**
   * Resolved WebSocket endpoint we tried to connect to (e.g.
   * `ws://localhost:2567`). Returns the resolved endpoint regardless
   * of whether the connection ultimately succeeded — useful for
   * deriving the matching HTTP origin (Phase 5 leaderboard).
   */
  endpoint(): string;
  /**
   * Submit the current local pose. Internally rate-limited to 20 Hz.
   * Safe to call every frame regardless of connection state.
   */
  sendPose(sample: PoseSample): void;
  /**
   * Phase 3: ask the server to register a delivery at the given world
   * position. The server validates against its own goal table for this
   * player and either accepts (`dreamIndex`/`litres` advance in the
   * schema, observed via `subscribeSelfProgression`) or silently
   * rejects. Internally rate-limited so callers can spam it from the
   * "in goal radius" branch without flooding the room.
   */
  sendDeliveryClaim(sample: PoseSample): void;
  /**
   * Phase 4.5 — tell the server we just spilled. Server rewinds our
   * `dreamIndex` (and `litres`) to 0 but keeps `litresDelivered`,
   * letting us keep playing the same round with reset progression.
   * Internally throttled so a one-frame spill burst doesn't flood the
   * room. Safe to call while offline (no-op).
   */
  sendSpillReport(): void;
  /**
   * Subscribe to the lifecycle of OTHER players in the room (self is
   * always filtered out). Returns an unsubscribe function. If the
   * handle is offline, the listeners simply never fire — safe to
   * always wire up unconditionally.
   */
  subscribeRemotePlayers(events: RemotePlayerEvents): () => void;
  /**
   * Subscribe to changes in the SELF player's progression (dreamIndex,
   * litres). Fires once immediately with the current snapshot if it's
   * already known, then on every subsequent server-driven change.
   * Returns an unsubscribe function. Safe to wire while offline (no
   * fires).
   */
  subscribeSelfProgression(events: SelfProgressionEvents): () => void;
  /**
   * Latest known progression for self (or `null` if we haven't seen the
   * schema entry yet). Same caveat as `remotePlayers()`: the returned
   * object is the live schema value, don't cache it across frames.
   */
  selfProgression(): Readonly<SelfProgressionView> | null;
  /**
   * Full self schema view (name, color, pose, progression). `null`
   * until our own player entry has hydrated. Useful for screens that
   * mix self + remotes (scoreboard) so callers don't have to assemble
   * the entry from `selfName()` + `selfProgression()` + a separate
   * color lookup.
   */
  selfView(): Readonly<RemotePlayerView> | null;
  /**
   * Subscribe to round-lifecycle changes (3-minute round ↔ 10-second
   * scoreboard). Fires immediately with the current snapshot if known,
   * then on every server-driven phase / deadline / roundNumber change.
   * Returns an unsubscribe function. Safe to wire while offline.
   */
  subscribeRound(events: RoundEvents): () => void;
  /**
   * Latest known round snapshot, or `null` if we haven't seen the
   * schema fields yet (e.g. still hydrating, or running offline).
   */
  round(): Readonly<RoundView> | null;
  /**
   * Live, mutable view of remote-player state for per-frame reads.
   * Each entry's fields update in place as patches arrive — do NOT
   * cache the inner objects across frames. Returns an empty Map when
   * offline. Safe to call every frame.
   */
  remotePlayers(): ReadonlyMap<string, Readonly<RemotePlayerView>>;
  /** Closes the room and stops further sends. Idempotent. */
  dispose(): void;
}

export interface ConnectOptions {
  endpoint?: string;
  /**
   * Phase 6a — display name chosen by the player (cached on their end
   * in `localStorage`). Mandatory: the welcome modal blocks until the
   * player enters a value that passes `sanitiseName`. We re-validate
   * here too as defense in depth — if a programming bug ever passes
   * an invalid name, the room would reject the join anyway, so we'd
   * rather fail fast and locally with a clear log line.
   */
  name: string;
  /** Notified whenever status changes; useful for HUD wiring. */
  onStatusChange?: (status: ConnectionStatus, selfName: string | null) => void;
}

/**
 * Try to join the multiplayer room. Always resolves with a handle —
 * if the connection fails, the handle stays in `'offline'` and all
 * methods become safe no-ops. The caller does NOT need to wrap this
 * in try/catch.
 */
export async function connectMultiplayer(
  opts: ConnectOptions,
): Promise<MultiplayerHandle> {
  const endpoint = resolveEndpoint(opts.endpoint);
  const onStatusChange = opts.onStatusChange ?? (() => {});

  // Phase 6a — re-run the SAME sanitisation the modal uses (and the
  // server uses) so we know exactly what name will land on the wire.
  // If it doesn't pass, refuse to even attempt the join: the modal
  // is supposed to make this unreachable, so a failure here is a
  // programming bug worth surfacing in the console.
  const name = sanitiseName(opts.name);
  if (name === null) {
    console.warn(
      `[multiplayer] invalid display name (got '${opts.name}'). Running in single-player.`,
    );
    onStatusChange('offline', null);
    return makeOfflineHandle(
      () => 'offline',
      () => null,
      () => null,
      new Map(),
      new Set(),
      endpoint,
    );
  }

  let status: ConnectionStatus = 'connecting';
  let selfName: string | null = null;
  let selfSessionId: string | null = null;
  let room: Room | null = null;
  let lastPoseSentMs = 0;
  let lastClaimSentMs = 0;
  let lastSpillSentMs = 0;
  let disposed = false;

  /** Live state of every player in the room EXCEPT self. */
  const remotes = new Map<string, RemotePlayerView>();
  /** Subscribers to remote-player lifecycle events. */
  const subscribers = new Set<RemotePlayerEvents>();
  /**
   * Live ref to OUR own player schema entry. Captured the first time we
   * see ourselves in `players`. Used both for `selfProgression()` reads
   * and for hooking `$(selfPlayer).onChange(...)` so we can fan out
   * progression updates to listeners.
   */
  let selfPlayer: RemotePlayerView | null = null;
  /** Subscribers to self-progression changes. */
  const selfProgressionSubs = new Set<SelfProgressionEvents>();
  /** Throttle for `claim_delivery`: at most one in-flight per N ms. */
  const CLAIM_THROTTLE_MS = 500;
  /**
   * Throttle for `report_spill`. Lower than the delivery throttle
   * because a spill is a single user-visible event that we want
   * acknowledged ASAP; the throttle exists only to absorb the case
   * where the local sim flips `isSpilled` for a few consecutive
   * frames before the server-driven reset lands.
   */
  const SPILL_THROTTLE_MS = 300;
  /**
   * Latest round snapshot in CLIENT timeline (phaseEndsAt converted from
   * server `Date.now()` to client `performance.now()` at receive time).
   * `null` until the schema's first hydration lands.
   */
  let roundView: RoundView | null = null;
  /** Subscribers to round-lifecycle changes. */
  const roundSubs = new Set<RoundEvents>();

  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    status = next;
    onStatusChange(status, selfName);
  }

  setStatus('connecting');

  try {
    const client = new Client(endpoint);
    room = await Promise.race<Room>([
      client.joinOrCreate(ROOM_NAME, { name }),
      new Promise<Room>((_, rej) =>
        setTimeout(
          () => rej(new Error('connect timeout')),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    console.warn(
      `[multiplayer] could not reach ${endpoint}: ${(err as Error).message}. Running in single-player.`,
    );
    setStatus('offline');
    return makeOfflineHandle(
      () => status,
      () => selfName,
      () => selfSessionId,
      remotes,
      subscribers,
      endpoint,
    );
  }

  if (disposed) {
    // Race: dispose() called while we were still negotiating.
    void room.leave().catch(() => {});
    return makeOfflineHandle(
      () => status,
      () => selfName,
      () => selfSessionId,
      remotes,
      subscribers,
      endpoint,
    );
  }

  selfSessionId = room.sessionId;

  // Structural type for the data we read off MapSchema's iteration.
  // Avoids importing the server Schema classes.
  interface ColyseusPlayersMap {
    get(key: string): RemotePlayerView | undefined;
    forEach(cb: (value: RemotePlayerView, key: string) => void): void;
  }

  // 0.17 API: schema callbacks moved off the schema instances themselves
  // and live behind `getStateCallbacks(room)`. The factory returns a
  // proxy `$` where `$(state).players.onAdd(...)` registers MapSchema
  // listeners and `$(player).onChange(...)` registers per-instance
  // change listeners. See: https://docs.colyseus.io/migrating/0.17
  //
  // The SDK's callback proxy is typed against the server schema; we
  // don't import that, so cast through `unknown` to a callable that
  // returns `any`. We then narrow at each call site to the structural
  // subset we use. Pragmatic — keeps both callable signatures (state
  // proxy and per-instance proxy) without overload gymnastics.
  type StateProxy = {
    players: {
      onAdd(cb: (value: RemotePlayerView, key: string) => void): void;
      onRemove(cb: (value: RemotePlayerView, key: string) => void): void;
    };
    /**
     * Listen to a primitive (string/number) property on the root state.
     * `immediate=true` fires once with the current value if it's
     * already populated. Used for the round-lifecycle fields below.
     */
    listen<T>(
      prop: string,
      cb: (value: T, prev: T) => void,
      immediate?: boolean,
    ): () => void;
  };
  type SchemaInstanceProxy = {
    onChange(cb: () => void): () => void;
  };
  const $ = getStateCallbacks(room) as unknown as (instance: unknown) => unknown;
  const stateCallbacks = $(room.state) as StateProxy;
  // Read a top-level state field by name without importing the server
  // schema class. The cast is structural — the schema decoder populates
  // these with the right runtime types.
  const stateField = <T>(prop: string): T | undefined =>
    (room!.state as unknown as Record<string, T>)[prop];

  /**
   * Notify `subscribeSelfProgression` listeners with the current snapshot
   * captured off the live schema. Cheap; called on every accepted
   * server-side change to self (incl. the initial onAdd).
   */
  const fireSelfProgression = () => {
    if (!selfPlayer) return;
    const snapshot: SelfProgressionView = {
      dreamIndex: selfPlayer.dreamIndex,
      litres: selfPlayer.litres,
      litresDelivered: selfPlayer.litresDelivered,
    };
    for (const sub of selfProgressionSubs) sub.onChange(snapshot);
  };

  const handleAdd = (value: RemotePlayerView, sessionId: string) => {
    if (sessionId === selfSessionId) {
      // Self appears in the schema map too; we just don't expose it as
      // a "remote". But we DO use this to capture the assigned name
      // the HUD couldn't know synchronously at join time, AND to start
      // tracking our own progression (dreamIndex, litres).
      if (value.name && !selfName) {
        selfName = value.name;
        onStatusChange(status, selfName);
      }
      if (!selfPlayer) {
        selfPlayer = value;
        // Per-instance listener: fires whenever ANY field on our player
        // schema changes, including the server-driven dreamIndex/litres
        // bumps after an accepted delivery. Pose echoes also fire this
        // (we're sending x/z/yaw at 20 Hz), but that's fine — listeners
        // can read the latest snapshot off `selfProgression()` and
        // ignore noise.
        try {
          (
            $(value) as SchemaInstanceProxy
          ).onChange(() => fireSelfProgression());
        } catch (err) {
          // Defensive: SDK shouldn't throw here, but if the proxy
          // changes shape on a future minor we'd rather log + survive
          // than break the whole multiplayer handle.
          console.warn(
            '[multiplayer] could not attach self-progression listener:',
            (err as Error).message,
          );
        }
        // Fire once now so a subscriber registered before the schema
        // landed gets the initial snapshot.
        fireSelfProgression();
      }
      return;
    }
    if (remotes.has(sessionId)) return; // dedupe across replay + listener
    remotes.set(sessionId, value);
    for (const sub of subscribers) sub.onAdd(sessionId, value);
  };

  stateCallbacks.players.onAdd((value, sessionId) =>
    handleAdd(value, sessionId),
  );

  stateCallbacks.players.onRemove((_value, sessionId) => {
    if (sessionId === selfSessionId) {
      selfPlayer = null;
      return;
    }
    remotes.delete(sessionId);
    for (const sub of subscribers) sub.onRemove(sessionId);
  });

  // Belt-and-braces: replay anyone already in the state in case the
  // first patch landed before our listener was attached. Safe because
  // `handleAdd` dedupes by sessionId.
  const seedPlayers = () => {
    const players = (room!.state as { players?: ColyseusPlayersMap }).players;
    players?.forEach((value, sessionId) => handleAdd(value, sessionId));
  };
  seedPlayers();
  room.onStateChange.once(seedPlayers);

  /**
   * Phase 4 — round-lifecycle bridge.
   *
   * The server stores `phaseEndsAt` in `Date.now()` ms. We convert to
   * the client's `performance.now()` timeline once at receive (using
   * the offset between the two clocks captured AT THIS MOMENT) so the
   * main loop's per-frame countdown doesn't have to keep computing it.
   *
   * Why convert at all instead of using `Date.now()` everywhere on the
   * client: `performance.now()` is the monotonic clock the rest of the
   * codebase already uses (e.g. `lastPoseSentMs`), and using two
   * unrelated clocks for "is this thing in the past?" math is a great
   * source of off-by-a-few-seconds bugs when the system clock jumps
   * (NTP correction, suspend/resume).
   *
   * The clock offset is captured fresh on every server update so any
   * subsequent system-clock jump self-corrects within ~50 ms (the
   * patch interval).
   */
  const refreshRoundView = () => {
    const phase = stateField<string>('phase');
    const serverEndsAt = stateField<number>('phaseEndsAt');
    const roundNumber = stateField<number>('roundNumber');
    if (
      phase === undefined ||
      serverEndsAt === undefined ||
      roundNumber === undefined
    ) {
      return;
    }
    const offset = performance.now() - Date.now();
    roundView = {
      phase: phase === 'scoreboard' ? 'scoreboard' : 'playing',
      phaseEndsAtMs: serverEndsAt + offset,
      roundNumber,
    };
    for (const sub of roundSubs) sub.onChange(roundView);
  };
  // Listen on the three round-related fields. The `listen` proxy from
  // 0.17 fires immediately when `immediate=true` for already-set
  // primitive values, so we cover both "subscribe before hydration"
  // and "subscribe after hydration" with one path.
  try {
    stateCallbacks.listen('phase', () => refreshRoundView(), true);
    stateCallbacks.listen('phaseEndsAt', () => refreshRoundView(), true);
    stateCallbacks.listen('roundNumber', () => refreshRoundView(), true);
  } catch (err) {
    console.warn(
      '[multiplayer] could not attach round-phase listener:',
      (err as Error).message,
    );
  }
  // Seed once in case `listen(immediate=true)` is a no-op pre-hydration
  // and the next patch comes too late for whatever's awaiting our boot.
  refreshRoundView();
  room.onStateChange.once(refreshRoundView);

  room.onLeave(() => {
    setStatus('offline');
    // Emulate "every remote left" so listeners can clean their visuals.
    for (const sessionId of [...remotes.keys()]) {
      remotes.delete(sessionId);
      for (const sub of subscribers) sub.onRemove(sessionId);
    }
  });
  room.onError((code, message) => {
    console.warn(`[multiplayer] room error ${code}: ${message ?? ''}`);
  });

  setStatus('online');

  return {
    status: () => status,
    selfName: () => selfName,
    selfSessionId: () => selfSessionId,
    endpoint: () => endpoint,
    sendPose: (sample) => {
      if (disposed || status !== 'online' || !room) return;
      const now = performance.now();
      if (now - lastPoseSentMs < SEND_INTERVAL_MS) return;
      lastPoseSentMs = now;
      try {
        room.send('pose', sample);
      } catch (err) {
        // A send mid-disconnect is not a player-facing problem; log once
        // and let the onLeave handler flip status to 'offline' shortly.
        if ((err as Error).message) {
          console.debug('[multiplayer] send failed:', (err as Error).message);
        }
      }
    },
    sendDeliveryClaim: (sample) => {
      if (disposed || status !== 'online' || !room) return;
      const now = performance.now();
      if (now - lastClaimSentMs < CLAIM_THROTTLE_MS) return;
      lastClaimSentMs = now;
      try {
        room.send('claim_delivery', { x: sample.x, z: sample.z });
      } catch (err) {
        if ((err as Error).message) {
          console.debug(
            '[multiplayer] claim send failed:',
            (err as Error).message,
          );
        }
      }
    },
    sendSpillReport: () => {
      if (disposed || status !== 'online' || !room) return;
      const now = performance.now();
      if (now - lastSpillSentMs < SPILL_THROTTLE_MS) return;
      lastSpillSentMs = now;
      try {
        room.send('report_spill', {});
      } catch (err) {
        if ((err as Error).message) {
          console.debug(
            '[multiplayer] spill send failed:',
            (err as Error).message,
          );
        }
      }
    },
    subscribeRemotePlayers: (events) => {
      subscribers.add(events);
      // Replay any remotes that joined before this subscription, so the
      // caller doesn't need to handle "boot order" specially.
      for (const [sessionId, view] of remotes) {
        events.onAdd(sessionId, view);
      }
      return () => {
        subscribers.delete(events);
      };
    },
    subscribeSelfProgression: (events) => {
      selfProgressionSubs.add(events);
      // Fire immediately if we already know our own progression — same
      // ergonomics as `subscribeRemotePlayers` replay above.
      if (selfPlayer) {
        events.onChange({
          dreamIndex: selfPlayer.dreamIndex,
          litres: selfPlayer.litres,
          litresDelivered: selfPlayer.litresDelivered,
        });
      }
      return () => {
        selfProgressionSubs.delete(events);
      };
    },
    selfProgression: () =>
      selfPlayer
        ? {
            dreamIndex: selfPlayer.dreamIndex,
            litres: selfPlayer.litres,
            litresDelivered: selfPlayer.litresDelivered,
          }
        : null,
    selfView: () => selfPlayer,
    subscribeRound: (events) => {
      roundSubs.add(events);
      // Replay current snapshot if known, same ergonomics as the other
      // subscribe* methods on this handle.
      if (roundView) events.onChange(roundView);
      return () => {
        roundSubs.delete(events);
      };
    },
    round: () => roundView,
    remotePlayers: () => remotes,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      void room?.leave().catch(() => {});
      setStatus('offline');
    },
  };
}

function makeOfflineHandle(
  getStatus: () => ConnectionStatus,
  getName: () => string | null,
  getSessionId: () => string | null,
  remotes: Map<string, RemotePlayerView>,
  subscribers: Set<RemotePlayerEvents>,
  endpoint: string,
): MultiplayerHandle {
  const selfProgressionSubs = new Set<SelfProgressionEvents>();
  const roundSubs = new Set<RoundEvents>();
  return {
    status: getStatus,
    selfName: getName,
    selfSessionId: getSessionId,
    endpoint: () => endpoint,
    sendPose: () => {},
    sendDeliveryClaim: () => {},
    sendSpillReport: () => {},
    subscribeRemotePlayers: (events) => {
      subscribers.add(events);
      return () => {
        subscribers.delete(events);
      };
    },
    subscribeSelfProgression: (events) => {
      selfProgressionSubs.add(events);
      return () => {
        selfProgressionSubs.delete(events);
      };
    },
    selfProgression: () => null,
    selfView: () => null,
    subscribeRound: (events) => {
      roundSubs.add(events);
      return () => {
        roundSubs.delete(events);
      };
    },
    round: () => null,
    remotePlayers: () => remotes,
    dispose: () => {},
  };
}

/**
 * No-op handle exported as a starting value while `connectMultiplayer`
 * is still negotiating in the background. Lets the main loop call
 * `multi.sendPose(...)` from frame 1 without a null check.
 */
const OFFLINE_REMOTES = new Map<string, RemotePlayerView>();
export const OFFLINE_MULTIPLAYER_HANDLE: MultiplayerHandle = {
  status: () => 'idle',
  selfName: () => null,
  selfSessionId: () => null,
  endpoint: () => '',
  sendPose: () => {},
  sendDeliveryClaim: () => {},
  sendSpillReport: () => {},
  subscribeRemotePlayers: () => () => {},
  subscribeSelfProgression: () => () => {},
  selfProgression: () => null,
  selfView: () => null,
  subscribeRound: () => () => {},
  round: () => null,
  remotePlayers: () => OFFLINE_REMOTES,
  dispose: () => {},
};

function resolveEndpoint(override?: string): string {
  if (override) return override;
  // Allow ad-hoc redirection without a rebuild — handy for testing
  // against a remote server during a LAN party.
  const param = new URLSearchParams(window.location.search).get('mp');
  if (param) return param;
  return DEFAULT_ENDPOINT;
}

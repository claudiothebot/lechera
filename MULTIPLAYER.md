# Milk Dreams — Multiplayer

Operative document for the multiplayer extension. Read this before
touching anything network-related. Update as decisions land.

## Vision

Casual party multiplayer for ~10–20 friends. Same map, fixed 3-minute
rounds repeating indefinitely, ranking persisted by player name. Anyone
joins with just a name (no auth, name spoofing accepted by design).

The single-player game stays playable as-is when the multiplayer server
is not reachable — multiplayer is an opt-in mode, not a replacement.

## Decisions (closed)

| Topic | Decision | Rationale |
|---|---|---|
| Networking transport | **Colyseus 0.17** (`@colyseus/core` + `@colyseus/sdk`) | Mature, TypeScript end-to-end, room-based state sync, self-host on Fly.io / Railway / local. Latest stable line; see "Notes for future phases" for why this is 0.17 and not 0.16 (the client package was renamed `colyseus.js` → `@colyseus/sdk`, easy to miss). |
| Persistence | **Supabase Postgres** | Already wired into the project's MCPs. Trivial schema for rankings. Free tier covers 10–20 friends. |
| Real-time tick | **20 Hz** for player position broadcasts | Sweet spot for slow characters; ~6 KB/s per client at 10 players, well under any sane budget. |
| Authority | **Server-authoritative for game state**, client-predictive for own movement | Prevents trivial score forgery (the only thing that matters since names are spoofable). Movement stays snappy via local prediction. |
| Round model | **Round-based**, 3 minutes, late join allowed mid-round (counts for that round) | Cleaner ranking semantics than always-on. Late join keeps casual entry painless. |
| Dream chains | **Independent per player** | Each player progresses their own fable in parallel. The map is shared, the goals are not. Simpler than racing-to-shared-goal, less stressful. |
| Player collision | **Yes, lecheras collide and the jug reacts** | Adds emergent social dynamics (intentional bumps, "polite" play). Worth the chaos for an indie party game. |
| Ranking | **All-time leaderboard + current round Top visible in HUD** | All-time gives long-term motivation, round Top gives short-term tension during the 3-minute window. |
| Repo layout | **Monorepo**: `lechera/` (client) and `lechera/server/` (Colyseus server) | Shared TS types via a small `shared/` folder. One `pnpm-workspace.yaml` at the package level keeps install times sane. |
| Client hosting | TBD — Vercel / Cloudflare Pages | Static, irrelevant to gameplay. |
| Server hosting | TBD — Fly.io ($5/mo) or self-host | Decide when we ship. Localhost is fine until then. |

## Open questions (decide as we hit them)

These don't block Phase 0–2. Park them and revisit when relevant:

- **Late join behaviour**: do you spawn instantly into the running round, or watch until the next one? Defaulting to "spawn instantly".
- **Visual identity per player**: tinted material on the Lechera, name tag floating above, color shown on the minimap. Implementation TBD in Phase 2.
- **Spawn distribution**: 10 players cannot all spawn at the same point. Probably a small ring around the spawn marker.
- **Reconnect semantics**: same name keeps your score for the current round; otherwise treated as a new player.
- **Anti-cheat depth**: server validates "delivery" events (distance to goal at the moment of claim). No further validation planned — names are spoofable by design.
- **Single-player mode**: keep working when the server is offline. The simplest path is "if WebSocket connect fails, run the existing local game logic and skip the network entirely". To define more concretely in Phase 1.

## Architecture (target, end of roadmap)

```
┌──────────────────┐                 ┌──────────────────┐
│   Browser tab    │ ◄─ WebSocket ─► │  Colyseus server │
│  (Three.js +     │   (20 Hz state) │  (Node + TS)     │
│   game logic)    │                 │                  │
│                  │                 │  - Room state    │
│  - local pred.   │                 │  - Round timer   │
│  - render others │                 │  - Validate      │
│  - HUD           │                 │    deliveries    │
└──────────────────┘                 └────────┬─────────┘
                                              │
                                              │  (end-of-round)
                                              ▼
                                     ┌──────────────────┐
                                     │  Supabase        │
                                     │  Postgres        │
                                     │                  │
                                     │  rankings table  │
                                     └──────────────────┘
```

## Repo layout (target)

```
lechera/
  client/                  ← rename of current `lechera/` content
    src/
      ...                  ← existing single-player game
      net/                 ← new: Colyseus client, remote-player render
  server/                  ← new
    src/
      index.ts             ← Colyseus boot
      rooms/
        MilkDreamsRoom.ts  ← single room schema + lifecycle
      persistence/
        supabase.ts        ← write rankings on round end
    package.json
  shared/                  ← new
    types.ts               ← messages, schemas shared between client/server
  pnpm-workspace.yaml      ← new
  MULTIPLAYER.md           ← this doc
  AGENTS.md
```

We can postpone the client/ rename until Phase 1 if it's noisy. The
exact layout will solidify in Phase 0 → Phase 1.

## Roadmap

Each phase is **independently testable** and **leaves the game in a
working state**. We can stop at any phase and the project is still
shippable. Mark `[x]` as we land each.

### Phase 0 — Setup & docs
- [x] Write `MULTIPLAYER.md` (this file)
- [x] Update `AGENTS.md` to point here, drop the "no multi ever" line
- [x] Add `pnpm-workspace.yaml` and `server/` skeleton (full Colyseus boot already in place — see Phase 1)
- [ ] Decide hosting target for server (deferred; localhost works for Phase 1–4)

**Done when**: opening `MULTIPLAYER.md` gives any contributor (or future me / future Claude) the full picture of where we're going and what's left.

### Phase 1 — "Echo": one client, one server, alive connection
- [x] Colyseus server with one room, accepts WebSocket connections, logs join/leave
- [x] Client connects on boot, sends own position at 20 Hz
- [x] HUD badge: "Online · Player 7" (auto-assigned name for now)
- [x] If server unreachable → fall back to local single-player silently (2.5 s connect timeout, non-blocking, badge shows "Single-player")
- [x] Smoke test script (`server/scripts/smoke-client.mjs`) verifies join + state sync without a browser

**Done when**: open the game, see the badge, see server logs your position. No remote players rendered yet. ✅

### Phase 2 — Render other players

Phase 2 ships in two passes so we can validate the network plumbing before the visual upgrade.

**Phase 2a — placeholder visuals (DONE)**
- [x] Server broadcasts a snapshot of all player positions (free with the schema; happens at `setPatchRate`)
- [x] Server assigns `colorHue` per player from an 8-color palette so identity is consistent across clients
- [x] Client subscribes to `players` MapSchema via `getStateCallbacks(room)` (the 0.17 API)
- [x] Client renders one **placeholder avatar** per remote (capsule body + head + mini jug, tinted by hue), interpolated ~100 ms behind to absorb jitter
- [x] Floating name tag above each remote (sprite + canvas-rendered pill in their color)
- [x] Minimap shows remote players as colored dots; clamped to the radar edge when out of range
- [x] Smoke test (`server/scripts/smoke-multi.mjs`) verifies two clients observe each other

**Phase 2b — real Lechera visual (DONE)**
- [x] Refactor `character.ts`: split `loadCharacter` into `loadCharacterSource` (cached GLB load) + `createCharacterInstance` (per-instance skinned-mesh clone + own `AnimationMixer`)
- [x] Same split on `jugModel.ts` (`loadJugSource` + `createJugInstance`)
- [x] Swap the placeholder factory in `remotePlayers.ts` for a real cloned Lechera + cloned jug, both tinted by `colorHue`
- [x] Each remote ticks its own walk animation, speed derived from the interpolated pose delta (smoothed with a one-pole lowpass to kill 20 Hz quantization jitter)
- [x] Material tint applied as a multiplicative factor on the base color (subtle, preserves texture)
- [x] Geometry is shared with the local player via the source cache (memory + GPU upload only paid once); only materials and bones are per-instance

**Done when** (2a): open two browser tabs, both see each other moving smoothly, name + color visible. ✅
**Done when** (2b): the visual is the real Lechera, not the capsule placeholder. ✅

### Phase 3 — Game state on the server (DONE)
- [x] Server owns `dreamIndex` and `litres` per player in the schema (`Player.dreamIndex`, `Player.litres`); everything else (jug scale, physics multipliers, animal at goal, dream label) is *derived* client-side from `dreamIndex` via the existing local `progression.ts` table — no need to ship those derived numbers on every patch
- [x] Client sends `claim_delivery` (with the position the client believed it was at, NOT the latest pose; rationale: 20 Hz pose is up to 50 ms / ~22 cm stale) → server checks distance to that player's current goal (`goalFor(dreamIndex)` + `GOAL_RADIUS + DELIVERY_TOLERANCE`) → confirms (bumps `dreamIndex`/`litres`) or silently rejects
- [x] Litres counter and current dream sourced from the schema. The local `progression` mirrors server state via a new `setIndex(n)` method called from `subscribeSelfProgression`
- [x] Each player keeps their own goal position (independent dreams) — derived from `dreamIndex` so it's automatically per-player; each client only renders ITS OWN goal marker (no change to `level.setGoalPosition` semantics)
- [x] Conservative server-ack pattern: no optimistic local advance. The `claim_delivery` is throttled to 1 every 500 ms inside the multiplayer handle so spamming it from the "in goal radius" branch every frame is harmless
- [x] Pose echoes ALSO fire `$(selfPlayer).onChange(...)`, so the listener filters on "did `dreamIndex` actually move?" before re-applying the dream (which is expensive)
- [x] Offline path preserved: when no server is reachable (or hydration hasn't completed), the original local `progression.advance()` flow runs unchanged
- [x] Smoke test (`server/scripts/smoke-delivery.mjs`) verifies: bogus claim rejected, valid claim accepted, B sees A's bump in its schema view, B's own dreamIndex stays put

**Done when**: two players in different dreams, scores tracked separately on server, deliveries validated. ✅

### Phase 4 — Round timer & lifecycle (DONE)
- [x] Server holds a global 3-minute countdown (`MD_ROUND_MS`, default 180_000) and 10 s scoreboard window (`MD_SCOREBOARD_MS`, default 10_000); both env-overridable so smoke tests can run a full round in 5 s without a rebuild
- [x] State machine: `phase` ∈ `{ 'playing', 'scoreboard' }` + `phaseEndsAt` (server `Date.now()` ms) + `roundNumber` (increments on every transition into 'playing'); all in the room schema so every client sees the same lifecycle
- [x] On round end: phase flips to 'scoreboard', player schemas KEPT (the scoreboard renders from live `dreamIndex`); after `MD_SCOREBOARD_MS`, server resets every player's `dreamIndex` + `litres` and flips back to 'playing'
- [x] HUD shows the server-driven countdown when online: client converts `phaseEndsAt` from `Date.now()` to its own `performance.now()` timeline at receive (offset captured fresh on every patch, so NTP corrections / suspend-resume self-correct within ~50 ms) — local `timeRemaining` ticking is suppressed
- [x] Scoreboard overlay (`#scoreboard` in `index.html`, `.scoreboard__*` styles): centered card with backdrop blur, top 8 players sorted by `dreamIndex` desc, color dots match the in-world tints, "(tú)" tag on the local player, live countdown to next round
- [x] On 'scoreboard' → 'playing' transition the client calls `restart()`, which now in MP only resets position + balance + status (NOT progression — server already zeroed it). Spilled players are revived for the new round automatically.
- [x] Local 'timeout' game-over branch suppressed in MP (server's phase transition handles end-of-round); spill is still client-owned and mid-round
- [x] Late join: server-side `onJoin` is independent of the round phase — new players land with `dreamIndex=0` mid-round, contribute from there, see the correct phase + remaining time on first state hydration
- [x] `claim_delivery` silently dropped server-side while phase is 'scoreboard' so a misbehaving client can't pump end-of-round scores
- [x] Smoke test (`server/scripts/smoke-rounds.mjs`): boots a dedicated server on :2568 with 3 s round / 1.5 s scoreboard, asserts `playing → scoreboard` (dream preserved) → `playing` (dream reset, roundNumber++) transitions

**Done when**: round ends synchronously for all, restart is automatic, late join works. ✅

### Phase 5 — Persistent ranking (Supabase)
- [ ] Schema: `rankings(name TEXT PRIMARY KEY, total_milk INT, runs_played INT, last_played TIMESTAMPTZ)`
- [ ] At round end, server upserts each player's contribution
- [ ] In-game UI: "All-time Top 10" reachable from a HUD button or the end-of-round overlay
- [ ] HUD already shows "current round Top" from in-memory server state — no DB needed for that

**Done when**: server restart doesn't lose scores; same name accumulates across sessions.

### Phase 6 — Polish
- [ ] Player ↔ player collision: lecheras push each other, the jug reacts to the impulse via `jugBalance.bumps`
- [ ] Spawn distribution: small ring around the spawn marker so 10 players don't pile up
- [ ] Reconnect: same name within X seconds resumes the round contribution
- [ ] Name input: simple modal at game start, cached in `localStorage`

**Done when**: a real session with 5+ amigotes feels good end-to-end.

## Things explicitly OUT of scope

To keep momentum and avoid creep:

- Matchmaking, lobbies with filters
- Skill-based ranking (ELO, MMR)
- Voice chat
- Replay system
- Real anti-cheat (signed messages, kick logic, etc.) — names are spoofable, deal with it
- Private rooms with codes — *might* be added later if friends ask; not in the roadmap
- Mobile / touch controls
- Tournament brackets

## Current state

**Phase 4 done.** The server now drives the whole round lifecycle: a 3-minute `'playing'` phase followed by a 10-second `'scoreboard'` phase, looping forever. All clients share the same countdown (`phaseEndsAt` synced via the schema, converted from server `Date.now()` to client `performance.now()` once at receive). At the end of a round the scoreboard overlay shows the top 8 by deliveries with colored dots and the local player tagged "(tú)"; when the server flips back to `'playing'` everyone's `dreamIndex` resets to 0, spilled players are revived, positions reset to spawn. Late joiners land mid-round with the correct timer + a clean dream chain. `claim_delivery` is rejected during `'scoreboard'`. Offline mode still works exactly as before. Next stop: Phase 5 (Supabase-backed all-time leaderboard).

### How to run multiplayer locally

```bash
# In one shell — start the Colyseus server
pnpm dev:server

# In another shell — start the Vite dev server (game client)
pnpm dev

# Or both at once (parallel, mixed logs)
pnpm dev:all
```

Then open the game in the browser. The badge in the top-left corner shows the connection state (Single-player / Connecting… / Online · Player N). To point at a remote server: append `?mp=ws://hostname:2567` to the URL.

### Repo layout (current)

Phase 0/1 went in without renaming the existing `src/` to `client/src/` to avoid noise. The structure today is:

```
lechera/
  pnpm-workspace.yaml
  package.json                ← workspace root + client package
  src/
    net/
      multiplayer.ts          ← client connector, 20 Hz pose throttle, fallback, remote-player subscription via getStateCallbacks
      remotePlayers.ts        ← spawns / updates / disposes one avatar per remote, snapshot interpolation, name-tag sprites
    ui/
      minimap.ts              ← now also renders remote players as colored dots
    main.ts                   ← wires connect → manager → per-frame update
  server/                     ← workspace package "milk-dreams-server"
    package.json
    tsconfig.json
    src/
      index.ts                ← Colyseus + WS transport + health endpoint
      game/
        dreams.ts             ← server-side mirror of the client's dreams catalog (goal positions, GOAL_RADIUS, litresFor)
      rooms/MilkDreamsRoom.ts ← Player schema (name, x, z, yaw, colorHue, dreamIndex, litres) + room state (phase, phaseEndsAt, roundNumber), pose + claim_delivery handlers, hue palette, round-lifecycle timer (startRound / endRound)
    scripts/
      smoke-client.mjs        ← one-shot connect/leave smoke test
      smoke-multi.mjs         ← spawns two clients, asserts mutual visibility (Phase 2)
      smoke-delivery.mjs      ← validates claim_delivery accept/reject + state propagation + dream independence (Phase 3)
      smoke-rounds.mjs        ← spawns a dedicated server with shrunk phase durations, validates playing → scoreboard → playing transitions and round reset (Phase 4)
```

We'll re-evaluate the rename when remote-player rendering or shared types start to feel cramped.

### Notes for future phases

- **Colyseus 0.17 + renamed client package**: the front-end SDK is `@colyseus/sdk` in 0.17 (it was `colyseus.js` in 0.16). Server uses `@colyseus/core@^0.17`, `@colyseus/schema@^4`, `@colyseus/ws-transport@^0.17`. See the [0.17 migration guide](https://docs.colyseus.io/migrating/0.17) for the full list. The two majors of `colyseus.js` (still on 0.16) are NOT compatible with a 0.17 server because they're locked to schema v3.
- **Express is a peer dep of `@colyseus/ws-transport@^0.17`**: even though we don't strictly need Express, the transport's ESM module imports it at the top, so it has to be installed. We added it as a real dep and use it for `/health` (and future REST endpoints, e.g. Phase 5 ranking).
- **Schema v3/v4 + class fields**: server `tsconfig.json` uses `useDefineForClassFields: false`. With the modern default (`true`), class field initializers shadow the prototype getters/setters that `@colyseus/schema` installs via `defineTypes`, which breaks `MapSchema.$childType` setup and produces `Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')` at first patch. The Room's `state = new MyState()` class field also depends on this — with `true`, Colyseus's change tracking on `state` would break the same way. Don't flip it back without switching every Schema subclass and the Room to constructor-assignment.
- **Room generic shape (0.17)**: `extends Room<{ state: S, metadata: M, client: C }>` (object form), not `extends Room<S>` (positional, which was the 0.16 form).
- **Shared types**: still inlined per side (`RemotePlayerView` on the client mirrors `Player` on the server). When we add 3+ shared types (probably Phase 3), promote to a real `shared/` package referenced via `workspace:*`.
- **0.17 schema callback API**: schema instances do NOT have `.onAdd` / `.onRemove` directly anymore. You must do `const $ = getStateCallbacks(room); $(room.state).players.onAdd(cb)`. Trying `room.state.players.onAdd(...)` throws `players.onAdd is not a function` at runtime even though TypeScript may accept it (because the SDK types `state` permissively).
- **`room.state` hydration timing (0.17)**: right after `joinOrCreate` resolves, `room.state` exists but nested schemas (like `players`) may still be undefined; they show up after the first state patch. Either subscribe via `getStateCallbacks(room)` (recommended — those listeners survive the hydration) or guard reads with `room.onStateChange.once(...)`. We do both: callback + a one-shot `seedPlayers()` in case the hydration happened synchronously.
- **`MapSchema` is not a real `Map`**: don't `for...of` or spread it. Use `forEach((value, key) => ...)`. The `.get(key)` accessor works as expected.
- **`SkeletonUtils` exports**: `three/examples/jsm/utils/SkeletonUtils.js` exports `clone`, `retarget`, `retargetClip` as **named functions**, NOT a `SkeletonUtils` namespace. Import as `import { clone as cloneSkinned } from '...'`. The plain `Object3D.clone()` shares the skeleton across instances — visible bug is "all clones pose identically / freeze together". Use `cloneSkinned` for any skinned model that needs an independent rig.
- **Source/instance split for shared assets**: `loadCharacterSource(url)` caches the parsed GLB; `createCharacterInstance(source, opts)` builds a per-instance scene graph with its own bones, mixer and (optionally) cloned + tinted materials. Geometry is shared (cheap). Disposing an instance must NOT dispose the geometry — that would break every other live instance.
- **Per-instance schema callbacks (0.17)**: same `getStateCallbacks(room)` proxy is callable on individual schema instances too. `$(playerSchema).onChange(cb)` fires whenever ANY field of that player changes (incl. position echoes from our own `pose` sends). For "react only when X changed" patterns, capture a previous value in closure and compare; the cost of a missed-equality check is way smaller than the cost of re-applying expensive game logic on every patch.
- **Server-ack vs optimistic prediction**: for low-frequency, high-impact actions (delivery, scoring) we chose pure server-ack — no local advance, just send the claim and let the schema patch drive the visual update. The 50–150 ms round-trip is barely noticeable in this game's pace and removes a whole class of "client thinks it scored, server disagrees, rollback time" bugs. Movement stays client-authoritative because the same delay would be visceral on every keystroke.
- **Dreams catalog duplication (server vs client)**: `server/src/game/dreams.ts` mirrors the goal positions and `GOAL_RADIUS` from `lechera/src/game/progression.ts`. The client also keeps its full `progression.ts` (animal, jug scale, balance multipliers — none of which the server cares about). Two copies, easy to drift. Promote to a `shared/` workspace package the moment we add a third shared shape (probably the leaderboard payload in Phase 5).
- **Top-level state field listening (0.17)**: schema callbacks aren't only for collections / instances — `$(state).listen('phase', cb, true)` works for primitive top-level fields and `immediate=true` fires once with the current value if it's already populated. Use it for room-wide state (round phase, deadlines, mode flags) instead of polling every frame; you also get cheap "did this actually change?" semantics for free because `cb(value, prev)` carries the previous value.
- **Server `Date.now()` → client `performance.now()` conversion**: when shipping a deadline as `serverDeadlineMs` (Date.now() ms), convert at receive: `localDeadline = serverDeadline + (performance.now() - Date.now())`. The offset is captured once on every patch so any system-clock jump (NTP, suspend) self-corrects within a patch interval. Don't mix `Date.now()` and `performance.now()` for the same countdown — they tick the same rate normally but `Date.now()` can JUMP (and `performance.now()` is the one the rest of the codebase already uses for throttles).
- **Round-end reset timing**: when ending a round, do NOT reset player progression at the SAME moment you flip into the scoreboard phase — the scoreboard renders from live `dreamIndex` values, and zeroing them then would show "0 deliveries" for everyone during the celebration. The right beat is to reset only at the `scoreboard → playing` transition. The client mirrors this: it suppresses the per-delivery toast when `dreamIndex` drops to 0 (interpreted as a round reset, not a delivery).
- **Hot-reload + setTimeout in rooms**: `tsx watch` re-imports the room module on edits but does NOT call `onDispose` cleanly, so any `setTimeout` you stashed leaks. We're OK because the leftover handler runs against the stale `this.state` and silently no-ops. If you ever store the timer on a singleton or schedule heavy side-effects, clean up explicitly in `onDispose` (we already do `clearTimeout(this.phaseTimer)` for hygiene).

## How to update this file

- Mark roadmap items `[x]` as they land. Don't remove them.
- New decisions go into the "Decisions (closed)" table with a one-line rationale.
- Open questions move into the table once decided, with the date in the rationale if non-obvious.
- If a decision is reversed, strike-through the old row and add a new one below.

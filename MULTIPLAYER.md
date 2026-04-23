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
| Country (approx.) | **Server `geoip-lite` at join** | ISO 3166-1 alpha-2 stored per display name; updated when a later join resolves a different country. HUD shows a flag emoji; not used for auth. |
| Client hosting | TBD — Vercel / Cloudflare Pages | Static, irrelevant to gameplay. |
| Server hosting | TBD — Fly.io ($5/mo) or self-host | Decide when we ship. Localhost is fine until then. |

## Deferred decisions

Only the infrastructure choice is still open:

- **Server hosting target**: Fly.io / Railway / self-host / VPS. Multiplayer
  itself is feature-complete; hosting can be decided when we want to expose it
  beyond local / friend testing.

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
  client/                  ← single-player + Colyseus client (formerly `src/`)
    main.ts
    net/                   ← Colyseus client, remote-player render
    ui/
    game/
    ...
  server/                  ← Colyseus server (workspace package)
    src/
      index.ts             ← Colyseus boot + GET /leaderboard
      rooms/
        MilkDreamsRoom.ts  ← single room schema + lifecycle
      persistence/
        supabase.ts        ← write rankings on round end
    package.json
  shared/                  ← workspace package `@milk-dreams/shared`
    src/                   ← dreams catalog, spawn, name validation, leaderboard types
    package.json
  pnpm-workspace.yaml
  MULTIPLAYER.md           ← this doc
  AGENTS.md
```

The `src/ → client/` rename landed alongside the shared package so the three
sources (client, server, shared) sit next to each other. See "Repo layout
(current)" below for the up-to-date file-level breakdown.

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
- [x] Client sends `claim_delivery` as a delivery request only; server validates against that player's latest SERVER-tracked pose (`Player.x/z`) and current goal (`goalFor(dreamIndex)` + `GOAL_RADIUS + DELIVERY_TOLERANCE`) → confirms (bumps `dreamIndex`/`litres`) or silently rejects
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
- [x] Scoreboard overlay (`#scoreboard` in `index.html`, `.scoreboard__*` styles): centered card with backdrop blur, top 8 players sorted by `dreamIndex` desc, color dots match the in-world tints, "(you)" tag on the local player, live countdown to next round
- [x] On 'scoreboard' → 'playing' transition the client calls `restart()`, which now in MP only resets position + balance + status (NOT progression — server already zeroed it). Spilled players are revived for the new round automatically.
- [x] Local 'timeout' game-over branch suppressed in MP (server's phase transition handles end-of-round); spill is still client-owned and mid-round
- [x] Late join: server-side `onJoin` is independent of the round phase — new players land with `dreamIndex=0` mid-round, contribute from there, see the correct phase + remaining time on first state hydration
- [x] `claim_delivery` silently dropped server-side while phase is 'scoreboard' so a misbehaving client can't pump end-of-round scores
- [x] Smoke test (`server/scripts/smoke-rounds.mjs`): boots a dedicated server on :2568 with 3 s round / 1.5 s scoreboard, asserts `playing → scoreboard` (dream preserved) → `playing` (dream reset, roundNumber++) transitions

**Done when**: round ends synchronously for all, restart is automatic, late join works. ✅

### Phase 4.5 — Soft-spill + cumulative scoring (DONE)
- [x] Server `Player` schema gains `litresDelivered: number` — monotonic per round, banks the litres of the jar that was just dropped off (`p.litresDelivered += p.litres` BEFORE incrementing `dreamIndex`). Reset to 0 only at `startRound` and on join.
- [x] New `report_spill` server message: while `phase === 'playing'`, rewinds `dreamIndex` to 0 + `litres = litresFor(0)` but KEEPS `litresDelivered`. Idempotent (no-op when already at 0). Silently dropped during `'scoreboard'`.
- [x] Scoreboard ranks by `litresDelivered` desc (was `dreamIndex`). HUD label switched from "X dream(s)" to "X L". Players that spilled often but kept playing rank above players that spilled and gave up.
- [x] Client `multiplayer.ts`: `RemotePlayerView` + `SelfProgressionView` expose `litresDelivered`. New `sendSpillReport()` method (300 ms throttled, safe offline).
- [x] Client `main.ts`: in MP, `balance.isSpilled` triggers a SOFT spill — `balance.reset()` locally, `multi.sendSpillReport()`, `SPILL_TOAST_TEXT` toast, NO game-over screen. The schema patch coming back as `dreamIndex=0` re-runs the existing "snap to 0" branch which rebuilds visuals (small jug, first goal). Position stays where it spilled (no teleport — less jarring).
- [x] Client HUD "Dropped off" now shows cumulative litres (`currentLitresDelivered()`): online from `selfProgression().litresDelivered`, offline from the triangular sum `n*(n+1)/2` (which is what a clean SP chain produces anyway). The number visibly grows faster than before, which feels more rewarding.
- [x] Single-player keeps the classic "spill = game over" model on purpose — consistent with the fable. The cumulative HUD number is purely cosmetic in SP because a clean chain is the only way to score.
- [x] Smoke test (`server/scripts/smoke-spill.mjs`): clean delivery #1 (1 L) → #2 (3 L total) → spill (chain to 0, total preserved at 3) → delivery (4 L total). Also asserts duplicate spill at `dreamIndex=0` is a no-op.

**Done when**: spilling in MP no longer kicks you out of the round — you respawn with the small jug at your current location, your standings hold, and you can keep contributing. ✅

### Phase 5 — Persistent ranking (Supabase) (DONE)
- [x] Schema lives in a dedicated **`milk_dreams` schema** (not `public`) so the rankings table doesn't mix with the rest of the Supabase project. Table: `milk_dreams.rankings(name TEXT PK, total_milk INT, rounds_played INT, best_round_milk INT, last_played TIMESTAMPTZ, country CHAR(2) NULL)` plus a DESC index on `total_milk`. Two SECURITY DEFINER functions (`record_contribution(name, litres, country)` for the upsert with `coalesce` on country so a failed geoip doesn't blank a known value, `top_rankings(limit)` returning `country` for the read) gate ALL access — the table itself is unreachable to the anon role. The canonical DDL was applied via the Supabase SQL editor and documented in this file / project notes; `server/.env.example` only documents the required env vars and the "Exposed schemas" gotcha. Add `milk_dreams` to "Exposed schemas" in Project Settings → API or PostgREST returns `404 schema not found`.
- [x] Server module `server/src/persistence/supabase.ts`: factory + lazy module-level singleton (`getLeaderboardStore()`). Reads `SUPABASE_URL` + `SUPABASE_ANON_KEY` from `process.env`; **falls back to a no-op store** when either is missing so local dev / CI runs unchanged. All Supabase calls are try/catch-wrapped — a transient outage logs a warning and returns `void` / `[]` instead of crashing the room.
- [x] `MilkDreamsRoom.endRound()` snapshots contributions, flips immediately to `'scoreboard'`, then persists in the background. Supabase RPCs are bounded by a timeout so a slow / wedged DB cannot stall the round lifecycle. Tradeoff: the all-time leaderboard may lag the just-finished round by one refresh when persistence is slow, but match flow always wins over leaderboard freshness.
- [x] Express route `GET /leaderboard?limit=N` (in `server/src/index.ts`): wildcard CORS (it's read-only public data), `Cache-Control: no-store`, returns `{ entries: [...] }`. Client never talks to Supabase directly — keeps anon key + URL out of the shipped JS bundle and lets the server be the single chokepoint for any future rate-limiting / sanitisation.
- [x] Client module `client/net/leaderboard.ts`: `httpEndpointFromWs(ws)` derives the HTTP origin from the existing WS endpoint (no second config knob). `fetchLeaderboard(http, limit, timeoutMs=2500)` returns `[]` on any error so the HUD can render a clean "no data yet" placeholder instead of a spinner.
- [x] HUD scoreboard panel ships an additional **"All-time Top 10"** section (`#leaderboard-section` in `index.html`, `.scoreboard__section*` styles). Renders `null` as "Loading…", `[]` as "No rounds played yet.", and otherwise lists name + `total_milk L`, with a `(you)` tag on rows whose name matches the local player. The local-round scoreboard above stays untouched.
- [x] `MultiplayerHandle.endpoint()` exposes the resolved WS URL so `main.ts` can derive the matching HTTP origin once and stash it; refresh fires from the same `subscribeRound` branch that opens the scoreboard overlay.
- [x] Env wiring: `dotenv/config` imported at the top of `server/src/index.ts` so a local `.env` is picked up automatically. `.env.example` documents the two required variables and the "Exposed schemas" gotcha. `.env` and `.env.local` are gitignored.
- [x] Smoke test (`server/scripts/smoke-leaderboard.mjs`): boots a dedicated server on `:2569` (`MD_SMOKE_PORT`) with shrunk round / scoreboard durations. **Two modes**: when `SUPABASE_*` env vars are absent it just verifies `/leaderboard` returns `{ entries: [] }` (no DB calls); when present it joins, claims a delivery, lets the round end, fetches `/leaderboard`, and asserts the player's row appears with `total_milk` >= baseline + 1 (and accumulates over a second round if the auto-assigned name matches).

**Done when**: server restart doesn't lose scores; same name accumulates across sessions; the in-game scoreboard shows the all-time Top 10 every round end. ✅

### Phase 6 — Polish (DONE)
- [x] Player ↔ player collision: lecheras push each other, the jug reacts to the impulse via `jugBalance.bumps`
- [x] Spawn distribution: small ring around the spawn marker so 10 players don't pile up
- [x] Reconnect: same name within 30 s resumes the round contribution (only `litresDelivered` is restored — `dreamIndex`/`litres` are reset so the player doesn't materialise on a fragile late-game jug)
- [x] Name input: mandatory modal at game start (min 3 chars, validated with the same `sanitiseName` the server uses), cached in `localStorage`. No "skip" path: the server rejects joins without a valid name.
- [x] Shared workspace package `@milk-dreams/shared` carries the dreams catalog (`DREAM_GOALS`, `goalFor`, `litresFor`, `GOAL_RADIUS`, `DELIVERY_TOLERANCE`), the spawn ring (`SPAWN_X/Z`, `SPAWN_RING_INNER_M/OUTER_M`, `spawnPositionInRing`), the name validation (`MIN_NAME_LENGTH`, `MAX_NAME_LENGTH`, `sanitiseName`, `isValidName`) and the leaderboard wire shape (`LeaderboardEntry`, `LeaderboardResponse`). Single source of truth for everything that has to agree across both sides.

**Done when**: a real session with 5+ amigotes feels good end-to-end.

### Phase 7 — Country from IP (DONE)
- [x] **Server-side geolocation only.** The Colyseus `WebSocketTransport` passes `AuthContext.ip` (`x-real-ip` → `x-forwarded-for` → socket address). `MilkDreamsRoom.onAuth` resolves it with the offline `geoip-lite` database and returns `{ country }` (ISO 3166-1 alpha-2 or empty). `onJoin` copies that onto `Player.country` (schema string; empty means "unknown").
- [x] **Persistence.** `endRound` includes `country` in each `RoundContribution`; `record_contribution` receives `p_country`. Rows store "last seen country" for that display name; a later join from elsewhere overwrites when the new lookup succeeds.
- [x] **Wire shape.** `LeaderboardEntry` in `@milk-dreams/shared` gains `country: string | null`. `GET /leaderboard` returns it verbatim from `top_rankings`.
- [x] **HUD.** During play, the top-left net badge shows a flag emoji next to the coloured name when `Player.country` is set (`#net-badge .net-badge__flag`). The all-time panel prefixes the same for each row when `country` is set (`countryCodeToFlagEmoji` in `shared/src/country.ts`).
- [x] **Smoke tests.** `smoke-leaderboard.mjs` loads `server/.env` in the parent process so the persistence branch matches the spawned server. `smoke-phase6.mjs` step F sends `pose` at the goal before `claim_delivery` (server-authoritative delivery).

**Done when**: production joins show a resolved country in logs and Supabase; the all-time list shows flags for rows with a country. ✅

### Phase 8 — Durable round counter + dev write gate (DONE)
- [x] **Durable round total.** `MilkDreamsRoom.roundNumber` used to reset to 1 on every server restart. New Supabase table `milk_dreams.round_counter(id smallint PK default 1, total_rounds bigint not null default 0, updated_at timestamptz default now())` — single-row singleton enforced by `check (id = 1)` — stores the cumulative rounds-ever count. Two SECURITY DEFINER functions gate access: `get_round_counter() → bigint` (read the counter at boot) and `increment_round_counter() → void` (atomic bump via `update ... set total_rounds = total_rounds + 1`). Both are `grant execute ... to anon` with `set search_path = ''`; the table itself stays unreachable to the anon role, same defense-in-depth as the rankings.
- [x] **Server wiring.** `onCreate` is now `async` and seeds `state.roundNumber` from `getRoundCounter()` BEFORE the first `startRound()` (so a client racing us to connect already sees the correct label in its initial state hydration). `startRound()` bumps local `roundNumber` and fire-and-forgets `incrementRoundCounter()` — same fire-and-forget pattern as the per-round contributions, so a slow/wedged Supabase never stalls the round lifecycle. Worst case: one failed RPC drops a single round from the persistent total.
- [x] **Dev write gate.** Writes now require `NODE_ENV === 'production'` on top of `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Pointing `pnpm dev:server` at the production Supabase project no longer pollutes the real leaderboard or advances the global round counter — `recordRoundContributions` and `incrementRoundCounter` both short-circuit to no-ops when the env gate fails. **Reads are NOT gated**: `topRankings` and `getRoundCounter` still go through, so a dev server sees the same leaderboard and round label as production (useful for QAing the UI with real data). The smoke-leaderboard test forces `NODE_ENV=production` on its persistence-ON path so CI still exercises the write path.
- [x] **Canonical DDL** (apply via the Supabase SQL editor; runnable standalone, idempotent):

  ```sql
  create table if not exists milk_dreams.round_counter (
    id smallint primary key default 1,
    total_rounds bigint not null default 0,
    updated_at timestamptz not null default now(),
    constraint round_counter_singleton check (id = 1)
  );

  insert into milk_dreams.round_counter (id, total_rounds)
  values (1, 0)
  on conflict (id) do nothing;

  create or replace function milk_dreams.increment_round_counter()
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    update milk_dreams.round_counter
       set total_rounds = total_rounds + 1,
           updated_at = now()
     where id = 1;
  end;
  $$;

  create or replace function milk_dreams.get_round_counter()
  returns bigint
  language sql
  security definer
  set search_path = ''
  as $$
    select total_rounds from milk_dreams.round_counter where id = 1;
  $$;

  revoke all on function milk_dreams.increment_round_counter() from public;
  revoke all on function milk_dreams.get_round_counter() from public;
  grant execute on function milk_dreams.increment_round_counter() to anon;
  grant execute on function milk_dreams.get_round_counter() to anon;
  ```

**Done when**: restarting the production server preserves the round label (`Round N+1` picks up where `Round N` left off); running `pnpm dev:server` with SUPABASE_* set does NOT bump the production counter. ✅

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

**Phase 6 done; Phase 7 (country) shipped.** Multiplayer remains feature-complete for a casual party session of ~10 lecheras, with optional per-name country on the all-time leaderboard:

- **Mandatory name + modal** (`client/ui/nameModal.ts` + `index.html#name-modal`): on first boot a small modal blocks the screen and asks for a display name (min 3 / max 18 chars after sanitisation). The submit button stays disabled until live validation (the SAME `sanitiseName` from `@milk-dreams/shared` the server uses) accepts the input, and a small inline error explains the rule once the user has typed something. Once accepted, the name is cached in `localStorage` under `lechera.name`; subsequent loads skip the modal entirely. The chosen name is forwarded to `joinOrCreate('milk-dreams', { name })`; the server re-runs `sanitiseName` and **rejects the join** if the result fails — there is no auto-name fallback any more. Players can clear `localStorage.lechera.name` from devtools to re-prompt on next load.
- **Spawn ring** (`shared/src/spawn.ts:spawnPositionInRing` + the cosmetic marker in `level.ts`): the server picks an area-uniform random point in an annulus `[0.5 m, 2.6 m]` around the world spawn `(0, 20)` for every joining or reconnecting player. Sampling `r = sqrt(lerp(r₁², r₂²))` keeps the distribution flat over the annulus area (no inner-edge bias). The painted spawn marker on the ground was widened from a thin 1.5 m ring to a thin 3.0 m ring so the visual matches the spawn budget — with 10 lecheras × π·PLAYER_RADIUS² ≈ 6.4 m² of footprint inside ≈ 20.4 m² of annulus the density sits around 31 % (tight but never pile-up). Two players landing within `2 × PLAYER_RADIUS` is fine: the Phase 6d player-player collision separates them on the next frame. Sizing history: the first iteration used `[1.0, 3.0]` (lecheras spawned outside the 1.5 m marker), then `[0.3, 1.2]` (fit inside the marker but mathematically too cramped for ~10 players), now `[0.5, 2.6]` paired with the wider marker. The client teleports to the server-picked position the first time the self schema hydrates (`player.reset(new Vector3(self.x, 0, self.z))`); subsequent server pose echoes are ignored so client-predictive movement isn't fought.
- **Reconnect by name** (`MilkDreamsRoom.recentlyLeftByName`): when a player leaves with `litresDelivered > 0` during the playing phase, their score is cached at MODULE scope (NOT per-room — Colyseus disposes the room when the last player leaves, which is precisely the canonical reconnect scenario). A new join under the same sanitised name within `RECONNECT_TTL_MS = 30 s` restores `litresDelivered`; `dreamIndex` / `litres` are NOT restored so the reconnecting player respawns on the small jug at the first goal (a fragile late-game jug right after a refresh would feel terrible). Different names start at 0 (no cross-name leak). TTL eviction is a lazy O(n) sweep on every leave — no leaked timer under `tsx watch`.
- **Player ↔ player collision** (`client/main.ts` per-frame `frameObstacles`): each frame we wrap every remote in a pre-pooled `Obstacle` AABB sized at `PLAYER_RADIUS`, concatenate with `level.obstacles`, and pass into the existing `player.update(...)` collision path. This gives lecheras a `2 × PLAYER_RADIUS = 0.9 m` collision diameter, produces `bumps` events that flow naturally through `jugBalance.bumps` (so a bodycheck tilts your jug exactly like banging into a wall), and costs essentially nothing per frame (~10 remotes × handful of field assignments). Each client resolves collision against the others on its own local sim, so the apparent push is roughly symmetric without server mediation.

The full multiplayer roadmap (Phase 0–7) is closed for casual play. The shared workspace package landed alongside the mandatory-name change (Phase 6 polish); Phase 7 adds country capture without changing the trust model (names remain spoofable). The only deferred infra item is picking a server hosting target (Fly / Railway / VPS).

### How to run multiplayer locally

```bash
# In one shell — start the Colyseus server
pnpm dev:server

# In another shell — start the Vite dev server (game client)
pnpm dev

# Or both at once (parallel, mixed logs)
pnpm dev:all
```

Then open the game in the browser. A modal asks for your display name (min 3 chars) the first time; the badge in the top-left corner shows the connection state (`Local` / `Connecting…` / your online name). To point at a remote server: append `?mp=ws://hostname:2567` to the URL.

### Repo layout (current)

The original single-player `src/` was renamed to `client/` once the workspace gained `shared/` and `server/` siblings, so the three sources sit next to each other (root package.json still IS the client). Vite root is unchanged (the package directory); `tsconfig.json` includes `client/`, and `index.html` loads `/client/main.ts` + `/client/ui/styles.css`.

```
lechera/
  pnpm-workspace.yaml         ← lists `shared` and `server` as workspaces; root is the client package
  package.json                ← workspace root + client package; depends on `@milk-dreams/shared: workspace:*`
  index.html                  ← Vite entry; loads `/client/main.ts` and `/client/ui/styles.css`
  client/                     ← client source (formerly `src/`)
    net/
      multiplayer.ts          ← client connector, 20 Hz pose throttle, fallback, remote-player subscription via getStateCallbacks; mandatory `name` (validated with shared `sanitiseName`) forwarded to joinOrCreate (Phase 6a)
      remotePlayers.ts        ← spawns / updates / disposes one avatar per remote, snapshot interpolation, name-tag sprites
      leaderboard.ts          ← client-side fetch for the all-time leaderboard (Phase 5); re-exports the shared `LeaderboardEntry` type
    ui/
      minimap.ts              ← now also renders remote players as colored dots
      nameModal.ts            ← Phase 6a: blocks on first boot until the player enters a valid name (min 3 chars), cached in localStorage. Validation comes from `@milk-dreams/shared:isValidName/sanitiseName`
    main.ts                   ← wires connect → manager → per-frame update; teleports to server-picked spawn (Phase 6b); concatenates remote-player AABBs into the per-frame obstacle list (Phase 6d)
  shared/                     ← workspace package "@milk-dreams/shared", source of truth for everything that must agree across both sides
    package.json              ← compiles to `dist/`; client/server depend via `workspace:*`
    tsconfig.json
    src/
      index.ts                ← public surface (re-exports from the four modules below)
      dreams.ts               ← `DREAM_GOALS`, `GOAL_RADIUS`, `DELIVERY_TOLERANCE`, `goalFor`, `litresFor`, `Goal2D`
      spawn.ts                ← `SPAWN_X/Z`, `SPAWN_RING_INNER_M/OUTER_M`, `spawnPositionInRing()` (Phase 6b)
      name.ts                 ← `MIN_NAME_LENGTH`, `MAX_NAME_LENGTH`, `sanitiseName`, `isValidName` (Phase 6a) — used by client modal + server `onJoin`
      leaderboard.ts          ← wire shape `LeaderboardEntry` + `LeaderboardResponse` (Phase 5); `country` + flag helpers (Phase 7)
      country.ts              ← `normaliseCountryCode`, `countryCodeToFlagEmoji` (Phase 7)
  server/                     ← workspace package "milk-dreams-server"; depends on `@milk-dreams/shared: workspace:*`
    package.json
    tsconfig.json
    .env.example              ← documents SUPABASE_URL + SUPABASE_ANON_KEY for Phase 5 + the NODE_ENV=production write gate added in Phase 8
    src/
      index.ts                ← dotenv preload + Colyseus + WS transport + health + GET /leaderboard
      persistence/
        supabase.ts           ← lazy singleton store backed by Supabase RPCs (`record_contribution` with `p_country`, `top_rankings`, `get_round_counter`, `increment_round_counter`); no-op fallback when env vars are missing. Phase 8: when Supabase IS configured but `NODE_ENV !== 'production'`, reads still hit Supabase (dev sees same data as prod) while writes (`recordRoundContributions`, `incrementRoundCounter`) short-circuit to no-ops. Re-aliases `LeaderboardEntry` from shared as `RankingEntry` for in-house clarity
      rooms/MilkDreamsRoom.ts ← Player schema (name, x, z, yaw, colorHue, dreamIndex, litres, litresDelivered, country) + room state (phase, phaseEndsAt, roundNumber), `onAuth` geoip + pose + claim_delivery + report_spill handlers, hue palette, round-lifecycle timer (endRound flips phase immediately, then persists in background with bounded RPC timeouts). Phase 6: re-runs shared `sanitiseName` on `JoinOptions.name` and **throws (rejects the join) on invalid**, picks a ring spawn, restores `litresDelivered` from a module-scope `recentlyLeftByName` cache when a player rejoins under the same name within 30 s. Phase 8: `onCreate` is async and seeds `state.roundNumber` from the durable `milk_dreams.round_counter` before the first `startRound`; every subsequent `startRound` fire-and-forgets an `increment_round_counter` RPC
    scripts/
      smoke-client.mjs        ← one-shot connect/leave smoke test
      smoke-multi.mjs         ← spawns two clients, asserts mutual visibility (Phase 2)
      smoke-delivery.mjs      ← validates claim_delivery accept/reject + state propagation + dream independence (Phase 3)
      smoke-rounds.mjs        ← spawns a dedicated server with shrunk phase durations, validates playing → scoreboard → playing transitions and round reset (Phase 4)
      smoke-spill.mjs         ← validates report_spill: chain rewind preserves litresDelivered + idempotency at dreamIndex=0 (Phase 4.5)
      smoke-leaderboard.mjs   ← boots a dedicated server on :2569; persistence-OFF asserts /leaderboard returns []; persistence-ON joins under a unique name and exercises end-to-end upsert + cross-round accumulation (Phase 5). Imports goal positions from `@milk-dreams/shared`
      smoke-phase6.mjs        ← boots a dedicated server on :2571; validates custom-name acceptance, **REJECTION** of missing / too-short names, sanitisation (control chars, length cap, post-truncation trim), spawn ring distribution, reconnect by name within TTL (preserves litresDelivered, resets dreamIndex), and that a different name does NOT inherit a cached score (Phase 6). Pulls all constants and `goalFor` from `@milk-dreams/shared` so future tweaks propagate automatically.
```

The monorepo layout is now the stable baseline; future work should extend it
rather than trying to collapse client/server/shared back together.

### Notes for future phases

- **Colyseus 0.17 + renamed client package**: the front-end SDK is `@colyseus/sdk` in 0.17 (it was `colyseus.js` in 0.16). Server uses `@colyseus/core@^0.17`, `@colyseus/schema@^4`, `@colyseus/ws-transport@^0.17`. See the [0.17 migration guide](https://docs.colyseus.io/migrating/0.17) for the full list. The two majors of `colyseus.js` (still on 0.16) are NOT compatible with a 0.17 server because they're locked to schema v3.
- **Express is a peer dep of `@colyseus/ws-transport@^0.17`**: even though we don't strictly need Express, the transport's ESM module imports it at the top, so it has to be installed. We added it as a real dep and use it for `/health` (and future REST endpoints, e.g. Phase 5 ranking).
- **Schema v3/v4 + class fields**: server `tsconfig.json` uses `useDefineForClassFields: false`. With the modern default (`true`), class field initializers shadow the prototype getters/setters that `@colyseus/schema` installs via `defineTypes`, which breaks `MapSchema.$childType` setup and produces `Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')` at first patch. The Room's `state = new MyState()` class field also depends on this — with `true`, Colyseus's change tracking on `state` would break the same way. Don't flip it back without switching every Schema subclass and the Room to constructor-assignment.
- **Room generic shape (0.17)**: `extends Room<{ state: S, metadata: M, client: C }>` (object form), not `extends Room<S>` (positional, which was the 0.16 form).
- **Shared contract location**: cross-runtime constants and wire shapes now live in the real `@milk-dreams/shared` workspace package. Some runtime view interfaces still stay local on purpose (for example `RemotePlayerView` on the client mirrors the decoded Colyseus schema shape), but anything that MUST agree semantically across both sides should be added under `shared/src/`.
- **0.17 schema callback API**: schema instances do NOT have `.onAdd` / `.onRemove` directly anymore. You must do `const $ = getStateCallbacks(room); $(room.state).players.onAdd(cb)`. Trying `room.state.players.onAdd(...)` throws `players.onAdd is not a function` at runtime even though TypeScript may accept it (because the SDK types `state` permissively).
- **`room.state` hydration timing (0.17)**: right after `joinOrCreate` resolves, `room.state` exists but nested schemas (like `players`) may still be undefined; they show up after the first state patch. Either subscribe via `getStateCallbacks(room)` (recommended — those listeners survive the hydration) or guard reads with `room.onStateChange.once(...)`. We do both: callback + a one-shot `seedPlayers()` in case the hydration happened synchronously.
- **`MapSchema` is not a real `Map`**: don't `for...of` or spread it. Use `forEach((value, key) => ...)`. The `.get(key)` accessor works as expected.
- **`SkeletonUtils` exports**: `three/examples/jsm/utils/SkeletonUtils.js` exports `clone`, `retarget`, `retargetClip` as **named functions**, NOT a `SkeletonUtils` namespace. Import as `import { clone as cloneSkinned } from '...'`. The plain `Object3D.clone()` shares the skeleton across instances — visible bug is "all clones pose identically / freeze together". Use `cloneSkinned` for any skinned model that needs an independent rig.
- **Source/instance split for shared assets**: `loadCharacterSource(url)` caches the parsed GLB; `createCharacterInstance(source, opts)` builds a per-instance scene graph with its own bones, mixer and (optionally) cloned + tinted materials. Geometry is shared (cheap). Disposing an instance must NOT dispose the geometry — that would break every other live instance.
- **Per-instance schema callbacks (0.17)**: same `getStateCallbacks(room)` proxy is callable on individual schema instances too. `$(playerSchema).onChange(cb)` fires whenever ANY field of that player changes (incl. position echoes from our own `pose` sends). For "react only when X changed" patterns, capture a previous value in closure and compare; the cost of a missed-equality check is way smaller than the cost of re-applying expensive game logic on every patch.
- **Server-ack vs optimistic prediction**: for low-frequency, high-impact actions (delivery, scoring) we chose pure server-ack — no local advance, just send the claim and let the schema patch drive the visual update. The 50–150 ms round-trip is barely noticeable in this game's pace and removes a whole class of "client thinks it scored, server disagrees, rollback time" bugs. Movement stays client-authoritative because the same delay would be visceral on every keystroke.
- **Shared workspace package (`@milk-dreams/shared`)**: history — Phase 3 server kept its own copy of the dreams catalog in `server/src/game/dreams.ts`, mirroring the client's `progression.ts`. Phase 5 added the leaderboard wire shape as a third "must agree" surface, and Phase 6 added name validation (modal + `onJoin` rejection) as a fourth. That tipped the scale: we created `shared/` as a pnpm workspace package compiled to `dist/` (NodeNext, `.d.ts` emitted) and wired both client (Vite) and server (`tsx watch`) to depend on it via `workspace:*`. The package now owns the dreams catalog, spawn ring constants + `spawnPositionInRing`, name validation, and the leaderboard interfaces. The client still keeps its visual-only `progression.ts` extras (animal, jug scale, balance multipliers — none of which the server cares about) but imports the goal coordinates from the shared catalog. The server's old `game/dreams.ts` is deleted. Adding a new "shared" thing now means a single file under `shared/src/` plus a re-export in `shared/src/index.ts`.
- **Top-level state field listening (0.17)**: schema callbacks aren't only for collections / instances — `$(state).listen('phase', cb, true)` works for primitive top-level fields and `immediate=true` fires once with the current value if it's already populated. Use it for room-wide state (round phase, deadlines, mode flags) instead of polling every frame; you also get cheap "did this actually change?" semantics for free because `cb(value, prev)` carries the previous value.
- **Server `Date.now()` → client `performance.now()` conversion**: when shipping a deadline as `serverDeadlineMs` (Date.now() ms), convert at receive: `localDeadline = serverDeadline + (performance.now() - Date.now())`. The offset is captured once on every patch so any system-clock jump (NTP, suspend) self-corrects within a patch interval. Don't mix `Date.now()` and `performance.now()` for the same countdown — they tick the same rate normally but `Date.now()` can JUMP (and `performance.now()` is the one the rest of the codebase already uses for throttles).
- **Round-end reset timing**: when ending a round, do NOT reset player progression at the SAME moment you flip into the scoreboard phase — the scoreboard renders from live `dreamIndex` values, and zeroing them then would show "0 deliveries" for everyone during the celebration. The right beat is to reset only at the `scoreboard → playing` transition. The client mirrors this: it suppresses the per-delivery toast when `dreamIndex` drops to 0 (interpreted as a round reset, not a delivery).
- **Hot-reload + setTimeout in rooms**: `tsx watch` re-imports the room module on edits but does NOT call `onDispose` cleanly, so any `setTimeout` you stashed leaks. We're OK because the leftover handler runs against the stale `this.state` and silently no-ops. If you ever store the timer on a singleton or schedule heavy side-effects, clean up explicitly in `onDispose` (we already do `clearTimeout(this.phaseTimer)` for hygiene).
- **Supabase + custom schema (PostgREST gotcha)**: PostgREST exposes only schemas listed in the project's API settings. After applying our `milk_dreams` DDL you MUST add `milk_dreams` to "Exposed schemas" (Project Settings → API → Exposed schemas) AND configure the JS client with `db: { schema: 'milk_dreams' }` — both are required. Symptom of forgetting either: `404 schema "milk_dreams" not found in public schema cache`. The functions are `SECURITY DEFINER` with `set search_path = ''` so they don't need any extra grants beyond `GRANT EXECUTE ... TO anon`; the underlying table itself is intentionally NOT granted to anon, which means a leaked anon key can only call our two RPCs — defense in depth on top of the "names are spoofable" trust model.
- **Dotenv loading order**: `import 'dotenv/config'` MUST be the first import in `server/src/index.ts` (before any module that reads `SUPABASE_*` from `process.env`). Our `getLeaderboardStore()` is a lazy singleton and reads env vars only on first call, but the room module imports it at the top level — so if dotenv loaded after the room import, we'd race. Putting dotenv first is the simplest deterministic ordering.
- **Background persistence beats lifecycle stalls**: round transitions must not wait on Supabase. `endRound()` flips the room to `'scoreboard'` immediately, then fires `recordRoundContributions(...)` in the background. The store wraps RPCs in a timeout so a slow / wedged DB resolves as a warning instead of freezing the match. Consequence: the persistent leaderboard may lag by one refresh if persistence is slow, which is acceptable for this project.
- **Delivery validation uses server-held pose**: `claim_delivery` is just a request signal now. The room ignores any client-provided claim coordinates and validates against the latest server-tracked `Player.x/z` from `pose` updates. This is not "real anti-cheat" because movement is still client-reported, but it closes the trivial "send goal coordinates without moving" exploit and matches the server-authoritative design described above.
- **Reconnect cache MUST be module-scope, not per-room (Phase 6c)**: Colyseus auto-disposes the room instance whenever the last player leaves (default `autoDispose: true`). The canonical reconnect scenario — a single player refreshes their tab — therefore goes through `onLeave → onDispose → onCreate → onJoin`, blowing away any per-room state in the process. Our first `private recentlyLeft = new Map(...)` worked in unit tests where two clients overlapped, then silently failed on the real "reload my tab" path. Solution: `recentlyLeftByName` lives at module scope (singleton in the Node process) so it survives room churn. Surviving a server RESTART would require pushing the cache into Supabase, which we don't because the all-time leaderboard already covers the durable case.
- **Sanitisation must trim AFTER truncation (Phase 6a)**: `raw.replace(...).trim().slice(0, MAX)` is buggy when truncation lands mid-space — `'Big Nasty Name Way Too Long'.slice(0, 18)` is `'Big Nasty Name Way '` with a trailing space. Always trim a second time after slicing. Smoke test (`smoke-phase6.mjs` step C) caught this on the first run; client and server share the same algorithm but each enforces it independently because trust boundaries.
- **Player-as-AABB collision (Phase 6d)**: instead of adding a circle-circle collision path to `player.ts`, we wrap remote players in `Obstacle` AABBs sized at `PLAYER_RADIUS` and reuse the existing AABB code. The collision math `dist(closestPointOnAABB, next) < PLAYER_RADIUS` produces a 2 × PLAYER_RADIUS = 0.9 m collision diameter — exactly the visual footprint of two lecheras touching. Bonus: bumps already feed `jugBalance`, so the jug reaction is free. The `Obstacle` shells live in a per-frame pool (`remoteObstaclePool`) shared across frames so collision against 10 remotes costs ~10 field assignments per frame, not 10 allocations.
- **Server-picked spawn + client teleport (Phase 6b)**: the server is authoritative on spawn, the client teleports to it on first hydration of the self schema. Subsequent server pose echoes are IGNORED — we don't want server-side pose to fight client-predictive movement (which would manifest as a tiny rubber-band on every patch). The teleport-once flag (`teleportedToServerSpawn`) lives on the closure that wires up the multiplayer handle, so it's automatically scoped to one connection lifetime; reconnects start a fresh closure → fresh teleport.
- **Mandatory name + double validation (Phase 6a hardened)**: switching from "optional, server falls back to Player N" to "mandatory, server rejects" needed three coordinated edits — (1) `sanitiseName` returns `null` for inputs shorter than `MIN_NAME_LENGTH`, (2) the modal disables Submit until `isValidName` accepts the input AND removes the Skip button entirely (no "fall through" path), (3) `onJoin` re-runs `sanitiseName` and `throw`s a Colyseus-friendly Error when null — Colyseus translates that into a join rejection on the client. The client also pre-validates inside `connectMultiplayer` and short-circuits to an offline handle on a bad name, so we never burn a connection attempt on input we already know the server will refuse. The smoke test asserts both rejection paths (missing name, too short) AND the happy path (sanitised dirty input passes), giving us regression coverage on each side of the trust boundary.
- **Workspace package consumption from Vite + tsx (Phase 6 shared)**: the `@milk-dreams/shared` package compiles ahead of time (`tsc --build` via `pnpm -r build`) and ships `dist/index.js` + `dist/index.d.ts`. Vite resolves the package transparently as long as `pnpm install` has linked `node_modules/@milk-dreams/shared` to the workspace folder; HMR works because Vite watches the linked `dist/`. The server uses `tsx watch src/index.ts` and also reads from the linked `dist/` — meaning when you edit a file under `shared/src/`, you need either `pnpm -r build` once or the `pnpm -F @milk-dreams/shared dev` watcher running in another terminal for the server to pick up the change. A future tweak: configure `tsx` and Vite with the package's `src/` exports so the build step disappears in dev. For now, the explicit build step is the price of "pure TypeScript NodeNext + ESM that survives both runtimes without bundler hacks".

## How to update this file

- Mark roadmap items `[x]` as they land. Don't remove them.
- New decisions go into the "Decisions (closed)" table with a one-line rationale.
- Deferred decisions stay in the "Deferred decisions" section until they are resolved, then move into the decisions table if they become meaningful long-term project memory.
- If a decision is reversed, strike-through the old row and add a new one below.

# Milk Dreams — Agents Memory

Operative memory for the project. Update when decisions change. Read this before touching code.

> **Multiplayer**: the project now ships with optional online multi for ~10–20 friends. Before touching anything network-related (Colyseus server, remote players, ranking, round timer, reconnect, leaderboard), read [`MULTIPLAYER.md`](./MULTIPLAYER.md). It owns the multiplayer roadmap, decisions and current state.

## Language (player-facing copy)

**All in-game UI is English**: HTML `lang`, HUD labels, dream names (`progression.ts`), toasts, game-over messages, scoreboard, loading screen, and accessibility strings. Agent chat and Cursor **skills** may stay in Spanish; that does not change the product language.

## What this is

A short prototype in pure Three.js (no React, no R3F) based on the folk tale of *La Lechera*. A milkmaid has to carry a jug of milk from A to B across a dreamlike world. The core tension is *not spilling*. Dreams appear as flavor and narrative, not as hard mechanics.

## Current phase

**Post-V0 iteration.** The core loop exists and is playable in both
single-player and optional multiplayer. Current work is in feel tuning,
level authoring, presentation polish, and keeping the multiplayer stack
robust for casual internet play.

## Stack

- Three.js (pure)
- Vite
- TypeScript
- `pnpm` as package manager
- DOM + CSS for HUD
- Colyseus 0.17 server in `server/` for multiplayer
- `shared/` workspace package for gameplay constants and wire shapes that
  must agree across client and server
- No physics engine (no Rapier). Jug balance is still pure math in
  `client/game/jugBalance.ts`.
- Desktop first. Gamepad and touch are explicitly out.

## Current game snapshot

- Desktop third-person controls:
  `W/S` move, `A/D` turn, arrow keys balance the jug, hold left mouse to
  free-look, `R` restart, `Space` / `Enter` toggle the instructions panel. There
  is **no pointer lock** anymore.
- Single-player remains fully playable offline. Multiplayer is opt-in and
  non-blocking: if the server is unreachable, the local game keeps running.
- Dream progression is real now: different dreams, different jug scales,
  balance multipliers, reward animals, cumulative litres, round HUD, and
  game-over / scoreboard flows.
- The meadow is no longer a flat placeholder only: it includes authored
  paths, houses, trees, tweet billboards, a minimap, a dream preview,
  soundtrack, and goal props.
- There is an in-browser level editor behind `?editor=1`. Authoring data
  lives in `public/levels/level-01.json`; the loader can optionally prefer
  a derived runtime artifact via `VITE_LEVEL_RUNTIME_PATH` and fall back to
  the JSON source. Supporting client authoring code lives under
  `client/editor/` + `client/game/level*`.

## Still out of scope

- Real physics / fluid simulation / Rapier
- Mobile / touch / gamepad support
- Authentication / accounts
- Serious anti-cheat beyond the current casual-friends threat model
- Matchmaking / lobbies / private-room productisation
- Saves / progression metagame / settings menus

## Folder layout

```
lechera/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  public/
    assets/            (HUD icons, music, cover art)
    hdri/              (sky panoramas)
    levels/            (authored level JSON)
    models/            (optimized GLBs used at runtime)
  client/
    main.ts
    app/
      bootstrap.ts     (renderer, scene, camera, base tonemapping and fog)
      resize.ts        (single centralized resize handler)
    audio/
      music.ts         (background loop bootstrap)
    editor/
      levelEditor.ts   (browser level editor, enabled with `?editor=1`)
    systems/
      input.ts         (desktop controls, hold-to-look, R restart)
    game/
      level.ts         (authored meadow, obstacles, spawn, goal, path meshes)
      levelDefinition.ts
      levelLoader.ts
      player.ts        (kinematic controller, collisions, bumps)
      jugBalance.ts    (tilt / spill simulation)
      progression.ts   (dream names, animals, balance scaling)
    render/
      cameraRig.ts     (follow camera with damping and freelook support)
      sky.ts           (HDRI environment)
    net/
      multiplayer.ts   (Colyseus client, round lifecycle, self/remotes)
      remotePlayers.ts
      leaderboard.ts
    ui/
      hud.ts           (DOM HUD + scoreboard)
      minimap.ts
      dreamPreview.ts
      nameModal.ts
      styles.css
  shared/
    src/               (dream goals, spawn ring, name sanitisation, leaderboard types)
  server/
    src/               (Colyseus room, HTTP leaderboard, Supabase persistence)
```

Systems are factories (`createXxx`) rather than classes so dependencies stay explicit. The main loop uses `renderer.setAnimationLoop` and clamps `dt`.

## Open tuning questions

These should be answered by *playing*, not by theorizing:

- Does `jugBalance` reward anticipation and smooth movement, or is it still
  too easy to brute-force with the arrow keys? (`client/game/jugBalance.ts`)
- Are turn inertia, obstacle bumps, and player-player bumps producing
  satisfying failures instead of cheap-feeling spills?
- Is the round pacing right for multiplayer, or do 3-minute rounds /
  10-second scoreboard windows need another tuning pass?
- Is the authored default level readable and fun enough, or do the current
  house/tree/billboard placements need another layout iteration?

Do not rewrite these as mechanics before tuning the numbers first.

## Rules of thumb for this project

- Do not add an asset or library until a mechanic needs it.
- Do not touch physics engines until `jugBalance` demonstrably does not work as pure math.
- HUD in DOM. 3D UI only when it is diegetic.
- Gameplay emits state and events. UI observes. UI never drives gameplay.
- Multiplayer is additive, not a replacement for the offline game.
- Anything that must agree across client and server belongs in `shared/`.
- Level authoring data should live in JSON / editor-friendly structures, not
  as ad-hoc constants buried in render code.
- Keep `dt` clamped, no fixed-frame logic.

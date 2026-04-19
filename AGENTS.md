# Milk Dreams — Agents Memory

Operative memory for the project. Update when decisions change. Read this before touching code.

> **Multiplayer**: the project is being extended with online multi for ~10–20 friends. Before touching anything network-related (Colyseus server, remote players, ranking, round timer), read [`MULTIPLAYER.md`](./MULTIPLAYER.md). It owns the multi roadmap, decisions and current state.

## Language (player-facing copy)

**All in-game UI is English**: HTML `lang`, HUD labels, dream names (`progression.ts`), toasts, game-over messages, scoreboard, loading screen, and accessibility strings. Agent chat and Cursor **skills** may stay in Spanish; that does not change the product language.

## What this is

A short prototype in pure Three.js (no React, no R3F) based on the folk tale of *La Lechera*. A milkmaid has to carry a jug of milk from A to B across a dreamlike world. The core tension is *not spilling*. Dreams appear as flavor and narrative, not as hard mechanics.

## Current phase

**Phase 1 — Core loop and mechanic** (see `phased-game-workflow.md` in the skill).

We are validating whether the *don't spill* fantasy is engaging at all. Everything else is scope creep until v0 works.

## Stack

- Three.js (pure)
- Vite
- TypeScript
- `pnpm` as package manager
- DOM + CSS for HUD
- No physics engine (no Rapier). `spillMeter` is a plain variable driven by kinematic derivatives.
- Desktop first (WASD + mouse, pointer lock). Gamepad and touch are explicitly out.

## V0 spec (current target)

Game is a single flat plane with:
- spawn point
- goal point with visible ring
- 3–4 simple box obstacles
- third-person camera rig with mouse look
- player as capsule with a small nose cone and a tiny jug on top (visual hints only)

Mechanics:
- WASD moves relative to camera yaw
- mouse rotates the camera
- pointer lock on click
- R restarts
- `spillMeter` fills from three channels:
  - sharp turns (yaw rate above threshold)
  - lateral acceleration above threshold
  - bump impulse from colliding with obstacles
- meter leaks slowly when calm
- reach goal with meter < 100% = win
- meter hits 100% = fail

Nothing else.

## What is explicitly out of V0

- final 3D assets for character, jug, environment
- audio and music
- dream sequences / cutscenes / narrative
- real physics (sloshing, Rapier)
- open world, multiple levels, progression
- main menu, settings, saves, localization
- mobile and touch
- tuning tier system, adaptive quality, benchmarks

## Folder layout

```
lechera/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  public/
    assets/            (provisional cover and future static assets)
  src/
    main.ts
    app/
      bootstrap.ts     (renderer, scene, camera, base tonemapping and fog)
      resize.ts        (single centralized resize handler)
    systems/
      input.ts         (WASD + mouse look + pointer lock + R restart)
    game/
      level.ts         (ground, obstacles, spawn and goal)
      player.ts        (kinematic controller, yaw rate, lateral accel, bumps)
      spillMeter.ts    (three-channel meter with leak)
    render/
      cameraRig.ts     (follow camera with spring damping and pitch clamp)
    ui/
      hud.ts           (DOM HUD: spill, distance, status, hint)
      styles.css
```

Systems are factories (`createXxx`) rather than classes so dependencies stay explicit. The main loop uses `renderer.setAnimationLoop` and clamps `dt`.

## Open tuning questions

These should be answered by *playing*, not by theorizing:

- Does the spill meter punish fast steady movement or only bad driving? It should reward flow and punish panic.
- Are the thresholds for yaw rate and lateral accel feeling right? (See `src/game/spillMeter.ts` constants.)
- Is the obstacle bump impulse too harsh / too lenient?
- Is the natural leak rate too generous?

Do not rewrite these as mechanics before tuning the numbers first.

## Next phases (do not start yet)

- **Phase 2** — feel and structure: iterate on controller, tune numbers, polish camera, maybe add a first pass of audio cues.
- **Phase 3** — presentation: replace placeholders, introduce the dreamlike aesthetic with intention.
- **Phase 4** — content: more layouts, dream moments as flavor, small narrative beats.

## Rules of thumb for this project

- Do not add an asset or library until a mechanic needs it.
- Do not touch physics engines until `spillMeter` demonstrably does not work as pure math.
- HUD in DOM. 3D UI only when it is diegetic.
- Gameplay emits state and events. UI observes. UI never drives gameplay.
- Keep `dt` clamped, no fixed-frame logic.

# Milk Dreams

Pure Three.js prototype. No React.

## Dev

```bash
pnpm install

# client only
pnpm dev

# multiplayer server only
pnpm dev:server

# shared watcher + server + client
pnpm dev:all
```

Open the printed URL from `pnpm dev`.

- Local single-player works with just the Vite client.
- Optional multiplayer uses the Colyseus server on `ws://localhost:2567`.
- The browser level editor is available at `?editor=1`.

## Controls

- WASD: move
- A/D: turn
- Arrow keys: balance the jug
- Hold left mouse: look around
- R: restart

## Status

The project is beyond the old V0 snapshot: it now includes dream
progression, authored level content, soundtrack, optional multiplayer,
and a browser level editor.

See `AGENTS.md` for the current project memory and `MULTIPLAYER.md` for
the network roadmap / architecture.

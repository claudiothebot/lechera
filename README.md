# La Lechera

Sitio y prototipo independiente de La Lechera.

## Scripts

- `pnpm build` genera `dist/`
- `pnpm start` sirve `dist/` en `127.0.0.1:${PORT:-19908}`

## Estructura

- `public/` contiene el sitio estático
- `public/play/` contiene el prototipo jugable actual
- `server.mjs` sirve la build de producción

## Dominio

Pensado para publicarse en `lechera.anto.codes` mediante `cloudflared`.

# Build and Deploy

## Objetivo
Pasar de `pnpm dev` a algo jugable en un dominio público sin romper assets, sin inflar el bundle y sin que los usuarios arrastren cachés viejas.

## Regla principal
**El juego en producción no es el juego en desarrollo.**
Compresión de assets, cache busting, target de navegadores y políticas de carga se decide antes del primer deploy, no después del primer bug.

## Stack por defecto (ver `default-project-stack.md`)
- Vite como bundler.
- TypeScript.
- `public/` para estáticos (modelos, texturas, audio).
- `src/` para código.

Vite resuelve la mayoría de decisiones sanas por defecto. No cambiar sin motivo.

## Targets de navegador
Definir explícitamente en `package.json` o config de Vite:
- desktop moderno (últimas 2 versiones mayores de Chrome/Firefox/Safari/Edge).
- móvil moderno según objetivo real del juego.

Evitar soportar navegadores que no tienen WebGL2 salvo requisito claro. Declarar el soporte en el README.

## Bundle del código
- sin dependencias gigantes innecesarias. Cada addon cuenta.
- tree-shaking: importar desde submódulos (`three/examples/jsm/loaders/GLTFLoader.js`), no barrels enormes.
- code splitting por rutas/pantallas si hay menú grande: el gameplay no debería tirar del bundle del editor de mapas.
- dynamic imports para sistemas opcionales (debug panel, benchmarks, level editor).

## Assets: pipeline
- modelos en **glTF / glb** con **Draco** o **Meshopt** (ver `gltf-pipeline.md`).
- para **inspección y optimización reproducible** del binario: CLI **gltf-transform** (`@gltf-transform/cli`, ver sección homónima en `gltf-pipeline.md`).
- texturas en **KTX2** con **Basis Universal** para juegos con mucha textura. Para proyectos pequeños, WebP/AVIF es aceptable.
- audio en **ogg/webm-opus** (ver `audio-systems.md`).
- atlas de sprites/íconos para HUD.

Tener un paso de build de assets separado (script), no improvisarlo a mano cada vez.

## Tamaño y descarga
Decidir estrategia antes del deploy:
- **todo precargado**: juegos pequeños. Splash con progreso, luego a gameplay.
- **streaming por nivel/zona**: más complejo, necesita loader central (ver `assets.md` y `world-generation.md`).
- **lazy de sistemas opcionales**: debug, editores, escenas de stress.

Servir con `Content-Encoding: br` (Brotli) o `gzip`. Verificarlo en prod, no asumirlo.

## Cache busting
- el build de Vite añade hashes al nombre de assets bundled.
- assets en `public/` **no** llevan hash por defecto: responsabilidad tuya.
  - o añadirles hash en el pipeline de build de assets.
  - o versionar el directorio (`/assets/v3/...`) cuando cambie.
- `index.html` debe servirse con `no-cache` o `max-age=0` para que el usuario no quede atrapado en una versión vieja.
- el resto (JS, CSS, assets con hash) puede ir con `immutable, max-age=31536000`.

## Service Worker y offline
- útil para PWA o juegos offline.
- peligroso si se implementa mal: usuarios pueden quedar cacheados en una versión rota.
- si se usa, planificar invalidación explícita al cambiar versión.
- por defecto, no añadir SW hasta que haya necesidad clara.

## HTTPS y embeds
- `AudioContext`, gamepad, fullscreen y pointer lock requieren contexto seguro.
- desarrollar y publicar sobre HTTPS.
- si el juego va embebido en iframe externo, probar pointer lock, audio y fullscreen desde el principio; romper bien temprano es mejor que romper en el lanzamiento.

## Hosting
Sana mezcla para juegos web:
- estáticos + CDN (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3+CloudFront).
- si hay backend (multiplayer, leaderboards), separar front y back; no mezclar en un monolito por comodidad.
- dominio propio desde el principio si el proyecto es “serio”, para no migrar URLs después.

## Entornos
- `dev`: HMR, source maps completos, debug panel, benches accesibles.
- `staging`: build de producción pero con debug behind flag; targets reales de navegador.
- `prod`: debug detrás de flag, telemetría mínima si aplica, no assets placeholder.

Variables de entorno (`import.meta.env.VITE_*`) para flags. No dejar toggles hardcoded.

## Source maps
- sí generarlos para debuggear crashes en producción.
- no publicarlos en el mismo endpoint del bundle si prefieres ocultar el código: servirlos desde un path privado o cargarlos solo cuando se necesite.
- minimum: subirlos al servicio de error reporting (si hay).

## Crashes y errores en producción
- `window.onerror` y `onunhandledrejection` enganchados a un sink mínimo (puede ser consola + localStorage de últimos errores, o un servicio).
- incluir en reportes: build version, commit, WebGL capabilities, user agent.
- no bloquear el juego por errores no fatales; mostrar aviso discreto.

## WebGL capability check
- detectar soporte de WebGL2 al arrancar.
- mensaje claro si el navegador/GPU no lo permite; no dejar pantalla negra.
- detectar `OES_texture_float_linear`, extensiones concretas, y degradar features si faltan.

## Performance en primera carga
- HTML crítico mínimo, canvas y splash temprano.
- diferir scripts no bloqueantes.
- precargar assets críticos del primer nivel al mismo tiempo que se inicializa el renderer.
- LCP/TTI razonables: un juego que tarda 20s sin feedback pierde usuarios antes de jugar.

## Versionado
- `version` en `package.json`, expuesto en la UI (pantalla de título, debug).
- etiquetar cada release con tag de git.
- payload de save también guarda la versión para detectar incompatibilidades (ver `persistence-save.md`).

## CI/CD mínimo
- linter + type-check en PRs.
- build de producción en CI para detectar roturas antes del merge.
- deploy automático a staging en merges a main.
- deploy a producción manual, con tag.

No hace falta pipeline industrial. Sí hace falta “no subir a prod a mano desde tu portátil”.

## Anti-patrones
- `localStorage`/`window` tocados directamente desde código que dependa del entorno (SSR no aplica aquí, pero probar build de prod sin desarrollo local sí).
- assets en `public/` sin estrategia de cache busting.
- `index.html` cacheado agresivamente.
- meter un Service Worker sin plan de invalidación.
- publicar con source maps en el mismo CDN público sin darse cuenta.
- no comprobar capacidades WebGL y dejar pantalla negra.
- confiar en que Brotli está activo sin verificarlo.
- telemetría sin consentimiento o sin control claro.

## Recomendación fuerte
Antes del primer deploy público:
- targets de navegador declarados.
- pipeline de assets con compresión.
- cache busting resuelto para `public/`.
- `index.html` no cacheado; el resto con hash + `immutable`.
- error reporting mínimo.
- version visible en UI.
- WebGL capability check con mensaje.

## Referencias asociadas
- `default-project-stack.md`
- `assets.md`
- `gltf-pipeline.md`
- `audio-systems.md`
- `persistence-save.md`
- `mobile-performance.md`

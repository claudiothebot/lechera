# UI and HUD

## Objetivo
Decidir cómo estructurar HUD, menús y overlays en un juego Three.js puro sin meter frameworks innecesarios ni esconder lógica de juego dentro de la capa de UI.

## Regla principal
**La UI refleja estado de juego, no lo dicta.**
Gameplay publica eventos/estado. UI se suscribe y pinta. Nunca se llama lógica de gameplay desde un `onClick` del menú.

## Decisión base: DOM vs canvas 3D
Por defecto:
- **DOM/CSS** sobre el canvas para HUD, menús, diálogos, opciones.
- **Canvas 3D** (sprites, meshes con textura) solo para UI diegética (marcadores en el mundo, health bars sobre personajes, minimapa integrado).

Razones:
- DOM gana en accesibilidad, layout, texto y localización.
- DOM cuesta poco y no compite por draw calls del juego.
- Canvas 3D conviene cuando la UI es parte del mundo (HMD, cockpit, panel físico).

Casos intermedios (HUD muy artístico con animaciones ricas): DOM con CSS/SVG o WebGL aparte, pero no meterlo en el render principal salvo necesidad.

## Stack mínimo
- HTML plano en `index.html` para el shell (canvas + contenedor de overlays).
- CSS para layout.
- Sin framework de UI por defecto. Si el juego tiene muchas pantallas, considerar algo muy ligero (no montar React solo para menús).
- Event bus o store simple del juego como fuente de verdad para la UI.

## Estructura típica del shell

```html
<div id="app">
  <canvas id="game"></canvas>
  <div id="hud"></div>
  <div id="menus"></div>
  <div id="toasts"></div>
</div>
```

Capas:
- `#game`: canvas de Three.js, fill-screen.
- `#hud`: overlay siempre visible, `pointer-events: none` salvo en elementos interactivos.
- `#menus`: pantallas modales (pausa, settings, game over).
- `#toasts`: feedback efímero.

## Pointer events y input
- El canvas recibe input de gameplay.
- HUD debe ser `pointer-events: none` por defecto para no robar clicks. Solo los botones concretos reactivan `pointer-events: auto`.
- Si hay UI modal abierta, gameplay debe ignorar input mientras la UI lo consume. Idealmente el input system conoce un `inputContext` (gameplay, menu, dialog) y enruta.

## Acoplamiento sano gameplay ↔ UI
Patrón:
1. Gameplay expone estado (`player.health`, `run.score`, `world.currentObjective`).
2. Gameplay emite eventos de dominio (`onObjectiveReached`, `onRunFailed`, `onPause`).
3. UI observa estado o se suscribe a eventos y pinta.
4. UI nunca muta estado de gameplay directamente. Llama a *commands* bien definidos (`pause()`, `requestRestart()`, `setSettingsVolume()`).

Así se pueden cambiar HUDs sin tocar gameplay y testear gameplay sin UI.

## Data flow recomendado
Para estado simple: un objeto `GameState` + callbacks.
Para más juego: un pequeño store con suscripción (no hace falta Redux, basta un `Map<string, Set<Listener>>`).

Evitar:
- consultar `scene.getObjectByName(...)` desde la UI
- que el HUD tenga su propia verdad sobre `playerHealth` distinta a la de gameplay

## Resize y pixel ratio
- HUD escala con el viewport. Evitar tamaños absolutos en px para elementos críticos; usar `clamp()` o variables CSS derivadas del viewport.
- Tener en cuenta safe areas en móvil (`env(safe-area-inset-*)`).
- El HUD no debe depender del `renderScale` del renderer: eso solo afecta al canvas.

## HUD 3D diegético
Cuando el HUD vive en el mundo:
- Usar `Sprite` para marcadores que siempre miran a cámara.
- Health bars sobre personajes: plano texturizado con `depthTest` apropiado.
- Evitar texto 3D real (coste de geometría) salvo que sea estilo. Preferir texturas de texto pre-renderizadas o atlas.
- Para mucho texto dinámico, valorar `troika-three-text` (addon externo) con criterio.

## Menús y pantallas
- Estado de menú como máquina simple: `boot → mainMenu → gameplay → paused → gameOver → mainMenu`.
- Cada pantalla es un componente/nodo DOM que se muestra/oculta.
- Transiciones cortas con CSS, sin bloquear el loop del juego.
- Pausa real: el loop del juego sigue renderizando pero para el tiempo de simulación (`dt = 0`). Así el mundo queda quieto pero la escena sigue viva visualmente.

## Accesibilidad y localización
- Usar elementos semánticos (`button`, `dialog`, roles ARIA) en DOM.
- Tamaños mínimos tocables en móvil (~44px).
- Textos centralizados en un módulo de i18n aunque sea un `Record<string, string>` para empezar.
- No hardcodear texto en plantillas sueltas.

## Performance
- DOM tranquilo no compite con el render. Animaciones CSS pesadas (sombras grandes, blurs) sí pueden costar, sobre todo en móvil.
- Evitar reflows por frame (tocar `layout` en cada update). Batch de cambios o escritura en variables CSS.
- Canvas 2D para HUDs muy dinámicos con muchos elementos puede ser más barato que DOM.

## Minimapa / radar barato (Canvas 2D)

Para **orientación** (goal, spawn, obstáculos) no hace falta un segundo render pass Three.js ni RTT de la escena.

Patrón:
- Un `<canvas>` 2D en el overlay DOM (misma resolución lógica, `devicePixelRatio` en el backing store si quieres nitidez).
- Cada frame: `clearRect`, dibujar puntos/rectángulos en **coordenadas de mundo → píxeles** con escala `metrosPorPixel = radioMetros / (tamañoCanvas/2)`.
- **Radar player-up**: `ctx.translate(cx, cy); ctx.rotate(facing − π)` (o la convención que encaje con tu `forward = (sin f, cos f)`), dibujar goal/spawn/obstáculos **debajo** de esa rotación; el icono del jugador (triángulo) y una marca cardinal fija **encima**, sin rotar, para que “arriba = adelante del personaje”.
- Goal fuera de rango: proyectar al borde del círculo (clamp por magnitud) y dibujar una **flecha apuntando radial hacia fuera** (rotada para que su apex coincida con la dirección al goal).

Ventaja frente a `WebGLRenderTarget` + cámara cenital: coste casi nulo (~docenas de primitivas 2D por frame), sin segundo frustum ni limpieza de depth. Ver también `render-target-families.md` cuando sí necesitas **la vista real** texturizada (mapa “fotográfico”, niebla de guerra, etc.).

## Debug UI
Separada del HUD final, activable por tecla o query param:
- FPS y frame time
- counters (`renderer.info`)
- estado del jugador
- toggles rápidos

Nunca dejar debug UI cargada en producción sin detrás de un flag.

## Anti-patrones
- montar React/Vue/Svelte para un HUD de 4 indicadores
- UI que lee del scene graph en lugar de del estado del juego
- `onClick` que hace gameplay directo (mover personaje, disparar)
- HUD con z-index enfrentado al canvas resuelto a base de `!important`
- texto 3D real para cada número del HUD
- no distinguir pausa de juego de pausa visual
- bloquear input global sin máquina de contextos
- localización metida a mano en múltiples sitios

## Recomendación fuerte
Desde el día 1:
- shell HTML con capas `hud`, `menus`, `toasts`
- `pointer-events: none` en HUD por defecto
- store o event bus simple como fuente de verdad
- máquina de estados de pantallas
- textos por clave, aunque sea un único idioma al principio

## Referencias asociadas
- `architecture.md`
- `input-controls.md`
- `audio-systems.md`
- `persistence-save.md`

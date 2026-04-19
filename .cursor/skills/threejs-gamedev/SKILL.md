---
name: threejs-gamedev
description: Build, extend and review web games with pure Three.js (no React or R3F). Covers architecture, render loop, assets, input, physics integration, rendering/RTT, performance and mobile trade-offs, audio, UI/HUD, cameras, shaders, AI/navigation, persistence, build/deploy and debugging. Use for singleplayer-first 3D/2.5D web games where control and clarity matter more than framework convenience. Not for React Three Fiber projects.
---

# Three.js Gamedev

Trabajar con Three.js puro. No mezclar React ni R3F salvo que el usuario lo pida explícitamente.

## Workflow

1. Si el usuario quiere empezar un juego nuevo, cerrar primero kickoff, stack y primer slice jugable.
2. Identificar el problema principal.
3. Leer solo las referencias necesarias (ver *Uso del contexto*).
4. Preferir patrones mantenibles antes que demo code.
5. Tratar docs/manual/examples/repo oficial como base canónica.
6. Usar DeepWiki para preguntas concretas sobre estructura o implementación del repo oficial cuando ayude.
7. Usar la búsqueda semántica del foro oficial (Discourse AI) para edge cases, dolores recurrentes o preguntas específicas del ecosistema.
8. Explicitar tradeoffs de rendimiento, móvil y complejidad cuando importen.

## Uso del contexto

La skill tiene muchas referencias. Cargarlas todas en un turno es un anti-patrón.

Reglas duras:
- **Máximo 3 referencias por turno** salvo justificación clara.
- **Nunca leer el bloque avanzado de multiplayer si el proyecto es singleplayer**.
- Si el usuario pregunta algo transversal, leer primero el router de abajo y elegir; si sigue sin estar claro, preguntar antes de leer.
- Si una referencia remite a otra, no encadenar lecturas sin criterio: evaluar si la segunda de verdad cambia la respuesta.

## Router rápido

Intención del usuario → referencia por la que empezar.

- *"Quiero empezar un juego"* → `game-kickoff-planning.md`, luego `default-project-stack.md`.
- *"¿Cómo organizo el código?"* → `architecture.md`.
- *"¿En qué orden ataco el proyecto?"* → `phased-game-workflow.md`.
- *"Carga de modelos/texturas/audio"* → `assets.md`, y si hay 3D complejo `gltf-pipeline.md` (incluye **gltf-transform** para inspección/optimización de GLB).
- *"Texturas: maps, color space, tiling, compresión"* → `texturing-pipeline.md` (incluye **ribbon meshes sobre curvas** para caminos/ríos).
- *"El cielo se ve feo / materiales PBR apagados"* → `lights-shadows.md` sección **IBL con HDRI**.
- *"Cargar GLBs/HDRIs sin bloquear el boot"* → `assets.md` sección **placeholder first, swap later** (+ disposal correcto).
- *"Animaciones de personaje"* → `animation-systems.md` + `animation-state-machines.md`.
- *"Mover al jugador / cámara de seguimiento"* → `character-locomotion.md` + `cameras.md`.
- *"Tank / sin strafe, girar con A-D"* → `character-locomotion.md` sección **tank / vehicle-lite**.
- *"Mirar alrededor con el ratón sin que la cámara rompa el control"* → `cameras.md` (**seguimiento + offset**) + `input-controls.md` (**hold-to-look / pointer capture**).
- *"Minimapa o radar sin otro render pass"* → `ui-hud.md` (**Canvas 2D**), no `render-targets.md` salvo que necesites ver el mundo texturizado.
- *"Input (teclado, touch, gamepad)"* → `input-controls.md`.
- *"Necesito física"* → `physics.md`.
- *"Mundo grande / streaming / proceduralismo"* → `world-generation.md`.
- *"Limpiar recursos / memory leak"* → `resource-lifecycle.md`.
- *"Va lento en móvil"* → `mobile-performance.md` + `profiling-budgets.md`.
- *"¿Es GPU, CPU o stutter?"* → `gpu-vs-cpu-heuristics.md` + `frame-pacing-stutter.md`.
- *"Animaciones distorsionan el mesh (scale de hueso raíz, root motion no deseado)"* → `gltf-pipeline.md` sección **tracks de scale**.
- *"Quality settings y escalado"* → `quality-tiers.md` + `adaptive-quality-scaling.md`.
- *"Benchmark y regresiones"* → `benchmarking.md` + `stress-scenes-benchmarks.md`.
- *"Luces y sombras"* → `lights-shadows.md`.
- *"Espejos, portales, minimapas, agua"* → `render-targets.md` + `render-target-families.md` (+ `portal-*` o `minimap-fog-of-war.md` según caso).
- *"Transparencias que se ven raras"* → `transparency-pitfalls.md`.
- *"Postpro (bloom, SSAO, etc.)"* → `postprocessing.md`.
- *"Audio del juego"* → `audio-systems.md`.
- *"HUD, menús, overlays"* → `ui-hud.md`.
- *"Shader custom (dissolve, water, terrain blend, etc.)"* → `custom-shaders.md`.
- *"Pathfinding / enemigos / IA"* → `ai-navigation.md`.
- *"Guardar partida, progreso, settings"* → `persistence-save.md`.
- *"Build, compresión de assets, deploy"* → `build-deploy.md`.
- *"Debug visual"* → `debugging.md`.
- *"Multiplayer"* → ir a *Bloque avanzado* (bajo demanda explícita).

## Defaults

- Three.js puro como base.
- `glTF` como formato principal de assets 3D.
- `setAnimationLoop` como loop por defecto.
- Separar bootstrap, render, world/systems y gameplay cuando el proyecto lo pida.
- Mantener addons explícitos y minimizados.
- Diseñar primero para claridad, luego para optimización.
- **Singleplayer first** salvo requisito claro de multiplayer.

## Mapa de referencias

### Kickoff y defaults de proyecto
- `references/game-kickoff-planning.md` para preguntas iniciales, kickoff brief y primer slice jugable.
- `references/phased-game-workflow.md` para forzar fases, validar mecánica antes de polish y evitar scope explosion.
- `references/threejs-game-viability.md` para viabilidad general, límites sanos, ideas que encajan bien e inspiración con scope realista.
- `references/default-project-stack.md` para stack por defecto, estructura de carpetas, Rapier y criterio singleplayer-first.
- `references/default-content-sourcing.md` para fuentes opinionadas de assets, texturas y audio provisional.
- `references/project-agents-md.md` para usar `AGENTS.md` como memoria operativa por juego.

### Core y gameplay
- `references/architecture.md` para estructura, bootstrap, loop, resize y lifecycle.
- `references/assets.md` para formatos, loaders e importación.
- `references/gltf-pipeline.md` para export, carga coordinada, compresión e instanciación.
- `references/texturing-pipeline.md` para maps, color space, tiling/anisotropy, compresión y blending de terreno.
- `references/animation-systems.md` para clips, mixers, actions y blending.
- `references/animation-state-machines.md` para estados visuales, transiciones y one-shots.
- `references/character-locomotion.md` para player controllers, grounded state, cámara, locomotion state y variantes (**tank controls** cuando el strafe compite con otra mecánica).
- `references/cameras.md` para follow cameras, spring-damped, orbital, cinematic y collision-aware.
- `references/input-controls.md` para input abstraction, teclado, touch, gamepad y raycasting.
- `references/physics.md` para integración de motor físico y límites de responsabilidad.
- `references/world-generation.md` para streaming, chunking y contenido procedural.
- `references/ai-navigation.md` para pathfinding, nav meshes, steering y behavior simple.
- `references/resource-lifecycle.md` para ownership, limpieza y `dispose()`.

### Presentación y UX
- `references/audio-systems.md` para buses, spatial audio, loading y pool de voces.
- `references/ui-hud.md` para HUD, menús, overlays DOM vs canvas y acoplamiento sano.
- `references/persistence-save.md` para guardar partida, progreso y settings.

### Performance y validación
- `references/mobile-performance.md` para presupuestos y reducción de coste.
- `references/profiling-budgets.md` para frame time, draw calls y budgets reales.
- `references/gpu-vs-cpu-heuristics.md` para distinguir cuello visual, lógico, mixto o stutter.
- `references/frame-pacing-stutter.md` para picos, warmup y activación suave.
- `references/quality-tiers.md` para presets coherentes por dispositivo.
- `references/adaptive-quality-scaling.md` para histéresis, cooldown y `renderScale`.
- `references/stress-scenes-benchmarks.md` para benches internos y escenas de estrés.
- `references/benchmarking.md` para runs reproducibles, diffs, thresholds y clasificación final (reporting + diffs + thresholds unificados).

### Rendering, RTT y lighting
- `references/render-targets.md` para RTT como subsistema, resolución, frecuencia y lifecycle.
- `references/render-target-families.md` para mirrors, refractors, portals y minimaps.
- `references/portal-recursion.md` para profundidad, resolución por nivel y fallbacks.
- `references/portal-masking-stencil-scissor.md` para recorte de área, stencil y overdraw.
- `references/minimap-fog-of-war.md` para minimapas tácticos, visibilidad y explored state.
- `references/fog-mask-blending.md` para masks y blending de fog.
- `references/transparency-pitfalls.md` para sorting, depth, alpha test y decisiones sanas con materiales transparentes.
- `references/lights-shadows.md` para estrategia de iluminación y shadow maps.
- `references/postprocessing.md` para cadenas de effects, resize y criterio de uso.
- `references/custom-shaders.md` para `ShaderMaterial`, `onBeforeCompile`, patrones comunes y anti-patrones.

### Debug y build
- `references/debugging.md` para helpers e inspección visual.
- `references/build-deploy.md` para Vite build, compresión de assets, cache busting y deploy.

### Bloque avanzado (solo bajo demanda explícita)
No cargar estas referencias por defecto. Entrar aquí solo si el usuario declara multiplayer como core del juego, o si va a añadirlo a un proyecto singleplayer existente.

- `references/multiplayer.md` para arquitectura base de red, snapshots, interest management y **stack concreto recomendado (Colyseus)** con sus gotchas en 0.17.
- `references/multiplayer-consistency-models.md` para rollback, lockstep e hit validation.
- `references/server-rewind-weapons.md` para rewind o lag compensation por arma.
- `references/anti-cheat-anomalies.md` para telemetría, scoring de sospecha y mitigaciones.

Default sano para juegos casual / cooperativo / competitivo ligero: empezar por `multiplayer.md` y plantear Colyseus con monorepo (`client/` + `server/`). Saltar a los otros tres solo si el género lo justifica.

## Reglas de criterio

- No copiar la documentación oficial dentro de la skill.
- No presentar demo code como arquitectura de producción.
- Marcar qué es core, qué es addon y qué es doctrina de proyecto.
- Recomendar herramientas externas solo cuando añadan un pipeline claro.
- Si una decisión afecta móvil o rendimiento, explicitar el tradeoff.
- Si una referencia declara un anti-patrón, no contradecirlo sin justificar por qué este caso es excepción.

## Fuentes base

- `threejs.org/docs`
- `threejs.org/manual`
- `threejs.org/examples`
- `github.com/mrdoob/three.js`
- DeepWiki sobre el repo oficial como ayuda puntual
- búsqueda semántica del foro oficial (`/discourse-ai/embeddings/semantic-search.json`) como ayuda puntual para problemas concretos

## Estado actual

**v1.3**. Añadidos aprendizajes de un proyecto multijugador real (cliente Three.js puro + servidor Colyseus en monorepo):

- `multiplayer.md`: nueva sección **Stack concreto recomendado: Colyseus** con cuándo elegirlo, cuándo no, y los **gotchas de la 0.17** que cuestan tiempo (`MapSchema` no iterable, `getStateCallbacks` reemplaza a `onAdd`/`onRemove` directos, hidratación tardía del estado, `useDefineForClassFields: false`, `@types/express` para Express 5). También: patrón de integración con conexión no bloqueante, `MultiplayerHandle` único como capa de aislamiento, identidad visual determinista server-side (color hue desde paleta fija), y smoke test multi-cliente headless.
- `animation-systems.md`: sección **Gotchas concretos al clonar SkinnedMesh** (no vale `Object3D.clone`, exports nombrados de `SkeletonUtils.js`, materiales y geometrías compartidos por el clone, regla de ownership en `dispose`) + patrón **source + instance** (`loadCharacterSource` / `createCharacterInstance`) para reusar GLBs entre jugador local, NPCs y remotos sin refetch ni doble parseo. Anti-patrones extendidos.

**v1.2**. Patrones genéricos probados en producción web:
- `cameras.md`: **follow detrás + yaw/pitch offset con decay** (visuales desacoplados del frame de movimiento cuando otra mecánica fija la referencia).
- `input-controls.md`: **hold-to-look** con `pointerdown` + `setPointerCapture` como alternativa a pointer lock.
- `character-locomotion.md`: **tank / vehicle-lite** (W/S eje, A/D giran; facing como estado, no derivado de velocidad).
- `ui-hud.md`: **minimapa/radar con Canvas 2D**, player-up.
- `gltf-pipeline.md`: **tracks de scale** en clips que distorsionan rigs retargeteados + sección **gltf-transform (CLI)**.
- `texturing-pipeline.md` nuevo: maps, color space, tiling, compresión y **ribbon meshes sobre curvas** para caminos/ríos.
- `lights-shadows.md`: **IBL con HDRI** (`PMREMGenerator` como `scene.environment` + `scene.background`).
- `assets.md`: **placeholder first, swap later** y recetas de `dispose()` al sustituir material/textura/render-target.

Router actualizado. El bloque avanzado de multiplayer ya tiene un default concreto (Colyseus) además de la doctrina general; sigue cargándose solo bajo demanda.

# Cameras

## Objetivo
Definir estrategias de cámara útiles para juegos Three.js: follow cameras, orbital, top-down, cinematic, collision-aware, sin acoplar la cámara al resto del juego más de lo necesario.

## Regla principal
**La cámara es un sistema, no un hijo del jugador.**
Debe consumir estado (posición, velocidad, intenciones del input) y producir una transform. No modifica gameplay ni vive pegada en el grafo del personaje.

## Elegir tipo de cámara antes que código
Pregunta de kickoff obligatoria (ver `game-kickoff-planning.md`): ¿primera persona, tercera, top-down, lateral, libre? Cada una implica tradeoffs distintos en input, colisiones, render y UI.

## Patrones principales

### 1. Follow camera (3ª persona)
- target offset en espacio del personaje (detrás y arriba).
- interpolación suave (spring-damped o `damp()` por eje).
- rotación controlada por input (ratón, stick derecho, touch).
- mirar al punto de interés: típicamente `target + lookOffset`, no al pivote del personaje.

### 2. Orbital
- para vehículos, puzzles, modos fotografía, editores.
- basada en `OrbitControls` (addon) o implementación propia si el input es mixto.
- limitar polar y distancia para no permitir ángulos rotos.

### 3. Top-down / isométrica
- cámara ortográfica o perspectiva con FOV bajo.
- target sigue al jugador en plano horizontal con lag suave.
- zoom como otro eje controlable.
- cuidado con shadows: ortográfica necesita ajustar `shadow.camera` acorde.

### 4. First-person
- cámara hija lógica del personaje pero no literalmente del mesh.
- lookat controlado por input con clamp en pitch.
- separar posición del cuerpo de la cabeza para permitir head bob y smoothing.

### 5. Cinematic / scripted
- timeline de keyframes con posición, target y FOV.
- interpolación con easing.
- en cinemáticas cortas, congelar input de gameplay; en largas, valorar skip.

## Damping y spring
- Nunca atar la cámara directamente al personaje (`camera.position.copy(player.position)`).
- Preferir interpolación por delta time:
  - `damp(current, target, lambda, dt)` donde `lambda` controla la rigidez.
- Distintos `lambda` para posición y rotación; la rotación suele ir más rápido.
- No depender de `frameRate`: si se usa `lerp` con factor fijo, vincularlo a `dt`.

## Collision-aware (3ª persona)
Cuando un muro se mete entre cámara y personaje:
- raycast desde el target hacia la posición ideal.
- si golpea, acortar distancia hasta el punto de impacto menos un margen.
- suavizar el acortamiento para evitar snaps.
- opcional: cross-fade del personaje a translúcido si la cámara queda muy cerca.

## Shake y feedback
- shake aditivo sobre la transform final, no sobre el target.
- duración corta y decay exponencial.
- distinguir shake de daño, de impacto, de explosión; no reutilizar el mismo perfil.
- en móvil, reducir amplitud para no marear.

## FOV
- FOV como parámetro del juego, no constante perdida.
- FOV dinámico útil para speed feedback (sprint, boost). Con cuidado, límites suaves.
- En portrait vs landscape en móvil, reconsiderar FOV y framing (ver también `ui-hud.md` para safe areas).

## Aspect y resize
- `aspect = width / height` y `updateProjectionMatrix()` en cada resize.
- Para ortográficas, actualizar también `left/right/top/bottom`.
- Evitar cambios de aspect por frame; centralizar en un `resize` único (ver `architecture.md`).

## Múltiples cámaras
- una cámara principal de gameplay siempre.
- cámaras secundarias para minimapa, portales, reflejos: ver `render-targets.md` y `render-target-families.md`.
- cámara de debug (free-fly) oculta detrás de flag. Útil para verificar escena sin tocar gameplay.

## Input de cámara
- abstraer en un controlador con ejes lógicos (`aimX`, `aimY`, `zoom`).
- mapear después teclado/ratón/gamepad/touch a esos ejes (ver `input-controls.md`).
- sensibilidad y invert configurables por usuario y persistidos (ver `persistence-save.md`).

## Seguimiento detrás + offset opcional (free-look sin acoplar gameplay)

Útil cuando **otra mecánica** (equilibrio, aim secundario, dirección de empuje…) debe usar un frame de referencia estable, pero quieres que la cámara **no sea fija**.

Patrón:
1. **Yaw base de seguimiento** anclado a la orientación del personaje (p. ej. `π − facing` para quedar detrás en convención +Z/XZ habitual).
2. **Offsets de yaw/pitch** opcionales que solo existen mientras el jugador mantiene un botón de *look-around* (o mientras arrastra).
3. Al soltar, **decay exponencial** de los offsets hacia 0 (λ ~5 s⁻¹: vuelta en ~200–400 ms). La cámara vuelve sola detrás sin paso explícito por tecla.

Qué gana:
- Movimiento y otras mecánicas que usan un frame fijo **no dependen del yaw de cámara**; el jugador no “rompe” controles mirando alrededor.
- No hace falta pointer lock; el cursor puede seguir visible (ver `input-controls.md`, hold-to-look).

Qué vigilar:
- Si el movimiento sigue siendo camera-relative, los offsets rotan también el significado de “adelante”. Para evitarlo, o bien el movimiento es **world- o character-relative**, o la cámara solo **orbita visualmente** mientras el gameplay usa `facing` del personaje.
- Orden de update: calcular **facing / velocidad del personaje antes** de posicionar la cámara si el follow yaw depende de `facing`, para no introducir frame de lag evitable.

## Pause, cutscenes y takeover
- estado claro: gameplay, cinematic, menu, photo.
- en cinematic, input de gameplay silenciado; cámara consume timeline.
- transiciones entre estados con blend corto, no corte duro, salvo efecto intencional.

## Rendimiento
- Una cámara adicional activa es una render pass más si se usa RTT. Evaluar coste.
- Shadows ortográficas mal ajustadas a la cámara top-down son el primer tirón en este género.
- No usar `frustum.containsPoint` como herramienta de gameplay; es para culling.

## Debug
- helpers: `CameraHelper`, visualización de target, línea raycast de colisión.
- overlay con FOV, posición, distancia al target, estado (gameplay/cinematic).
- toggle free-fly para inspección.

## Anti-patrones
- cámara como hijo del mesh del personaje
- `camera.lookAt(player.position)` directo cada frame sin smoothing
- shake aplicado al target en vez de a la transform final
- FOV constante hardcoded en tres sitios distintos
- `lerp` con factor fijo sin `dt`
- no limitar pitch en primera persona (se da la vuelta hacia arriba)
- collision-aware que teletransporta la cámara al detectar pared
- misma cámara para gameplay y minimapa compartiendo transform

## Recomendación fuerte
Modelar desde el principio:
- `CameraRig` con estado de cámara (`gameplay`, `cinematic`, `debug`).
- target y transform final separados.
- damping por dt y parámetros externos.
- collision-aware opcional con raycast.
- input mapeado a ejes lógicos.

## Referencias asociadas
- `architecture.md`
- `character-locomotion.md`
- `input-controls.md`
- `render-targets.md`
- `lights-shadows.md`

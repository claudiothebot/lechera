# Input and Controls

## Objetivo
Diseñar una capa de input robusta para juegos en Three.js puro sin acoplar el gameplay directamente a eventos del navegador.

## Regla principal
Crear una **input abstraction layer**.

El gameplay no debería depender de `keydown`, `pointermove`, `touchstart` o `gamepad` directamente. Debería depender de acciones o estados de input más estables.

## Separación recomendada

1. **captura cruda**
   - teclado
   - ratón
   - touch
   - gamepad
   - sensores si más adelante hacen falta

2. **normalización**
   - convertir eventos a estados o acciones comunes
   - ejemplo: `moveLeft`, `jump`, `interact`, `tiltX`

3. **consumo por sistemas**
   - player controller
   - camera controller
   - UI controller
   - debug tools

## Principio útil
Pensar el input como una API interna del juego, no como una colección de listeners sueltos.

## Patrones recomendados

### Estados continuos
Para movimiento y cámara, preferir estados continuos:
- `moveX`
- `moveY`
- `lookX`
- `lookY`
- `tilt`

### Acciones discretas
Para eventos puntuales:
- `jumpPressed`
- `interactPressed`
- `pausePressed`

### Mapping configurable
Dejar espacio para remapear fuentes:
- teclado en escritorio
- touch en móvil
- gamepad si aplica

## Touch y móvil
No asumir que el control móvil es una traducción literal del teclado.

Diseñar pensando en:
- zonas táctiles claras
- feedback visual
- tolerancia a dedos grandes
- menos precisión fina que en ratón
- evitar depender de hover

El manual también deja un detalle práctico que merece estar aquí: si el canvas necesita teclado, hay que pensar en foco y captura de input de forma explícita. No dar por hecho que el canvas ya recibe teclado solo porque está en pantalla.

## Raycasting e interacción
Si el juego requiere seleccionar o tocar objetos 3D:
- centralizar `Raycaster`
- separar picking de gameplay
- no repartir raycasts por veinte sistemas distintos
- convertir resultados del raycast en eventos de juego manejables

Patrón sano:
- convertir pointer o touch a coordenadas normalizadas una sola vez
- resolver picking en un sistema dedicado
- emitir resultados interpretables por gameplay, UI o debug

Detalle importante sacado de examples reales:
- si el canvas no ocupa toda la ventana, normalizar pointer contra `renderer.domElement.clientWidth/clientHeight` o contra el rect real del canvas, no contra `window.innerWidth/innerHeight` por inercia
- si el caso de uso está acotado, raycastear contra objetivos concretos en vez de contra toda la escena

## Cámara y controles
Distinguir claramente:
- controles de cámara para debug o edición
- controles de cámara de gameplay
- controles del player

No mezclar `OrbitControls` de prototipo con cámara final de juego sin marcar la diferencia.

Los examples oficiales son útiles aquí, pero dejan una lección clara: muchas demos usan controles para enseñar una técnica, no para representar un esquema final de juego. Copiar el ejemplo completo sin separar esa intención suele ensuciar la arquitectura.

Si usas pointer lock en escritorio, tratar su ciclo de vida como parte del diseño:
- lock
- unlock
- foco
- overlay o instrucciones

No asumir que pointer lock es solo una línea de código sin implicaciones de UX.

### Hold-to-look sin pointer lock (ratón visible)

Cuando quieres **mirar alrededor** a ratón pero:
- el juego no exige aim fino continuo, y
- prefieres **no** ocultar el cursor ni exigir click-to-play permanente,

alternativa sana: **mantener pulsado** un botón (suelen ser `pointerdown` en el canvas con `setPointerCapture` para seguir recibiendo `pointermove` aunque el cursor salga un poco fuera).

Reglas prácticas:
- Acumular `movementX/Y` solo mientras el botón está abajo.
- `pointerup`/`pointercancel` en `window` y en el canvas, más `blur`: soltar el botón aunque pierdas foco.
- Si la cámara aplica **offset que decae al soltar**, no necesitas “reset vista” extra para la mayoría de jugadores.

Esto se combina bien con cámaras **follow + offset decay** (ver `cameras.md`).

## Gamepad
Diseñar para soportarlo si el tipo de juego lo agradece, pero sin forzarlo desde el día 1.

Reglas útiles:
- leer estado por frame
- aplicar deadzones
- normalizar ejes
- no asumir distribución idéntica entre mandos

## Estructura sugerida

```text
systems/
  inputSystem.js
  pointerSystem.js
  gamepadSystem.js
controllers/
  playerController.js
  cameraController.js
```

## Anti-patrones
- gameplay conectado directo a listeners del DOM
- duplicar lógica para teclado y touch en vez de normalizar
- meter raycasting dentro de cada entidad interactiva
- usar controles de debug como si fueran controles de producción
- no distinguir entre input continuo y acción puntual
- asumir que foco, pointer lock o teclado ya están resueltos sin diseñarlos

## Checklist al diseñar controles
- ¿funciona en escritorio?
- ¿funciona en móvil?
- ¿la cámara compite con el control principal?
- ¿el input está desacoplado del DOM?
- ¿los nombres de acciones son claros?
- ¿es fácil cambiar el esquema más adelante?

## Pendiente de ampliar
- giroscopio y sensores
- virtual joystick
- input buffering
- rebinding
- accesibilidad y esquemas alternativos
- patrones de control para third-person, runner y equilibrio

# Render Targets

## Objetivo
Usar render targets en Three.js como infraestructura de juego real, entendiendo su coste, su lifecycle y sus implicaciones de cámara, resize y calidad.

## Regla principal
**Un render target suele significar al menos un render extra.**
No tratarlo como una textura gratis ni como un adorno menor.

## Qué es realmente
Un `WebGLRenderTarget` es una textura a la que renderizas, pero en práctica implica además:
- una cámara adicional o al menos una configuración adicional
- una escena o subconjunto de escena a renderizar
- memoria para color y a veces depth/stencil
- resize, cleanup y calidad propios

## Casos de uso típicos
- monitor dentro del mundo
- retrovisor o cámara de seguridad
- minimapa
- portal o vista remota
- picking por color en target dedicado
- buffers auxiliares para efectos propios

Shadows y postprocessing también usan render targets, pero aquí interesa su uso como sistema explícito del juego.

Para familias y edge cases concretos, apoyarse en `render-target-families.md`, `portal-recursion.md`, `portal-masking-stencil-scissor.md`, `minimap-fog-of-war.md` y `fog-mask-blending.md`.

## Default recomendado
Antes de crear un render target, preguntarse:
- ¿de verdad necesito una vista viva?
- ¿puede actualizarse menos veces?
- ¿puede ir a menor resolución?
- ¿puede renderizar un subconjunto más pequeño del mundo?

Muy a menudo la respuesta correcta no es “renderizarlo todo otra vez a full res cada frame”.

## Coste real
### 1. Render extra
Cada target suele implicar otra llamada a `renderer.render(...)`.

Eso significa:
- más coste CPU de submit
- más coste GPU
- más trabajo de culling y traversal

### 2. Memoria
El manual deja una pista útil:
- por defecto, `WebGLRenderTarget` crea textura de color y buffer depth/stencil

Si no necesitas depth o stencil:
- pedir `depthBuffer: false`
- pedir `stencilBuffer: false`

Eso puede ahorrar memoria y coste inútil.

### 3. Resize
Si el target depende del tamaño de pantalla o del viewport:
- `renderTarget.setSize(...)`
- actualizar también la cámara asociada si cambia el aspect

No basta con redimensionar solo el renderer principal.

## Cámara del render target
La cámara del target debe responder al propósito real del target, no copiar por copiar la cámara principal.

Ejemplos:
- minimapa: probablemente ortográfica
- monitor cuadrado: aspect cuadrado
- retrovisor panorámico: aspect distinto al canvas
- picking: cámara equivalente a la vista sobre la que haces picking

## Frecuencia de actualización
Una de las mejores palancas de ahorro.

No todo target necesita update continuo.

Buenas opciones:
- cada frame, solo si es crítico
- cada N frames
- solo cuando cambia algo relevante
- solo mientras el objeto está visible
- solo cuando el jugador interactúa con ese sistema

Patrón útil heredado del manual de responsive y render-on-demand:
- si una vista no necesita movimiento continuo, no la rerenderices sin parar

## Resolución del target
Regla muy fuerte:
- casi nunca conviene atar todos los targets a resolución completa del canvas

Pensar por caso:
- monitor pequeño en escena, resolución bastante menor
- minimapa, resolución reducida
- blur o buffers auxiliares, media o menor resolución
- target de UI o captura crítica, quizá sí alta si aporta algo real

## Integración con quality tiers
Los render targets deberían formar parte explícita de los tiers.

Variables útiles:
- target on/off
- tamaño del target
- frecuencia de update
- depth/stencil on/off cuando aplique
- contenido que ese target renderiza

No pensar solo en postprocessing. Un CCTV, un espejo o un minimapa también son presupuesto visual.

## Integración con adaptive quality
Cuando un target no es crítico para gameplay:
- bajar su resolución
- bajar su frecuencia de update
- apagarlo en tiers bajos

Muchas veces es mejor esto que tocar la imagen principal primero.

## Subconjunto de escena
No siempre hace falta renderizar el mundo entero al target.

Patrones sanos:
- layers
- escena secundaria minimalista
- contenido proxy o simplificado
- esconder elementos irrelevantes para esa vista

Esto puede ser decisivo en cámaras remotas o monitores internos.

En minimapas tácticos, muchas veces conviene ir más lejos: mapa base simplificado + overlay de visibilidad, en vez de rerenderizar el mundo entero para expresar fog of war.

## Render order básico
Patrón típico:
1. configurar target
2. `renderer.setRenderTarget(renderTarget)`
3. renderizar escena/cámara asociadas
4. `renderer.setRenderTarget(null)`
5. renderizar escena principal

Si mezclas varios targets, tener un orden explícito y fácil de seguir.

## Clear y estado
No olvidar que el target tiene su propio contenido y clear implícito o explícito.

Preguntas útiles:
- ¿necesita clear completo cada frame?
- ¿usa fondo propio?
- ¿depende de alpha?
- ¿estoy arrastrando estado del renderer sin querer?

En pipelines más complejos, el orden y el clear importan bastante.

## Feedback loops y trampas raras
Evitar situaciones donde un target se usa para renderizar algo que a la vez depende de ese mismo target de forma accidental.

Regla simple:
- cuidado con espejos, pantallas y superficies que muestran la misma vista que se está generando
- si hace falta, excluir temporalmente ciertos objetos de la pasada del target

## Lifecycle
Tratar cada target como recurso con dueño claro.

Ejemplos:
- sistema de minimapa
- sistema de cámaras de seguridad
- pantalla diegética de UI 3D
- reflector o portal

Cada uno debería saber:
- cuándo crear
- cuándo actualizar
- cuándo resizear
- cuándo `dispose()`

## Cleanup
`scene.remove()` no limpia el target.

Cuando ya no se necesita:
- `renderTarget.dispose()`
- limpiar materiales o meshes auxiliares si fueron creados para ese sistema
- limpiar cámaras, listeners o passes asociados

## Debug útil
Vigilar:
- frame time al activar/desactivar el target
- memoria y `renderer.info`
- picos al resize
- número de targets vivos
- frecuencia real de update

Si un monitor “inocente” mete varios ms, ya tienes sospechoso claro.

## Anti-patrones
- un target full-res por cada pantallita del mundo
- actualizar todos los targets cada frame por inercia
- olvidar `setSize()` y aspect de la cámara del target
- dejar depth/stencil activados sin necesitarlos
- no hacer `dispose()`
- renderizar el mundo entero para una vista que solo necesita un subconjunto

## Recomendación fuerte
Crear un pequeño sistema o wrapper por target que centralice:
- cámara
- resolución
- frecuencia de update
- filtros de contenido
- lifecycle y dispose
- integración con quality tiers

## Pendiente de ampliar
- picking por render target dedicado
- targets múltiples en HUDs o cockpits
- estrategias de update intermitente por visibilidad

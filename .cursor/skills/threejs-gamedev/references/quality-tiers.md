# Quality Tiers

## Objetivo
Diseñar presets de calidad reales para juegos Three.js, especialmente cuando hay postprocessing, render targets y costes que cambian mucho según dispositivo.

## Regla principal
**La calidad debe ser escalable por sistema, no solo por un interruptor global.**

Pensar en tiers como una política coordinada sobre:
- resolución efectiva
- sombras
- passes
- render targets
- distancia de dibujado
- densidad de mundo
- variantes de assets si aplica

## Default recomendado
Tener al menos:
- bajo
- medio
- alto

Si el proyecto es serio o va a móvil, esto deja de ser lujo bastante rápido.

## Qué suele escalar mejor
### Resolución
- `renderer.setPixelRatio()` con límites razonables
- resolución interna de ciertos efectos
- tamaño de composer y render targets auxiliares

### Postprocessing
- activar o desactivar passes
- bajar calidad de bloom
- reducir resolución de blur
- desactivar DOF en tiers modestos

### Sombras
- on/off
- resolución de shadow map
- número de luces con sombra
- distancia útil de sombras

### Mundo
- densidad de props
- distancia de dibujado
- cantidad de partículas
- frecuencia de ciertos sistemas secundarios

## Render targets
El manual de postprocessing deja una idea clave:
- `EffectComposer` ya usa render targets internos
- algunos passes crean más targets o buffers propios

Eso significa que el tier no debería pensar solo en “activar bloom”, sino en:
- cuántos targets existen
- a qué resolución viven
- si merece la pena que todos estén a resolución completa

## Resolución reducida por efecto
Patrón muy sano:
- no todos los efectos necesitan full resolution

Especialmente:
- bloom
- blur
- algunos passes de glow o combinaciones similares

Regla:
- si un efecto tolera media o menor resolución sin romper imagen, usarlo como vía preferente de ahorro

## Passes recomendables vs peligrosos
### Más defendibles
- un bloom moderado y medido
- color grading o ajustes simples
- output/tone mapping bien controlado

### Más peligrosos
- depth of field en gameplay principal
- cadenas largas de blur
- múltiples passes costosos a resolución alta
- efectos que degradan claridad en pantallas pequeñas

La example de DOF es útil como referencia técnica, pero también como recordatorio de que algo vistoso puede ser bastante caro y no siempre merece vivir en el loop jugable.

## Tiering por postprocessing
Ejemplo de política razonable:

### Bajo
- sin DOF
- sin bloom o bloom mínimo
- output pass esencial
- resolución interna recortada

### Medio
- bloom moderado
- color grading ligero
- sin efectos muy caros persistentes

### Alto
- passes completos justificables
- bloom más cuidado
- algún efecto premium si de verdad aporta

## Activación en runtime
Cambiar tier en caliente puede introducir tirones si:
- creas composer o render targets nuevos en momento crítico
- recompilas materiales
- redimensionas buffers grandes sin planificación

Regla:
- preparar cambios importantes fuera de momentos sensibles
- si el cambio es fuerte, tratarlo como transición de sistema, no como toggle trivial

## Presets coherentes
No hacer tiers absurdos donde:
- bajas sombras pero dejas DOF caro
- bajas pixel ratio pero mantienes todo el post premium
- ahorras GPU pero sigues con spawn y updates sin control

Los tiers deben tener coherencia interna.

## Quality scaler manual primero
Antes de pensar en auto-scaling complejo:
- definir presets manuales buenos
- saber qué apaga y qué mantiene cada tier
- medir escenas reales

Después ya se puede pensar en adaptación automática si compensa.

La mejor forma de validar si un tier está bien diseñado es correrlo en escenas de estrés repetibles, no fiarse de una sola escena agradable.

Para la capa automática que decide cuándo bajar o subir calidad sin thrash, ver `adaptive-quality-scaling.md`.

## Qué documentar por tier
- pixel ratio máximo
- post passes activos
- tamaño de render targets especiales
- sombras y su resolución
- distancia de dibujado
- densidad de props/partículas
- notas visuales y tradeoffs

Aquí merece entrar también la frecuencia de update de targets no críticos como minimapas, monitores o cámaras remotas. Ver `render-targets.md`.

Si el proyecto usa mirrors, portals o minimaps, conviene tratarlos como familias distintas dentro del tier. Ver `render-target-families.md`.

## Anti-patrones
- un único botón de “low/high” sin saber qué hace
- tratar todos los efectos como igual de caros
- mantener render targets grandes por defecto en móvil
- activar DOF o chains premium en gameplay por postureo
- cambiar tier sin medir picos de resize y reconfiguración

## Recomendación fuerte
Crear un `qualityManager` o equivalente que:
- conozca el tier actual
- aplique cambios coordinados
- pueda afectar renderer, composer, sombras y densidad de mundo
- exponga debug claro

## Pendiente de ampliar
- adaptive quality basado en picos de frame time
- presets concretos por género
- relación con render targets personalizados fuera de postprocessing

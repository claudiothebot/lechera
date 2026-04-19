# Profiling and Budgets

## Objetivo
Tener una forma práctica de medir rendimiento en juegos Three.js, identificar cuellos reales y trabajar con presupuestos en vez de intuiciones vagas.

## Regla principal
**No optimizar a ciegas.**
Primero hay que distinguir qué está fallando:
- carga inicial
- CPU por frame
- GPU por frame
- memoria
- stutter por compilación o creación de recursos

## Pregunta correcta
No preguntar solo “¿va lento?”.
Preguntar:
- ¿cuándo va lento?
- ¿en qué escena o sistema?
- ¿es constante o son picos?
- ¿cae por draw calls, lógica, shaders, texturas o cargas asíncronas?

## Presupuesto antes que pánico
Diseñar con budgets desde el inicio.

Budgets típicos a vigilar:
- frame time objetivo
- draw calls
- geometrías y nodos vivos
- memoria de texturas
- número de luces caras
- número de objetos actualizados por frame
- tiempo de carga de escena o zona

No hace falta fingir números universales mágicos, pero sí elegir límites concretos por proyecto y revisarlos.

## Regla de frame time
Pensar en milisegundos por frame, no solo en FPS.

Referencia útil:
- ~16.7ms para 60fps
- ~33.3ms para 30fps

Si un sistema nuevo mete 4, 6 o 8ms él solo, ya sabes quién está pidiendo demasiado.

## Separación útil de problemas
### CPU-bound
Sospechar de:
- demasiados updates por frame
- lógica de gameplay pesada
- raycasts excesivos
- demasiados nodos en scene graph
- merges o reconstrucciones frecuentes
- trabajo JS evitable

### GPU-bound
Sospechar de:
- draw calls altas
- demasiadas sombras
- postprocessing caro
- demasiadas transparencias
- materiales pesados
- resolución o pixel ratio demasiado altos

### Load-bound o stutter-bound
Sospechar de:
- assets demasiado pesados
- descompresión o parsing costosos
- compilación de shaders
- creación o destrucción masiva de recursos en mal momento

## Herramientas mínimas
### `Stats`
Útil para ver si el frame se degrada de forma obvia y rápida.
No explica todo, pero sirve para notar caídas y comparar cambios.

### `renderer.info`
Mirar especialmente:
- geometries
- textures
- programs
- render.calls
- triangles

Esto no cuenta toda la historia, pero da una lectura muy buena del estado de render.

### Medición local
Patrones simples útiles:
- `console.time()` / `console.timeEnd()` para builds o pasos caros
- medir duración de cargas
- medir generación procedural
- medir creación o rebuild de geometrías

El example `webgl_instancing_performance` usa este enfoque con bastante honestidad, y merece quedarse como patrón.

### Browser devtools
Usar profiling del navegador cuando el problema no está claro.
Especialmente para:
- flame charts de JS
- memoria
- picos de layout o UI externa
- coste de callbacks y listeners

## `renderer.info` como brújula
Patrón útil:
- si `render.calls` se dispara, pensar draw calls
- si geometrías/texturas crecen sin volver a bajar, pensar lifecycle o fuga
- si triangles suben mucho en escenas que no deberían, revisar assets y LOD

No obsesionarse con un único contador. Cruzarlo con el contexto de la escena.

## Draw calls
El manual y examples dejan una señal muy clara:
- **muchas draw calls matan antes de lo que mucha gente cree**

Soluciones típicas:
- `InstancedMesh`
- merge de geometrías
- menos materiales distintos
- menos meshes pequeñas inútiles

Tradeoff importante:
- instancing reduce draw calls y mantiene cierta flexibilidad
- merge reduce draw calls pero complica updates individuales
- naive meshes sirven para prototipo, no para cantidades grandes por defecto

## Scene graph y coste CPU
La docs también dejan otra verdad poco glamourosa:
- no solo cuesta dibujar, también cuesta mantener miles de nodos, matrices y updates

Regla:
- si solo representas masa de datos o props repetidos, no usar scene graph como estructura de datos gigantesca porque sí

## Actualizaciones caras
`how-to-update-things` deja varias alertas importantes:
- cambiar ciertas propiedades de material puede forzar recompilación
- redimensionar buffers no es barato
- geometrías dinámicas necesitan prealloc y updates bien pensados
- al cambiar instancing o skinned bounds, puede tocar recomputar bounding volumes

Implicación:
- no medir solo render final, medir también el coste de mutar datos y recursos

## Presupuestos recomendados por categorías
No como dogma, sino como disciplina.

### Render
- límite orientativo de draw calls por escena jugable
- límite de luces con sombras
- límite de passes de postprocessing

### Assets
- tamaño máximo por modelo crítico
- tamaño máximo por textura según categoría
- número de materiales por asset importante

### Gameplay
- cuántas entidades actualizan full cada frame
- cuántos raycasts o queries se permiten por tick
- cuántos sistemas pueden correr a menor frecuencia

### Mundo
- densidad máxima por chunk
- props simultáneos visibles
- presupuesto de spawn/despawn por frame

## Presupuestos por tier
Especialmente en web y móvil, definir tiers:
- bajo
- medio
- alto

Variables candidatas:
- pixel ratio
- sombras
- densidad de props
- distancia de dibujado
- postprocessing
- calidad de texturas o variantes de asset

## Patrón de profiling sano
1. reproducir el problema
2. aislar la escena o sistema
3. medir antes del cambio
4. aplicar una sola intervención clara
5. medir después
6. dejar anotado el tradeoff

Para una rutina más explícita de diagnóstico práctico entre cuellos de GPU, CPU, mixed o stutter/load, ver `gpu-vs-cpu-heuristics.md`.

## Qué medir de forma periódica
- frame time medio y picos
- draw calls en escenas clave
- memoria aproximada viva
- tiempos de carga por escena
- coste de generación procedural
- stutter al cambiar de zona, skin o modelo

Para doctrina más concreta sobre tirones, warmup y activación suave, ver `frame-pacing-stutter.md`.

## Anti-patrones
- optimizar por superstición
- mirar solo FPS sin frame time
- arreglar GPU bajando calidad cuando el cuello es CPU
- arreglar CPU quitando geometría cuando el problema son shaders o sombras
- asumir que un benchmark sintético representa tu juego real
- no medir picos de carga y solo mirar la media

## Recomendación fuerte
Crear un pequeño `performanceHUD` o panel de debug que pueda mostrar:
- fps o frame time
- `renderer.info.render.calls`
- geometries/textures/programs
- tier de calidad activo
- toggles para sombras, post y densidad

Eso suele pagar solo en cuanto el proyecto crece un poco.

Para comprobar todo esto contra escenas reproducibles y no solo contra intuición, ver `stress-scenes-benchmarks.md`.

Para guardar runs comparables con contexto, warmup y resultados estructurados, ver `benchmark-reporting.md`.

Para comparar baseline vs candidate sin caer en diffs engañosos por config distinta o ruido, ver `benchmark-diffs.md`.

## Pendiente de ampliar
- GPU timing más fino según navegador y tooling
- budgets orientativos por género
- pruebas automatizadas de escenas de estrés
- integración con quality scaler adaptativo

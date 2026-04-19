# Resource Lifecycle

## Objetivo
Evitar fugas, picos de memoria y degradación silenciosa en juegos Three.js gestionando el ciclo de vida real de geometrías, materiales, texturas, render targets y objetos auxiliares.

## Regla principal
Quitar algo de la escena **no** significa liberar sus recursos.

El manual lo deja negro sobre blanco: si ya no necesitas una geometría, material, textura o render target, normalmente tienes que llamar a su `dispose()` de forma explícita.

## Qué hay que limpiar

### Geometrías
- `BufferGeometry.dispose()`

### Materiales
- `Material.dispose()`

### Texturas
- `Texture.dispose()`
- si hay `ImageBitmap`, cerrar también el bitmap cuando aplique

### Render targets
- `WebGLRenderTarget.dispose()`

### Skeletons
- `Skeleton.dispose()` si ya no se comparte con otros skinned meshes

### Addons y utilidades
Muchos addons también tienen `dispose()`:
- controls
- postprocessing passes/composer
- utilidades con listeners o buffers internos

## Regla de ownership
Cada recurso debería tener dueño claro.

Ejemplos:
- un chunk del mundo es dueño de su malla agregada y texturas temporales
- una escena UI es dueña de sus render targets
- un sistema de postprocessing es dueño de composer y passes

Si nadie sabe quién limpia algo, probablemente se quede vivo más de la cuenta.

## Cuándo limpiar
Buenos momentos típicos:
- cambio de nivel
- descarga de chunk
- salida de una escena o modo de juego
- reemplazo masivo de assets o estrategia de representación

En pipelines con glTF cargado bajo demanda, añadir además:
- cambio rápido entre modelos o skins
- loads asíncronos que quedan obsoletos
- viewers o selectores donde el usuario puede cambiar de asset antes de terminar la carga

## Shared resources
No destruir a lo loco recursos compartidos.

Antes de hacer `dispose()` preguntarse:
- ¿esta textura la usa otro material?
- ¿este skeleton se comparte?
- ¿este material lo usan más meshes?

Los examples de animación refuerzan esto bastante: clonar personajes con `SkeletonUtils.clone()` y compartir skeleton son dos estrategias distintas, así que el cleanup también cambia.

## Renderer info
Usar `renderer.info` para vigilar:
- geometrías
- texturas
- programas
- draw calls y stats del frame

No es verdad absoluta de todo el sistema, pero sí una alarma muy útil para detectar fugas o crecimiento raro.

## Reusar tras dispose
El manual aclara algo útil:
- en muchos casos Three.js puede recrear recursos si vuelves a usar el objeto tras `dispose()`
- eso no rompe siempre el runtime, pero puede pegar un coste en el frame

O sea, `dispose()` mal usado no siempre explota. A veces solo te fastidia el rendimiento.

## Patrón recomendado
1. desacoplar datos lógicos de recursos GPU
2. registrar qué crea cada subsistema
3. tener una ruta de cleanup explícita
4. limpiar por grupos coherentes, no con cien parches sueltos

## Anti-patrones
- asumir que `scene.remove()` basta
- no limpiar render targets o composer
- no revisar `dispose()` en addons
- destruir recursos compartidos sin ownership claro
- no mirar `renderer.info` cuando sospechas fuga

## Recomendación fuerte
En juegos con chunks, escenas o modos:
- cada unidad grande del sistema debe tener `create`, `attach`, `detach`, `dispose` o equivalente
- lifecycle explícito gana siempre a magia implícita

Para ownership, resize y política de update de RTT personalizados, ver `render-targets.md`.

## Pendiente de ampliar
- checklist de cleanup por scene/chunk
- pooling vs dispose
- lifecycle de composers y passes
- streaming de assets y descarte diferido
- relación entre cleanup y stutter de frame

# World Generation

## Objetivo
Construir mundos grandes o proceduralmente ricos en Three.js sin caer en el error clásico de representar cada pieza como un mesh suelto o de intentar tenerlo todo vivo a la vez.

## Regla principal
Separar **datos del mundo** de **representación renderizable**.

El mundo no es la escena. La escena es solo una vista temporal y optimizada de una parte del mundo.

## Principio base
Pensar en capas:
1. **datos** del mundo
2. **generación** o carga
3. **meshing / representación**
4. **streaming y descarte**
5. **gameplay sobre el mundo**

## Lección fuerte del manual
Si hay muchísimos elementos:
- no crear un mesh por pieza por defecto
- no abusar del scene graph como estructura de datos
- usar geometría combinada, instancing o meshing específico según el caso

## Chunking
Para mundos grandes, usar chunks o celdas.

Razones:
- limitar memoria activa
- reconstruir solo zonas afectadas
- facilitar streaming y descarte
- evitar pensar en el mundo entero a la vez

Regla práctica:
- definir un tamaño de chunk razonable
- mantener separado el identificador lógico del chunk y su representación visual
- poder regenerar la malla de un chunk sin reescribir el mundo entero

## Voxel worlds
El manual de voxel geometry deja una regla muy clara:
- no basta con fusionar cubos a lo bruto
- hay que generar solo las caras visibles

Patrones clave:
- almacenar datos del voxel world por celdas
- consultar vecinos para decidir si una cara existe
- generar geometría propia en vez de instanciar un cubo por voxel
- no reservar memoria enorme para espacio vacío si se puede evitar

## Heightmaps y superficies
Para terrenos tipo mapa de alturas:
- un mesh de superficie puede ser suficiente
- raycasting contra el terreno es útil para placement, navegación o debug
- helpers visuales de impacto ayudan mucho a entender qué pasa

## Geometría combinada vs instancing
### Combinar geometría
Buena opción cuando:
- hay muchísimos elementos estáticos
- no hace falta tocar piezas individuales con frecuencia
- queremos reducir draw calls al máximo

### Instancing
Buena opción cuando:
- hay muchos elementos similares
- sí queremos cierto grado de cambio por instancia
- necesitamos actualizar transforms o colores sin rehacer toda la malla

### Meshes sueltas
Dejarlo para:
- objetos realmente especiales
- entidades interactivas importantes
- cantidades pequeñas

## Helpers de posicionamiento
El manual enseña un patrón fino: usar unos pocos `Object3D` helpers temporales para calcular posiciones complejas en vez de inundar el scene graph con nodos persistentes.

Regla:
- usar helpers para calcular
- no convertirlos en estructura permanente si no hace falta

## Streaming
Un mundo grande debería asumir que:
- chunks entran
- chunks salen
- recursos se liberan
- la escena visible cambia

Preguntas útiles:
- ¿qué chunks deben estar activos alrededor del jugador?
- ¿qué distancia activa usamos para visual, física y gameplay?
- ¿cuándo regeneramos malla y cuándo solo actualizamos datos?

## Anti-patrones
- un mesh por bloque o por prop minúsculo en mundos enormes
- usar la escena como base de datos del mundo
- no separar mundo lógico y representación visual
- no chunkear cuando el mundo ya lo pide a gritos
- reconstruir el mundo entero por cambios locales pequeños

## Recomendación fuerte
Para juegos web:
- mundo lógico chunked
- representación agregada por chunk
- instancing para repetición con variación ligera
- meshes individuales solo para objetos importantes

## Pendiente de ampliar
- política de tamaños de chunk
- world streaming alrededor de cámara o player
- meshing incremental
- integración con física por chunk
- navegación y queries espaciales
- procedural generation reproducible por seed

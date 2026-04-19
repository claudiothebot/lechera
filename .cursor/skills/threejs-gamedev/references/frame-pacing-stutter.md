# Frame Pacing and Stutter Control

## Objetivo
Reducir tirones visibles y frame pacing irregular en juegos Three.js, entendiendo que un buen FPS medio no garantiza una buena sensación de juego.

## Regla principal
**No medir solo media de FPS.**
Hay que vigilar:
- picos de frame time
- stutter al cargar o activar assets
- recompilación de shaders
- trabajo masivo concentrado en un único frame

## Qué es lo que duele de verdad
Problemas típicos de sensación:
- entrar en una zona y notar un microparón
- cambiar skin o personaje y que el frame se rompa
- activar un pass o material y pegar un tirón
- hacer spawn masivo de props o enemigos y sentir un golpe seco

Eso suele venir de trabajo concentrado en mal momento, no solo de un rendimiento medio bajo.

## Tipos de stutter
### Shader stutter
- compilación o recompilación de shaders
- cambios de materiales o flags que fuerzan nuevos programas

### Asset activation stutter
- parsing
- descompresión
- subida de recursos a GPU
- primer uso de materiales o texturas

### JS/update stutter
- generación procedural grande
- rebuild de geometrías
- spawn/despawn masivo
- demasiada lógica agrupada en un frame

### Postprocessing stutter
- activar composer o passes caros en caliente
- resize mal coordinado
- crear render targets en mal momento

## `compileAsync()` como patrón serio
La example moderna de `webgl_loader_gltf` deja un patrón muy valioso:
- usar `renderer.compileAsync()` antes de añadir un modelo importante puede evitar el tirón de compilación al primer frame visible

Casos donde conviene pensar en ello:
- cambios de personaje o skin
- entrada a escena nueva
- viewer o selector de modelos
- assets grandes cargados bajo demanda

## Recompilación evitable
`how-to-update-things` deja un aviso bastante claro:
- ciertas propiedades de material no cambian gratis
- algunas fuerzan recompilación y pueden inducir jerkiness

Sospechar especialmente de cambios que alteran:
- presencia de texturas
- vertex colors
- morphing
- shadow map usage
- alpha test
- transparent
- estructura de uniforms o variantes de shader

Regla:
- no cambiar permutations de materiales alegremente en mitad de gameplay
- preferir valores dummy o rutas preparadas si el cambio será frecuente

## Prewarm mental
Pensar en “prewarm” o preparación anticipada de recursos.

Ejemplos:
- compilar modelos o materiales antes de que entren en plano
- cargar y preparar un enemigo antes del spawn visible
- construir render targets o passes antes de una transición importante
- precalcular variantes que sabes que vas a usar en breve

## Staggering
No meter trabajo pesado de golpe si se puede repartir.

Patrones útiles:
- crear props en lotes
- repartir spawn en varios frames
- construir chunks por fases
- escalonar inicialización de sistemas secundarios
- no limpiar y reconstruir medio mundo en el mismo frame si hay alternativa

## Asset activation
Cargar un asset no termina cuando llega el archivo.
A veces faltan aún:
- parse
- bind de texturas
- compilación de materiales
- activación de animaciones
- ajuste de cámara o scene attachment

Regla fuerte:
- separar **load complete** de **asset ready to show smoothly**

## Frame time y picos
Más útil que mirar solo FPS:
- medir frame time medio
- medir picos claros
- revisar qué pasa en eventos concretos: spawn, load, resize, cambio de preset, entrada de escena

Si el juego va razonablemente bien pero “se siente mal”, casi siempre toca mirar esta capa.

## Delta y estabilidad
Si el delta se dispara por una pausa, carga o tab switch:
- no dejar que el gameplay explote por integrar un delta monstruoso
- limitar deltas máximos en sistemas sensibles cuando tenga sentido
- usar substeps en sistemas que lo necesiten

Esto no arregla toda la causa del stutter, pero evita que el frame malo destruya la simulación.

## Spawn, despawn y lifecycle
Momentos peligrosos:
- olas de enemigos
- cambio de chunk
- abrir inventario 3D o selector
- cambiar calidad visual
- destruir y recrear composer o materiales

Recomendación:
- ownership claro
- create/attach/detach/dispose explícitos
- evitar picos por destrucción y creación masiva sin planificación

## Postprocessing
Los passes también pueden introducir tirones, no solo coste continuo.

Cuidado con:
- activar bloom o cadenas nuevas en caliente
- resize sin sincronizar renderer y composer
- crear render targets grandes durante gameplay crítico

Los quality tiers ayudan bastante aquí si controlan explícitamente cuándo y cómo cambian passes, tamaños y targets.

## Debug útil
Tener panel o logs que permitan correlacionar tirón con evento:
- frame time actual y picos recientes
- carga o activación de assets
- cambios de calidad
- número de programas o draw calls
- momento de spawn/despawn importante

## Anti-patrones
- presumir de FPS medio e ignorar picos
- cambiar flags de material en caliente sin pensar en recompilación
- cargar y mostrar asset grande en el mismo instante crítico
- rebuild masivo de geometría en frame jugable
- activar postprocessing pesado sin warmup
- no separar “cargado” de “listo para mostrarse suave”

## Recomendación fuerte
Crear una pequeña política de runtime que cubra:
- preload
- compile/warmup
- activación visible
- stagger de trabajo pesado
- límites de delta en sistemas sensibles
- medición de picos, no solo de medias

Si además el proyecto usa quality scaling automático, esa política debería incluir histéresis, cooldown y cambios en momentos seguros. Ver `adaptive-quality-scaling.md`.

## Pendiente de ampliar
- warmup por escena o encounter
- técnicas de background preparation más concretas
- quality scaler basado en picos de frame time
- política de spawn budgets por frame

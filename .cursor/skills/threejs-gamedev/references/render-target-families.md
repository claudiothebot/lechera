# Render Target Families: Mirrors, Portals, Minimap

## Objetivo
Aterrizar tres familias muy comunes de RTT en juegos Three.js, entendiendo qué las hace distintas, qué trampas traen y qué defaults suelen ser sanos.

## Regla principal
**No todos los render targets se comportan igual.**
Un mirror, un portal y un minimapa comparten infraestructura, pero no comparten la misma cámara, la misma frecuencia de update ni el mismo coste aceptable.

## 1. Mirrors

### Qué son realmente
Un mirror plano no es solo “otra cámara mirando lo mismo”.
Necesita:
- cámara reflejada respecto al plano
- clipping correcto para evitar ver cosas detrás del espejo
- ocultar el propio espejo durante su render

El addon `Reflector` deja muy claro este patrón.

### Patrón útil visto en `Reflector`
- crea un `WebGLRenderTarget`
- genera una cámara reflejada por cada cámara de escena que lo usa
- actualiza una texture matrix
- modifica la proyección con clip plane oblicuo
- oculta el reflector durante la pasada
- vuelve a render target anterior al terminar

Eso ya no es un “monitorcito”. Es infraestructura bastante seria.

### Defaults sanos
- usar `Reflector` si el caso es un espejo plano estándar
- bajar `textureWidth/textureHeight` antes de degradar toda la escena
- no poner espejos full-res alegremente en móvil
- actualizar tamaño del target en resize

### Costes y riesgos
- pasada extra cara
- múltiples espejos multiplican coste muy rápido
- riesgo de feedback visual o recursion si el espejo ve otros espejos
- picos de resize si el target sigue al drawing buffer principal

### Cuándo apagar o recortar
- tiers bajos
- espejos secundarios o decorativos
- escenas con varios reflectores simultáneos

Palancas buenas:
- resolución del target
- frecuencia de update
- desactivar espejo lejano o no visible

## 1.5 Refractors

### Qué son realmente
Un refractor plano comparte mucha infraestructura con un mirror plano:
- render target
- clip plane oblicuo
- ocultar la propia superficie durante la pasada

Pero no vende una reflexión especular del mundo. Vende una vista refractada o distorsionada a través de una superficie.

La clase `Refractor` y la example `webgl_refraction` dejan esto bastante claro.

### Qué cambia frente a un mirror
- usa cámara virtual copiada de la cámara principal en vez de cámara reflejada
- el resultado final depende mucho más del shader de refracción
- suele apoyarse en mapas auxiliares, por ejemplo dudv, para distorsión
- visualmente puede tolerar más resolución modesta si el shader hace bien su trabajo

### Defaults sanos
- tratarlo como superficie premium, no como decoración gratis repetida por todo el nivel
- bajar `textureWidth/textureHeight` antes de tocar toda la escena
- medir si de verdad aporta más que una solución fake o material más barato
- usar update continuo solo si la superficie lo necesita de verdad

### Riesgos típicos
- confundirlo con mirror y esperar la misma credibilidad geométrica
- subir mucho resolución para tapar un shader flojo
- olvidarse de que la distorsión también puede degradar legibilidad
- meter agua/vidrio refractivo en exceso y comerse GPU a lo tonto

### Cuándo merece la pena
- agua o cristales hero
- superficies mágicas o sci-fi concretas
- momentos donde la distorsión aporta identidad real

### Cuándo no
- HUDs internos
- decoración secundaria repetida
- móvil modesto sin presupuesto claro

## 2. Portals

### Qué son realmente
Un portal no suele ser una reflexión. Es una ventana a otra vista coherente del mundo.

La example `webgl_portal` deja un patrón bastante fino:
- un target por portal visible
- una cámara de portal específica
- transformar la posición del jugador/cámara al espacio del otro portal
- ajustar la proyección para encajar exactamente el marco del portal
- ocultar el propio portal durante su render

### Qué complica de verdad
- correspondencia espacial entre portal A y portal B
- proyección ajustada al marco, no solo una cámara cualquiera
- clipping local
- recursion potencial si un portal ve otro portal
- orden de render muy fácil de romper

### Defaults sanos
- empezar con portals no recursivos
- limitar profundidad de recursion si aparece
- usar resolución moderada
- ocultar la superficie del portal durante su propia pasada
- medir muy pronto picos si hay dos o más portales en pantalla

Para recursion, resolución por nivel y masking más fino, ver `portal-recursion.md` y `portal-masking-stencil-scissor.md`.

### Riesgos típicos
- verla bien en una demo simple y romperse al meter gameplay real
- jitter o seams por mala transformación de cámara
- coste explosivo si cada portal renderiza demasiado mundo
- recursion visual accidental

### Palancas útiles
- resolución del target
- número máximo de portales activos
- limitar contenido visible por layers o proxies
- apagar actualización si el portal está fuera de pantalla o irrelevante

## 3. Minimap

### Qué es realmente
Un minimapa no suele pedir fidelidad cinematográfica. Pide:
- lectura clara
- orientación estable
- coste bajo

Normalmente encaja mejor con cámara ortográfica o casi ortográfica que con perspectiva dramática.

### Default recomendado
- cámara ortográfica para mapa táctico o top-down limpio
- target de resolución modesta
- update a menor frecuencia que la vista principal si el juego lo tolera
- contenido filtrado: solo lo que aporta lectura

### Qué renderizar
No meter el mundo completo sin discriminar.

Mejor incluir:
- terreno base o proxies simples
- player
- objetivos
- enemigos relevantes
- markers y elementos navegables

Mejor excluir:
- detalle cosmético fino
- partículas
- transparencias caras
- props irrelevantes
- postprocessing

### Buenas decisiones visuales
- colores claros por facción o categoría
- iconos o proxies simples
- rotación controlada: o rota el mapa o rota el icono del jugador, no ambas cosas sin necesidad

### Frecuencia de update
Muchas veces un minimapa no necesita 60 fps.

Opciones sanas:
- cada N frames
- solo cuando el jugador o targets cambian suficiente
- update completo en momentos importantes y parcial el resto

Si además hay fog of war, explored state o blending de máscara, ver `minimap-fog-of-war.md` y `fog-mask-blending.md`.

## Comparación rápida entre familias
### Mirror
- prioridad: credibilidad visual
- cámara: reflejada
- riesgo: recursion y coste por resolución

### Refractor
- prioridad: distorsión/refracción creíble
- cámara: virtual copiada + clip plane
- riesgo: coste GPU + shader caro + pérdida de legibilidad

### Portal
- prioridad: coherencia espacial
- cámara: transformada entre espacios
- riesgo: recursion, clipping, orden de render

### Minimap
- prioridad: legibilidad y coste bajo
- cámara: ortográfica casi siempre defendible
- riesgo: sobre-renderizar detalles inútiles

## Quality tiers por familia
### Mirrors
- bajar resolución primero
- luego bajar frecuencia o apagar secundarios

### Refractors
- bajar resolución primero
- luego apagar superficies secundarias
- evitar shaders premium en tiers modestos

### Portals
- limitar portales activos
- bajar resolución
- recortar contenido visible
- capar recursion por tier

### Minimap
- bajar tamaño del target
- bajar frecuencia
- simplificar layers renderizadas
- separar mapa base y overlay de fog si existe

## Lifecycle por familia
Todos necesitan dueño claro, pero:
- mirrors y portals suelen requerir más cuidado con cámara auxiliar y estado de render
- minimap suele requerir más cuidado con filtros de contenido y UI asociada

Siempre:
- resize explícito si depende del viewport
- `dispose()` del target
- cleanup de materiales/superficies auxiliares si se crean para esa familia

## Qué medir en benches
### Mirrors
- coste por espejo activo
- impacto de resolución del target
- picos de resize

### Refractors
- coste por superficie activa
- impacto de resolución del target
- coste adicional del shader de distorsión

### Portals
- coste por portal visible
- impacto de recursion limitada
- picos al cruzar o activar portales

### Minimap
- coste por frecuencia de update
- impacto de layers completas vs simplificadas
- claridad visual frente a coste

## Anti-patrones
- usar la misma receta de cámara para las tres familias
- full-res por defecto
- no ocultar mirror/portal durante su propia pasada
- renderizar todo el mundo en minimapa
- asumir que portal = mirror con distinta textura

## Recomendación fuerte
Tratar cada familia como subsistema propio:
- `mirrorSystem`
- `portalSystem`
- `minimapSystem`

Cada uno con cámara/math propios, política de resolución, frecuencia de update, filtros de contenido y lifecycle explícito.

## Pendiente de ampliar
- mirrors/refractions en móvil

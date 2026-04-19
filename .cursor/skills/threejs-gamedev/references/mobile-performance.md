# Mobile and Performance

## Objetivo
Construir juegos en Three.js que sigan siendo viables en web móvil y dispositivos modestos, evitando decisiones visuales que maten la experiencia demasiado pronto.

## Regla principal
Diseñar con un **presupuesto de rendimiento** desde el inicio.

No pensar en rendimiento solo cuando el juego ya va mal. Cada sistema nuevo debería pagar alquiler.

## Prioridad correcta
En móvil, normalmente importan más estas cosas que el detalle bruto:
- frame rate estable
- tiempos de carga razonables
- controles responsivos
- buena legibilidad visual
- batería y temperatura bajo control

Para metodología de medición y budgets más explícitos, ver `profiling-budgets.md`.

## Principios base

### 1. Menos coste, mejor frame
Preferir:
- menos draw calls
- menos luces caras
- menos sombras dinámicas
- menos transparencias problemáticas
- menos geometría inútil
- menos postprocessing por defecto

### 2. Escalar por tiers
Pensar en calidades o presets:
- bajo
- medio
- alto

Variables típicas para recortar:
- pixel ratio
- sombras
- distancia de dibujado
- cantidad de props
- efectos de post
- resolución de texturas

Para una política más explícita de presets y coordinación entre renderer, composer y render targets, ver `quality-tiers.md`.

### 3. Medir antes de adivinar
No optimizar a ciegas.

Separar preguntas:
- ¿el cuello está en GPU?
- ¿el cuello está en CPU?
- ¿el problema es carga inicial?
- ¿el problema es demasiada lógica por frame?

## Defaults sanos para móvil
- limitar `renderer.setPixelRatio()` a valores razonables
- evitar sombras dinámicas complejas por defecto
- usar pocas luces importantes
- preferir fondos simples o skyboxes baratos antes que entornos carísimos
- usar geometrías y materiales acordes al estilo real del juego
- arrancar con menos efectos y subir solo si sobra margen

En proyectos más serios, merece la pena ir un paso más allá y controlar explícitamente el tamaño del drawing buffer y el pixel budget por dispositivo, no solo un `setPixelRatio()` alegre.

## Draw calls
Las draw calls suelen ser uno de los primeros techos.

Reducirlas con:
- `InstancedMesh` cuando haya muchos objetos similares
- merge de geometrías si tiene sentido
- menos materiales distintos
- menos objetos decorativos inútiles

La revisión de manual y examples refuerza que `InstancedMesh` no es un truco raro, sino una pieza central cuando el mundo necesita muchos objetos similares.

Tradeoff útil visto en examples:
- `InstancedMesh` da una solución muy fuerte cuando prima cantidad y coste
- merge de geometrías también reduce draw calls, pero sacrifica flexibilidad para updates individuales
- muchas meshes sueltas deberían ser la excepción, no el default, en props repetidos

## Geometría y mallas
- vigilar polycount real, no solo apariencia
- evitar assets hiperdensos si luego van a salir pequeños en pantalla
- revisar LOD o variantes simplificadas si el mundo crece
- no asumir que un asset bonito de escritorio sirve igual en móvil

Otra lección del manual de optimización: no usar el scene graph como estructura masiva de datos si lo que necesitas es representar miles de elementos. El coste no está solo en dibujar, también en mantener demasiados nodos vivos.

## Materiales y luces
- empezar simple
- justificar cada luz cara
- usar `MeshStandardMaterial` o similares con cabeza, no por inercia
- revisar si ciertos objetos pueden usar materiales más baratos
- tratar sombras como lujo controlado, no como derecho universal

## Texturas
- tamaños razonables
- evitar 4K por postureo
- reutilizar texturas cuando sea posible
- comprimir si el pipeline lo permite
- vigilar memoria total, no solo peso en disco

## Transparencias y postprocessing
Ambos pueden salir caros y dar guerra.

Usarlos con criterio:
- transparencias solo cuando aporten algo real
- postprocessing modular y desactivable
- no encadenar efectos porque sí

## Update loop y CPU
No todo problema de rendimiento está en render.

Revisar:
- cuántos objetos actualizan por frame
- cuántos raycasts haces
- cuánta lógica corre aunque nada cambie
- cuántos listeners o sincronizaciones innecesarias existen
- si hay sistemas que podrían ejecutarse con menor frecuencia

## Estrategias prácticas
- budget visual desde el prototipo
- presets de calidad
- toggles para sombras, efectos y densidad de mundo
- profiling periódico, no solo al final
- pruebas en móvil real cuanto antes

Patrón útil tomado del manual: en pantallas o vistas que no necesitan update constante, considerar render on demand. En un juego principal normalmente habrá loop continuo, pero menús 3D, configuradores o escenas pausadas no tienen por qué renderizar sin parar.

## Checklist rápida cuando algo va mal
- ¿pixel ratio demasiado alto?
- ¿demasiadas draw calls?
- ¿sombras excesivas?
- ¿texturas demasiado grandes?
- ¿postprocessing innecesario?
- ¿demasiados objetos actualizando cada frame?
- ¿raycasts o colisiones demasiado frecuentes?
- ¿el problema aparece en carga, en gameplay o en escenas concretas?

Y, muy importante, no asumir que todo problema móvil es GPU: separar visual vs lógica con `gpu-vs-cpu-heuristics.md`.

## Anti-patrones
- diseñar para desktop potente y esperar milagros en móvil
- activar sombras y efectos premium desde el día 1
- meter assets generativos pesados sin poda
- usar materiales caros en todo
- intentar arreglar FPS solo bajando calidad visual sin mirar la CPU
- no probar en dispositivos reales hasta el final
- ignorar técnicas oficiales de instancing y seguir empujando miles de meshes sueltas

## Pendiente de ampliar
- presupuesto orientativo por tipo de juego
- estrategias de LOD y chunking
- límites prácticos para sombras
- profiling con herramientas concretas
- política de calidad adaptativa por dispositivo

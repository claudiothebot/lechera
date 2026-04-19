# Minimap Fog of War

## Objetivo
Construir minimapas útiles con niebla de guerra sin convertir el sistema en otra cámara cara que renderiza el mundo entero por costumbre.

## Regla principal
**El minimapa debe priorizar legibilidad y estado táctico, no fidelidad visual.**
La fog of war pertenece más a un subsistema de visibilidad/juego que a un render bonito.

## Qué suele necesitar de verdad
- geometría o mapa base simplificado
- posición del jugador o equipo
- zonas exploradas
- zonas visibles ahora
- markers relevantes

No suele necesitar:
- materiales completos del mundo
- sombras complejas
- postprocessing
- props cosméticos completos

## Dos capas útiles
### 1. Capa base del mapa
Puede venir de:
- cámara ortográfica simplificada
- textura prehorneada
- chunks/proxies tácticos

### 2. Capa de visibilidad
Representa:
- visible ahora
- explorado antes
- desconocido

Esta capa puede actualizarse con lógica propia y no tiene por qué salir de renderizar el mundo entero cada frame.

Para decidir cómo representar esa capa con masks y blending legible, ver `fog-mask-blending.md`.

## Modelo sano
Pensar el minimapa como combinación de:
- representación estática o barata del mundo
- overlay dinámico de visibilidad
- iconos/markers de entidades relevantes

## Implementaciones razonables
### Opción A: minimapa RTT + overlay de fog
- render target con vista ortográfica simplificada
- textura o máscara adicional para la fog
- composición final sencilla

### Opción B: mapa prehorneado + fog dinámica
Muchas veces es la opción más sana.

- imagen o textura base del mapa
- sistema de coordenadas mundo -> mapa
- máscara dinámica de exploración/visibilidad
- iconos actualizados aparte

### Opción C: chunks tácticos
Útil en mundos grandes:
- mapa base por chunks
- visibilidad por sector
- actualización local, no global

## Qué conviene trackear
Separar al menos:
- `currentlyVisible`
- `explored`
- `neverSeen`

Eso permite niebla clásica:
- visible: claro
- explorado: atenuado
- no visto: oculto

## Update policy sana
La fog no siempre necesita 60 fps.

Opciones:
- actualizar por tick táctico
- actualizar al moverse una distancia mínima
- actualizar solo si cambia un revelador relevante
- recalcular parcialmente por zona/chunk

## Fuentes de visibilidad
Según el juego:
- radio alrededor del jugador
- raycasts simplificados
- visibilidad por habitaciones
- grid o nav sectors
- influencia por unidades aliadas

No atar esto directamente al coste del render target. Primero decidir la lógica de visibilidad.

## Chunks y mundos grandes
En mapas grandes:
- no mantener todo con detalle uniforme
- dividir exploración por tiles/chunks/sectores
- serializar estado de exploración separado del render
- cargar solo overlays necesarios cerca o en UI activa

## Integración con RTT
Si el minimapa usa cámara:
- ortográfica por defecto
- resolución modesta
- layers filtradas
- update independiente de la vista principal

La fog debería poder sobrevivir incluso si bajas mucho la frecuencia del RTT.

## Integración con gameplay
La fog of war no es solo decoración.
Puede afectar:
- markers visibles
- enemigos detectables
- objetivos conocidos
- navegación táctica

Por eso conviene que el estado de fog viva fuera de Three.js y Three.js solo lo pinte.

## Anti-patrones
- renderizar el mundo entero para una UI táctica pequeña
- calcular visibilidad solo con estética y no con reglas del juego
- mezclar “explorado” con “visible ahora” como si fueran lo mismo
- hacer depender toda la fog de un RTT a 60 fps

## Recomendación fuerte
En la mayoría de juegos, empezar por:
- mapa base simplificado o prehorneado
- overlay de fog separado
- iconos relevantes
- actualización por eventos, ticks o sectores

Solo subir complejidad visual si la lectura táctica ya está resuelta.

## Pendiente de ampliar
- multijugador con fog compartida por equipo
- streaming de exploración persistente

# Transparency Pitfalls

## Objetivo
Evitar uno de los pozos clásicos de Three.js: asumir que materiales transparentes se comportarán de forma intuitiva solo por poner `transparent = true`.

## Regla principal
**La transparencia en tiempo real no es magia.**
Orden de render, depth y sorting importan muchísimo, y hay casos donde no existe una solución perfecta barata.

## Qué suele salir mal
- objetos transparentes que se dibujan en orden raro
- caras traseras o internas que desaparecen o parpadean
- vidrio o overlays que tapan cosas de forma incorrecta
- partículas y transparencias apiladas que se ven mal
- postprocessing que empeora los artefactos

## Modelo mental sano
Con opacos, el depth buffer ayuda mucho.
Con transparentes, Three.js suele depender bastante de sorting por objeto, y eso tiene límites claros.

Resultado:
- entre objetos transparentes complejos, el orden puede fallar
- dentro del mismo mesh, el problema puede ser todavía peor

## Defaults sanos
Antes de tocar hacks raros:
- preguntarse si de verdad hace falta transparencia real
- preferir opaco, alpha test o dither si visualmente basta
- mantener pocas capas transparentes simultáneas
- evitar geometrías transparentes complejas e interpenetradas como base del juego

## Alternativas más sanas
### 1. Alpha test / cutout
Útil para:
- hojas
- vallas
- sprites recortados
- detalles donde no hace falta semitransparencia suave

Ventaja:
- mucho más estable que la transparencia clásica

### 2. Fake transparency
Útil para:
- HUDs diegéticos
- efectos estilizados
- superficies donde importa la sensación más que la física correcta

### 3. Dither / temporal tricks
A veces encaja mejor que apilar materiales transparentes caros y frágiles.

## Si hace falta transparencia real
Mirar estas palancas:
- `depthWrite = false` muchas veces ayuda
- `depthTest` según el caso, con cuidado
- `renderOrder` para casos concretos y controlados
- separar geometría en capas o meshes distintos
- simplificar la forma o el número de capas visibles

## Qué no hacer
- usar `renderOrder` como martillo universal
- asumir que un único material transparente arregla vidrio complejo, partículas y overlays a la vez
- mezclar demasiadas superficies transparentes con expectativas de corrección perfecta
- meter transparencia por gusto cuando alpha test u opaco resolvían el problema

## Casos típicos
### Follaje
- casi siempre mejor alpha test que transparencia suave

### Vidrio
- usar con moderación
- separar piezas si hace falta
- confirmar si el efecto visual compensa el coste y los artefactos

### Partículas
- controlar blending y número de capas
- asumir que mucha superposición traerá problemas visuales y de rendimiento

### UI en mundo 3D
- intentar composición y capas simples
- no tratarla como si fuera vidrio físicamente correcto

## Cuándo prototipar antes
Hacer spike temprano si el juego depende mucho de:
- mucho vidrio
- partículas densas
- materiales semitransparentes hero
- composición compleja con postprocessing

## Recomendación fuerte
Primero decidir si necesitas:
- opaco
- alpha test
- fake transparency
- transparencia real

Y elegir la opción más barata que mantenga la lectura visual.

## Referencias asociadas
- `render-targets.md`
- `postprocessing.md`
- `quality-tiers.md`

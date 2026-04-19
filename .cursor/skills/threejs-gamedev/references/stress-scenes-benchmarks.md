# Stress Scenes and Internal Benchmarks

## Objetivo
Crear escenas de estrés y benchmarks internos que sirvan para validar budgets, quality tiers, frame pacing y decisiones de arquitectura en un juego Three.js real.

## Regla principal
**No confiar solo en la escena bonita del prototipo.**
Hace falta una batería pequeña de escenas que fuercen los cuellos típicos del proyecto.

## Qué debe responder una escena de estrés
- ¿qué pasa si sube la densidad de props?
- ¿qué pasa si activo el tier alto?
- ¿qué pasa si hay carga, spawn o cambio de zona?
- ¿qué pasa con sombras, postprocessing y pixel ratio altos?
- ¿qué pasa en móvil o hardware más flojo?

## Tipos de escenas de estrés útiles
### 1. Draw-call stress
Sirve para validar:
- instancing vs meshes sueltas
- merge de geometrías
- materiales por objeto

Patrón de referencia:
- baseline `NAIVE`
- variante `MERGED`
- variante `INSTANCED`

El example `webgl_instancing_performance` deja exactamente esta comparación, y merece convertirse en benchmark interno de referencia.

### 2. Scene graph / CPU stress
Sirve para validar:
- coste de updates por frame
- demasiados nodos vivos
- lógica por entidad
- raycasts o systems que escalan mal

Medir:
- frame time
- nodos vivos
- frecuencia de updates
- degradación al aumentar entidades

### 3. Postprocessing stress
Sirve para validar:
- composer
- passes
- render targets
- tiers de calidad

Escalar cosas como:
- bloom on/off
- DOF on/off
- resolución interna de passes
- pixel ratio

Importa mucho porque el coste aquí puede cambiar brutalmente entre tiers.

Cuando el proyecto usa mirrors, portals o minimaps, merece además una escena RTT dedicada por familia. Ver `render-target-families.md`.

### 4. Asset activation stress
Sirve para validar:
- carga bajo demanda
- `compileAsync()`
- guards de async
- stutter al cambiar modelo, skin o escena

Prueba útil:
- alternar assets pesados o personajes
- medir picos al activar
- comparar con y sin warmup

### 5. Spawn/despawn stress
Sirve para validar:
- lifecycle
- pooling vs create/dispose
- presupuesto por frame
- tirones por oleadas o chunks

### 6. Character/gameplay stress
Sirve para validar:
- player controller
- animación
- físicas/queries
- cámara
- densidad de enemigos o interacciones

Importante porque un benchmark bonito pero vacío puede ocultar el coste real del juego.

## Qué no debe ser un benchmark interno
- una demo irrelevante al juego real
- una sola escena “hero shot”
- una prueba sin métricas guardadas
- una comparativa donde cambian diez cosas a la vez

## Métricas mínimas
Registrar al menos:
- frame time medio
- picos de frame time
- draw calls
- triángulos
- geometries/textures/programs
- tier activo
- configuración relevante de sombras y post

Y si aplica:
- tiempo de build
- tiempo de carga
- tiempo de activación visible

## Diseño de benchmarks sanos
### Controlar variables
Cambiar una cosa importante cada vez:
- misma escena, distinto número de props
- mismo contenido, distinto tier
- mismo asset, con y sin warmup

Si quieres separar CPU y GPU con algo de honestidad, conviene además tener benches donde cambie una palanca visual limpia y otros donde cambie una palanca lógica limpia.

### Repetibilidad
- mismas semillas si hay aleatoriedad
- mismas rutas de cámara si importa la vista
- mismo orden de activación
- mismas condiciones de calidad

### Relevancia
Cada benchmark debería parecerse a una amenaza real del juego:
- mundo denso
- combate con muchos actores
- escena con post pesado
- cambio de chunk
- selector o inventario 3D

## Conjunto mínimo recomendado
Para un proyecto medio, tener al menos:
1. **draw-call bench**
2. **postprocessing/tier bench**
3. **asset activation bench**
4. **spawn or chunk bench**
5. **real gameplay slice bench**

## Integración con quality tiers
Los benchmarks deberían poder correr por tier:
- bajo
- medio
- alto

Así se ve si el sistema de calidad realmente escala o si solo cambia dos sliders cosméticos.

Si existe scaler adaptativo, también conviene probar:
- cuánto tarda en reaccionar
- si hace thrash
- si el downgrade salva frame pacing o solo maquilla la media

## Integración con stutter
No mirar solo la media.
Mirar:
- picos al entrar
- picos al cambiar tier
- picos al activar assets
- picos al recrear composer, sombras o materiales

## Integración con CI o revisiones manuales
No hace falta automatizar todo desde el día 1.
Pero sí conviene:
- tener escenas guardadas
- poder abrirlas fácil
- saber qué métricas mirar
- comparar antes/después de cambios grandes

Para convertir esto en runs más repetibles con warmup, ventana de medida y salida estructurada, ver `benchmark-reporting.md`.

## Resultado esperado
Un benchmark bueno no dice “va rápido”.
Dice algo como:
- tier alto rompe en móvil por DOF + bloom
- spawn de 200 props mete pico de 40ms
- instancing reduce draw calls de forma brutal sin romper el caso
- warmup evita el tirón al cambiar skin

Eso ya es información accionable de verdad.

Cuando esos resultados se guardan por run, conviene además compararlos con una capa de diff consistente. Ver `benchmark-diffs.md`.

## Anti-patrones
- optimizar sin escena de prueba estable
- confundir benchmark sintético con experiencia real final
- medir solo una vez
- no guardar la configuración de la prueba
- no cruzar métricas de render con eventos del juego

## Recomendación fuerte
Crear una pequeña carpeta o suite de `benchScenes` o equivalente que:
- represente amenazas reales del proyecto
- exponga toggles de calidad y densidad
- muestre métricas básicas
- sirva para comparar cambios grandes antes de darlos por buenos

## Pendiente de ampliar
- seeds reproducibles y rutas de cámara fijas
- automatización mínima de captures de métricas
- escenarios específicos por género

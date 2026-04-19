# Animation Systems

## Objetivo
Usar el sistema de animación de Three.js como un subsistema de juego serio, no como una serie de `play()` sueltos pegados al loader.

## Regla principal
Separar claramente:
1. **assets y clips**
2. **mixer y actions**
3. **estado de animación**
4. **reglas de transición**
5. **sincronización con gameplay**

## Piezas base del sistema
El sistema oficial gira alrededor de:
- `AnimationClip`
- `KeyframeTrack`
- `AnimationMixer`
- `AnimationAction`
- opcionalmente `AnimationObjectGroup`

## Default recomendado
- un `AnimationMixer` por personaje o raíz animada, salvo casos especiales
- tratar cada clip como dato
- tratar cada `AnimationAction` como control runtime
- mantener un módulo o system de animación separado del input y de las reglas de juego

## Patrón sano
No hacer esto:
- cargar glTF
- crear mixer
- llamar a `clipAction(...).play()` en cualquier sitio
- cruzar dedos

Hacer esto:
- registrar clips por nombre
- crear actions controladas
- definir estado base (`idle`, `walk`, `run`, etc.)
- encapsular transiciones y pesos
- actualizar mixer en el loop con `delta`

## Base actions vs additive actions
Los examples oficiales dejan una separación muy útil:

### Base actions
Estados principales mutuamente excluyentes o casi:
- idle
- walk
- run
- jump loop

### Additive actions
Capas parciales o poses adicionales:
- head shake
- aim
- upper-body pose
- sneak pose
- gesto o reacción

Regla fuerte:
- no mezclar ambas categorías sin nombrarlas
- las base actions mandan el cuerpo principal
- las additive ajustan por encima con pesos controlados

## Crossfades
El sistema oficial soporta crossfade, pero eso no significa que toda transición deba dispararse sin criterio.

Patrón recomendable:
- centralizar transiciones
- usar duraciones pequeñas y consistentes
- resetear tiempo y peso cuando toca
- si una transición depende del final del loop actual, sincronizarlo explícitamente

## Time scale y weights
`AnimationAction` y `AnimationMixer` permiten cambiar:
- peso
- velocidad
- pausado
- repetición

Eso es potente, pero también fácil de convertir en caos.

Regla:
- el gameplay decide intención
- el animation system decide pesos, crossfades y timeScale efectivos

## Update loop
Regla obligatoria:
- actualizar `mixer.update(delta)` en el loop principal
- usar `delta` real del frame
- no depender de tiempos hardcoded fuera del sistema

## Locomotion y state machine
En juegos con personaje controlable, la animación debería colgar de un estado de locomotion más estable que el teclado crudo.

Patrón recomendado:
- input -> locomotion intent
- locomotion/controller -> estado del personaje
- animation system -> resolución de clips, blending y capas

Estados útiles para animación:
- idle
- move
- sprint
- jumpStart
- airborne
- land

Regla fuerte:
- no disparar `walk` porque `W` está pulsada
- disparar `walk` o `run` porque el personaje realmente se está desplazando según su locomotion state

Para diseño explícito de estados, prioridades, one-shots y layering conceptual, ver `animation-state-machines.md`.

## Root motion
Decidir pronto si el movimiento real viene de gameplay/controller o del clip animado.

Recomendación inicial:
- locomotion gobernada por gameplay por defecto
- root motion solo en casos concretos donde compense de verdad

Motivo:
- simplifica colisiones
- simplifica multiplayer
- simplifica sincronización entre cámara, controller y animación

## Clonado de personajes
Los examples enseñan algo muy útil:
- usar `SkeletonUtils.clone()` para duplicar personajes animados
- distinguir entre clones con skeleton independiente y setups con skeleton compartido

Recomendación:
- independencia total si cada personaje puede tener estado distinto
- shared skeleton solo si realmente buscas compartir estado y sabes lo que haces

### Gotchas concretos al clonar SkinnedMesh
Probados en producción al clonar un mismo personaje para múltiples actores (NPCs, jugadores remotos, etc.). Estos errores son silenciosos hasta que pasan, y cuando pasan cuestan tiempo:

- **No vale `Object3D.clone()` para skinned meshes**. El clon nativo comparte el `Skeleton` por referencia y todos los actores acaban con la misma pose (o NaN). Hay que usar `clone` de `three/examples/jsm/utils/SkeletonUtils.js`. Síntoma típico: "todos los clones se mueven igual", o "el clon aparece en pose T".
- **Los exports de `SkeletonUtils.js` son nombrados, no namespace**. Importar como `import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'`. `import { SkeletonUtils } from '...'` falla en runtime con `does not provide an export named 'SkeletonUtils'`.
- **`SkeletonUtils.clone` comparte materiales por referencia**. Si tintas un clon, tintas a todos. Para tintes per-instancia hay que recorrer el clon y hacer `material.clone()` por mesh (y multiplicar `.color` por el tint). El tinte multiplicativo sobre `.color` preserva la textura subyacente; sustituir el material rompe el aspecto.
- **`SkeletonUtils.clone` también comparte geometrías**, lo cual está bien (un upload de GPU para todos). Pero implica que **disponer la geometría desde el `dispose()` de un clon rompe a los demás**. Regla: el clon dispone solo lo que clonó (materiales tinte, mixer, sprite tags). La geometría vive con la fuente.

### Patrón "source + instance" para activos compartidos
Cuando el mismo GLB se usa en N actores (jugador local + NPCs, jugador local + remotos, etc.), separar la carga del activo de la creación de instancias:

- `loadCharacterSource(url)`: fetch + parse del GLB con caché por URL. Devuelve un objeto inmutable con `{ scene, clips }`.
- `createCharacterInstance(source, opts)`: síncrono. Hace `cloneSkinned(source.scene)`, monta su propio `AnimationMixer`, opcionalmente clona y tinta materiales, y devuelve la API runtime (`tick`, `dispose`, `getJugWorldPosition`, etc.).
- `loadCharacter(url, opts)`: helper async para call sites simples. Internamente `await loadCharacterSource(url)` + `createCharacterInstance(source, opts)`.

Ventajas:
- Una sola descarga + parseo por URL.
- Spawnear el segundo actor es un `clone` + setup sync, sin esperar red.
- El call site del jugador local no cambia.
- El sistema de "remote actors" (NPC manager, jugador remoto, etc.) puede instanciar dentro de un callback sin awaits.

Aplicar el mismo split a props no-animados (e.g. `loadJugSource` + `createJugInstance`): plain `Object3D.clone(true)` basta porque no hay esqueleto, pero el patrón de caché + clone-de-materiales-solo-si-tintas mantiene las reglas claras.

### Animación de clones
Cada clon necesita su propio `AnimationMixer` corriendo sobre su propia escena clonada. Los `AnimationClip` son datos puros, así que el `mixer` del clon puede reutilizar los clips parseados en la fuente sin riesgo (limpiar tracks de scale **una vez** en la fuente, no por instancia).

## Skeletons y cleanup
Si un skinned mesh o skeleton deja de usarse:
- revisar si el skeleton es compartido
- si no lo es, limpiar con `Skeleton.dispose()` cuando toque
- en el patrón source/instance: la fuente vive lo que vive la página; el `dispose()` del instance solo limpia mixer + materiales clonados + sprites propios. Geometrías y skeletons originales se dejan en paz.

## Bounding volumes
La guía oficial de updates recuerda algo importante:
- `SkinnedMesh` tiene bounding volumes propias
- si el juego depende de culling, queries o debug fiable sobre una malla animada, conviene revisar bounding boxes/spheres en estados relevantes

## Debug útil
- `SkeletonHelper`
- panel para pesos y actions activas
- visualización del estado actual (`idle`, `walk`, etc.)
- toggles para additive layers
- estado de máquina y transición activa si existe

## Anti-patrones
- animación mezclada con input directo
- `clipAction(...).play()` disperso por todo el código
- no distinguir base vs additive
- no centralizar crossfades
- no nombrar clips y depender de índices mágicos
- clonar personajes animados sin pensar en skeletons y ownership
- usar `Object3D.clone()` en SkinnedMesh y luego perseguir por qué los clones se mueven idénticos
- tintar el material original esperando independencia entre clones
- disponer la geometría en el `dispose()` de un clon (rompe a todos los demás)

## Recomendación fuerte
Para juegos reales, crear un `animationSystem` o `characterAnimationController` que:
- indexe clips por nombre
- exponga intents de alto nivel
- resuelva transiciones
- actualice mixer
- sepa limpiar recursos si el actor desaparece

Si el personaje ya tiene varias acciones, combate o capas parciales, separar además un `characterAnimationStateMachine` explícito.

## Pendiente de ampliar
- root motion vs movimiento gobernado por gameplay
- upper/lower body layering
- integración con combate o locomotion avanzada
- multiplayer y replicación de estado de animación

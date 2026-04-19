# Character Locomotion

## Objetivo
Diseñar movimiento de personaje en Three.js con sensación jugable, arquitectura mantenible y límites claros entre input, locomotion, colisión, cámara y animación.

## Regla principal
**Locomotion no es solo input ni solo física.**
Es una capa propia que traduce intención del jugador en movimiento creíble, restricciones espaciales y estado de personaje.

## Separación recomendada
Separar al menos:
1. **input intent**
2. **character locomotion state**
3. **collision/physics queries**
4. **camera behavior**
5. **animation state**

Patrón sano:
- input produce intención (`moveX`, `moveY`, `jumpPressed`, `sprintHeld`)
- locomotion decide aceleración, velocidad, giro y contacto con suelo
- colisión resuelve penetraciones y restricciones
- animación consume estado alto nivel
- cámara sigue o responde sin convertirse en la lógica del personaje

## Tipos comunes
### First-person
- cámara anclada al personaje
- movimiento relativo a yaw de cámara
- pointer lock habitual en escritorio

### Third-person
- cámara desacoplada parcialmente
- movimiento relativo a cámara proyectada en plano
- suele requerir mejor giro, facing y blending de animación

### Tank / vehicle-lite (sin strafe)

Cuando **no** quieres A/D como strafe lateral (p. ej. la mano derecha o otra mecánica ya consume ejes “laterales”, o quieres que girar el cuerpo sea una decisión costosa):

- **W/S**: empujan en la dirección **forward/back** del personaje (en su frame), no en el de la cámara.
- **A/D**: cambian **solo el yaw** (`facing`) a ritmo constante.
- **Facing como estado**: lo actualiza el input de giro, no `atan2(velocity)` (si derivaras facing de velocidad, los pivotes en seco o el “derrape” de intención se vuelven raros).

Parámetros típicos a exponer: velocidad de giro (rad/s), eventualmente asimetría adelante/atrás si la fantasía del juego lo pide (no es obligatorio).

Ventajas: esquema estable con free-look o cámara auto-follow; cada giro es explícito (útil si otra simulación acoplada al personaje reacciona a **velocidad angular**).

Tradeoff: no hay strafe; las curvas son “W + A” o “W + D”, no “solo D”.

### Runner / lane / arcade
- locomotion más guionizada
- menos libertad, más control del feel

No mezclar necesidades de estos tipos sin decidir cuál manda.

## Default recomendado
Para muchos juegos 3D web:
- player kinemático
- collider simple, normalmente cápsula
- mundo estático consultable con estructura espacial si hace falta
- gravedad y salto controlados por lógica propia
- movimiento relativo a cámara
- cámara y locomotion desacopladas, pero coordinadas

## Collider del personaje
El example `games_fps` deja una señal muy útil:
- la **cápsula** suele ser una base mucho más sana que una caja para movimiento humano básico

Ventajas:
- sube mejor pequeñas irregularidades
- se engancha menos en esquinas
- representa bastante bien un cuerpo de pie

Regla práctica:
- collider simple primero
- collider complejo del jugador, casi nunca como default

## Suelo, pendientes y paredes
No basta con detectar colisión. Hay que clasificarla.

Patrón útil:
- usar la normal del contacto
- decidir si algo cuenta como suelo según un umbral
- tratar paredes aparte

`games_fps` deja una idea canónica:
- no toda superficie colisionada es suelo
- las pendientes necesitan criterio explícito

## Movimiento en suelo vs aire
Separar claramente:
- aceleración en suelo
- fricción o damping en suelo
- control aéreo
- gravedad

Patrón fuerte:
- más control y respuesta en suelo
- menos control en aire
- salto solo desde estado válido de grounded

La demo oficial mete incluso un air control reducido. Ese detalle merece quedarse como doctrina porque cambia muchísimo la sensación del juego.

## Substeps
Cuando hay velocidad, gravedad o colisiones rápidas:
- usar substeps de simulación puede ahorrar bastantes problemas

El example `games_fps` lo hace con intención clara:
- divide el frame en varios pasos para reducir tunneling y errores de resolución

Regla:
- no confiar ciegamente en un único paso por frame cuando ya ves clipping o inestabilidad

## Orden de update recomendado
1. leer input normalizado
2. construir intención de locomotion
3. aplicar aceleración y gravedad
4. integrar movimiento
5. resolver colisiones
6. actualizar estado (`grounded`, `falling`, `jumping`, etc.)
7. sincronizar cámara
8. emitir estado para animación

## Estado de locomotion
No quedarse en `velocity` y ya.

Mínimo útil:
- `grounded`
- `jumpRequested`
- `falling`
- `moveIntent`
- `moveDirectionWorld`
- `speed`
- `facingDirection`
- `sprint`
- `crouch` si existe

Este estado debería ser suficientemente limpio como para alimentar animación y multiplayer sin exponer detalles crudos del input.

## State machine
En cuanto el personaje hace algo más que caminar:
- conviene una state machine explícita o, mínimo, estados bien delimitados

Estados típicos:
- idle
- locomotion
- jump start
- airborne
- land
- dash
- climb
- knockback

No hace falta una mega jerarquía desde el día 1, pero sí evitar reglas dispersas tipo `if` por todos lados.

## Root motion vs movimiento por gameplay
Decidirlo pronto.

### Gameplay-driven locomotion
- el movimiento real lo manda el controller
- la animación acompaña
- suele ser el default más sano para web y prototipos de juego

### Root motion
- la animación empuja parte del desplazamiento
- útil en casos concretos, combate o acciones authoradas
- exige más disciplina para colisiones, networking y blending

Recomendación inicial:
- usar locomotion gobernada por gameplay por defecto
- meter root motion solo donde aporte muchísimo y sepas por qué

## Cámara
La cámara no debería decidir el movimiento del personaje por accidente.

Regla útil:
- usar la orientación de cámara como referencia de intención
- pero mantener estado propio del personaje para facing y locomotion

En first-person la unión puede ser más directa.
En third-person, si atas todo a la cámara sin filtro, el personaje suele sentirse raro o nervioso.

## Pointer lock y lifecycle
El example `misc_controls_pointerlock` recuerda algo importante:
- el control de ratón en escritorio tiene lifecycle real: lock, unlock, overlay, foco

Eso no es detalle menor.
Diseñarlo como parte del controller, no como parche suelto.

## Física y queries
Aunque uses un motor físico o estructuras como octree:
- el player controller merece reglas específicas
- no delegar toda la sensación del personaje a la simulación bruta

Patrón sano:
- locomotion propia
- queries/collisions de apoyo
- sincronización clara con la representación visual

## Teleport y recuperación
Otro patrón muy real de demos y juegos:
- si el personaje cae fuera del mundo, hay que recuperarlo

Parece obvio, pero conviene dejarlo como regla explícita:
- tener `teleportToSafePoint()` o equivalente
- no dejar el estado roto tras una caída o NaN espacial

## Debug útil
- visualizar collider del player
- mostrar normal de contacto y grounded
- mostrar velocidad horizontal/vertical
- mostrar estado de locomotion
- toggles para substeps y gravedad
- puntos de respawn o safe points visibles

## Anti-patrones
- unir input DOM, cámara, salto y colisiones en una sola función monstruo
- usar mesh visual como collider real del player
- no distinguir suelo de pared
- depender de física totalmente realista para el movimiento principal
- no separar aire y suelo
- no tener estado explícito de locomotion
- acoplar animación directamente al teclado en vez de al estado del personaje

## Recomendación fuerte
Crear un `characterController` o `locomotionSystem` que:
- consuma input abstracto
- mantenga collider y estado del personaje
- resuelva movimiento y colisiones
- publique estado de locomotion para cámara y animación
- tenga recuperación, respawn y debug

## Pendiente de ampliar
- third-person camera rigs
- stair stepping más fino
- ledge detection
- root motion selectiva
- networking de locomotion
- combate y locomotion avanzada

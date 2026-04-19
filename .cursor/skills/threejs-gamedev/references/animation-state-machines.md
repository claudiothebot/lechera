# Animation State Machines

## Objetivo
Convertir la animación de personajes en una capa explícita de estados, transiciones y capas, en vez de una colección de clips reproducidos a mano.

## Regla principal
**No gobernar animación con teclas ni con clips sueltos.**
Gobernarla con estados de personaje e intents de gameplay.

## Separación sana
Separar al menos:
1. **locomotion state**
2. **animation state machine**
3. **clip/actions layer**
4. **additive or partial-body layers**
5. **event-driven one-shots**

Patrón sano:
- locomotion/controller publica estado alto nivel
- animation state machine decide estado visual principal
- actions concretas se activan por transición controlada
- capas additive o upper-body se mezclan por separado

## Qué resuelve una state machine
- qué clip base debe estar activo
- cuándo cambiar de estado
- qué transición usar
- qué eventos disparan one-shots
- qué capas pueden convivir
- qué prioridades mandan si hay conflicto

## Estados base típicos
### Locomotion base
- idle
- walk
- run
- sprint
- jumpStart
- airborne
- land

### Estados contextuales
- crouch
- aim
- block
- hitReact
- attack
- dead

No todos deben vivir en la misma máquina. A veces conviene:
- una state machine principal de locomotion
- una capa superior de combate/interacción

## Default recomendado
Para un personaje jugable típico:
- una máquina principal para locomotion
- clips base mutuamente excluyentes
- capas additive o parciales para poses secundarias
- eventos discretos para acciones cortas
- transiciones centralizadas con duraciones coherentes

## Patrón base
### 1. Estado del personaje
Consumir cosas como:
- `grounded`
- `speed`
- `moveDirection`
- `facingDirection`
- `sprint`
- `jumpRequested`
- `attackRequested`
- `hitReaction`

### 2. Resolución de estado animado
Ejemplo:
- si `!grounded` -> `airborne`
- si `grounded` y `speed` casi cero -> `idle`
- si `grounded` y `speed` media -> `walk`
- si `grounded` y `speed` alta + sprint -> `run`

### 3. Resolución de clips
- `idle` -> clip idle
- `walk` -> clip walk
- `run` -> clip run
- `airborne` -> clip jump/fall loop

### 4. Resolución de capas
- `aim` ajusta upper body
- `hitReact` o gesto puede entrar como one-shot o capa temporal

## Base layer vs additive layer
El example oficial de additive blending deja una doctrina muy buena:

### Base layer
- locomotion y cuerpo principal
- solo una action dominante o casi dominante a la vez

### Additive layer
- poses o correcciones parciales
- pesos continuos
- útil para aim, sneak pose, head shake, reacción ligera

Regla fuerte:
- no usar additive como parche para arreglar una base rota
- primero resolver bien la locomotion base
- luego añadir capas con propósito claro

## Full body vs upper body
Patrón muy útil en juegos:
- locomotion en cuerpo completo o lower body dominante
- acciones como aim, reload, attack windup o gesto en upper body

Aunque Three.js no trae una “layer graph” lista como motor completo, la doctrina sigue siendo válida:
- separar conceptualmente capas completas de capas parciales
- no dejar que una acción de upper body rompa la locomotion base sin querer

## Transiciones
Centralizar transiciones, no dispararlas por todo el código.

Buenas reglas:
- duraciones pequeñas y coherentes
- resetear tiempo del clip de entrada si corresponde
- no encadenar fades contradictorios sin control
- si una transición debe esperar al final de loop, sincronizarla explícitamente

El example oficial hace justo esto con `prepareCrossFade`, `synchronizeCrossFade` y `executeCrossFade`. Muy buena señal.

## Estados instantáneos vs sostenidos
### Sostenidos
- idle
- walk
- run
- airborne
- crouch
- aim mode

### Instantáneos o one-shot
- attack start
- roll
- hit reaction
- emote corto
- interact

Regla:
- un one-shot no debería destruir la lógica de locomotion si solo debe superponerse o bloquear temporalmente

## Prioridades
Definir qué gana cuando hay conflicto.

Ejemplo posible:
1. dead
2. hard stun / knockback
3. attack locked animation
4. jump/airborne
5. locomotion
6. idle

No hace falta esta lista exacta, pero sí una política explícita.

## Root motion
Si usas root motion, la state machine tiene aún más responsabilidad.

Recomendación base:
- locomotion gobernada por gameplay para movimiento normal
- root motion selectiva para acciones especiales si compensa

Porque si todo depende del root motion:
- colisiones se complican
- multiplayer se complica
- prediction se complica
- ajustar feel se complica

## Multiplayer
La state machine ayuda mucho a no replicar basura visual.

Replicar mejor:
- estado alto nivel
- velocidad o intención relevante
- eventos discretos

No replicar:
- pesos internos exactos de todas las actions
- detalles de mezcla salvo necesidad extrema

## Debug útil
- estado actual de la máquina
- estado previo
- transición en curso
- clip base activo
- pesos de capas additive
- flags de bloqueo o prioridad

## Anti-patrones
- `if (keyW) play('walk')`
- transiciones disparadas desde input, gameplay y UI a la vez
- additive layers sin ownership ni límites
- no distinguir one-shot de estado sostenido
- no definir prioridades entre ataque, salto, golpe y locomotion
- replicar detalles internos de mixer como si fueran gameplay

## Recomendación fuerte
Crear un `characterAnimationStateMachine` o equivalente que:
- consuma estado de personaje
- resuelva estado visual principal
- dispare transiciones centralizadas
- gestione capas y one-shots
- publique debug legible

## Pendiente de ampliar
- máscaras de huesos o estrategias de upper/lower body
- one-shots con cancel windows
- combate cuerpo a cuerpo
- locomotion 8-directional
- root motion selectiva por acción

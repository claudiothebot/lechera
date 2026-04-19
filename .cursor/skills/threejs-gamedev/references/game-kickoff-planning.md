# Game Kickoff Planning

## Objetivo
Tener un arranque más concreto cuando el usuario dice “quiero hacer un juego X”, evitando saltar demasiado pronto al código sin cerrar alcance, stack y primer slice jugable.

## Regla principal
**No empezar por la carpeta ni por el shader.**
Empezar por unas pocas decisiones que cambian arquitectura, scope y tooling.

## Cuándo usar esto
Cuando el usuario quiera:
- empezar un juego nuevo
- prototipar una idea de juego
- decidir stack o estructura inicial
- aterrizar un concepto todavía difuso

## Flujo recomendado
1. Hacer pocas preguntas, pero las que sí cambian el proyecto.
2. Resumir respuestas en un brief corto.
3. Recomendar stack y estructura por defecto.
4. Declarar fase actual y qué queda explícitamente fuera.
5. Elegir un primer slice jugable muy pequeño.
6. Crear o proponer un `AGENTS.md` del proyecto para registrar decisiones y cambios.

## Preguntas que sí merecen la pena
No hacer un interrogatorio eterno. Normalmente bastan 8 a 12.

### Juego y alcance
- ¿qué género o mezcla de géneros es?
- ¿qué hace el jugador en el bucle principal, en una frase?
- ¿es singleplayer o multiplayer?
- ¿qué nivel de ambición tiene, prototipo corto o proyecto serio?

### Cámara y control
- ¿primera persona, tercera, top-down, lateral, libre?
- ¿teclado/ratón, gamepad, touch o mezcla?
- ¿desktop, móvil o ambos?

### Mundo y presentación
- ¿3D total, 2.5D o muy simple?
- ¿estilo placeholder, low poly, stylized, realista, abstracto?
- ¿hay físicas importantes o solo colisiones sencillas?

### Producción
- ¿qué debe estar jugable primero?
- ¿qué puede ser placeholder sin problema?
- ¿hay restricciones de assets, licencias o tiempo?

## Qué devolver después de preguntar
Responder con un kickoff brief corto, no con un ensayo.

### Shape útil
- concepto del juego
- target platform
- camera/control
- singleplayer o multiplayer
- stack recomendado
- riesgos principales
- primer slice jugable
- qué se deja explícitamente fuera de v0

Si la idea todavía está muy verde o su scope huele raro, contrastarla con `threejs-game-viability.md` antes de comprometer stack o roadmap.

## Slice inicial recomendado
El primer slice debería ser casi ridículo de pequeño.

Ejemplos:
- personaje se mueve + cámara + colisión básica + objetivo simple
- vehículo se controla + circuito mínimo + restart
- shooter simple con un arma y un dummy
- puzzle con una sola mecánica principal

## Orden de trabajo recomendado
No intentar hacer todo a la vez.

Patrón sano:
- fase 1: core loop y mecánica
- fase 2: feel y estructura
- fase 3: presentación y contenido
- fase 4: sistemas avanzados
- fase 5: multiplayer si aplica

Para esta secuencia completa, ver `phased-game-workflow.md`.

## Anti-patrones
- arrancar con menú, settings, backend y progreso persistente antes del core
- diseñar veinte sistemas antes del primer loop jugable
- meter multiplayer desde el día 1 sin validar que el juego lo necesita
- hacer preguntas sobre todo si todavía no está claro el género real

## Recomendación fuerte
Cuando el usuario diga “quiero hacer un juego X”, guiar así:
- cerrar brief corto
- recomendar stack por defecto
- definir v0 jugable
- dejar backlog fuera del arranque
- crear `AGENTS.md` del proyecto

## Referencias asociadas
- `phased-game-workflow.md`
- `threejs-game-viability.md`
- `default-project-stack.md`
- `default-content-sourcing.md`
- `project-agents-md.md`

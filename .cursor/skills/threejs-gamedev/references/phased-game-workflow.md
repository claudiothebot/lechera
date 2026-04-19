# Phased Game Workflow

## Objetivo
Evitar el error clásico de intentar hacer un juego entero de golpe, forzando una secuencia de fases donde primero se valida la mecánica y luego se añade complejidad.

## Regla principal
**No construir arte, backend y multiplayer sobre una mecánica no validada.**
Primero probar que el juego funciona. Luego que se siente bien. Luego hacerlo bonito. Luego hacerlo grande.

## Cuándo usar esto
Usar esta referencia cuando el usuario quiera:
- empezar un juego nuevo
- planificar roadmap inicial
- decidir en qué orden atacar sistemas
- evitar scope explosion

## Secuencia recomendada
### Fase 1. Core loop y mecánica
Objetivo:
- validar la fantasía jugable básica
- comprobar si el loop principal tiene gracia

Qué sí hacer:
- movimiento básico
- cámara mínima
- colisión suficiente
- una sola mecánica central
- un objetivo o fail state simple
- placeholders feos sin problema

Qué no hacer todavía:
- assets finales
- UI compleja
- progreso meta
- backend
- multiplayer completo

Criterio de salida:
- el usuario puede jugar 1 o 2 minutos y decir si la idea funciona o no

### Fase 2. Feel y estructura
Objetivo:
- hacer que el juego responda bien
- limpiar arquitectura mínima para no seguir sobre barro

Qué sí hacer:
- mejorar controles
- mejorar cámara
- ajustar timing, feedback y dificultad inicial
- ordenar bootstrap, systems y carpetas
- eliminar bugs que rompen la experiencia base

Qué no hacer todavía:
- polish audiovisual grande
- expansión fuerte de contenido

Criterio de salida:
- el slice base ya no solo funciona, también empieza a sentirse bien

### Fase 3. Presentación y contenido
Objetivo:
- sustituir placeholders donde de verdad aporte
- reforzar identidad visual y sonora

Qué sí hacer:
- assets 3D mejores
- texturas y materiales
- música y SFX
- UI más clara
- más variedad de contenido si la mecánica ya aguanta

Regla:
- mejorar primero lo que más cambia la percepción del loop, no lo cosmético secundario

Criterio de salida:
- el juego ya comunica mejor su intención y deja de parecer solo un prototipo gris

### Fase 4. Sistemas avanzados
Objetivo:
- añadir complejidad solo después de validar el juego base

Puede incluir:
- progreso persistente
- economy/meta loops
- generación más seria
- herramientas internas
- settings más completos

### Fase 5. Multiplayer, si aplica
Regla importante:
- si multiplayer es accesorio, va claramente después del core loop validado
- si multiplayer es central para la fantasía del juego, se diseña pronto, pero se implementa en un slice mínimo, no como sistema gigante desde el día 1

Slice sano de multiplayer:
- conexión mínima
- un solo escenario
- una sola interacción relevante
- validación de latencia, authority y sensación antes de escalar

## Cómo validarlo con el usuario
Al final de cada fase, hacer una validación corta:
- qué funciona
- qué no funciona
- qué duele más ahora
- si merece pasar a la siguiente fase o seguir iterando la actual

## Anti-patrones
- hacer mecánica, arte, backend y multiplayer a la vez
- pulir assets antes de comprobar si el loop engancha
- meter red demasiado pronto para “ir adelantando”
- añadir más contenido cuando el problema real era el feel
- no declarar explícitamente qué queda fuera de la fase actual

## Regla operativa fuerte
En cada proyecto nuevo:
- declarar fase actual
- declarar qué queda fuera de esa fase
- no saltar de fase sin validación mínima

Esto encaja muy bien con `AGENTS.md` del proyecto.

## Recomendación fuerte
Si el usuario dice “quiero hacer un juego X”, responder con:
1. kickoff breve
2. stack por defecto
3. fase actual = core loop
4. primer slice jugable
5. lista explícita de cosas que todavía no vamos a tocar

## Referencias asociadas
- `game-kickoff-planning.md`
- `default-project-stack.md`
- `project-agents-md.md`

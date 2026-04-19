# Multiplayer Consistency Models: Rollback, Lockstep, Hit Validation

## Objetivo
Elegir y aplicar el modelo de consistencia adecuado para un juego multijugador con Three.js en el cliente, sin mezclar presentación visual con autoridad de simulación.

## Regla principal
**No todos los géneros necesitan rollback.**
Y meter rollback donde no toca puede complicar el proyecto mucho más de lo que lo mejora.

Three.js aquí sigue siendo capa de presentación. El modelo de consistencia vive en networking y simulación.

## Tres familias principales
### 1. Servidor autoritativo con snapshots e interpolación
Es el default sano para muchísimos juegos.

Encaja bien en:
- acción general
- cooperativo PvE
- shooters no hiper exigentes
- juegos con físicas compartidas moderadas

Patrón:
- servidor decide estado real
- cliente local puede predecir lo justo
- resto de clientes interpolan snapshots

### 2. Rollback netcode
Encaja mejor cuando:
- el juego depende mucho de inputs precisos y justos
- hay pocos actores relevantes por frame
- la simulación puede re-ejecutarse de forma determinista o suficientemente estable

Muy típico en:
- lucha
- versus 1v1 o 2v2 pequeño
- acción muy input-sensitive

Coste:
- guardar historial de inputs y/o estado
- re-simular
- soportar correcciones frecuentes
- separar muy bien lógica, FX y audio para no duplicar caos visual

### 3. Lockstep
Encaja cuando:
- la simulación puede avanzar por comandos sincronizados
- el ritmo tolera esperar a inputs remotos
- el determinismo es una exigencia seria

Muy típico en:
- estrategia
- tácticos
- juegos de baja frecuencia o turnos híbridos

Coste:
- disciplina dura de determinismo
- mal encaje con acción rápida en navegador si no está muy pensado
- sensibilidad a desincronizaciones

## Default por género
### Fighting / duel muy preciso
- mirar rollback primero
- presentation layer muy desacoplada de la simulación
- FX y animaciones como consecuencia re-aplicable, no como authority

### Shooter / acción competitiva 3D
- servidor autoritativo
- snapshots + interpolación
- predicción local limitada
- hit validation autoritativa
- rollback parcial o lag compensation del servidor, no rollback total del cliente como dogma

### RTS / táctica
- lockstep o variantes por comandos si la simulación lo permite
- si no, servidor autoritativo con snapshots más abstractos

### Coop / sandbox
- snapshots + interpolación + predicción local moderada
- no meter rollback total salvo que haya una razón fortísima

## Rollback en cliente: reglas sanas
Si se usa rollback:
- separar `simulationState` de `presentationState`
- guardar historial por tick
- re-simular solo la parte necesaria
- re-disparar FX visuales con cuidado para no duplicar flashes, partículas o sonidos
- aislar random y tiempo para no romper determinismo

Patrón sano:
1. input local entra con tick
2. se simula provisionalmente
3. llega confirmación o corrección remota
4. se restaura estado base
5. se re-simulan ticks pendientes
6. presentación se suaviza si hace falta

Patrón tóxico:
- usar rollback sin tick fijo claro
- mezclar estado visual con estado lógico reversible
- disparar audio/partículas sin control y repetirlos en cada re-simulación

## Lockstep: reglas sanas
Si se usa lockstep:
- inputs o comandos discretos por tick
- estado inicial idéntico
- misma lógica determinista para todos
- random con seed/tick controlados
- evitar depender de tiempos del navegador o floats caóticos sin control

Three.js no debe decidir nada crítico aquí.
Solo representa el resultado del tick acordado.

## Hit validation
### Regla principal
**El cliente puede proponer un hit. El servidor decide si cuenta.**

Especialmente en shooters o acción competitiva:
- cliente puede mandar intención de disparo
- quizá origen, dirección, tick, target esperado
- servidor valida con su estado autoritativo o con lag compensation controlada

## Lag compensation
Útil cuando el género premia puntería y tiempo de reacción.

Patrón típico:
- servidor guarda breve historial de posiciones autoritativas
- al validar un disparo, reconstruye estado aproximado del momento relevante
- decide hit con esa ventana, no solo con el “ahora” del servidor

Riesgos:
- ventanas demasiado generosas
- sensación de morir detrás de cobertura
- inconsistencias si el historial es pobre o el tick no está bien definido

Para bajar esto a políticas distintas por arma o familia, ver `server-rewind-weapons.md`.

## Qué mandar para hit validation
Mandar mejor:
- `tick`
- `shooterId`
- origen o muzzle si aplica
- dirección o ray
- tipo de arma/acción
- contexto mínimo necesario

No mandar como verdad:
- “le he dado, resta 40 HP”
- estado visual del ragdoll
- resultado final ya cocinado por cliente

## Anti-cheat mínimo sensato
No hace falta prometer imposibles, pero sí evitar ingenuidades.

Como mínimo:
- servidor autoritativo para vida, daño, cooldowns, posiciones importantes o validación derivada
- límites plausibles de movimiento/inputs
- validación de cadencia de armas y acciones
- rechazo de mensajes imposibles o fuera de tick razonable

Para una capa adicional de telemetría, scoring de sospecha y mitigaciones graduales, ver `anti-cheat-anomalies.md`.

## Presentation firewall
Muy importante con Three.js:
- impactos visuales locales pueden mostrarse al instante
- daño real, muerte o confirmación importante deben esperar autoridad
- no mezclar hitmarker bonito con verdad de gameplay sin capa intermedia

## Estructura útil
- `inputBuffer`
- `snapshotBuffer`
- `predictionSystem`
- `reconciliationSystem`
- `hitValidationProtocol`
- `lagCompensationStore` si el género lo necesita

## Errores típicos
- asumir que rollback es siempre “más pro”
- intentar lockstep con simulación no determinista y luego rezar
- dar autoridad total al cliente en daño o hits
- mezclar FX de Three.js con estado reversible de simulación
- no separar validación del disparo de presentación local del disparo

## Recomendación fuerte
Elegir modelo por género y coste de mantenimiento:
- acción 3D general: snapshots + predicción limitada + hit validation autoritativa
- lucha o input crítico: rollback
- estrategia/táctica: lockstep si la simulación lo soporta

## Pendiente de ampliar
- rollback con físicas complejas
- reconciliación de projectiles persistentes

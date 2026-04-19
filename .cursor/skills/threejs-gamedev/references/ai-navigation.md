# AI and Navigation

## Objetivo
Dar una base sana para pathfinding, navegación y behavior simple en juegos Three.js, sin saltar directamente a soluciones industriales cuando el juego no las pide.

## Regla principal
**Antes de meter un motor de navegación, demostrar que el movimiento “tonto” no basta.**
Muchos juegos se solucionan con steering + raycast + waypoints, sin nav mesh.

## Tres niveles de navegación
Escala de menor a mayor coste/complejidad:

### Nivel 0 — Movimiento directo + steering
- ir hacia un target con aceleración limitada.
- separación básica entre agentes.
- evitación de obstáculos por raycast adelante/lados.
- suficiente para escenarios abiertos con pocos obstáculos y pocos agentes.

### Nivel 1 — Grafo de waypoints
- nodos manualmente colocados o generados, con aristas visibles.
- A* sobre el grafo.
- suficiente para niveles con rutas limitadas (patrullas, rondas, puntos clave).
- barato, controlable, debuggable a ojo.

### Nivel 2 — Nav mesh
- superficie transitable generada desde la geometría del nivel.
- A* sobre polígonos, string-pulling para caminos naturales.
- necesario para mundos abiertos o niveles con mucha irregularidad.
- stack típico en web: `recast-navigation` (port de Recast/Detour) u opciones similares. Son addons externos: marcar como tal.

## Elegir nivel
Preguntas:
- ¿cuántos agentes simultáneos? (>10–20 empieza a pedir algo más que raycast)
- ¿geometría compleja o mundo simple?
- ¿niveles estáticos o dinámicos?
- ¿caminos finos (puentes, pasillos estrechos) o amplios?
- ¿se reciclan niveles o cada partida es distinta?

Responder antes de elegir motor.

## Integración con físicas
La navegación no es física:
- el pathfinder decide *a dónde* ir.
- la física decide *cómo* se mueve el cuerpo en el mundo real (colisiones, gravedad).
- un agente combina: pathfinder → waypoints → locomotion/controller → físicas.

No meter la lógica de pathfinding dentro de un rigid body.

## Actualización de caminos
- recalcular path solo cuando cambie el objetivo o el mundo, no cada frame.
- re-path on-demand si el agente queda bloqueado N frames.
- si hay muchos agentes, distribuir re-paths a lo largo de varios frames (tick budget).

## Steering y follow-path
- el path es una lista de puntos, no un rail.
- usar un look-ahead: el agente apunta a un punto a cierta distancia del path, no al siguiente waypoint estricto.
- string-pulling para suavizar caminos sobre nav mesh.
- tolerancia de llegada (`arriveRadius`) en cada waypoint.

## Agentes locales y separación
Con varios agentes:
- separación básica por distancia entre pares (con un grid espacial para no ser O(n²)).
- priorizar: agente con menos avance cede.
- nunca empujar con físicas salvo que forme parte del diseño.

## Behavior simple
Antes de behavior trees o utility AI:
- una máquina de estados finitos (FSM) por enemigo: `idle`, `patrol`, `chase`, `attack`, `flee`.
- transiciones por condiciones (distancia, visibilidad, salud).
- suficiente para prototipos y muchos juegos pequeños.

Si el comportamiento crece:
- behavior tree (addon externo o implementación propia sencilla).
- utility AI si hay muchas acciones con prioridades cambiantes.

En ningún caso empezar por behavior tree “porque suena profesional”.

## Percepción
- vista: raycast desde el agente al target; cono de FOV con `dot` de direcciones.
- oído: eventos emitidos por acciones del jugador con un radio; agentes suscritos filtran por distancia y obstáculos.
- memoria corta: el agente recuerda la última posición conocida durante X segundos.

Modelar percepción explícita evita enemigos que lo saben todo siempre.

## Distribución de cómputo
- no correr IA de todos los agentes cada frame. Tick staggered: un subconjunto por frame.
- escalar por distancia/importancia: agentes lejos piensan menos y se mueven con menos fidelidad.
- si hay muchos, usar LOD de IA: lejos, solo patrulla; cerca, toda la FSM.

## Debug
- visualizar path con líneas.
- dibujar cono de visión y radio de audición.
- color del agente según estado.
- overlay con coste de IA por frame.

## Mundo dinámico
- obstáculos que aparecen/desaparecen invalidan caminos.
- con nav mesh: soporte de tiles o parches dinámicos (la mayoría de libs lo exponen).
- con waypoints: marcar aristas temporalmente bloqueadas.

## Mobile
- nav meshes grandes comen memoria y CPU: limitar área.
- menos agentes activos, más LOD agresivo.
- evitar re-paths masivos al mismo tiempo.

## Anti-patrones
- meter Recast/Detour port para 5 enemigos en un plano
- A* cada frame “por si acaso”
- decidir behavior con ifs desperdigados por entidades
- físicas resolviendo navegación (“empujo al agente hasta que llega”)
- enemigos que ven a través de muros porque no hay raycast de visibilidad
- un único tick de IA monstruoso con todos los agentes cada frame
- nav mesh regenerado en runtime sin necesidad

## Recomendación fuerte
Flujo sano por defecto:
1. empezar con steering + raycast.
2. si falla, añadir waypoints + A*.
3. si el mundo lo pide, entonces sí nav mesh.
4. FSM como behavior por defecto; behavior tree solo cuando el número de estados lo justifique.

## Referencias asociadas
- `character-locomotion.md`
- `physics.md`
- `world-generation.md`
- `debugging.md`
- `mobile-performance.md`

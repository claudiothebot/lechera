# Physics

## Objetivo
Integrar física en juegos Three.js de forma pragmática, evitando que el motor físico se coma la arquitectura o complique el gameplay más de la cuenta.

## Regla principal
Usar física solo donde aporte valor real.

No todo objeto necesita simulación completa. Muchas veces basta con:
- colisiones simples
- triggers
- movimiento kinemático
- constraints puntuales

## Separación sana
Three.js renderiza. El motor físico simula.

No mezclar ambas responsabilidades.

Pensar en tres capas:
1. **representación visual**
2. **representación física**
3. **sincronización entre ambas**

## Recomendación inicial
Tener una capa o bridge de physics que:
- cree cuerpos y colliders
- avance la simulación
- sincronice transforms visuales
- exponga eventos o consultas útiles al gameplay

## Cuándo usar física completa
Sí suele merecer la pena para:
- objetos que caen, rebotan o empujan de verdad
- interacción sistémica entre varios cuerpos
- vehículos o mecanismos si el juego depende de ello
- gameplay basado en equilibrio, fuerzas o colisiones emergentes

## Cuándo NO hace falta
A menudo no hace falta para:
- triggers simples
- pickups
- obstáculos estáticos
- puertas o plataformas con movimiento guionado
- detección básica de proximidad

## Principio clave
No usar un motor físico para resolver un problema que ya entiendes mejor con lógica de juego.

La física realista no siempre produce el mejor juego.

## Tipos de cuerpos y uso práctico

### Estáticos
Para suelo, paredes, mundo fijo.

### Dinámicos
Para objetos que deben reaccionar a fuerzas y colisiones.

### Kinemáticos
Para personajes, plataformas o elementos gobernados por lógica propia pero que aún interactúan con el mundo físico.

## Colliders
Preferir colliders simples siempre que sea posible:
- cajas
- esferas
- cápsulas
- planos aproximados

No usar malla compleja como collider por defecto salvo necesidad real.

## Player controller
El personaje principal suele necesitar cuidado especial.

Recomendaciones:
- no depender totalmente de física cruda para el control del player
- separar intención de movimiento de respuesta física
- definir bien suelo, salto, pendiente y contacto
- evitar que el personaje se sienta "gelatinoso" por buscar realismo

Patrón fuerte que sale muy bien parado en examples reales:
- player kinemático
- collider simple, normalmente cápsula
- mundo consultado con octree, queries o colliders estáticos
- gravedad, grounded state y salto resueltos por el controller

Eso suele dar un resultado mucho más controlable que soltar un rigid body humanoide y rezar.

## Timing y update
La física necesita un ritmo claro.

Reglas útiles:
- usar step de simulación controlado
- no dejar que el delta variable rompa la estabilidad
- sincronizar visuales después del paso físico
- registrar claramente el orden de update

## Rendimiento
La física también consume bastante.

Vigilar:
- número de cuerpos activos
- número de colliders complejos
- frecuencia de consultas
- coste de colisiones continuas
- objetos dormidos que podrían no actualizarse

## Gameplay y física
La física debe servir al diseño, no dominarlo.

Preguntas útiles:
- ¿esto mejora la sensación del juego?
- ¿es más divertido o solo más realista?
- ¿puedo conseguir un resultado mejor con lógica más simple?

## Anti-patrones
- meter física a todo por inercia
- usar colliders complejos para cualquier cosa
- acoplar gameplay directamente a callbacks del motor físico
- no distinguir entre cuerpo visual y cuerpo físico
- confiar en física realista para arreglar mal diseño de controles

## Pendiente de ampliar
- elección concreta de motor recomendado
- patrones para personajes y equilibrio
- triggers y sensores
- rollback o reconciliación si hay multiplayer
- herramientas de debug de colliders y contactos
- integración con world generation y streaming

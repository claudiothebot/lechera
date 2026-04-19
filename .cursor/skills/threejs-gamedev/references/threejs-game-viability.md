# Three.js Game Viability and Inspiration

## Objetivo
Ayudar a decidir qué tipo de juego encaja bien con Three.js, qué ideas conviene acotar o prototipar primero, y dónde están las zonas que suelen parecer fáciles pero se vuelven caras o frágiles.

## Regla principal
**Que algo sea posible no significa que sea buena idea para arrancar.**
Three.js permite muchísimo, pero la pregunta útil al inicio no es solo “¿se puede?”, sino “¿se puede con este scope, este equipo y este tiempo?”.

## Cómo usar esta referencia
Usarla cuando el usuario pregunte:
- si una idea de juego es viable en Three.js
- si algo encaja bien o mal como primer proyecto
- qué tipo de juegos o prototipos tienen más sentido
- qué ideas merecen spike temprano antes de comprometer arquitectura

## Tres categorías útiles
### 1. Buena idea para arrancar
Encaja bien con Three.js y suele permitir prototipo rápido.

### 2. Viable, pero con cuidado
Se puede hacer, pero suele esconder coste técnico, rendimiento o contenido.

### 3. Mala idea para arrancar
No porque sea imposible, sino porque suele explotar scope, tooling o complejidad demasiado pronto.

## Buena idea para arrancar
### Juegos que suelen encajar bien
- runner 3D o arcade simple
- conducción simple o circuito corto
- exploración ligera en tercera persona
- shooter simple con pocos enemigos
- puzzle 3D con una sola mecánica fuerte
- survival pequeño con un loop muy claro
- toy box física pequeña
- experiencia estilizada/abstracta con pocos sistemas simultáneos

### Por qué encajan bien
- loop jugable prototipable rápido
- dependencia baja o moderada de contenido masivo
- cámara y control relativamente controlables
- margen para usar placeholders sin romper la idea

## Viable, pero con cuidado
### Mundos grandes o procedural serio
Viable si se acota bien, pero obliga a pensar en:
- streaming
- chunks
- budgets de draw calls y memoria
- herramientas de contenido

### Multiplayer competitivo
Viable, pero requiere:
- autoridad clara
- snapshots/prediction/reconciliation
- validación de hits
- testing de latencia

Como primer gran proyecto suele ser mala apuesta salvo que el loop social sea el corazón del juego.

### Física relevante y continua
Viable, pero conviene confirmar pronto:
- si de verdad hace falta simulación seria
- si Rapier entra por necesidad real o por reflejo
- cuánto del gameplay depende de estabilidad física fina

### Portals, mirrors, refractors y RTT premium
Viables, pero pueden comerse rendimiento y complejidad visual si se usan como adorno generalizado.

### Vehículos, vuelo o movimiento no trivial
Muy buenos para prototipo si el juego gira alrededor de eso, pero requieren validar pronto:
- cámara
- feel del control
- colisión
- estabilidad de movimiento

## Mala idea para arrancar
### MMO-ish o mundo social enorme
No imposible, pero pésima idea como arranque si todavía no existe core loop pequeño y probado.

### Juego hiper sistémico con crafting, housing, combate, economía y multiplayer desde día 1
Eso no es un prototipo. Eso es una máquina de scope explosion.

### Shooter competitivo serio con anti-cheat fuerte, backend complejo y matchmaking completo desde el inicio
Viable en teoría, pero no como primer paso de un proyecto nuevo salvo equipo muy preparado.

### Sandbox procedural inmenso con física compleja y multiplayer simultáneo
Se puede soñar, claro. También se puede hundir el proyecto en la primera semana.

## Señales de que una idea necesita spike temprano
- depende de una cámara rara o difícil
- depende de una física muy concreta
- depende de RTT premium o portals como fantasy central
- depende de latencia o sincronización para ser divertida
- depende de streaming o mundos grandes para existir

Cuando aparezca una de esas señales:
- hacer spike pequeño primero
- no diseñar todo el juego alrededor de una suposición no validada

## Ideas que suelen lucir bien en Three.js
### Por estética
- low poly limpio
- stylized sencillo
- abstracto geométrico
- ambientes dreamlike o surrealistas con pocos assets pero buena luz/color

### Por mecánica
- movimiento agradable y cámara clara
- interacción física ligera
- puzzles espaciales
- conducción arcade
- traversal corto y expresivo
- action toy con pocos enemigos pero buen feel

Three.js brilla mucho cuando:
- la lectura espacial importa
- el movimiento se siente bien
- la dirección visual no depende de contenido masivo fotorrealista

## Ideas que requieren disciplina extra
- horror atmosférico, porque el feel depende mucho de lighting/audio/pacing
- builders o sandboxes, porque piden tooling y contenido escalable
- shooters, porque el feel del arma y la validación de hit importan muchísimo
- simulaciones, porque parece que “ya funciona” mucho antes de estar realmente bien

## Regla de inspiración sana
Al inspirarse en examples o demos:
- coger patrón técnico, no promesa de producción automática
- extraer sensación o mecánica, no copiar todo el scope implícito
- traducir la idea a un slice jugable pequeño

## Preguntas útiles para bajar una idea a tierra
- ¿cuál es el loop principal en una frase?
- ¿se puede demostrar divertido con placeholders?
- ¿qué sistema técnico más arriesgado hay que validar primero?
- ¿qué parte puedo dejar fuera durante dos semanas sin romper la fantasía central?

## Recomendación fuerte
Cuando una idea llega verde:
1. clasificarla como buena para arrancar, viable con cuidado o mala idea para arrancar
2. detectar el riesgo técnico central
3. definir un slice mínimo que pruebe solo esa fantasía
4. dejar explícito qué se aparca fuera de la primera fase

## Anti-patrones
- responder “sí, todo se puede” sin hablar de scope
- vender multiplayer o procedural masivo como siguiente paso obvio
- confundir example vistoso con feature barata
- intentar validar la idea con assets finales en vez de con mecánica

## Referencias asociadas
- `game-kickoff-planning.md`
- `phased-game-workflow.md`
- `default-project-stack.md`

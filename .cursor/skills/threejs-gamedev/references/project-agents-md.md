# Project AGENTS.md

## Objetivo
Usar un `AGENTS.md` dentro de cada juego como memoria operativa del proyecto, para registrar decisiones, cambios, convenciones y contexto que no conviene dejar solo en el chat.

## Regla principal
**Si una decisión importa mañana, escríbela hoy.**
No confiar en recordar por magia por qué se eligió una librería, qué carpeta manda o qué bug quedó pendiente.

## Cuándo crearlo
Crear `AGENTS.md` casi desde el principio cuando el juego pase de idea suelta a proyecto real.

## Qué debería contener
### 1. Contexto del juego
- nombre provisional
- premisa en una frase
- plataforma objetivo
- singleplayer o multiplayer

### 2. Stack elegido
- Three.js puro
- Vite/TS o JS
- Rapier sí/no
- otras librerías importantes

### 3. Convenciones del proyecto
- estructura de carpetas
- naming
- cómo se arrancan builds o tests si existen
- cómo se organizan assets

### 4. Decisiones importantes
Ejemplos:
- por qué no se usa framework UI
- por qué multiplayer se dejó fuera de v0
- qué sistema de cámara manda
- qué física está dentro y qué no

### 4.5 Fase actual
Muy útil dejar explícito:
- fase actual del proyecto
- qué sí entra ahora
- qué queda fuera por decisión

Esto ayuda muchísimo a no intentar hacerlo todo de golpe.

### 5. Log breve de cambios
No hace falta diario kilométrico.
Sí hace falta dejar rastro de:
- cambios importantes
- nuevos sistemas añadidos
- refactors serios
- problemas conocidos
- siguientes pasos claros

## Formato recomendado
```markdown
# AGENTS.md

## Juego
- nombre:
- premisa:
- target:
- modo:

## Stack
- three.js:
- vite:
- typescript:
- physics:
- multiplayer:

## Convenciones
- estructura:
- assets:
- render loop:

## Decisiones activas
- ...

## Cambios recientes
- 2026-04-17: se creó bootstrap inicial y loop base
- 2026-04-18: se añadió controlador de personaje

## Próximos pasos
- ...
```

## Qué no meter
- logs eternos de cada tontería
- secretos o credenciales
- copia de documentación pública
- opiniones vagas sin impacto operativo

## Relación con memoria y skill
Este `AGENTS.md` no sustituye la skill.
Sirve para aterrizar la skill en un juego concreto.

## Recomendación fuerte
Cuando arranque un juego nuevo:
- crear `AGENTS.md`
- escribir stack y decisiones iniciales
- escribir fase actual y exclusiones explícitas
- ir dejando cambios relevantes y próximos pasos

Eso ahorra muchísimo contexto perdido entre sesiones.

## Referencias asociadas
- `game-kickoff-planning.md`
- `default-project-stack.md`
- `default-content-sourcing.md`

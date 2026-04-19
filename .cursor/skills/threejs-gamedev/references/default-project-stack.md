# Default Project Stack

## Objetivo
Dar un stack por defecto suficientemente opinionado para arrancar juegos Three.js sin perder tiempo en decisiones base cada vez.

## Regla principal
**Default no significa obligatorio.**
Significa “esto es lo que usaríamos salvo que el juego pida otra cosa”.

## Default recomendado
### Base
- Three.js puro
- Vite
- TypeScript por defecto
- HTML/CSS normal para shell y UI simple
- sin React/R3F por defecto

## Por qué este default
- Three.js puro mantiene control y claridad
- Vite da dev server, imports, build y manejo sano de assets sin meter framework grande
- TypeScript compensa bastante bien cuando el proyecto empieza a crecer
- HTML/CSS simple evita meter UI framework demasiado pronto

## Cuándo bajar a JavaScript normal
Se puede usar JS en vez de TS cuando:
- es un prototipo muy corto
- el usuario quiere velocidad extrema sobre rigor
- el equipo realmente no quiere TS

Pero el default defendible sigue siendo TS.

## Estructura de carpetas recomendada
```text
project/
  AGENTS.md
  index.html
  package.json
  public/
    models/
    textures/
    audio/
  src/
    main.ts
    app/
      bootstrap/
      config/
      loop/
    game/
      entities/
      systems/
      gameplay/
      levels/
    render/
      scene/
      cameras/
      lighting/
      materials/
      post/
    physics/
    input/
    ui/
    assets/
    utils/
```

No hace falta crear todas las carpetas el día 1, pero sí tener esta dirección.

## Bootstrap mínimo sano
- inicialización de renderer, camera y scene
- resize
- loop central
- asset preload mínimo
- primer estado jugable antes de menús o meta-sistemas

## Física por defecto
Si el juego necesita física de verdad:
- **Rapier** como default recomendado

Buena elección cuando quieres:
- rendimiento sólido
- API razonable
- colisiones y rigid bodies serios
- una opción ya bastante asentada en web

Si el juego solo necesita colisiones o overlaps simples:
- no meter Rapier por inercia
- empezar más simple

## Multiplayer por defecto
Default sano:
- **singleplayer primero**
- no meter red hasta que el loop base funcione y el juego demuestre necesitarla

Si multiplayer es core desde el concepto:
- diseñarlo pronto, pero no casar el proyecto con una librería por reflejo
- tratar soluciones como MavonEngine o similares como **candidatas a validar en spike**, no como dogma automático todavía

## Assets y shell
- `public/` para assets estáticos simples
- loaders y registro coordinado de assets en `src/assets/`
- no esconder lógica del juego dentro de componentes de UI

## Defaults de scope
Al arrancar:
- un solo loop jugable
- una sola escena o nivel de prueba
- una sola cámara principal
- una sola mecánica central

## Anti-patrones
- HTML+JS pelado cuando el proyecto ya va a crecer
- meter React solo por costumbre
- meter backend o multiplayer antes del core loop
- meter Rapier cuando bastaba con colisiones simples
- estructura de carpetas caótica desde el primer día

## Recomendación fuerte
Para la mayoría de juegos nuevos:
- Three.js puro
- Vite
- TypeScript
- Rapier solo si la física importa de verdad
- singleplayer first salvo requisito claro de multiplayer

## Referencias asociadas
- `game-kickoff-planning.md`
- `project-agents-md.md`
- `default-content-sourcing.md`

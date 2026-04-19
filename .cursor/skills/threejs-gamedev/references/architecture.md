# Architecture

## Objetivo
Definir una base razonable para juegos en Three.js puro que no colapse en un único archivo y que permita crecer sin mezclar responsabilidades demasiado pronto.

## Regla principal
Separar, como mínimo, estas capas:

1. **Bootstrap**
   - crear renderer
   - crear escena y cámara principal
   - montar canvas
   - registrar resize
   - arrancar loop

2. **World / Scene setup**
   - luces
   - entorno
   - suelo o geometría base
   - objetos persistentes del mundo

3. **Systems**
   - input
   - cámara
   - animación
   - audio
   - networking bridge si hay multijugador
   - physics bridge
   - spawners
   - UI bridge si aplica

4. **Gameplay**
   - reglas
   - puntuación
   - estados de partida
   - objetivos
   - progresión

5. **Entities / Actors**
   - player
   - enemigos
   - pickups
   - obstáculos
   - props interactivos

## Estructura mínima sugerida

```text
src/
  main.js
  app/
    bootstrap.js
    loop.js
    resize.js
  world/
    createScene.js
    createLights.js
    createEnvironment.js
  systems/
    inputSystem.js
    cameraSystem.js
    animationSystem.js
  gameplay/
    gameState.js
    rules.js
  entities/
    player.js
    pickup.js
```

Adaptar la granularidad al tamaño real del proyecto. No fragmentar por postureo.

## Loop
Usar `renderer.setAnimationLoop()` por defecto.

Separar dentro del loop:
- lectura de input
- update de systems
- update de gameplay
- sync visual final
- render

Evitar meter lógica arbitraria directamente en callbacks DOM o dentro de `render()`.

`setAnimationLoop()` encaja bien como base de juego y además mantiene una vía natural si más adelante hay XR. Aun así, no confundir el loop de render con un permiso para actualizar todo sin control. Si una parte del sistema puede vivir fuera del frame crítico, mejor.

## Resize y lifecycle
Centralizar:
- ancho/alto actuales
- aspect ratio
- `camera.updateProjectionMatrix()`
- `renderer.setSize()`
- si hace falta, `renderer.setPixelRatio()` con límites razonables

## Convenciones útiles
- Mantener referencias explícitas a systems compartidos.
- Evitar singletons globales sin control.
- Pasar dependencias importantes por composición cuando sea razonable.
- No acoplar la lógica de juego a una cámara concreta más de lo necesario.
- No mezclar carga de assets con reglas de gameplay.
- Si hay multijugador, no usar el scene graph como fuente de verdad del estado compartido.

## Core vs addons
La revisión del repo y de la docs deja una regla útil: distinguir claramente entre lo que es **core** de Three.js y lo que entra por **addons/examples**.

- core: escena, cámara, renderer, materiales, geometrías, math, `Object3D`, `Raycaster`, etc.
- addons: loaders específicos, controles, postprocessing y muchas utilidades de examples

En la arquitectura del juego, los addons deberían entrar como dependencias explícitas en systems concretos, no desperdigados como si fueran base del motor.

## Bootstrap recomendado (TS)

### Mal ejemplo
Todo pegado en `main.ts`, input y gameplay mezclados, resize y loop ad-hoc:

```ts
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight);
renderer.setSize(innerWidth, innerHeight);

const player = new THREE.Mesh(/* ... */);
scene.add(player);

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') player.position.z -= 0.1;
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

function tick() {
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
```

Problemas: input DOM toca gameplay directo, resize hace tres cosas, no hay `dt`, no hay `dispose`, la cámara y el jugador no tienen sistemas detrás.

### Buen ejemplo
Capas explícitas, loop con `dt`, resize centralizado, input abstraído:

```ts
const renderer = createRenderer(canvas);
const scene = createScene();
const camera = createMainCamera();
const world = createWorld(scene);
const input = createInputSystem();
const player = createPlayer({ scene, input });
const cameraRig = createCameraRig(camera, player);

const resize = createResize(renderer, camera);
resize.install();

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  input.update(dt);
  player.update(dt);
  cameraRig.update(dt);
  world.update(dt);
  renderer.render(scene, camera);
});
```

Claves:
- cada factory vive en su módulo (`app/bootstrap`, `systems/input`, `entities/player`, `world/...`).
- `dt` con clamp para evitar pasos enormes al volver de una pestaña suspendida.
- input es un sistema, no un listener suelto.
- resize centralizado, con cleanup si hace falta.
- la cámara es un rig que consume estado, no un hijo del mesh (ver `cameras.md`).

## Anti-patrones iniciales
- `main.ts` gigante con todo mezclado
- input DOM disparando gameplay directo por todos lados
- assets cargados desde cualquier archivo sin coordinación
- cámara, player y reglas pegados en una sola clase
- `requestAnimationFrame` custom en vez de `setAnimationLoop`
- update loop sin `dt` (todo acoplado al frame rate)
- no hacer clamp del `dt`: un tab inactivo devuelve un delta enorme y rompe física
- optimizar demasiado pronto sin medir el coste real

## Referencias asociadas
- `phased-game-workflow.md`
- `default-project-stack.md`
- `resource-lifecycle.md`
- `cameras.md`
- `input-controls.md`

# Lights and Shadows

## Objetivo
Tomar decisiones de iluminación y sombras en Three.js con mentalidad de juego web, no de demo aislada.

## Regla principal
Las sombras son caras. Muy caras si se dejan crecer sin control.

El manual lo deja clarísimo: cada luz que genera sombras obliga a renderizar la escena extra desde el punto de vista de esa luz. Con varias luces, el coste se multiplica muy rápido.

## Default recomendado
- empezar con iluminación simple
- usar pocas luces importantes
- si hace falta sombra dinámica, preferir **una directional light principal** antes que varias luces con sombra
- tratar las sombras como presupuesto limitado, no como valor por defecto universal

## Estrategia de sombras por niveles

### Nivel 0, sin sombras dinámicas
Usar:
- iluminación simple
- AO o light hints en assets
- contraste de materiales
- composición visual del escenario

### Nivel 1, fake shadows
Muy recomendables en muchos juegos estilizados o móviles.

Patrón clásico:
- plano o decal simple
- textura de sombra suave en escala de grises
- `MeshBasicMaterial`
- `transparent: true`
- `depthWrite: false`
- colocar ligeramente por encima del suelo para evitar z-fighting

Esto es baratísimo y muchas veces da el pego de sobra.

### Nivel 2, shadow maps reales
Usarlas cuando de verdad mejoran la lectura o la fantasía del juego.

Reglas:
- activar `renderer.shadowMap.enabled` solo cuando toca
- marcar `castShadow` y `receiveShadow` con criterio objeto por objeto
- ajustar la shadow camera de la luz, no dejarla absurda por defecto
- medir el coste en escenas reales

## Luces
No meter luces porque sí.

Preguntas útiles:
- ¿qué aporta esta luz a la lectura del juego?
- ¿podemos conseguir casi lo mismo con una luz menos?
- ¿el estilo visual necesita realismo o claridad?

## Shadow camera
El manual insiste en algo importante: si faltan sombras o salen raras, muchas veces el problema no es "Three.js" sino la región que cubre la shadow camera.

Regla práctica:
- visualizarla con `CameraHelper`
- ajustar top, bottom, left, right, near y far al área útil real
- evitar cajas gigantes si la acción ocurre en una zona pequeña

## Helpers y debug
Útiles cuando se trabaja con sombras:
- `CameraHelper` sobre la shadow camera
- herramientas para ver shadow map si el caso se complica
- toggles de HUD o debug para comparar con y sin sombras

## Anti-patrones
- varias luces con sombra por defecto
- `castShadow` y `receiveShadow` activado en todo
- usar shadow maps complejos en móvil sin medir
- no ajustar la shadow camera
- perseguir sombras perfectas cuando el estilo del juego no lo necesita

## Recomendación fuerte
Para muchos juegos web, la combinación ganadora es:
- una luz principal bien elegida
- fake shadows para secundarios
- o directamente sombras muy selectivas solo donde ayudan de verdad

## IBL con HDRI (image-based lighting)
Técnica desproporcionadamente útil para escenas PBR: cargar un HDRI equirectangular, pasarlo por `PMREMGenerator` y asignarlo tanto a `scene.background` como a `scene.environment`. Con una sola llamada obtienes:
- **skybox** detrás de todo (resuelve "el cielo se ve feo"),
- **reflexión + diffuse ambient** coherentes para todos los materiales PBR, sin añadir luces extra.

Receta mínima:
```ts
// Three r168+ sustituyó RGBELoader por HDRLoader. API equivalente.
const hdr = await new HDRLoader().loadAsync(url);
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromEquirectangular(hdr);
hdr.dispose();
pmrem.dispose();
scene.background = envRT.texture;
scene.environment = envRT.texture;
```

Cuándo compensa:
- cualquier escena outdoor con materiales PBR
- quieres que personajes, props, metales se iluminen "bien" sin pelearte con 3-4 luces puntuales
- la cámara ve cielo real y no quieres un fondo pintado

Gotchas:
- si ya tenías `HemisphereLight` o luces ambientales fuertes, **bájalas cuando metas env map**, o todo queda doblemente iluminado y se lava el contraste.
- la `DirectionalLight` que representa el sol sigue siendo necesaria si quieres sombras (el env map por sí solo no las proyecta).
- dirección del sol del HDRI ≈ dirección de tu `DirectionalLight`, o cantará.
- Poly Haven (CC0) es el default razonable; 1K basta casi siempre para fondo, 2K si el cielo está muy en pantalla.
- descomprimir un HDR a PMREM cuesta; hacerlo una vez en boot, no por frame.
- disposer el `RenderTarget` de PMREM si la escena se destruye (lo que devuelve `fromEquirectangular` es un `WebGLRenderTarget`).

Anti-patrón: `new RGBELoader().load(...)` y asignarlo directamente a `scene.environment` sin PMREM. Aparenta funcionar pero las reflexiones salen con artefactos y la iluminación ambiental está mal prefiltrada.

`backgroundIntensity` (Three r155+) permite bajar el brillo del cielo visible sin tocar la intensidad del IBL sobre los materiales, útil cuando el HDRI es demasiado luminoso como fondo pero sí sirve como IBL.

## Pendiente de ampliar
- tipos de `shadowMap`
- comparación directional / spot / point en coste real
- política de sombras por preset de calidad
- técnicas híbridas con lightmaps o AO

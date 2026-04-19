# Custom Shaders

## Objetivo
Escribir y mantener shaders custom en Three.js sin tirar por la borda el sistema de materiales/luces del motor, y sabiendo cuándo basta con un material estándar.

## Regla principal
**No escribir shader hasta haber descartado `MeshStandardMaterial` con texturas bien hechas y un poco de vertex displacement controlado.**
Muchos efectos que parecen pedir shader se resuelven con texturas, máscaras y uniforms simples.

## Cuándo sí merece shader
- efectos que dependen del tiempo (dissolve, hologram, shimmer)
- shading no físico (toon, cel-shade, paper, comic)
- distorsión geométrica dinámica (olas, viento, jelly)
- blending por reglas de mundo (triplanar, slope-aware terrain, altura)
- impostores, billboarding avanzado, FX de partículas custom
- postprocesado a medida que ningún pase estándar cubre

## Cuándo no merece shader
- cambiar color base → `material.color`
- hacer algo “brillante” → ajustar `metalness`/`roughness` y lighting
- un outline simple → postpro o doble pase, no shader custom del objeto
- un degradado vertical → `vertexColors` o textura
- fade por distancia → niebla del motor o propiedad del material

## Elección del material
Tres grandes caminos:

### 1. `onBeforeCompile` sobre material estándar
- conservas iluminación, sombras, tonemapping y lo demás del motor.
- inyectas uniforms y modificas chunks concretos del shader generado.
- ideal para vertex displacement sobre `MeshStandardMaterial` sin perder PBR.
- riesgo: acoplarse a chunks internos que pueden cambiar entre versiones de Three.js.

### 2. `ShaderMaterial` / `RawShaderMaterial`
- control total.
- pierdes la cadena de lighting del motor salvo que la reimplementes.
- bueno para unlit effects, postpro, fullscreen passes, cosas muy específicas.
- `RawShaderMaterial` no añade ninguna uniform/attribute automáticamente: tú te lo curras.

### 3. Node-based (`NodeMaterial`, TSL)
- API moderna, modular, portable entre WebGL2/WebGPU.
- útil para proyectos que apuntan a WebGPU o que quieren editar shaders por composición.
- más joven, menos ejemplos en la wild, puede cambiar.
- valorable para proyectos nuevos con intención de aguantar años.

## Patrones comunes

### Vertex displacement sano
- usar `onBeforeCompile` sobre `MeshStandardMaterial`.
- inyectar uniform `uTime` y funciones de noise/curl.
- mantener `normal` consistente: si desplazas el vértice, recalcula o aproxima la normal si quieres que la luz no mienta.
- evitar noise 3D caro si 2D basta.

### Fullscreen passes
- quad fullscreen con `ShaderMaterial` y cámara ortográfica trivial.
- usar RTT con resolución y frecuencia controlada (ver `render-targets.md`).
- separar passes si ayuda a legibilidad aunque sumes un target intermedio.

### Terrain blending (slope/height/triplanar)
- muestrear texturas por componente del mundo, no por UV exclusivamente.
- máscaras prebakeadas o procedurales, no hardcoded.
- atlas compactos si hay muchas variantes de material.

### Dissolve / reveal
- textura de noise + umbral animado.
- `discard` para recorte, pero cuidado: `discard` deshabilita optimizaciones (early-z) y puede costar más de lo que parece, sobre todo en móvil.

### Water / waves
- desplazamiento con `sin/cos` sumados o noise en vertex.
- reflejo/refracción con RTT (ver `render-target-families.md`).
- normal map animado en fragment para detalle sin inflar vértices.

## Uniforms y estado
- objetos `uniforms` compartidos cuando varios materiales usan el mismo tiempo/params.
- actualizar en un sistema central (`uniformsUpdater`), no en cada entidad.
- evitar crear objetos nuevos cada frame (`new THREE.Vector3(...)` en el update es un goteo constante de garbage).

## Precision
- `mediump` en móvil por defecto, `highp` donde haga falta (depth, normales en shading serio).
- no asumir que `highp` existe siempre en fragment en móvil.

## Defines y variantes
- `#define` por capability (`USE_NORMALMAP`, `ANIMATE_VERTICES`) para compilar solo lo necesario.
- cuidado con la explosión combinatoria de variantes: si hay demasiadas, mover a uniforms booleanos aunque se pague algo en coste.

## Shadows y shading con custom vertex
Si desplazas vértices en `onBeforeCompile`:
- sombras proyectadas se calculan con un material propio de shadow pass.
- aplicar el mismo displacement al `customDepthMaterial` y `customDistanceMaterial` del mesh para que la sombra no mienta.
- alternativa: evitar sombras sobre meshes con displacement fuerte.

## Postpro custom
- pases pequeños y compuestos antes que un megashader.
- medir con `benchmarking.md`: un pase custom suele ser más barato que parecía, o al revés, mucho más caro.
- sobre móvil, cada pase extra se nota.

## Debug de shaders
- uniform de “modo debug” que pinte normales, UVs, profundidad, máscara.
- isolation view: material plano con solo la parte que dudas.
- `console.log(material.program?.fragmentShader)` con cuidado, es para leer en desarrollo.
- integrar con extensions del navegador (Spector.js) cuando haga falta mirar captures.

## Cross-version
- los chunks internos de Three.js cambian. Si usas `onBeforeCompile`, fijar versión de Three.js y revisar al actualizar.
- tener tests visuales mínimos (screenshot o escena de verificación) para detectar roturas rápido.

## WebGPU / TSL
Si el proyecto puede apuntar a WebGPU más adelante:
- preferir `NodeMaterial` desde el principio cuando tenga sentido.
- aislar la lógica de shader en módulos para facilitar la migración.
- no invertir mucho en shaders manuales muy atados a WebGL 2.

## Anti-patrones
- escribir `ShaderMaterial` para lo que un `MeshStandardMaterial` con textura resuelve
- `discard` en fragment sin necesidad, bloqueando optimizaciones
- recalcular cada frame uniforms estáticos
- mega-shader con todas las ramas, mezclando efectos que no siempre se usan
- inyectar `onBeforeCompile` sin fijar versión de Three.js
- usar `highp` indiscriminado en móvil
- desplazar vértices sin corregir shadow pass
- olvidarse de `needsUpdate` al cambiar defines

## Recomendación fuerte
Flujo sano:
1. ¿puedo hacerlo con material estándar + textura?
2. si no, ¿basta con `onBeforeCompile`?
3. si no, `ShaderMaterial` aislado, con uniforms centralizados y documentación del chunk/versión.
4. medir coste con un bench pequeño antes de adoptarlo como default.

## Referencias asociadas
- `lights-shadows.md`
- `transparency-pitfalls.md`
- `postprocessing.md`
- `render-targets.md`
- `benchmarking.md`
- `mobile-performance.md`

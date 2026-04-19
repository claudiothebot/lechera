# Texturing Pipeline

## Objetivo
Decidir **qué maps usas, cómo los configuras y cómo los comprimes** para Three.js puro, sin convertirlo en teoría ni en obsesión por 4K.

## Regla principal
**Menos texturas, mejor configuradas, antes que más texturas.**
El 80% del resultado viene de: tamaño sensato, color space correcto, filtrado y repetición razonables. El 20% es compresión.

---

## Tipos de map y cuándo usarlos

### Base / Albedo (color difuso)
- Casi siempre lo quieres.
- **Color space: sRGB.** En Three.js: `texture.colorSpace = THREE.SRGBColorSpace`.
- No hornear iluminación en el albedo si vas a usar luces dinámicas.

### Normal
- Añade relieve sin geometría.
- **Color space: linear** (NO sRGB). No tocar `colorSpace` o dejarlo en `NoColorSpace`.
- Convención habitual: tangent-space, OpenGL (+Y up). Si ves relieve invertido en Y, invertirlo en el map o flipear Y en el shader.

### Roughness / Metalness / AO
- **Todos linear.** Son *data maps*, no colores.
- `MeshStandardMaterial` acepta mapas combinados AO/Roughness/Metalness en un solo RGB con las convenciones glTF (R=AO, G=roughness, B=metalness). Ahorra memoria y draw calls.
- Si no tienes metalness, no fuerces el material a metálico: suelos y tela casi nunca lo son.

### Height / Displacement
- Solo si de verdad vas a desplazar geometría (`displacementMap`) o parallax.
- Usarlo como normal disfrazado suele salir caro y feo.

### Emissive
- Útil para señales, lámparas, HUD emisivo.
- `emissiveMap` funciona bien con `emissiveIntensity`.

---

## Color space: el error más común

En Three.js moderno:
- `renderer.outputColorSpace = THREE.SRGBColorSpace` (casi siempre).
- **Albedo/emissive** → `SRGBColorSpace`.
- **Normal, roughness, metalness, AO, mask, displacement** → `NoColorSpace` (linear).

Síntoma clásico de olvidarlo: colores lavados, iluminación que parece demasiado oscura o demasiado chillona, o normales que *casi* funcionan pero se ven apagadas. Revisar color space antes de tocar luces.

---

## Tamaño, repetición y filtrado

### Tamaño
- Default razonable para juegos web: **1K–2K por map**.
- 4K solo cuando se ve muy de cerca y lo justifica. 4K duplica VRAM (y mipmaps).
- Para props pequeños lejanos: 512 y para abajo.

### Repetición (tiling)
- `texture.wrapS = texture.wrapT = THREE.RepeatWrapping` para suelos/paredes.
- `texture.repeat.set(x, y)` proporcional al tamaño del plano en metros, no a la geometría del mesh.
- **Tiling único se nota.** Mitigar con:
  - detail map sumado en shader custom,
  - decals o parches extra,
  - splat / blending (ver más abajo).

### Filtrado y mipmaps
- `texture.minFilter = THREE.LinearMipmapLinearFilter` (default en Three).
- `texture.magFilter = THREE.LinearFilter`.
- `texture.generateMipmaps = true` (por defecto en texturas potencia de 2).
- **Anisotropy**: subirla al máximo soportado cuando la cámara mira texturas en ángulos razantes (suelo grande):
  ```ts
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  ```
- Sin anisotropy, un suelo PBR se ve "chapucero" en perspectiva.

---

## Compresión y formato

### Qué elegir para runtime
- **PNG/JPG**: base. Funciona siempre, no aprovecha compresión GPU.
- **WebP**: buena compresión CPU, decodifica a RGBA en GPU. Bien para albedo donde importa el tamaño de descarga.
- **KTX2 + Basis Universal**: compresión nativa de GPU (menos VRAM). Recomendado cuando hay muchas texturas o dispositivos modestos (ver `gltf-pipeline.md` sección compresión; requiere `KTX2Loader` y soporte del renderer).
- **Dentro de glTF**: usar `KHR_texture_basisu` (KTX2) cuando el pipeline lo soporte bien; el CLI `gltf-transform` permite pasarlo como parte de `optimize` (ver `gltf-pipeline.md`).

### Regla práctica
- Prototipo: PNG/JPG o WebP.
- Producción con muchos assets: KTX2 donde se note el ahorro.
- No comprimir a ciegas: validar calidad visual en el juego, no en el visor.

---

## Tiling único vs. mezcla de materiales (suelos, terrenos)

### Tiling único
- Un PBR tileable aplicado al plano.
- Simple, rápido; se ve obvio en superficies grandes.

### Splat / blend por textura
- Una textura máscara (RGBA o R por canal) decide el peso de 2–4 materiales.
- Requiere `onBeforeCompile` sobre `MeshStandardMaterial` o `ShaderMaterial` custom (ver `custom-shaders.md`, sección "Terrain blending").
- Coste moderado: más muestras por fragmento.

### Triplanar
- Muestrea por las tres componentes del mundo; evita estiramiento en cuestas.
- **Caro en móvil**. Usar solo cuando el estiramiento sea visible y no haya UVs razonables.

### Vertex colors / vertex attributes
- Alternativa sin texturas extra para dar varianza.
- Barato pero tosco; bien para prototipo.

---

## Rendimiento y límites

- Cada material con `map/normalMap/...` diferentes aumenta memoria y, sobre todo, **draw calls**. Considerar atlases o `MeshBasicMaterial` pool cuando haya muchos objetos simples.
- Mobile: presupuesto VRAM más estricto (ver `mobile-performance.md`). 1K como default, no 2K.
- Evitar texturas no potencia de 2 si usas wrapping o mipmaps: algunos drivers renquean; WebGL2 lo soporta pero el coste puede subir.
- `anisotropy > 1` barato en desktop, más caro en móvil; bajar si aparece coste de fragmentos.

---

## Fuentes (ver `default-content-sourcing.md`)

- **ambientCG** (CC0) como default de materiales/superficies PBR.
- Para concept/props: Kenney, Poly Pizza, Sketchfab (con licencia bien leída).
- No mezclar cinco estilos sin criterio.

---

## Checklist de entrada de textura

- [ ] tamaño razonable para el uso (1K–2K típico)
- [ ] color space correcto (sRGB vs linear)
- [ ] tipo de map claro (albedo / normal / roughness…)
- [ ] wrap y repeat correctos
- [ ] anisotropy configurada en superficies grandes/oblicuas
- [ ] mipmaps activos cuando aplique
- [ ] formato de distribución decidido (PNG / WebP / KTX2)
- [ ] licencia registrada (ver `default-content-sourcing.md`)

---

## Anti-patrones

- Todo el suelo en 4K "por si acaso".
- Albedo con iluminación horneada y luego añadir luces dinámicas encima.
- Normal map en sRGB: da relieve falso y lavado.
- Tiling único visible y "solucionarlo" subiendo la textura a 4K.
- Compresión KTX2 sin validar en el juego real.
- Texturas añadidas en mil archivos sin registry central (ver `assets.md`).
- Confundir `displacementMap` con `normalMap`: el primero desplaza geometría y necesita teselación; el segundo sólo cambia el sombreado.

---

## Ribbon meshes sobre curvas (caminos, ríos, muros)

Patrón recurrente: quieres una franja texturizada que siga una curva en el mundo (camino de tierra que serpentea, río, rastro de fuego, pista de carreras). Lo que no es obvio es **cómo acoplarlo al pipeline de texturas** para que el tiling se vea consistente.

### Receta

1. Definir la curva con `CatmullRomCurve3` sobre waypoints en XZ (y un `yLift` pequeño para evitar z-fighting con el suelo).
2. Muestrear con `curve.getSpacedPoints(N)` — `N` ≈ 2 × arc-length en metros da resolución suficiente sin pasarte.
3. Por cada muestra, calcular tangente (diferencia finita con el siguiente punto) y `side = up × tangent` (normalizado). Construir los dos vértices left/right a `±width/2` del punto central.
4. **UVs normalizadas 0..1** en las dos direcciones:
   - `u = 0` en el vértice izquierdo, `u = 1` en el derecho.
   - `v = arc[i] / totalLength`, con `arc[i]` acumulado del primer pase.
5. Índices en triangle-strip: `a,c,b` + `b,c,d` por segmento.
6. Material: `MeshStandardMaterial` con mapas PBR en `RepeatWrapping`.
7. Tiling final: `texture.repeat.set(tilesPerMetre * width, tilesPerMetre * length)`. Así la textura ve exactamente la cantidad de repeticiones que tocan al tamaño real del ribbon, y si cambias la geometría (añades un waypoint) el tiling se recalcula solo con `length` actualizada.

### Por qué UVs normalizadas y no "en metros"

Tentación: meter `uv.v = arc_in_metres` directamente y dejar `texture.repeat = (1, 1)`. Funciona, pero **acopla geometría con escala de textura**. Si reduces `tilesPerMetre` globalmente (para toda la escena) tienes que regenerar UVs de cada ribbon. Con UVs 0..1 el tiling se controla en un único sitio (el material) y eso encaja con el helper `loadPbrMaterial(...).setPlaneSize(width, length)`.

### Gotchas

- `getSpacedPoints` reparte equidistante por arc-length, no por parámetro; eso es lo que quieres para que la textura no se estire en zonas curvas.
- El vector `up × tangent` degenera si la tangente es casi vertical. Como aquí la curva vive en XZ, no pasa.
- No uses `CatmullRomCurve3` con `tension > 0.5` si los waypoints están muy juntos; los bucles salen torcidos.
- Si el ribbon se ve pegado al suelo y parpadea: subir `yLift` (0.005–0.02 m) o mejor, activar `polygonOffset` en el material.

### Cuándo no usar este patrón

- superficies enormes y orgánicas (valles, dunas) → mejor heightmap sobre plano subdividido y blend por textura (ver `custom-shaders.md`).
- caminos que necesitan bordes difuminados hacia la hierba → ribbon + máscara alpha en el shader del suelo, no ribbon opaco.
- cuando el camino es trivialmente recto → un `PlaneGeometry` rotado es más que suficiente.

---

## Pendiente de ampliar

- patrones concretos de terrain blending con código ejemplo
- política exacta de KTX2 vs WebP según proyecto/target
- impostores y billboarding con atlas
- texturas procedurales en tiempo real (RTT) y cuándo compensan

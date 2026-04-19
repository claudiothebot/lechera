# glTF Pipeline

## Objetivo
Tratar `glTF` y `GLB` como un pipeline de producción real para Three.js, no como un simple `loader.load()` aislado.

## Default principal
Para juegos web nuevos en Three.js:
- usar `glTF` o `GLB` como runtime format principal
- mantener archivos fuente aparte
- centralizar carga con `GLTFLoader`
- usar `LoadingManager` cuando haya varios assets o una pantalla de carga real
- considerar compresión de geometría y texturas solo con pipeline claro

## Regla principal
Separar estas capas:
1. **source assets**
2. **runtime exports**
3. **load orchestration**
4. **instanciación/clonado**
5. **activación visual y cleanup**

## `glTF` vs `GLB`
Regla práctica:
- `GLB` suele ser mejor default de distribución cuando quieres un runtime empaquetado y simple de servir
- `glTF` puede ser útil cuando necesitas inspección fácil o assets externos explícitos

No convertir esto en religión. Lo importante es que el runtime sea consistente y mantenible.

## Source files vs runtime files
Regla fuerte:
- los archivos de editor no son runtime assets
- exportar una versión pensada para juego
- no depender del archivo de Blender, Maya o similar como si fuera el asset final

Mantener claro:
- fuente editable
- export runtime
- variante comprimida si existe

## Checklist de export
Antes de integrar:
- escala correcta
- orientación correcta
- pivots útiles
- nombres estables
- materiales razonables
- jerarquía limpia
- clips de animación con nombre
- texturas con tamaño sensato
- polycount proporcional al uso real

## Animación: cuidado con tracks de **scale**

En rigs exportados desde herramientas de IA o con retarget ruidoso, un clip puede llevar **keyframes de scale** en huesos raíz o torso. En reproducción eso se traduce en “inflado” o clipping durante el walk.

Opciones:
- arreglar en DCC / re-export limpio;
- en runtime, **eliminar tracks de scale** del `AnimationClip` al cargar (quedan posición y rotación), si el modelo ya tiene escala correcta en bind pose.

Relacionado: `animation-systems.md` y bounding boxes en skinned meshes (`Box3.setFromObject(..., true)`).

## Orquestación de carga
Cuando haya varios modelos o dependencias:
- usar `LoadingManager`
- exponer progreso al usuario si la espera no es trivial
- no arrancar gameplay serio antes de que los assets críticos estén listos

El manual de `game` es bastante claro aquí: la coordinación de carga y la UI de progreso forman parte del producto, no de un detalle menor.

## Asset registry recomendado
Patrón sano:
- registrar assets por id
- separar metadata de runtime object
- cachear el resultado del load cuando toque
- exponer factories para instancias visuales

Ejemplo conceptual:
- `assets.characters.knight`
- `assets.props.crate`
- `assets.environments.village`

## Clonado e instanciación
No todo asset cargado debe añadirse tal cual a escena.

### Caso 1, una única escena grande
- cargar
- montar
- configurar ownership y lifecycle

### Caso 2, múltiples instancias del mismo asset
- clonar con criterio
- si es personaje skinned, usar `SkeletonUtils.clone()`
- no compartir estado animado por accidente

### Caso 3, muchos objetos repetidos
- evaluar instancing o assets preparados con instancing
- no asumir que clonar cientos de nodos normales es gratis

La example `webgl_loader_gltf_instancing` deja una pista útil: glTF puede convivir con `EXT_mesh_gpu_instancing`, así que parte del coste puede resolverse ya desde el asset pipeline.

## Compresión
La revisión oficial empuja varias ideas distintas:

### Compresión HTTP
Primer win casi gratis:
- servir assets con compresión HTTP correcta
- muchas veces da una mejora enorme sin tocar el contenido del asset

El manual de `game` deja un ejemplo muy claro: varios megas bajan muchísimo solo por compresión del servidor.

### Compresión de geometría y texturas
El example `webgl_loader_gltf_compressed` enseña un camino canónico:
- `KTX2Loader` para texturas comprimidas
- `MeshoptDecoder` para geometría comprimida

Patrón base:
- detectar soporte real del renderer para KTX2
- configurar loaders auxiliares explícitamente
- no meter compresión a ciegas sin validar pipeline y dispositivos objetivo

## gltf-transform (CLI)

[gltf-transform](https://gltf-transform.dev/) es la herramienta de referencia para **inspeccionar, limpiar y optimizar** glTF/GLB en pipeline reproducible. No sustituye a Blender/Substance para authoring, pero sí a **export ad hoc** y a “bajar megas” antes de subir a `public/`.

**Paquete:** `@gltf-transform/cli` (el binario suele invocarse como `gltf-transform` vía `npx` o `pnpm dlx`).

**Cuándo usarla**
- Antes de integrar un GLB enorme: entender qué pesa (geometría vs texturas vs extensiones).
- Antes de producción: deduplicar accessors, simplificar materiales, comprimir geometría (p. ej. Meshopt) o texturas según el proyecto.
- En CI: validar que un export no ha crecido más de un umbral (combinar con `benchmarking.md` si aplica).

**Comandos típicos (ejemplos)**

```bash
# Estructura, tamaños, meshes, animaciones, texturas
npx @gltf-transform/cli inspect modelo.glb

# Optimización general (revisar flags en la doc del paquete; evolucionan entre versiones)
npx @gltf-transform/cli optimize entrada.glb salida.glb
```

**Reglas sanas**
- Fijar **versión mayor** del CLI en el proyecto (script en `package.json` o documentado en README) para que `optimize` sea reproducible entre máquinas.
- Tras optimizar, **probar en el juego real** (Three.js + extensiones que uses: Meshopt decoder, KTX2, etc.).
- No tratar la compresión como magia: si el asset sigue gigante, el cuello a menudo son **texturas 4K** u opciones de export del DCC.

**Anti-patrones**
- Optimizar una sola vez “a mano” sin script ni versión fijada y olvidar cómo se regeneró el artefacto.
- Asumir que `optimize` siempre baja calidad visual: depende de flags y del contenido.

## Recomendación actual
Con lo revisado en esta ola, la apuesta más sana para proyectos serios sería:
- `GLB` como artefacto runtime principal
- compresión HTTP siempre que puedas
- `KTX2` para texturas si el pipeline lo soporta bien
- `Meshopt` como opción muy seria para geometría
- Draco solo si encaja con tu pipeline y lo has medido, no por reflejo

## Shader warmup y activación visual
La example moderna de `webgl_loader_gltf` deja un detalle muy valioso:
- `renderer.compileAsync()` antes de añadir el modelo puede evitar bloqueos visibles al activar el asset

Esto merece default mental en escenas donde:
- cargas bajo demanda
- cambias de personaje o skin
- entras en zonas nuevas
- presentas modelos grandes al usuario

Para frame pacing, warmup y política general de activación sin tirones, ver `frame-pacing-stutter.md`.

## Entorno y lookdev
Varios examples oficiales mezclan carga de glTF con:
- environment map
- tone mapping
- ajuste de cámara

Esto importa porque un asset puede “verse mal” no por el asset, sino por:
- entorno sin iluminar bien
- tone mapping incoherente
- cámara mal ajustada

No culpar al modelo demasiado pronto.

## Fit de cámara y presentación
Para visores, menús de selección o inspección:
- calcular bounds
- ajustar cámara a selección
- actualizar near/far con criterio

El example oficial lo usa bien como patrón de presentación.

## Lifecycle de modelos cargados
Al cambiar de modelo o reemplazar vistas:
- remover visual de escena
- parar actions o mixers si existen
- limpiar recursos si el asset no va a reutilizarse
- no dejar loads viejos ganar carreras de async

La example oficial moderna también deja una señal útil:
- usar ids o guards de carga para ignorar respuestas antiguas cuando el usuario cambia rápido de asset

## Ownership
Cada modelo cargado debería tener dueño claro:
- viewer
- scene chunk
- enemy factory
- character roster
- skin selector

Sin ownership claro, el caos entra por tres sitios:
- fugas
- dobles cargas
- cleanup roto

## Anti-patrones
- tratar el export del DCC como asset final sin revisión
- cargar glTF desde cualquier archivo sin registry ni coordinación
- mezclar load, gameplay y setup visual en el mismo callback kilométrico
- clonar personajes animados sin `SkeletonUtils.clone()`
- comprimir assets sin pipeline reproducible
- ignorar stutter de compilación de shaders
- no tener estrategia para cancelación lógica o loads obsoletos

## Recomendación fuerte
Si el proyecto pasa de prototipo pequeño, crear explícitamente:
- `assetRegistry`
- `gltfAssetLoader`
- `modelFactory`
- `preloadPhase` o `loadingScreenController`
- `assetLifecycle` o integración con lifecycle general

## Pendiente de ampliar
- variantes por plataforma
- preload por escena o bioma
- streaming de bundles glTF
- validación automática de budgets
- política exacta Draco vs Meshopt según proyecto

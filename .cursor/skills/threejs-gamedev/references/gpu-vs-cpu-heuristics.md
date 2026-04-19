# GPU vs CPU Bottleneck Heuristics

## Objetivo
Distinguir de forma práctica si un problema de rendimiento en un juego Three.js parece venir sobre todo de GPU, de CPU, o de otra fuente como carga/stutter, sin fingir precisión imposible.

## Regla principal
**No diagnosticar por intuición ni por un solo contador.**
Cruzar señales, hacer pruebas pequeñas y comparar cambios concretos.

## Qué intenta resolver
- no bajar resolución cuando el problema es lógica o scene graph
- no quitar gameplay cuando el problema real es postprocessing o sombras
- no usar adaptive quality como parche ciego

## Qué no resuelve por sí solo
- profiling profundo de GPU real
- bugs de lifecycle
- stutter por compilación o activación de assets
- problemas mixtos donde CPU y GPU se pisan a la vez

## Pregunta correcta
No preguntar solo:
- “¿va lento?”

Preguntar:
- ¿mejora al bajar resolución interna?
- ¿mejora al quitar postprocessing o sombras?
- ¿mejora al reducir entidades, lógica o raycasts?
- ¿el problema es constante o aparece en eventos concretos?

## Heurística más útil: tocar una palanca limpia
### Señales de GPU-bound
Sospechar más de GPU si mejora claramente al:
- bajar `renderScale` o resolución interna
- bajar pixel ratio o cap de pixel budget
- desactivar bloom, DOF u otros passes caros
- bajar sombras o su resolución
- reducir transparencias o materiales costosos

### Señales de CPU-bound
Sospechar más de CPU si mejora claramente al:
- reducir entidades con update por frame
- bajar frecuencia de systems secundarios
- quitar raycasts o queries caras
- simplificar lógica de gameplay, IA o física
- reducir nodos vivos o trabajo de scene graph
- evitar rebuilds de geometría o cambios masivos en JS

### Señales de load-bound o stutter-bound
Sospechar otra categoría si el problema aparece sobre todo al:
- entrar en escena
- cambiar skin o modelo
- activar materiales o passes
- spawnear o destruir cosas de golpe
- cambiar tier en caliente

Ahí suele mandar más `frame-pacing-stutter.md` que una simple dicotomía CPU/GPU.

## Pruebas rápidas que suelen decir mucho
### 1. Test de resolución
Baja resolución interna de forma visible.

Si el frame mejora bastante:
- huele a GPU

Si casi no cambia:
- probablemente no era el cuello principal de GPU

## 2. Test de postprocessing
Desactiva composer o passes caros.

Si el frame mejora mucho:
- GPU/postprocess sospechoso fuerte

Si apenas cambia:
- mira otra parte

## 3. Test de densidad lógica
Reduce entidades activas, updates, raycasts o systems.

Si mejora claro:
- CPU sospechosa fuerte

## 4. Test de draw calls
Reduce meshes sueltas, materiales distintos o densidad visible.

Si bajan `renderer.info.render.calls` y mejora mucho:
- puede ser cuello de CPU por driver/submit y también GPU por draw overhead
- no asumir que draw calls son “solo GPU”

## 5. Test de scene graph
Sustituye masa de meshes por instancing o merge en una escena equivalente.

Si mejora:
- había coste importante en mantenimiento de nodos, draw calls o ambas

## `renderer.info` como ayuda, no como juez supremo
Mirar:
- `render.calls`
- `triangles`
- `geometries`
- `textures`
- `programs`

Lecturas útiles:
- `render.calls` muy alto, sospechar draw overhead
- `programs` creciendo al tocar materiales, sospechar permutations y compilación
- geometrías/texturas creciendo sin bajar, sospechar lifecycle o fuga

Pero `renderer.info` no te dice solo con eso “esto es CPU” o “esto es GPU”.

## Scene graph y CPU
Los manuales de optimización dejan una pista muy fuerte:
- demasiados nodos, helpers y transforms también cuestan aunque el render no parezca escandaloso

Sospechar CPU cuando:
- la escena tiene miles de objetos con updates
- el problema cae al reducir entidades lógicas
- instancing/merge mejora sin tocar mucho el shading

## Material changes y falsos diagnósticos
`how-to-update-things` deja claro que ciertos cambios de material fuerzan recompilación.

Eso puede parecer “GPU lenta” cuando en realidad estás viendo:
- compilación de shaders
- stutter por `needsUpdate`
- reconfiguración costosa en mal momento

Regla:
- separar throughput lento de picos por recompilación

## Resolución y pixel budget
El manual `responsive` deja otro patrón fuerte:
- controlar explícitamente el drawing buffer ayuda a hacer tests limpios de GPU
- capar pixel count evita ahogarse en HD-DPI

Esto hace que la prueba de resolución sea bastante fiable como primer filtro práctico.

## Quality scaling y diagnóstico
El adaptive scaler no debería actuar solo por frame time bruto.

Si hay indicios de CPU-bound:
- bajar resolución puede servir poco
- incluso puede ocultar el problema real

Patrón sano:
- usar heurísticas ligeras para estimar si el coste parece más visual o más lógico
- priorizar `renderScale` y post recuts cuando huele a GPU
- no tocar calidad visual agresivamente si los síntomas apuntan a CPU o stutter de activación

## Benchmarks recomendados para separar causas
Conviene tener benchmarks distintos para:
- fill/postprocessing heavy
- draw-call heavy
- scene graph/update heavy
- spawn/activation heavy

Si todo se mete en una sola escena gigante, el diagnóstico se vuelve barro.

Y si además quieres comparar runs a lo largo del tiempo, esos benches deberían emitir reportes consistentes. Ver `benchmark-reporting.md`.

## Casos mixtos
Muy común:
- draw calls altas pegan en CPU y GPU
- sombras pegan en GPU, pero también pueden disparar variants y trabajo extra
- demasiados objetos pegan en scene graph y también en render submission

Regla:
- aceptar que a veces el cuello principal cambia por dispositivo o escena
- buscar la palanca más rentable, no una etiqueta perfecta

## Heurística de bolsillo
### Huele a GPU si
- bajar resolución ayuda mucho
- quitar post/shadows ayuda mucho
- la lógica apenas cambia el resultado

### Huele a CPU si
- bajar resolución ayuda poco
- reducir entities/updates ayuda mucho
- devtools muestran JS pesado o callbacks caros

### Huele a stutter/load si
- la media no parece terrible pero hay golpes concretos
- el problema aparece al activar, cargar, compilar o reconfigurar

## Anti-patrones
- asumir que FPS bajo en móvil significa automáticamente GPU
- bajar calidad visual antes de aislar la CPU
- culpar a triangles cuando el problema son draw calls o lógica
- culpar a draw calls cuando el problema es compilación de shaders
- intentar resolver stutter de activación con simple downgrade visual

## Recomendación fuerte
Tener una rutina corta de diagnóstico:
1. medir frame time y contexto
2. hacer test de resolución
3. hacer test de post/shadows
4. hacer test de entidades/update
5. cruzar con `renderer.info` y devtools
6. etiquetar provisionalmente: GPU, CPU, mixed o stutter/load

## Pendiente de ampliar
- heurísticas por género de juego
- señales más finas con tooling de navegador
- diagnóstico por dispositivo o tier
- integración directa con `adaptiveScaler`

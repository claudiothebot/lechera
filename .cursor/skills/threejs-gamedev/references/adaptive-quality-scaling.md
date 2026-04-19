# Adaptive Quality Scaling

## Objetivo
Ajustar la calidad visual en runtime de forma estable y controlada, para proteger frame time y evitar que el juego se vuelva un festival de tirones o cambios erráticos.

## Regla principal
**La calidad adaptativa no debe reaccionar a un frame malo aislado.**
Debe responder a tendencias, picos sostenidos y contexto real.

## Qué intenta resolver
- GPU sobrecargada en ciertos dispositivos
- escenas que cambian mucho de coste
- picos por postprocessing, sombras o resolución interna
- necesidad de mantener una sensación estable sin obligar al jugador a abrir opciones

## Qué no intenta resolver
- lógica CPU desastrosa
- lifecycle roto
- stutter por compilación o activación de assets
- benchmarks mal diseñados

Si el problema real es CPU, shaders recompilando o spawn masivo mal repartido, bajar resolución puede maquillar pero no curar.

Para una capa previa de diagnóstico práctico antes de decidir qué palanca tocar, ver `gpu-vs-cpu-heuristics.md`.

## Base sana: presets manuales primero
Antes de adaptar nada automáticamente, hace falta tener tiers manuales coherentes:
- bajo
- medio
- alto

La calidad adaptativa debería moverse entre presets buenos o modificar un subconjunto muy controlado de variables.

## Mejor palancas para adaptación automática
### 1. Resolución interna
Suele ser la palanca más limpia cuando el cuello es GPU.

Patrón fuerte derivado del manual `responsive`:
- calcular tamaño real del drawing buffer de forma explícita
- evitar magia opaca cuando importa saber la resolución real
- poder limitar máximo de píxeles internos

Esto favorece una variable como:
- `renderScale` entre 0.6 y 1.0, por ejemplo

## 2. Resolución de ciertos efectos
Muy buena segunda palanca:
- bloom a media resolución
- blur reducido
- targets auxiliares más pequeños

Lo mismo aplica a minimapas, monitores y otros RTT no críticos: a menudo compensa más bajar su tamaño o frecuencia que degradar antes la imagen principal. Ver `render-targets.md`.

## 3. Postprocessing premium
Buena palanca, pero con más riesgo de tirón:
- DOF off
- bloom más barato
- desactivar chains premium

## 4. Sombras
Útil pero más delicado visualmente:
- bajar resolución de shadow map
- reducir distancia
- limitar luces con sombra

## 5. Densidad secundaria
Solo para sistemas no críticos:
- partículas
- props decorativos
- vegetación secundaria

## Palancas que conviene tocar menos
- cambios bruscos en materiales que recompilen shaders
- destrucción y recreación frecuente de composer completo
- alternancia agresiva de features visibles cada pocos segundos
- cambios que afecten legibilidad o gameplay principal

## Señal de entrada correcta
No usar solo FPS instantáneo.
Usar mejor:
- frame time suavizado
- percentiles o ventana reciente
- picos repetidos
- contexto del sistema

Patrón razonable:
- mantener media móvil o EMA de frame time
- llevar contador de frames malos consecutivos
- detectar picos largos, no solo accidentes aislados

## Histeresis o te comes el infierno
Sin histéresis, el scaler sube y baja como un borracho.

Regla:
- bajar relativamente rápido cuando hay degradación sostenida
- subir lentamente solo si sobra margen durante bastante tiempo

Ejemplo conceptual:
- bajar si el frame time supera el objetivo durante N frames o X ms acumulados
- subir solo tras varios segundos de estabilidad cómoda

## Cooldown
Tras aplicar un cambio, esperar.

Si no hay cooldown:
- no sabes qué cambio ayudó
- encadenas resizes
- generas más stutter del que intentabas evitar

## Separar niveles de intervención
### Nivel 1, ajuste fino
- bajar `renderScale`
- reducir resolución interna de efectos

### Nivel 2, recorte moderado
- bloom más barato
- sombras más pequeñas

### Nivel 3, cambio de tier
- pasar de alto a medio
- pasar de medio a bajo

Esto evita apagar medio juego por una caída breve.

## Recomendación fuerte sobre resolución
Preferir una política explícita de tamaño de drawing buffer frente a depender ciegamente de `renderer.setPixelRatio()`.

Razón fuerte del manual `responsive`:
- saber realmente el tamaño del buffer importa mucho en postprocessing, shaders, screenshots, picking y render targets
- además conviene poder capar píxeles máximos

## Escalado por pixel budget
Patrón muy defendible:
- definir un máximo de píxeles internos por tier o dispositivo
- si el tamaño real excede ese presupuesto, aplicar `renderScale`

Eso es especialmente valioso en móviles y pantallas HD-DPI altas.

## Cambios en momentos seguros
No aplicar cambios grandes en cualquier frame porque sí.

Mejor momentos:
- pausa
- menú
- transición
- fade
- tras un encounter
- cuando el jugador no está en una maniobra crítica

Si el cambio ocurre en gameplay vivo, que sea pequeño y de baja visibilidad.

## Integración con frame pacing
Un scaler adaptativo bueno protege la regularidad, no solo la media.

Por eso conviene vigilar:
- picos recientes
- resize cost
- recreación de targets
- cambios de quality manager

Si el remedio mete tirones al aplicar cambios, hay que rediseñar la transición.

## Integración con quality tiers
Patrón sano:
- `qualityManager` define presets coherentes
- `adaptiveScaler` decide si conviene moverse dentro de un margen o bajar de tier

Separar responsabilidades ayuda mucho.

## Integración con benches
No validar adaptive quality en una sola escena agradable.
Probarlo en:
- postprocessing stress
- asset activation stress
- gameplay slice bench
- spawn/chunk bench

Así se ve si:
- estabiliza de verdad
- reacciona demasiado tarde
- cambia demasiado a menudo
- rompe claridad visual

## Debug recomendado
Exponer al menos:
- tier actual
- `renderScale`
- frame time suavizado
- últimos picos importantes
- cooldown restante
- motivo del último downgrade/upgrade

## Anti-patrones
- usar FPS instantáneo como única señal
- bajar calidad por un único pico aislado
- subir y bajar sin histéresis
- tocar demasiadas variables a la vez
- usar adaptive quality para tapar CPU o lifecycle rotos
- aplicar cambios grandes de postprocessing en medio de gameplay sensible

## Recomendación fuerte
Crear dos capas separadas:
- `qualityManager` para presets y cambios coordinados
- `adaptiveScaler` para observación, histéresis, cooldown y decisiones

## Pendiente de ampliar
- heurísticas concretas por género
- separación explícita entre GPU-bound y CPU-bound
- políticas de upscale/downgrade con percentiles
- integración con telemetría y reporting

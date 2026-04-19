# Benchmarking

## Objetivo
Convertir mediciones de rendimiento en runs reproducibles, diffs honestos y veredictos accionables. Unifica reporting, diffing y thresholds.

## Regla principal
**Un bench sin rastro comparable y sin thresholds del proyecto se olvida y miente.**
La cadena útil es: *run reproducible → reporte estructurado → diff validado → veredicto bajo thresholds del proyecto*.

## Qué intenta resolver
- comparativas antes/después honestas
- evitar “creo que iba mejor”
- detectar regresiones de media, percentiles y picos por separado
- tener un lenguaje común para revisar PRs o cambios grandes
- traducir deltas numéricos a decisiones (aceptar, vigilar, bloquear)

## Qué no necesita desde el día 1
- CI perfecta
- granja de dispositivos
- tooling industrial
- snapshots visuales automáticos

Basta con semiautomatización consistente.

---

## 1. Runs reproducibles

### Nivel mínimo viable
Un bench debe poder:
1. arrancar una escena concreta
2. fijar una configuración reproducible
3. correr warmup + ventana de medición
4. capturar métricas clave
5. guardar un resultado legible

### Warmup y ventana de medición
- fase de warmup para absorber compilación, carga y cachés
- fase de medición estable
- reporte final separado
- medir el arranque aparte si importa

### Reproducibilidad
Cuanto más controlado, más valor:
- seed fija si hay aleatoriedad
- misma ruta de cámara o path pregrabado
- misma secuencia de inputs
- misma duración de run
- misma configuración visual

Sin esto, comparar runs es barro.

### Rutas de cámara y scripts de acción
Patrones útiles sin sofisticación:
- orbitar durante 10s
- activar tier alto en t=5s
- spawn de 100 props en t=8s
- cambiar skin en t=12s

Eso da contexto real a los picos.

### Qué capturar
Contexto del run:
- nombre del bench, fecha, commit
- dispositivo/navegador si se conoce
- resolución y pixel ratio efectivos
- tier activo
- toggles relevantes (sombras, post, densidad, RTT, etc.)

Métricas mínimas:
- frame time medio
- p95 y p99
- peor pico relevante
- draw calls
- triángulos
- geometries/textures/programs

Opcionales según bench:
- tiempo de build
- tiempo de carga
- tiempo hasta “asset ready to show smoothly”
- tiempo de spawn/despawn
- latencia del scaler adaptativo

### Separar throughput de stutter
Dos lecturas distintas:
- régimen estable: media, percentiles, draw calls y estado medio
- eventos críticos: pico al activar asset, cambiar tier, crear RTT, entrar a chunk

No aplastar todo en un número único.

### Formato de salida
Resumen legible (markdown o texto):
- bench, config, métricas clave, observaciones

Datos estructurados (JSON) con campos estables para diffs y gráficos posteriores:

```json
{
  "bench": "draw-call-stress",
  "scenario": "instanced-vs-naive",
  "variant": "INSTANCED",
  "tier": "medium",
  "resolution": { "width": 1600, "height": 900, "renderScale": 0.8 },
  "sample": {
    "warmupMs": 3000,
    "measureMs": 10000,
    "frameTimeAvgMs": 14.8,
    "frameTimeP95Ms": 18.9,
    "frameTimeMaxMs": 29.4
  },
  "rendererInfo": {
    "calls": 1,
    "triangles": 240000,
    "geometries": 12,
    "textures": 5,
    "programs": 3
  },
  "notes": ["stable", "no visible stutter"]
}
```

---

## 2. Diffs entre runs

### Regla previa
**No comparar runs si no son realmente comparables.**
Antes de mirar métricas, validar que contexto y configuración sean equivalentes o que la diferencia esté declarada.

### Contexto antes que números
Validar:
- mismo bench y variante
- mismo tier
- misma resolución efectiva y `renderScale`
- mismos toggles relevantes
- misma duración de warmup/measure
- misma seed o ruta de cámara si aplica

Si no coincide, marcar `no comparable` o `comparable con reservas` y no vender el resultado como definitivo.

### Tipos de diff
1. **Throughput estable**: frame time medio, p95/p99, draw calls, triángulos, geometries/textures/programs.
2. **Picos/eventos**: peor spike, pico al activar asset, cambiar tier, crear composer o RTT, spawn/despawn.
3. **Comportamiento adaptativo**: tiempo hasta primer downgrade, número de cambios, thrash.

### Orden sano de lectura
1. ¿hay diferencia de contexto?
2. ¿cambió p95/p99?
3. ¿cambió el peor pico relevante?
4. ¿cambió la media?
5. ¿cambió memoria o draw calls?

Evitar obsesionarse con media mientras los tirones empeoran.

### Clasificación
- **mejora clara**
- **regresión clara**
- **mixto / tradeoff**
- **inconcluso**
- **no comparable**

### Casos de tradeoff típicos
- baja la media pero sube el peor pico
- mejora p95 pero aumenta memoria viva
- bajan draw calls pero empeora tiempo de build
- mejora tier alto pero rompe tier bajo

Decirlo así. No forzar éxito/fracaso binario.

### Shape de diff

```json
{
  "bench": "postprocessing-stress",
  "baseline": "run-2026-04-17-a",
  "candidate": "run-2026-04-17-b",
  "comparable": true,
  "classification": "mixed",
  "deltas": {
    "frameTimeAvgMs": -1.4,
    "frameTimeP95Ms": -2.1,
    "frameTimeMaxMs": 5.8,
    "renderCalls": 0,
    "textures": 2
  },
  "highlights": [
    "mejora clara en p95",
    "empeora el peor pico al activar bloom",
    "memoria de texturas sube ligeramente"
  ]
}
```

---

## 3. Thresholds por proyecto

### Regla
**Los thresholds no son universales.**
Salen del género, target de hardware, frame budget y lo que el proyecto considera aceptable.

### Punto de partida
Antes de fijar thresholds, dejar claro:
- objetivo de frame rate: 60fps (~16.7ms), 30fps (~33.3ms) o mixto
- hardware objetivo: desktop, móvil, gama baja
- escenas críticas: gameplay principal, combate, carga

### Tres capas de threshold
- **ruido**: debajo de esto el cambio no se considera significativo
- **advertencia**: merece atención y comentario
- **bloqueo**: rompe presupuesto o política; no aceptar sin excepción justificada

### Por categoría
1. **Throughput estable**: la media tolera más; p95 suele importar más; si p95 se acerca al techo del budget, endurecer.
2. **Picos y eventos**: thresholds más severos que para la media. Un pico nuevo de 20ms en gameplay crítico no es aceptable aunque la media apenas cambie.
3. **Recursos y memoria**: mirar no solo delta absoluto, también si el proyecto ya iba justo en móvil o tiers bajos.

### Por bench y por plataforma
No usar los mismos thresholds para:
- draw-call sintético vs gameplay slice
- desktop alto vs móvil

Estructura sana:
- defaults globales del proyecto
- overrides por bench o familia
- overrides por plataforma o tier

### Ejemplo conceptual

```json
{
  "project": "my-threejs-game",
  "targets": {
    "frameTimeAvgWarnMs": 0.5,
    "frameTimeAvgBlockMs": 1.5,
    "frameTimeP95WarnMs": 1.0,
    "frameTimeP95BlockMs": 2.5,
    "frameTimeMaxWarnMs": 4.0,
    "frameTimeMaxBlockMs": 8.0,
    "renderCallsWarn": 20,
    "renderCallsBlock": 50
  }
}
```

No son números universales. Solo ilustran la forma.

### Veredicto final
Combinar diff + thresholds:
- **ok / ruido**
- **vigilar**
- **regresión seria**
- **bloqueante**
- **tradeoff aceptable**

---

## Infraestructura mínima del proyecto

Capa pequeña y suficiente:
- `benchRunner`: escenas de bench accesibles (query param, debug menu o ruta dedicada), config reproducible desde fuera (seed, tier, variant, duración, densidad, `renderScale`), recolector de métricas (frame times, percentiles, `renderer.info`, eventos), salida en texto + JSON, marcas de evento relevantes.
- `benchDiff`: valida comparabilidad, calcula deltas, agrupa por categorías, marca mismatches, emite clasificación.
- `benchThresholds`: defaults globales + overrides por bench y por plataforma, aplicados sobre el diff.

Cercano al código del proyecto, no notas sueltas.

## Integraciones

### Con profiling y budgets
- ¿qué bench rompe el presupuesto?
- ¿qué tier lo arregla?
- ¿qué cambio mejora media pero empeora picos?

### Con adaptive quality
Registrar además:
- tiempo hasta primer downgrade
- número de downgrades/upgrades
- thrash
- si mejoró percentiles o solo media

### Con GPU vs CPU heuristics
Si el bench cambia una palanca visual o lógica limpia, el reporte ayuda a clasificar el cuello: visual/GPU-ish, lógico/CPU-ish, mixed, stutter/load.

### Con revisión humana
El diff no sustituye mirar contexto:
- ¿el cambio visual merece el coste?
- ¿el empeoramiento aparece solo en una escena rara o en la principal?
- ¿el beneficio es desktop y castiga móvil?

## Inspiración útil de examples
`webgl_instancing_performance`:
- variants comparables
- `console.time()` para medir build
- misma escena, distinta estrategia

## Anti-patrones
- medir a ojo y no guardar nada
- comparar runs con configuración distinta sin decirlo
- mezclar warmup, loading y steady-state en un único número
- capturar solo FPS medio
- no registrar tier o `renderScale` activos
- cambiar varias variables fuertes a la vez
- celebrar mejoras de media ignorando picos peores
- aplicar los mismos thresholds a todos los benches
- bloquear cambios por ruido minúsculo
- thresholds inventados sin ligarlos al frame budget

## Recomendación fuerte
Un bench serio en el proyecto emite siempre:
- un resumen humano con veredicto
- un JSON comparable
- una clasificación bajo los thresholds del proyecto

## Referencias asociadas
- `stress-scenes-benchmarks.md`
- `profiling-budgets.md`
- `gpu-vs-cpu-heuristics.md`
- `adaptive-quality-scaling.md`
- `quality-tiers.md`

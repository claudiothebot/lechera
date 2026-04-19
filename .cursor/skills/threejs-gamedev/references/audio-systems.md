# Audio Systems

## Objetivo
Dar una base sana de audio para juegos Three.js: carga coordinada, buses, pool de voces y spatial audio, sin acoplar gameplay a llamadas sueltas de `play()`.

## Regla principal
**No llamar `play()` desde cualquier sitio.**
Todo audio pasa por un `AudioService` del juego que conoce buses, volumen global, limitaciones de voces concurrentes y estado (muted, foco de ventana, pausa).

## Qué cubrir
- SFX cortos y frecuentes
- música
- ambientes (loops largos y pesados)
- voces del personaje o VO
- audio espacial de entidades del mundo

## Decisión base: `three/audio` vs Web Audio API directa
- Three.js ofrece `AudioListener`, `Audio`, `PositionalAudio` y `AudioLoader`. Base suficiente para empezar.
- Para juegos con más capas (buses, ducking, filtros dinámicos, crossfade de música), usar Web Audio API directamente y exponer un wrapper propio. `three/audio` se queda corto en mixing serio.
- En móvil, `AudioContext` puede venir suspendido hasta primer input: desbloquear de forma explícita al primer gesto del usuario.

## Buses mínimos
- `master`
- `music`
- `sfx`
- `ambience`
- `ui`
- `voice` (si aplica)

Cada bus con su `GainNode` conectado al master. Settings de usuario modifican volúmenes por bus, no por sonido.

## Carga y registro de assets
- Declarar el set de audio junto al resto de assets del juego (ver `assets.md`).
- Formatos: `ogg` o `webm/opus` preferente; `mp3` como fallback.
- SFX cortos: decodificados en memoria (`AudioBuffer`).
- Música y ambientes largos: streaming con `<audio>` + `MediaElementAudioSourceNode` para no inflar memoria.
- Registro por clave lógica (`sfx/player-hit`), no por path.

## Pool de voces
Límites duros por bus:
- SFX del mismo tipo: collapsing (si ya suenan N iguales en una ventana corta, reemplazar el más viejo o ignorar).
- Máximo global de voces concurrentes por bus.
- Prioridades: un SFX importante puede robar voz a uno irrelevante.

Sin esto, una ráfaga de eventos clava la CPU y satura el mix.

## Spatial audio
- `PositionalAudio` con `AudioListener` pegado a la cámara activa.
- Definir `refDistance`, `maxDistance` y `rolloffFactor` por tipo de fuente, no por sonido individual.
- En juegos top-down o 2.5D, usar audio espacial con cuidado: el pan puede marear si la cámara y la orientación no casan con el jugador.

## Música
- Transiciones con crossfade, no corte brusco.
- Música por estados del juego, no por nivel cargado.
- Evitar layers verticales sofisticadas hasta tener el loop jugable validado (fase 3+).
- Loops con puntos de corte marcados desde el export, no calculados a ojo.

## Ducking y prioridades
Casos típicos:
- VO o diálogo: baja temporalmente música y ambientes.
- Hit crítico de gameplay: pequeño duck del bus de música.

Implementar como transiciones cortas de gain en el bus, no tocando sonidos individuales.

## Pausa y foco de ventana
- Al perder foco (`visibilitychange`), parar o silenciar según política.
- Al entrar a pausa del juego, silenciar SFX y ambientes, mantener música en bajada suave.
- Nunca detener `AudioContext` silenciosamente, o se pierde estado.

## Mobile
- Desbloqueo por primer gesto obligatorio.
- Menos voces concurrentes.
- Preferir audio más corto y menos denso en frecuencias altas.
- No dar por hecho que el dispositivo puede decodificar todos los formatos: tener fallback.

## Gameplay hooks
Acoplamiento sano:
- gameplay emite eventos de dominio (`onPlayerHit`, `onStepGrass`, `onPenalty`).
- un suscriptor mapea eventos a llamadas al `AudioService`.
- el `AudioService` decide qué bus, qué pool, qué prioridad.

Así se pueden silenciar o remapear sonidos sin tocar gameplay.

## Debug
- overlay con voces activas por bus
- toggle para solo un bus (solo música, solo SFX)
- log opcional de eventos de audio con timestamp

## Anti-patrones
- `new Audio(...).play()` desperdigado en entidades
- compartir un único `AudioContext` sin desbloquear en móvil
- cargar música larga como `AudioBuffer` y ver cómo explota la memoria
- spatial audio sin definir `refDistance` y `rolloffFactor`
- loops de música con artefactos porque el punto de corte no estaba bien exportado
- ajustar volumen individualmente en vez de por bus
- música que cambia brusco al pasar de menú a gameplay

## Recomendación fuerte
Tener desde el principio:
- `AudioService` único con buses explícitos
- API por claves lógicas
- pool de voces y prioridades
- desbloqueo de `AudioContext` estandarizado
- settings de usuario persistidos por bus (ver `persistence-save.md`)

## Referencias asociadas
- `assets.md`
- `default-content-sourcing.md`
- `mobile-performance.md`
- `persistence-save.md`
- `ui-hud.md`

# Persistence and Save

## Objetivo
Guardar y cargar partida, progreso y settings en un juego Three.js web sin perder datos al actualizar, sin mezclar formatos sueltos y sin llamar a storage desde todos lados.

## Regla principal
**Gameplay no toca storage directamente.**
Todo persiste a través de un `SaveService` con versiones, namespaces y validación. Si mañana se migra de `localStorage` a `IndexedDB` o a backend, gameplay no se entera.

## Qué persistir
- **Settings**: volumen por bus, calidad gráfica, sensibilidad de cámara, idioma, controles remapeados.
- **Progreso**: nivel actual, unlocks, collectibles, estadísticas.
- **Save slot(s)**: estado continuable de una partida concreta.
- **Telemetría local** opcional (highscores, tiempos).

Cada uno con su namespace y su schema.

## Qué NO persistir
- estado derivable (cachés, posiciones temporales de cámara).
- pools, texturas, geometrías.
- flags de depuración por defecto.
- cualquier cosa con referencias a objetos de Three.js.

## Storage web: elegir con criterio
- **`localStorage`**: suficiente para settings y saves pequeños (KB). Síncrono, simple. Límite ~5MB por origen.
- **`IndexedDB`**: para saves grandes, múltiples slots, datos binarios. Asíncrono. La vía sensata cuando el save pasa de decenas de KB.
- **`sessionStorage`**: útil para cosas que mueren al cerrar pestaña, no para save real.
- **Backend**: solo si el juego lo pide (cloud saves, leaderboards, cuentas). No meter por reflejo.

Regla práctica: settings en `localStorage`, saves en `IndexedDB` salvo que el save sea trivial.

## Shape del SaveService
API mínima:
- `loadSettings()` / `saveSettings(settings)`
- `loadProgress()` / `saveProgress(progress)`
- `listSlots()` / `loadSlot(id)` / `saveSlot(id, state)` / `deleteSlot(id)`
- `clearAll()` (con confirmación).

Todo tipado. Todo pasando por serializadores propios.

## Versionado y migraciones
**Cada payload lleva un `version` obligatorio.**
Al cargar:
1. leer `version`.
2. si coincide con la actual, validar y usar.
3. si es anterior, aplicar migraciones paso a paso (v1 → v2 → v3).
4. si es mayor que la conocida, rechazar y avisar (no intentar adivinar).
5. si no hay `version` o falla parsing, tratar como corrupto.

Migraciones como funciones puras `(old) => new`. Guardar las antiguas aunque la versión actual sea muy superior; un usuario puede venir de una build vieja.

## Validación
No confiar en que el storage tenga lo que escribiste:
- schema runtime (manual, Zod, Valibot según gusto).
- fallbacks seguros: si falla validación, cargar defaults y no crashear.
- loggear errores de validación en desarrollo; en producción, degradar silenciosamente a defaults salvo casos críticos.

## Serialización
- JSON simple por defecto.
- evitar referencias circulares (escoger qué se guarda, no “vaciar el objeto entero”).
- para binario (texturas procedurales guardadas, snapshots grandes), `IndexedDB` acepta `Blob`/`ArrayBuffer` directamente.

Datos que no deberían ir a JSON:
- `Vector3` → serializar como `{x, y, z}` o array.
- fechas → ISO string.
- `Map`/`Set` → array de pares o array.

## Auto-save
- eventos claros que disparan save: fin de nivel, checkpoint, pausa, cambio crítico.
- throttle: si gameplay emite muchos eventos, no escribir en cada uno.
- debounce para settings (el usuario mueve un slider; guardar al soltar o cada N ms).
- nunca guardar en cada frame.

## Pérdida de datos y robustez
- escribir a un slot temporal y renombrar al final cuando sea posible (en `IndexedDB` se resuelve con transacciones).
- mantener un slot de backup previo; si el actual está corrupto, caer al backup.
- no bloquear el hilo principal con guardados grandes: en `IndexedDB` todo es asíncrono ya.

## Privacidad y cuotas
- avisar si el juego pide `navigator.storage.persist()` (modo persistente).
- manejar `QuotaExceededError`: ofrecer limpiar saves antiguos.
- en móvil, el OS puede limpiar storage; no asumir que siempre está.

## Settings y UI
- settings es el primer candidato a persistir.
- UI lee y escribe a través del `SaveService`, nunca a `localStorage` directamente.
- cambios aplicables en caliente (volumen, sensibilidad) vs cambios que requieren reinicio (idioma, api gráfica): marcarlo en la UI.

## Integración con audio y UI
- `AudioService` se inicializa con settings cargados; si cambian, los aplica en vivo.
- remapeo de controles (ver `input-controls.md`) se persiste por perfil o slot.
- HUD puede mostrar “guardando…” pero no bloquear.

## Seguridad y tampering
- en juegos web singleplayer no merece la pena cifrar el save.
- si el juego tiene puntuaciones online, la verdad debe estar en el servidor. El save local no es autoridad.
- no guardar tokens sensibles en `localStorage`.

## Debug
- panel que permita volcar save actual, importar, exportar, borrar.
- versionar también la build y el commit en el payload para diagnosticar bugs.

## Anti-patrones
- `localStorage.setItem('player', JSON.stringify(player))` con el objeto de gameplay entero
- guardar `Vector3` como tal (se pierde el tipo al parsear)
- no poner `version` al payload
- migraciones que mutan el objeto y rompen saves intermedios
- escribir en cada frame
- meter backend cloud saves antes de validar el save local
- ignorar `QuotaExceededError`
- cifrar saves de un juego singleplayer “por seguridad”

## Recomendación fuerte
Desde el día 1:
- `SaveService` con namespaces (`settings`, `progress`, `slots/*`).
- `version` en cada payload.
- validación + fallback a defaults.
- `localStorage` para settings, `IndexedDB` en cuanto el save supere algún KB.
- eventos de gameplay disparan save, con throttle/debounce.

## Referencias asociadas
- `audio-systems.md`
- `ui-hud.md`
- `input-controls.md`
- `architecture.md`

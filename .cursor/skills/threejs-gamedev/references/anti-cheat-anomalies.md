# Anti-Cheat by Telemetry and Anomalies

## Objetivo
Añadir una capa sensata de detección de anomalías y validación de plausibilidad, sin vender humo tipo “anti-cheat perfecto” ni cargar el cliente con responsabilidades que no le tocan.

## Regla principal
**Primero autoridad y validación, luego detección.**
La telemetría no sustituye un servidor autoritativo. La complementa.

## Qué intenta resolver
- detectar patrones imposibles o muy improbables
- revisar abuso sin bloquear juego legítimo por ruido
- evitar depender solo de reglas binarias simplonas

## Base mínima obligatoria
Antes de hablar de anomalías, tener:
- autoridad del servidor en vida, daño, cooldowns y validaciones críticas
- límites plausibles de movimiento y cadencia
- rechazo de mensajes imposibles

Si eso no existe, la telemetría llega demasiado tarde.

## Tipos de anomalía útiles
### Movimiento
- velocidad imposible
- aceleración improbable repetida
- teleports fuera de reglas
- desajustes frecuentes entre input esperado y resultado observado

### Combate
- cadencia superior a la permitida
- precisión estadísticamente absurda mantenida
- patrones de adquisición de target demasiado perfectos
- disparos con origen/dirección incompatibles con postura o arma

### Economía/acciones
- uso de habilidades sin recursos
- secuencias imposibles por cooldown
- comandos fuera de orden lógico o de tick razonable

## Modelo sano
Usar capas:
1. **hard validation**: rechazar lo imposible
2. **soft suspicion**: acumular señales
3. **review or mitigation**: actuar si el patrón persiste

## Scoring de sospecha
Mejor que banear por un evento aislado.

Ejemplo conceptual:
- cada anomalía suma un peso
- hay decaimiento temporal
- ciertos eventos críticos pesan mucho más
- acciones finales requieren acumulación o evidencia muy fuerte

## Mitigaciones posibles
No todo tiene que ser ban directo.

Opciones:
- ignorar el evento inválido
- corregir posición/estado
- reducir confianza en reportes del cliente
- marcar la sesión para revisión
- aplicar restricciones progresivas

## Qué loggear
Guardar lo suficiente para investigar:
- `playerId`
- tipo de anomalía
- tick/timestamp
- contexto del arma/acción
- métricas resumidas
- estado de sospecha acumulada

Evitar:
- logs gigantes de scene graph
- datos visuales innecesarios

## False positives
Tema delicado de verdad.

Puede haber ruido por:
- latencia alta
- jitter
- pérdida de paquetes
- bugs del propio juego
- diferencias de frame pacing cliente/servidor

Regla:
- no castigar fuerte sobre una sola señal dudosa
- correlacionar eventos y contexto

## Qué sí puede hacer Three.js aquí
Muy poco en autoridad, algo en observabilidad:
- visualización debug de rayos, hitboxes o trayectorias
- overlays internos para investigar casos raros
- reproducción visual de eventos sospechosos si existe tooling interno

Pero la detección real vive fuera del render.

## Anti-patrones
- prometer “anti-cheat” solo con heurísticas cliente
- banear por precisión alta sin contexto
- confundir bug de netcode con trampa real
- loggear tanto que luego nadie analiza nada

## Recomendación fuerte
Diseñar una capa de anomalías pequeña y accionable:
- pocas señales buenas
- scoring simple
- logs útiles
- mitigaciones graduales

## Pendiente de ampliar
- revisión asistida por replay
- anomalías por input device
- correlación entre squads/cuentas

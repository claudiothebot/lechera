# Server Rewind by Weapon

## Objetivo
Aplicar lag compensation o server rewind con criterio por arma y por acción, en vez de tratar todos los disparos como si necesitaran exactamente la misma validación temporal.

## Regla principal
**No todas las armas merecen la misma ventana de rewind.**
Un hitscan rápido, un shotgun, un proyectil lento o una melee no piden la misma reconstrucción del pasado.

## Qué intenta resolver
- validar hits de forma más justa
- evitar ventanas absurdas que regalan disparos
- reducir la sensación de morir detrás de cobertura
- no usar una sola política de rewind para todo el arsenal

## Modelo base
Patrón típico:
- el cliente manda intento de disparo con `tick`, origen, dirección y arma
- el servidor consulta historial autoritativo reciente
- reconstruye estado aproximado del momento relevante
- valida según política de esa arma

## Separar por familia de arma
### 1. Hitscan preciso
Ejemplos:
- rifle
- pistola precisa
- sniper

Suele merecer:
- rewind corto pero fiable
- validación estricta de línea/rayo
- límites fuertes de ventana máxima

Riesgo:
- si la ventana es muy generosa, se siente injusto para quien ya estaba a cubierto

### 2. Shotgun o multi-pellet
Suele requerir:
- misma base de rewind que hitscan
- validación de varios rayos o dispersión determinista/servidor
- más cuidado con coste por número de impactos potenciales

Riesgo:
- repetir toda la simulación pellet por pellet de forma cara y poco controlada

### 3. Proyectiles lentos
Ejemplos:
- cohetes
- flechas lentas
- bolas de energía

Muchas veces no necesitan rewind fuerte del impacto final.
Lo importante suele ser:
- validar spawn inicial
- velocidad inicial plausible
- simulación autoritativa del proyectil o corrección fuerte

### 4. Melee
Suele pedir otra cosa:
- ventana corta
- validación espacial por volumen o arco
- confirmación temporal coherente con animación o tick de ataque

### 5. AoE o explosivos
Importa separar:
- validación del punto de impacto/explosión
- aplicación del daño por radio

No todo es rewind de raycast.

## Qué guardar en el historial
Guardar solo lo necesario y con ventana pequeña.

Normalmente:
- transform autoritativa por tick o timestamp
- posture relevante si afecta hitbox
- estado vivo/muerto/activo
- quizá hit volumes simplificados

Evitar:
- reconstruir todo el scene graph
- depender de estado visual del cliente

## Ventana máxima
Tener una ventana máxima clara por arma o familia.

Ejemplo conceptual:
- rifle preciso: más estricta
- shotgun: estricta pero tolerante a dispersión
- melee: muy corta
- proyectil lento: mínima o centrada en spawn

## Fairness vs feel
Tradeoff real:
- ventana mayor ayuda a jugadores con latencia alta
- ventana mayor también aumenta muertes “injustas” a ojos de la víctima

Regla:
- ajustar por género, TTK y ritmo del juego
- no copiar una ventana universal de otro juego

## Datos mínimos del disparo
Mandar:
- `weaponId`
- `tick`
- origen o socket de salida si aplica
- dirección o intención
- quizá seed si la dispersión necesita reproducibilidad

No mandar como verdad:
- lista final de impactos válidos
- daño definitivo
- resolución ya cocinada por el cliente

## Coste y presupuesto
El rewind tiene coste de CPU y memoria.

Medir:
- número de validaciones por segundo
- coste por arma
- tamaño del historial vivo
- impacto en picos bajo combate intenso

## Defaults sanos
- rewind corto y explícito
- políticas por arma, no una sola global
- servidor decide daño final
- hitscan y melee más estrictos que armas difusas o lentas

## Anti-patrones
- una única ventana de rewind para todo el arsenal
- usar rewind enorme para tapar netcode flojo
- validar daño directamente desde cliente
- reconstruir demasiado estado por disparo

## Recomendación fuerte
Crear tabla de políticas por arma o familia:
- `maxRewindMs`
- `validationMode`
- `spreadPolicy`
- `allowPastCoverGrace` si aplica

## Pendiente de ampliar
- hitboxes variables por postura
- projectiles persistentes híbridos
- server rewind con destrucción del entorno

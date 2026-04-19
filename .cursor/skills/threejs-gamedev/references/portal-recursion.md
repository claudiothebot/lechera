# Portal Recursion Control

## Objetivo
Mantener portals visualmente convincentes sin dejar que el coste o la complejidad exploten cuando un portal ve otro portal, o se ve a sí mismo indirectamente.

## Regla principal
**No empezar con recursion infinita.**
El default sano es portal no recursivo, o recursion muy limitada y explícita.

## Qué hace difícil la recursion
Cuando un portal A ve un portal B, la imagen de A puede requerir renderizar B, que a su vez puede requerir A otra vez.

Eso complica:
- número de pasadas
- orden de render
- estabilidad de cámara
- clipping
- coste de resolución acumulada

## Default recomendado
- profundidad máxima 0 o 1 al empezar
- target propio por portal visible importante
- resolución moderada por portal
- apagar recursion en tiers bajos o móvil

## Modelo mental útil
Pensar cada nivel de recursion como otra vista derivada, no como “la misma escena otra vez sin coste”.

Si `depth=0`:
- renderizas solo la vista del otro lado

Si `depth=1`:
- esa vista puede incluir una representación adicional del siguiente portal

Cada nivel suma coste y fragilidad.

## Estrategias sanas
### 1. Hard cap de profundidad
La más importante.

Ejemplo conceptual:
- desktop alto: profundidad 1 o 2 muy medida
- desktop medio: 1
- móvil o tier bajo: 0

### 2. Resolución decreciente por nivel
No hace falta que cada nivel recursivo tenga la misma resolución.

Patrón útil:
- nivel principal: resolución base del portal
- nivel siguiente: 0.5x o menos
- niveles lejanos: quizá ni se renderizan

### 3. Recorte de contenido
Cada render recursivo debería intentar ver menos mundo, no más.

Palancas:
- layers
- proxies
- distancia máxima
- excluir detalles cosméticos

### 4. Update policy agresiva
No recalcular toda recursion siempre.

Opciones:
- solo si el portal está visible y ocupa área suficiente
- solo si la cámara o el portal cambiaron bastante
- alternar updates entre portales secundarios

## Cruce de portal vs vista de portal
Importa separar:
- ver un portal en pantalla
- cruzar físicamente un portal

Cruzar exige coherencia espacial, física y cámara.
La recursion visual es otra capa y no debería complicar el cruce más de lo necesario.

## Riesgos típicos
- shimmering o seams por matrices mal encadenadas
- feedback accidental si un portal se usa en la pasada equivocada
- coste explosivo con dos portales grandes enfrentados
- confiar en una demo recursiva sin medir frame time real

## Bench mínimo recomendable
Medir:
- un portal visible sin recursion
- dos portales visibles
- dos portales enfrentados
- recursion depth 1 frente a 0
- impacto de bajar resolución del target

## Integración con quality tiers
Exponer al menos:
- `portalEnabled`
- `portalResolutionScale`
- `portalMaxRecursionDepth`
- `portalUpdateRate`
- `portalContentMask`

Si el problema pasa por recortar mejor el área del portal o controlar overdraw del marco, ver `portal-masking-stencil-scissor.md`.

## Fallbacks honestos
Si el presupuesto no da:
- portal sin recursion
- portal congelado o de update reducido
- proxy más simple al fondo
- apagar visual premium y mantener solo la mecánica

## Recomendación fuerte
Portal premium sí, pero con techo claro:
- cap de recursion
- resolución por nivel
- benchmarks específicos
- kill switch por tier

## Pendiente de ampliar
- cruce con física compleja
- portals encadenados en mundos grandes

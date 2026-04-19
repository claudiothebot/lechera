# Portal Masking with Stencil and Scissor

## Objetivo
Recortar la vista de un portal al marco correcto y evitar overdraw innecesario, usando stencil o scissor cuando el caso lo justifique.

## Regla principal
**No todo portal necesita stencil.**
Y usar stencil o scissor sin entender qué problema resuelven es una receta para un render order infernal.

## Qué intenta resolver
- que la vista del portal no se derrame fuera del marco
- reducir render inútil fuera del área del portal
- tener marcos no triviales o recortes más precisos

## Dos herramientas distintas
### Scissor test
Encaja bien cuando:
- el portal ocupa un rectángulo o área de pantalla aproximable
- quieres recortar rápido por screen-space
- buscas ahorro simple de fillrate

Ventajas:
- simple mentalmente
- útil para limitar coste de la pasada del portal

Límites:
- recorte rectangular
- menos útil si el marco es irregular o transformado de forma compleja

### Stencil buffer
Encaja cuando:
- el marco del portal tiene forma más precisa
- necesitas enmascarado más fino
- hay composición más seria del portal con la escena

Ventajas:
- máscara más exacta
- sirve mejor para marcos no rectangulares o más controlados

Coste:
- orden de render más delicado
- estado GL más fácil de romper

## Default recomendado
- empezar sin stencil si el portal ya funciona y el marco es simple
- añadir scissor primero si el problema es overdraw o recorte rectangular
- reservar stencil para marcos complejos o composición que de verdad lo pida

## Patrón conceptual con scissor
1. proyectar bounds del portal a screen-space
2. calcular rectángulo de recorte
3. activar scissor para la pasada del portal
4. renderizar solo esa región
5. restaurar estado

Buen uso:
- portal pequeño en pantalla
- varios portales donde quieres ahorrar fillrate

## Patrón conceptual con stencil
1. renderizar máscara del marco al stencil
2. configurar pruebas para que la vista del portal solo pinte donde la máscara permite
3. renderizar la escena del portal con ese estado
4. limpiar o restaurar stencil según pipeline

Buen uso:
- marcos irregulares
- superficies donde el portal debe respetar geometría precisa

## Riesgos típicos
- fugas de estado del renderer entre pasadas
- depender de stencil sin cleanup claro
- usar scissor con bounds mal calculados y cortar de más
- resolver con stencil lo que en realidad pedía solo mejor portal quad o mejor clip

## Integración con recursion
Stencil o scissor no eliminan el coste base de la recursion.
Solo ayudan a controlar dónde se dibuja.

Seguir necesitando:
- cap de profundidad
- resolución por nivel
- update policy

## Integración con quality tiers
Exponer si hace falta:
- `portalUseScissor`
- `portalUseStencil`
- `portalMaskQuality`

En tiers bajos, muchas veces basta:
- sin stencil
- con scissor simple o incluso sin ambos si el portal ya es pequeño

## Debug útil
Mirar:
- área real del portal en pantalla
- fillrate aparente
- overdraw si hay tooling
- glitches al cambiar orden de render
- coste con y sin scissor/stencil

## Anti-patrones
- activar stencil por defecto en todos los portales
- no restaurar estado GL/renderer
- usar scissor para marcos muy complejos como si fuera máscara perfecta
- confundir máscara visual con solución total del portal system

## Recomendación fuerte
Pensar así:
- problema de área rectangular en pantalla, prueba scissor
- problema de forma precisa del marco, mira stencil
- problema de coste global, vuelve primero a resolución, recursion y contenido

## Pendiente de ampliar
- marcos curvos o arbitrarios
- interacción con postprocessing
- stencil en cadenas de varios portales

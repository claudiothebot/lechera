# Fog Mask Blending

## Objetivo
Representar niebla de guerra o visibilidad táctica con máscaras y blending legibles, baratos y coherentes con el estado de juego.

## Regla principal
**La máscara expresa estado táctico, no decoración gratuita.**
Elegir blending por claridad antes que por “efecto bonito”.

## Qué intenta resolver
- distinguir visible, explorado y desconocido
- mezclar overlay de fog con mapa base sin perder legibilidad
- evitar soluciones visuales caras o confusas

## Tres estados base
Lo mínimo sano suele ser:
- `visibleNow`
- `explored`
- `unseen`

La máscara o combinación de máscaras debería dejar esta lectura clarísima.

## Modelos útiles
### 1. Máscara binaria simple
- visible / no visible

Muy barata, pero limitada.
Útil en prototipos o juegos sin memoria de exploración.

### 2. Visible + explored
La más útil en muchos juegos.

Patrón:
- visible ahora: casi limpio
- explorado pero no visible: atenuado
- no visto: tapado

### 3. Máscaras por equipo o capas
Útil en multiplayer o juegos con múltiples reveladores.

## Opciones de blending
### Multiplicative / darken-like
Muy útil para oscurecer zonas no visibles.

Ventajas:
- simple
- barato
- lectura clara

Riesgo:
- si oscurece demasiado, se pierde información útil del mapa base

### Alpha lerp clásico
Mezcla una capa de niebla sobre el mapa base.

Ventajas:
- control fino
- fácil de ajustar por estado

Riesgo:
- grisáceo o lavado si se hace sin criterio

### Color coding suave
Añadir tinte distinto para explored frente a visible.

Ventaja:
- lectura táctica rápida

Riesgo:
- exceso de color y ruido visual

## Defaults sanos
- explored más oscuro o desaturado, no negro total
- unseen claramente oculto
- visible con máxima lectura
- transiciones suaves solo si no sacrifican claridad

## Bordes y suavizado
Opciones:
- borde duro para juegos tácticos muy abstractos
- feather suave si el estilo lo pide
- blur moderado sobre máscara, no sobre todo el minimapa

Regla:
- el suavizado debe ayudar a leer, no a emborronar.

## Dónde aplicar la máscara
### Opción A: en shader/material del overlay
Buena cuando:
- ya tienes pipeline simple de minimapa
- quieres control visual continuo

### Opción B: composición entre mapa base y textura de visibilidad
Buena cuando:
- separas claramente datos tácticos y render del mapa
- quieres update independiente del estado de fog

## Multiplayer y equipos
Si la fog es compartida por equipo:
- agregar visibilidad de varios reveladores
- serializar estado táctico de forma compacta
- no depender de lo que un cliente dice haber visto como única verdad

## Performance
La máscara debería ser más barata que rerenderizar el mundo.

Palancas buenas:
- textura de visibilidad de baja resolución táctica
- update por sector/tick
- blur pequeño y localizado
- composición simple

## Anti-patrones
- confundir explored con visible actual
- usar efectos bonitos que destruyen contraste
- recalcular máscara global a 60 fps sin necesidad
- aplicar blur pesado a toda la UI táctica

## Recomendación fuerte
Empezar por una política visual clara:
- unseen oculto
- explored atenuado
- visible limpio

Luego elegir el blending más barato que mantenga esa lectura.

## Pendiente de ampliar
- ejemplos concretos de shaders
- texturas de visibilidad por chunks
- blending para estilos muy diegéticos

# Postprocessing

## Objetivo
Usar postprocessing en Three.js con cabeza, entendiendo que es una cadena de render adicional y no un adorno gratis.

## Regla principal
El postprocessing debe justificar su coste.

Si el juego ya funciona visualmente sin él, mejor. Añadirlo después es más sano que construir toda la identidad visual sobre una cadena cara y frágil desde el minuto uno.

## Base técnica
Three.js monta postprocessing con `EffectComposer` y una cadena de passes.

Patrón base:
- `EffectComposer`
- `RenderPass`
- passes concretos como bloom u otros
- `OutputPass` al final

## Qué implica realmente
El manual deja una idea importante: el composer trabaja con render targets intermedios y va encadenando passes. Eso significa:
- más memoria
- más trabajo por frame
- más sitios donde algo puede salir mal

Esto también significa que el coste del postprocessing debería entrar en los quality tiers, no quedarse como una decisión fija y ciega.

Para render targets personalizados fuera de la cadena de post, ver `render-targets.md`.

## Default recomendado
- no activar postprocessing por defecto en prototipos de gameplay
- introducirlo cuando el loop principal ya esté claro
- mantenerlo modular y fácil de apagar
- tratarlo como preset de calidad si apunta a móvil

## Resize
Si hay composer, no basta con redimensionar solo el renderer.

Regla obligatoria:
- actualizar cámara
- `renderer.setSize(...)`
- `composer.setSize(...)`

## Delta time
`composer.render(deltaTime)` puede necesitar el delta si algunos passes son animados.

No asumir que cambiar de `renderer.render()` a `composer.render()` es un reemplazo tonto sin consecuencias.

## Bloom y similares
Examples y manual dejan una conclusión práctica:
- bloom puede quedar bonito
- bloom también puede empastar la imagen y costar bastante
- no debería convertirse en maquillaje para una dirección visual floja

## Orden y criterio
Preguntas útiles antes de meter un pass:
- ¿mejora de verdad la legibilidad o el tono?
- ¿cuánto cuesta?
- ¿se puede apagar por preset?
- ¿rompe claridad en móvil o pantallas pequeñas?

Y además:
- ¿introduce tirones al activarse o al redimensionarse?
- ¿necesita warmup o preparación antes de mostrarse en momento crítico?

## Shader passes
Si se necesita algo muy concreto, `ShaderPass` permite construir efectos propios.

Regla sana:
- empezar por efectos existentes y pequeños
- leer el código del pass antes de adoptarlo a ciegas
- mantener los uniforms importantes bien localizados y documentados

## Anti-patrones
- meter bloom porque sí
- encadenar muchos passes desde el día 1
- olvidar `composer.setSize()` en resize
- no tener forma de desactivar efectos
- usar postprocessing para tapar problemas de materiales, iluminación o dirección artística

## Recomendación fuerte
En juegos web, el mejor postprocessing suele ser el mínimo que da identidad sin destruir rendimiento ni claridad.

Para presets coordinados de calidad que afecten passes, targets y resolución, ver `quality-tiers.md`.

## Pendiente de ampliar
- passes recomendables vs peligrosos
- resolución reducida para ciertos efectos
- integración con móvil y profiling

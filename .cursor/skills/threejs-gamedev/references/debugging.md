# Debugging

## Objetivo
Tener una estrategia de debugging práctica para juegos en Three.js que permita detectar rápido problemas de cámara, transforms, luces, sombras, materiales, assets y flujo general del frame.

## Regla principal
Hacer visible el estado del juego y de la escena. Si algo falla y no se puede inspeccionar, el tiempo se va al carajo.

## Helpers útiles
Usar helpers visuales cuando aporten claridad:
- `AxesHelper`
- `GridHelper`
- `BoxHelper`
- `Box3Helper`
- `CameraHelper`
- `SkeletonHelper` cuando haya personajes o rigs
- helpers de luces cuando toque
- gizmos o markers propios si el juego los necesita

## Qué conviene poder inspeccionar
- posición, rotación y escala de objetos clave
- jerarquía de nodos cargados desde assets
- cámara activa y su target real
- colliders o volúmenes aproximados
- puntos de spawn
- zonas de interacción
- estado de animaciones importantes
- acción base activa, pesos y capas additive si existen
- tiempo, delta y orden de update
- ownership de recursos si una escena carga y descarga assets
- `renderer.info` cuando sospechas fuga o crecimiento raro

## Checklist de problemas típicos

### No se ve nada
- cámara mal colocada
- near/far absurdos
- objeto fuera de frame
- escala rota
- renderer no montado bien
- canvas con tamaño incorrecto
- luces insuficientes si el material lo necesita
- material o textura mal configurados

### El modelo carga raro
- eje u orientación incorrectos
- pivot raro
- escala inconsistente
- materiales rotos
- texturas no encontradas
- jerarquía sucia o inesperada

### Las sombras van fatal
- demasiadas sombras activas
- shadow map caro para la escena real
- cámara de sombra mal ajustada
- objetos marcados sin criterio para cast/receive shadow
- esperar sombras perfectas en móvil barato

### El rendimiento cae
- draw calls altas
- demasiadas luces caras
- geometrías o texturas excesivas
- postprocessing innecesario
- demasiados objetos actualizando cada frame
- raycasts o cálculos repartidos sin control

## Estrategias útiles
- introducir toggles de debug desde el principio
- poder activar y desactivar helpers rápido
- añadir panel de debug si el proyecto crece
- tener panel de rendimiento mínimo con frame time/FPS, `renderer.info` y tier de calidad
- registrar warnings útiles al cargar assets
- aislar sistemas para probar si el problema está en input, update o render
- distinguir si el fallo viene del scene graph, del asset pipeline o del lifecycle de recursos

## Debug visual mínimo recomendado
- mostrar axes o grid en prototipos
- poder dibujar bounds de entidades importantes
- resaltar objeto seleccionado o interactivo
- visualizar puntos de control, triggers y spawns
- visualizar hit points, normales o markers de raycast cuando haya interacción 3D

## Reglas sanas
- no depurar solo mirando el código
- no dejar helpers permanentes en producción por accidente
- no asumir que el problema está en Three.js antes de revisar cámara, escala y estado
- depurar primero lo básico y barato
- revisar también foco de input, resize y liberación de recursos cuando el problema parece "aleatorio"

## Anti-patrones
- veinte `console.log` sin estructura
- helpers repartidos por el código sin control
- mezclar debug tools con lógica de gameplay final
- no tener ninguna forma de inspeccionar scene graph o asset hierarchy
- optimizar a ciegas sin identificar el cuello de botella

## Pendiente de ampliar
- stats y métricas por frame
- herramientas de inspección de materiales
- debugging de animaciones y mixers
- debugging de loaders y streaming
- checklist específica para móvil

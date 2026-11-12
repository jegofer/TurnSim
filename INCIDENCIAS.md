# Registro de incidencias técnicas del proyecto

## INC-001 - Desplazamiento del vehículo a (0, 0) y bloqueo de reproducción al trazar ruta interactiva con el ratón

- **Problema:** Al hacer clic en el visor 2D para trazar puntos de paso, el camión se movía automáticamente a la coordenada (0, 0) y al pulsar Reproducir permanecía completamente inmóvil.
- **Contexto:** Módulo de trazado interactivo (`web/js/view2d/viewer2d.js`), función `buildSegmentsFromWaypoints` (`web/js/engine/kinematics.js`) y orquestador (`web/js/app.js`).
- **Causa conocida:** `viewer2d.js` emitía los puntos como tuplas `[x, y]`. La función `buildSegmentsFromWaypoints` intentaba leer `p.x` y `p.y`, obteniendo `undefined` que al convertirse con `Number()` resultaba en `NaN`. El sistema aplicaba un repliegue a (0, 0) y descartaba los tramos por longitud no finita, dejando la simulación con un único fotograma inicial.
- **Causa probable:** Ninguna; causa conocida demostrada fehacientemente con pruebas unitarias.
- **Solución aplicada:** Se adaptó `buildSegmentsFromWaypoints` y `setWaypoints` para aceptar indistintamente tuplas `[x, y]` u objetos `{x, y}`, se añadió la actualización inmediata de posición para el primer punto (P1) y se conectó la llamada a `_renderSegmentsListUI()` para refrescar el acordeón lateral de tramos.
- **Resultado:** El camión se ubica de inmediato en P1 y, a partir de P2, genera los tramos, las envolventes sombreadas y se anima correctamente al pulsar Reproducir.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

## INC-002 - Planos CAD DXF cargados no visibles en el lienzo 2D

- **Problema:** Al importar un archivo CAD en formato DXF, las entidades se procesaban en memoria pero el visor 2D permanecía aparentemente vacío o no mostraba el contenido del plano.
- **Contexto:** Módulo `web/js/view2d/viewer2d.js`, método `fitToScene` y renderizado de entidades CAD de fondo `_drawCadBackground`.
- **Causa conocida:** El método `fitToScene` abortaba tempranamente si no existía una simulación activa previa (`!this.simResult`), ignorando las entidades CAD y los obstáculos. Además, la escala mínima estaba restringida a valores altos ($\ge 4\text{ px/m}$), lo que impedía alejar la vista para visualizar planos de accesos o carreteras con dimensiones superiores a 200 metros.
- **Causa probable:** Ninguna; causa comprobada.
- **Solución aplicada:** Se reescribió `fitToScene` para considerar conjuntamente el rectángulo envolvente de la simulación, de los obstáculos, de los waypoints y de las entidades CAD de fondo, reduciendo la cota inferior de escala a $0.02\text{ px/m}$. Se aseguró además el dibujado incondicional de los elementos de fondo independientemente de si hay simulación activa.
- **Resultado:** Los planos DXF se visualizan de forma nítida, centrada y a escala métrica inmediatamente después de ser cargados.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

## INC-003 - Error de referencia computeEffectiveTrailerWheelbase is not defined en Web Worker en paquetes autónomos

- **Problema:** Al generar los paquetes autónomos monobloque HTML, la consola del navegador notificaba un fallo de ejecución en el Worker: `Worker posted success: false error: computeEffectiveTrailerWheelbase is not defined`.
- **Contexto:** Script de construcción `scripts/build_standalone_html.mjs` y cliente worker `web/js/engine/worker_client.js`.
- **Causa conocida:** El código fuente inyectado en el worker agrupaba `kinematics.js`, `envelope.js` y `collisions.js`, pero omitía `vehicles.js`, donde reside la función de cálculo de la batalla efectiva del trídem.
- **Causa probable:** Ninguna; comprobada en la traza de error de los tests autónomos.
- **Solución aplicada:** Se incorporó el contenido de `web/js/models/vehicles.js` a la cadena de ensamblado del worker en `build_standalone_html.mjs`.
- **Resultado:** El worker opera de forma asíncrona sin errores en todos los archivos HTML generados.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

## INC-004 - Ausencia de botones directos de acción de trazado y salto a PK en barra de herramientas

- **Problema:** Los botones de "✏️ Trazar ruta" y "📍 Ir al PK" estaban ubicados únicamente en paneles secundarios colapsados, dificultando su localización rápida por el usuario.
- **Contexto:** Interfaz principal `web/index.html` y estilos CSS `web/css/styles.css`.
- **Causa conocida:** Disposición de controles heredada de versiones previas donde la interacción principal se realizaba mediante carga de escenarios predefinidos.
- **Causa probable:** Ninguna; necesidad ergonómica confirmada.
- **Solución aplicada:** Se añadieron botones de acceso directo destacados en la barra superior del visor 2D junto con atajos visuales y estados activos con iluminación cian.
- **Resultado:** El usuario dispone de acceso inmediato con un solo clic a la herramienta de dibujo interactivo y posicionamiento por estación/PK.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

## INC-005 - Bloqueo de navegación de etapas y herramientas en Mozilla Firefox

- **Problema:** En Mozilla Firefox, los botones del Stepper superior (Etapas 1 a 6), los botones de la barra de actividad lateral (`.act-btn`) y los botones de navegación interna (`.btn-goto-stage`) no respondían a los clics del usuario, mientras que en Google Chrome funcionaban con normalidad.
- **Contexto:** Inicialización de la aplicación (`web/js/app.js`), inicializador 3D (`web/js/view3d/viewer3d.js`) y empaquetador autónomo (`scripts/build_standalone_html.mjs`).
- **Causa conocida:** En `scripts/build_standalone_html.mjs`, la librería `OrbitControls.js` se inyectaba dinámicamente mediante `document.createElement("script")`. En Firefox (especialmente bajo `file://`), los scripts creados dinámicamente son asíncronos por defecto (`async = true`), lo que generaba una condición de carrera: el script principal del bundle se ejecutaba en `DOMContentLoaded` antes de que `OrbitControls.js` hubiera finalizado su carga e inyección en el objeto global `THREE`. Al instanciar `Viewer3D`, la llamada a `new THREE.OrbitControls(...)` lanzaba un `TypeError: THREE.OrbitControls is not a constructor` no capturado. Dicha excepción abortaba la ejecución del constructor de `SweptPathApp` antes de alcanzar el método `this._initHybridWorkflow()`, impidiendo que se asociaran los *event listeners* de clic a los botones de navegación. En Chrome, los scripts locales en caché o con tiempos de resolución diferentes mitigaban la carrera. Adicionalmente, el estado de replegado de la gaveta lateral utilizaba una variable no sincronizada (`this.leftSidebarCollapsed`) en lugar de consultar la clase `.sidebar-collapsed` del contenedor `.app-layout`.
- **Causa probable:** Ninguna; reproducida, diagnosticada y verificada mediante Firefox 157.0 headless y volcados de consola.
- **Solución aplicada:**
  1. En `web/js/view3d/viewer3d.js`, se endureció la comprobación de disponibilidad requiriendo expresamente `Boolean(window.THREE) && typeof window.THREE.OrbitControls === "function"`. Se encapsuló la llamada a `_initScene()` dentro de un bloque `try...catch` con degradación elegante a banner informativo, garantizando que un fallo o retraso en Three.js/WebGL nunca aborte el ciclo de vida de la aplicación principal.
  2. En `scripts/build_standalone_html.mjs`, se restituyó la carga estática síncrona en `<head>` de `three.min.js` y `OrbitControls.js`.
  3. En `web/js/export/exporters.js`, se escaparon las etiquetas de script anidadas en plantillas literales (`\x3Cscript>` / `\x3C/script>`) para evitar interferencias con el analizador léxico HTML.
  4. En `web/js/app.js`, se sincronizó de forma bidireccional el colapso de la gaveta lateral con el DOM (`.sidebar-collapsed`), permitiendo reapertura/cierre consistente e interacción reactiva (estilo VS Code al pulsar el icono activo).
- **Resultado:** Navegación fluida y verificación al 100 % de clics en todas las etapas (1 a 6), barra de actividad, navegación interna y colapso/reapertura de gaveta en Mozilla Firefox y Google Chrome.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

---

### INC-006: Inoperatividad y generación de NaN en las curvas de telemetría a lo largo del recorrido (PK)
- **Fecha:** 2026-11-11
- **Gravedad:** Media
- **Descripción:** Al abrir el panel de curvas de telemetría a lo largo del recorrido (PK), el gráfico SVG no se visualizaba, el clic interactivo para saltar al PK seleccionado no respondía, y el cursor de seguimiento de la posición no avanzaba con la reproducción o el desplazamiento manual del deslizador temporal.
- **Contexto:** Módulo de cinemática (`web/js/engine/kinematics.js`), panel de telemetría en `web/js/app.js` (`_renderPKCurves`, `_updatePKCursor`, `_syncFrameToViewers`), worker en línea (`web/js/engine/worker_source.js`) e internacionalización (`web/js/i18n/locales.js`).
- **Causa conocida:**
  1. En `web/js/engine/kinematics.js` (`buildDetailedState`), el objeto de estado calculaba y exponía la distancia acumulada como `dist`, pero no definía la propiedad `distAlongPathM`.
  2. En `web/js/app.js`, los métodos `_renderPKCurves` y `_updatePKCursor` intentaban leer `st.distAlongPathM`, el cual resultaba ser `undefined`.
  3. Al calcular `scaleX(st.distAlongPathM)`, la expresión aritmética `padL + (undefined / totalDist) * plotW` evaluaba a `NaN`. Como consecuencia, los comandos del trazado SVG se generaban con coordenadas corruptas (`M NaN 65.0 L NaN ...`), resultando en un elemento `<path>` geométricamente inválido e invisible para el renderizador SVG del navegador.
  4. La función de clic interactivo (`container.onclick`) evaluaba `Math.abs(states[i].distAlongPathM - targetDist)`, produciendo `NaN < minDiff` (siempre falso), lo que anulaba el salto de fotograma.
  5. En `_syncFrameToViewers`, no se invocaba `_updatePKCursor`, por lo que el cursor indicador no se movía durante la reproducción.
  6. La leyenda de articulación $\gamma(s)$ permanecía fija independientemente de si el vehículo activo era rígido o articulado.
- **Solución aplicada:**
  1. En `web/js/engine/kinematics.js` y `web/js/engine/worker_source.js`, se añadió `distAlongPathM: dist` a cada estado devuelto por `buildDetailedState`.
  2. En `web/js/app.js`, se implementó resolución defensiva de distancia `st.distAlongPathM ?? st.dist ?? 0` en `_renderPKCurves`, `_updatePKCursor` y en el manejador de clic.
  3. Se conectó la llamada a `this._updatePKCursor(clamped)` en `_syncFrameToViewers` para actualizar la línea del cursor y los marcadores de dirección y articulación en vivo.
  4. Se añadió mensaje indicador de reposo cuando no hay maniobra activa, y ocultación dinámica de la leyenda de articulación para vehículos rígidos.
  5. Se ajustó la posición CSS a `bottom: 68px;` con bordes redondeados para evitar solapamientos con la cápsula inferior del timeline.
  6. Se renombró el componente al formato normativo solicitado: **«Curvas de telemetría a lo largo del recorrido (PK)»**.
  7. Se añadió la prueba unitaria automatizada `TEST-39` en `tests/test_engine.mjs`.
- **Resultado:** Renderizado impecable de curvas de dirección y articulación en SVG sin valores NaN, interactividad fluida al hacer clic en cualquier PK y sincronización temporal exacta en tiempo real.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

## INC-007 - Desviación del barrido fuera de la línea en splines y aceleración del vehículo en curvas

- **Problema:** Al crear una spline interactiva para trazar la ruta del vehículo, la envolvente de barrido llegaba a generarse fuera de la línea dibujada por el usuario. Asimismo, la velocidad del vehículo en la reproducción aumentaba de forma anómala al entrar en tramos curvos en lugar de mantenerse constante.
- **Contexto:** Motor cinemático (`web/js/engine/kinematics.js`), simulación de maniobras continuas, bucle de animación temporal (`web/js/app.js`) y exportadores técnicos (`web/js/export/exporters.js`).
- **Causa conocida:**
  1. *Desfase del eje director en inicio:* Con `steeringReferencePoint: 'front_axle'` (por defecto en vehículos reglamentarios españoles de la Norma 3.1-IC), `startPose` posicionaba el eje motriz trasero en el punto inicial $P_0$, dejando el eje director avanzado una longitud igual a la batalla $L_{wb}$ (3,80 a 7,15 m), por lo que la trayectoria del eje director no partía de la línea dibujada.
  2. *Límite forzado de radio a 0,5 m:* En curvas cerradas donde el radio nominal $R \le L_{wb}$, la conversión cinemática al eje motriz fijaba un radio artificial de $0,5\text{ m}$, provocando giros extremos sobre el propio eje que desestabilizaban el semirremolque y lo proyectaban fuera de la traza.
  3. *Sobreoscilación (sag) en Catmull-Rom:* La interpolación Catmull-Rom estándar presentaba oscilaciones de hasta $-1,25\text{ m}$ antes de inflexiones o giros pronunciados.
  4. *Deriva acumulada por discretización en micro-arcos:* La descomposición previa de la spline en arcos discretos perdía la tangencia y continuidad exacta de la curva.
  5. *Avance temporal por estados por segundo:* En `_startAnimationLoop()`, la animación avanzaba un número fijo de estados discretos por segundo (`dt * 28.0`). Como en tramos rectos el paso métrico era $\Delta s \approx 0,05\text{ m}$ ($v \approx 1,4\text{ m/s}$), pero en curvas el paso angular fijo de $0,5^\circ$ producía arcos $\Delta s = R \cdot \Delta\theta$ proporcionales al radio ($3,05\text{ m/s}$ en $R=12,5\text{ m}$; $6,1\text{ m/s}$ en $R=25\text{ m}$), el vehículo duplicaba o triplicaba su velocidad visual en curvas.
- **Causa probable:** Ninguna; causas plenamente comprobadas con pruebas cinemáticas.
- **Solución aplicada:**
  1. Se implementó interpolación cúbica de Hermite con preservación de forma (PCHIP) en `sampleCatmullRomSpline` y `samplePchipSpline`, garantizando monotonicidad estricta y flecha residual nula en rectas previas a curvas.
  2. Se ajustó `buildSegmentsFromSplineWaypoints` para retroceder la pose inicial del eje motriz cuando la referencia es el eje director (`front_axle`), logrando coincidencia milimétrica en el origen.
  3. Se incorporó la ejecución directa de tramos spline (`seg.type === 'spline'`) en `simulateManeuver()`, integrando directamente sobre los puntos continuos de la spline sin degradación por arcos aproximados.
  4. Se acotó el radio cinemático en arcos circulares según el ángulo de giro admisible del chasis ($R_{\text{mín}} = L_{wb} / \tan(\delta_{\text{máx}})$) sustituyendo la cota de $0,5\text{ m}$.
  5. Se reestructuró `_startAnimationLoop()` para avanzar por distancia métrica acumulada a velocidad constante en calzada ($v = 2,0\text{ m/s}$ a $1\times$) mediante búsqueda binaria de índices en el vector de estados (`_findFrameIndexForDist`).
  6. Se añadieron representaciones informativas de tramos spline en la interfaz de usuario (`_renderSegmentsListUI`) y en los reportes técnicos en Markdown y HTML.
- **Resultado:** Coincidencia milimétrica de la trayectoria y barrido sobre la línea dibujada, eliminación completa de invasiones espurias del semirremolque y velocidad de animación perfectamente uniforme y constante tanto en rectas como en curvas.
- **Estado:** RESUELTA
- **Acciones pendientes:** Ninguna.

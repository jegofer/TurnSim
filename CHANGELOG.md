# Historial de cambios

## 2026-11-23

### Añadido
- **Maniobras Combinadas Avance / Marcha Atrás en Vértices de Trazado (DEC-025):**
  - Partición automática por sub-tramos de sentido en `splitWaypointsByDirection` (`web/js/engine/kinematics.js`), acoplamiento de tangente inicial (`initialTangentRad`) en cúspides y corrección exacta de `front_axle` en retroceso.
  - Menú contextual flotante (`#wp-context-menu`) con clic derecho en vértices, conmutador en vivo `▶ Avance (D) / ◀ Retroceso (R)` + tecla `R`, detección automática de cúspides ($\Delta\theta \ge 125^\circ$, conmutable vía `#chk-auto-cusps`), visualización diferenciada en planta 2D y prueba `TEST-46`.
- **Planta Técnica Enfocada (`bbox + 2 m`), Plano General y Diligencia Técnica en Panel 6 (DEC-023):**
  - Recorte automático de la planta del apartado 3 del informe técnico al `bbox + 2,0 m` de la trayectoria (`computeTrajectoryBbox`), con recuadro flotante «Situación general» en la esquina superior izquierda e indicador de encuadre `#detail-viewport-indicator`.
  - Formulario de diligencia técnica en el panel 6 (`Autor del estudio`, `Colegiado n.º`, `Fecha`, `Organismo o consultora`) integrado en informes HTML/PDF, Markdown y `.turnsim.json` (`TEST-44`).

### Modificado / Corregido
- **Aceleración del Motor de Envolventes, Colisiones CCD y Preview en Vivo (DEC-024 / INC-008):**
  - Unión booleana por bloques (*Divide & Conquer*) en Clipper, reutilización de `baseExPolygons` para `ClipperOffset`, y ventana deslizante $O(1)$ en `computeCrossSectionWidth` (`web/js/engine/envelope.js`).
  - Corregida la ausencia de poda AABB en `s.trailers` y sus cápsulas CCD en `evaluateObstacleInterferences` (`web/js/engine/collisions.js`), junto con búsqueda semilla `seedIdx`/`centerSeedIdx`.
  - Diferido `viewer3D.setData` mientras `viewMode === "2d"` y modo `previewMode` ligero al arrastrar waypoints (`TEST-45`).

## 2026-11-12

### Añadido
- **Traducción Integral al Español Técnico de la Herramienta de Carga CAD / GIS y Títulos de Etapa:**
  - Traducción y normalización ortotipográfica del modal de asignación y correspondencia de capas CAD DXF (`_showDxfLayerMappingModal` en `web/js/app.js`):
    - Cabecera: «📂 Importación de plano CAD DXF: [nombre de archivo]».
    - Asignación de capas técnicas: «Eje / trayectoria del camión», «Avance (sentido de dibujo)», «Marcha atrás (retroceso)», «Radio mínimo de acuerdo (m)», «Obstáculos físicos / edificaciones», «Bordes de calzada / bordillos», «Zonas restringidas / excluidas».
    - Ayudas operativas: indicación clara de selección múltiple mediante pulsación de Ctrl/Cmd y botones normalizados «Cancelar» y «✓ Aplicar plano y simular».
  - Normalización de las etapas del flujo de trabajo híbrido en español e inglés:
    - Etapa 1: «1. Escenario y entorno CAD / GIS»
    - Etapa 2: «2. Selección y cotas de vehículo»
    - Etapa 3: «3. Trazado y tramos de maniobra»
    - Etapa 4: «4. Simulación cinemática y capas»
    - Etapa 5: «5. Análisis de resguardo y obstáculos»
    - Etapa 6: «6. Informes técnicos y exportación»
  - Inclusión de claves bilingües `stage_1_title` a `stage_6_title` en `web/js/i18n/locales.js` (`LOCALES.es` y `LOCALES.en`), con actualización reactiva automática del título de la gaveta lateral (`drawer-active-title`) y los títulos emergentes de la barra de actividades (`act-btn-X`) ante el conmutador de idioma.
- **Autoencuadre Dinámico en Visor 3D al Pulsar Modo de Vista (DEC-022):**
  - Al pulsar el botón `Visor 3D` (o `Dividida 2D+3D`), la cámara tridimensional se redimensiona y ejecuta automáticamente un encuadre integral (`fitToScene()`).
  - Cálculo ampliado de la caja envolvente que contempla no solo los estados de trayectoria, sino los contornos poligonales completos del tractor y semirremolque, la envolvente física de barrido, los obstáculos 3D extruidos, los fondos CAD y los waypoints.
  - Centrado instantáneo del objetivo orbital (`controls.target`) y elevación en perspectiva isométrica proporcional a las dimensiones del escenario.

### Corregido
- **Corrección de Desviación de Barrido en Splines e Interpolación PCHIP Anti-Overshoot (DEC-021 / INC-007):**
  - Subsanada la anomalía por la cual la envolvente de barrido se proyectaba fuera de la línea dibujada:
    1. Desfase de origen: cuando el vehículo utiliza como referencia el eje director delantero (`steeringReferencePoint: 'front_axle'`), se retrocede la pose inicial de cálculo una longitud igual a la batalla ($L_{wb}$), garantizando que el eje director comience exactamente en el primer punto marcado por el usuario.
    2. Supresión de sobreoscilación (*sag*): reemplazo del cálculo de tangentes Catmull-Rom por interpolación cúbica de Hermite con preservación de forma (PCHIP) en `sampleCatmullRomSpline` y `samplePchipSpline`, eliminando ondulaciones espurias previas a las curvas.
    3. Integración directa de splines: incorporación del ejecutor `seg.type === 'spline'` en `simulateManeuver()`, recorriendo punto a punto la curva sin pérdidas de tangencia derivadas de descomponer en micro-arcos.
    4. Corrección de cota de radio mínimo: sustitución de la cota artificial fija de $0,5\text{ m}$ por el límite cinemático real del vehículo ($R_{\text{mín}} = L_{wb} / \tan(\delta_{\text{máx}})$).
- **Velocidad de Animación Constante en Maniobra y en Curvas (DEC-021 / INC-007):**
  - Corrección de la aceleración del vehículo en tramos curvos: sustituido el avance por fotogramas fijos por segundo (`dt * 28.0`) por un avance isométrico a velocidad constante en calzada ($v = 2,0\text{ m/s}$ a $1\times$).
  - Búsqueda binaria exacta de estados en función de la distancia métrica acumulada (`_findFrameIndexForDist`).
  - Sincronización continua de la distancia de animación (`currentAnimDistM`) en deslizador temporal, controles de reproducción y saltos a puntos kilométricos (PK).
- **Visualización y Reporte de Tramos Spline:**
  - Tarjeta técnica informativa en la lista de tramos de la gaveta lateral (`_renderSegmentsListUI`) con longitud total y radio mínimo.
  - Soporte de tramos spline en la tabla del informe imprimible HTML y en la memoria técnica en Markdown (`web/js/export/exporters.js`).

### Añadido
- **Trazado mediante Spline CAD Continua (Catmull-Rom Centripetal) (DEC-020):**
  - Implementación del algoritmo `sampleCatmullRomSpline` y `buildSegmentsFromSplineWaypoints` en `web/js/engine/kinematics.js`, ofreciendo interpolación de curvas continuas $C^1$ que pasan estrictamente por todos los vértices sin ángulos vivos ni quiebros bruscos.
  - Generación de segmentos tangenciales de curvatura suave ejecutables por el motor cinemático RK4, eliminando discontinuidades angulares en la dirección del vehículo y sacudidas en el semirremolque.
  - Detección en tiempo real del radio mínimo de curvatura local $R(s) = 1/\kappa(s)$ y alerta visual en ámbar/rojo en el lienzo 2D (`Viewer2D`) si el trazado exige un giro inferior al radio de giro de referencia del vehículo seleccionado ($R_{\text{local}} < R_{\text{mín}}$).
  - Selector dual en interfaz y barra de herramientas: botón `⚡ Spline CAD` / `📐 Polilínea` en el visor 2D y selector `<select id="sel-waypoints-mode">` en la gaveta lateral, permitiendo alternar entre Spline CAD continua (por defecto) y Polilínea con acuerdos circulares (fillet clásico).
  - Nueva prueba automatizada `TEST-43` en `tests/test_engine.mjs` (59/59 pruebas superadas al 100 %).

### Corregido
- **Reubicación del Banner de Recuperación de Sesión Previa:**
  - Desplazamiento del aviso flotante `#autosave-banner` desde la parte superior (`top: 48px`), donde solapaba la botonera técnica del visor 2D (`.pane-toolbar`), hacia la parte inferior central (`bottom: 68px; left: 50%`), 16 px por encima de la barra de reproducción temporal.
  - La botonera de herramientas del visor 2D (`✏️ Trazar ruta`, `⚡ Spline CAD`, `🗑️ Borrar trazado`, `📏 Medir`, `🛰️ PNOA`, buscador toponímico) queda 100 % despejada y accesible desde el primer segundo.
  - Incorporación de animación de entrada suave con desenfoque de fondo y botón de descarte.
- **Traducción del Buscador Toponímico a Español:**
  - Corrección de cadenas en `locales.js`, plantillas HTML y script empaquetador para mostrar siempre en español el campo del buscador de lugares de España: `🔍 Buscar lugar en España (OSM)...`, información emergente (`title`) y mensajes de estado.

## 2026-11-11

### Modificado
- **Inicialización en Visor Vacío, Apertura en Etapa 1 y Reubicación de Banner de Asistencia (DEC-019):**
  - El visor se inicializa completamente vacío al cargar la aplicación, sin dibujar vehículo ni envolventes, mostrando en el centro una caja técnica con indicación inicial: «Para comenzar una simulación: ✏️ Pulse «Trazar ruta» para dibujar una trayectoria sobre el plano · 📂 O cargue un plano CAD (.DXF) o cartografía geoespacial (.GeoJSON)».
  - Apertura por defecto en la Etapa 1 («1. Escenario y Entorno CAD») en el Stepper horizontal de la cabecera, la barra de actividades, el título de la gaveta lateral y el bloque de carga de archivos CAD/GeoJSON.
  - Reubicación del banner de asistencia interactiva del modo trazado (`waypointMode`) en el lienzo 2D hacia la parte inferior central (`by = this.height - 42`), liberando por completo la botonera superior de herramientas para evitar solapamientos visuales.

### Añadido
- **Importador de Cartografía Geoespacial GeoJSON con Georreferenciación Recíproca PNOA (DEC-017):**
  - Módulo autónomo `web/js/export/geojson_importer.js` para parsear e importar archivos `.geojson` y `.json` según el estándar RFC 7946.
  - Proyección conforme métrica local con la formulación de Web Mercator (EPSG:3857) escalada por $\cos(\text{lat}_0)$, logrando alineación nanométrica recíproca con la capa de ortofotos aéreas PNOA del Instituto Geográfico Nacional de España.
  - Soporte automático para coordenadas geodésicas WGS84 / ETRS89 en grados y coordenadas métricas proyectadas UTM (husos 28 a 31 de España).
  - Clasificación inteligente de geometrías y capas viales (ejes, bordillos, isletas, calzadas, edificios y farolas).
  - Activación y posicionamiento automático instantáneo de la capa de ortofotografía PNOA al cargar cualquier archivo GeoJSON.
  - Archivo de prueba de glorieta real en España: `ejemplo_glorieta_espana.geojson` (Glorieta M-501 en Boadilla del Monte, Madrid).
  - Prueba de verificación automatizada `TEST-42` en `tests/test_engine.mjs` (58/58 pruebas superadas al 100%).

### Añadido
- **Autoencuadre Dinámico en Visor 3D al Pulsar Modo de Vista (DEC-022):**
  - Al pulsar el botón `Visor 3D` (o `Dividida 2D+3D`), la cámara tridimensional se redimensiona y ejecuta automáticamente un encuadre integral (`fitToScene()`).
  - Cálculo ampliado de la caja envolvente que contempla no solo los estados de trayectoria, sino los contornos poligonales completos del tractor y semirremolque, la envolvente física de barrido, los obstáculos 3D extruidos, los fondos CAD y los waypoints.
  - Centrado instantáneo del objetivo orbital (`controls.target`) y elevación en perspectiva isométrica proporcional a las dimensiones del escenario.

### Corregido
- **Herramienta «Borrar trazado» y Persistencia del Vehículo en Reposo (DEC-018):**
  - Corrección del fallo por el cual «Borrar trazado» hacía desaparecer el vehículo de la pantalla o disparaba recálculos asíncronos en bucle.
  - En `clearVehicleTrajectory()`, cancelación síncrona de temporizadores de recálculo (`clearTimeout`), limpieza silenciosa de waypoints (`clearWaypoints(true)`) y vaciado de tramos.
  - En `recomputeAll()`, generación de simulación estática de reposo (1 estado base en `startPose`) cuando la maniobra no tiene tramos, manteniendo el modelo 2D y 3D del camión visible en su punto de origen en la calzada.
  - La telemetría se inicializa en reposo (`LISTO (VEHÍCULO EN REPOSO)`, PK 0.00 m, distancia 0.00 m) y la herramienta de trazado interactivo (`✏️ Trazar ruta`) queda inmediatamente lista para dibujar una nueva trayectoria.

### Modificado
- **Normalización Ortotipográfica y Capitalización en Español de Informes Técnicos (DEC-016 / prose-guard-es):**
  - Modificación del texto de la diligencia facultativa en el informe HTML/PDF y en la memoria Markdown: sustitución de `"Autor del Estudio: Ingeniero de Caminos, Canales y Puertos"` por `"Autor del estudio:"` con puntos suspensivos para firma y colegiación.
  - Aplicación exhaustiva de la regla de estilo para títulos y encabezados en español de la skill `prose-guard-es`: supresión de mayúsculas a la inglesa (*Title Case*) en todos los encabezados de informes técnicos, memorias Markdown, modales y diccionarios i18n, dejando en mayúscula únicamente la letra inicial y nombres propios.
  - Normalización de títulos en memoria Markdown:
    - `# Memoria técnica de justificación de trayectoria de barrido`
    - `## 1. Vehículo de diseño y trazabilidad geométrica`
    - `## 2. Definición geométrica de la maniobra`
    - `## 3. Comprobación de elementos viarios, márgenes y distancias libres`
    - `## 4. Cuadro de conformidad normativa española y europea`
    - `## 5. Diligencia de responsabilidad y visado facultativo`
  - Normalización de títulos en el informe imprimible HTML/PDF:
    - `<h2>5. Justificación y dictamen de conformidad normativa (Norma 3.1-IC, Guía de nudos viarios y reglamentación UE)</h2>`
    - Cabeceras de tabla: `<th>Criterio de evaluación normativa</th>`, `<th>Referencia oficial</th>`, `<th>Valor prescrito o límite</th>`, `<th>Valor obtenido en simulación</th>`, `<th>Dictamen técnico</th>`.
    - Diligencia: `<strong>Diligencia técnica del proyecto:</strong>`, `<strong>Autor del estudio:</strong>`, `<strong>Colegiado n.º:</strong>`, `<strong>Organismo o consultora:</strong>`, `<strong>Firma y fecha de conformidad:</strong>`.
  - Actualización de títulos en modales y locales:
    - `Guía técnica, metodología cinemática y normativa`
    - `🛰️ Capa de ortofotografías aéreas PNOA (IGN)`
  - Actualización del test `TEST-38` en `tests/test_engine.mjs` para verificar la conformidad ortotipográfica de los encabezados y la etiqueta `"Autor del estudio:"`.

### Añadido
- **Buscador Toponímico OpenStreetMap Integrado y Desbloqueo Multiescala Total de Ortofotografías PNOA (DEC-015):**
  - Incorporación en el visor 2D (`#pane-2d .pane-toolbar`) de un buscador toponímico en tiempo real conectado con la base de datos oficial de OpenStreetMap a través de su API pública de geocodificación Nominatim acotada a España (`countrycodes=es`).
  - Desplegable interactivo flotante (`#toponym-dropdown-results`) con búsqueda predictiva por debounce (300 ms), navegación por teclado (flechas Arriba/Abajo, Enter y Escape), discriminación de nombre de infraestructura/calle, término municipal y provincia, y centrado automático instantáneo de la ortofotografía aérea PNOA y del visor en el lugar seleccionado.
  - **Desbloqueo de todos los niveles de escala y resolución del servicio WMTS PNOA (IGN):**
    - Se habilitó el soporte completo de niveles de resolución WMTS del IGN (`TileMatrix` 4 a 20).
    - Se eliminó la limitación artificial que restringía la visualización a escalas inferiores a 1:1260 y generaba el mensaje de corte.
    - Se eliminó el tope inferior en el evento de rueda del ratón (`wheel`), permitiendo alejar la vista libremente hasta escala 1:750.000 (`this.scale` desde 0.005 px/m) para visualizar comarcas y comunidades autónomas completas.
    - Cuadrícula métrica adaptativa (`gridStep` de 5 m hasta 5000 m) que previene bucles de renderizado pesado al alejar la vista.
    - Se resolvió el solapamiento de la botonera reubicando el selector de vistas (`.floating-view-hud`: Planta 2D / Visor 3D / Dividida) en la esquina superior izquierda (`top: 10px; left: 14px;`), dejando totalmente despejados los botones de herramientas (`✏️ Trazar ruta`, `🗑️ Borrar trazado`).
    - Se aseguró que el 100% de los textos del buscador toponímico se muestren en riguroso español (sustitución de "Spain" por "España" en toponimia y mensajes de error y carga en español).
    - Se permite la visualización fluida y continua de la ortofoto aérea tanto a escalas territoriales y comarcales ($1:50.000$ a $1:10.000$) como a escalas viarias ($1:5.000$ a $1:1.000$) y escalas de proyecto de máximo detalle ($1:500$, $1:200$, $1:100$, mediante magnificación continua de teselas de nivel 20 a 14 cm/píxel).
    - Aumento del tamaño de la memoria caché LRU de teselas PNOA a 512 imágenes para una interacción inmediata.
  - Soporte bilingüe en `I18nManager` (`data-i18n-placeholder`, `data-i18n-title`) para el buscador toponímico en español e inglés.
  - Nueva prueba automatizada `TEST-41` en `tests/test_engine.mjs` que valida el rango completo de niveles [4, 20] del PNOA en diversas escalas de trabajo y la paridad i18n de las nuevas claves.
- **Capa de Ortofotografías Aéreas Oficiales del PNOA (IGN) en el Visor 2D (DEC-014):**
  - Implementación en `web/js/view2d/viewer2d.js` del renderizado de imágenes aéreas del Plan Nacional de Ortofotografía Aérea (PNOA) provistas por el Instituto Geográfico Nacional (IGN) mediante el servicio teselado OGC WMTS (`OI.OrthoimageCoverage`, `GoogleMapsCompatible`).
  - Proyección conforme continua entre el sistema métrico local de TurnSim (m) y Web Mercator EPSG:3857, con cálculo adaptativo de nivel de zoom WMTS (niveles 10 a 19, resoluciones de hasta 25 cm/píxel) según la escala del lienzo.
  - Implementación de la función geodésica analítica `utmToLatLon` sobre el elipsoide GRS80 / WGS84 para transformar con precisión milimétrica coordenadas de planos técnicos en husos UTM ETRS89 (28, 29, 30 y 31) a coordenadas geográficas.
  - Interfaz de usuario integrada con botón de conmutación rápida `🛰️ Ortofoto PNOA` y botón de ajuste `⚙️` en la barra del lienzo 2D, casilla de control en el panel de capas y modal de configuración `#modal-pnoa-config`.
  - Herramienta de búsqueda geográfica de municipios y viales de España vía Nominatim, control continuo de opacidad (10% a 100%) y catálogo de 1 clic con 5 infraestructuras viarias y logísticas patrón (Glorieta M-501 Madrid, PLAZA Zaragoza, ZAL Valencia, ZAL Prat Barcelona y Glorieta Cartuja Sevilla).
  - Trazado interactivo de rutas sobre la imagen aérea: los ingenieros pueden activar la ortofoto y hacer clic directamente sobre calzadas, glorietas o plataformas de carga para evaluar el barrido del vehículo.
  - Nueva prueba automatizada `TEST-40` en `tests/test_engine.mjs` que valida la transformación UTM ETRS89 y la integridad de las traducciones.

### Modificado
- **Traducción rigurosa al español del botón «Clear Path» por «Borrar trazado»:**
  - Homogeneización formal en `LOCALES.es`, `LOCALES.en` y marcado HTML estático (`#btn-clear-path` y `#btn-clear-path-sidebar`) con el texto exacto **«🗑️ Borrar trazado»** y atributos descriptivos en español técnico.
- **Traducción integral al español de todos los textos del visor Path Telemetry Curves:**
  - Nomenclatura del visor unificada: **«📈 Curvas de telemetría a lo largo del recorrido (PK)»**.
  - Leyendas y curvas: **«Ángulo de dirección δ(s)»**, **«Ángulo de articulación γ(s)»** y **«Holgura libre d_mín(s)»**.
  - Ejes y rotulación gráfica en el SVG: eje vertical **«Ángulo (°)»** y eje horizontal **«PK / Distancia s (m)»**.
  - Botonera y ayudas contextuales: **«📈 Curvas de telemetría»** / **«📈 Ocultar telemetría»**, títulos de cierre e indicador de estado en reposo traducidos íntegramente al español.
- **Extrusión volumétrica 3D de construcciones y obstáculos (DEC-012):**
  - Implementación en `web/js/view3d/viewer3d.js` del método `_addExtrudedPolygon3D` para generar volúmenes tridimensionales reales a partir de los polígonos cerrados de obstáculos y capas CAD de edificación (`EDIFICIOS`, `MUROS`, `NAVES`).
  - Asignación de alturas de extrusión estándar y arquitectónicas (4,50 m para naves y edificios, 0,20 m para bordillos, o `heightM` paramétrico), con caras laterales extruidas, techos triangulados mediante `earcut` y aristas superiores acentuadas.
- **Indicador flotante de cálculo en progreso (Anti-incertidumbre UX):**
  - Incorporación en el visor de una cápsula animada flotante `#calculating-indicator` con spinner cian y texto dinámico bilingüe (`calc_indicator_text`), activada automáticamente durante la integración RK4 y la unión de envolventes de barrido.
  - Sincronización del badge superior (`.status-COMPUTING: ⏳ CALCULANDO TRAYECTORIA...`) y del lienzo 2D en reposo para eliminar la incertidumbre del usuario durante el procesamiento del cálculo cinemático.

### Modificado
- **Unificación y traducción al español de la acción de borrado de trazado:**
  - Actualización del diccionario español (`web/js/i18n/locales.js`) para asignar `"btn_clear_path": "🗑️ Borrar trazado"`.
  - Actualización del botón en la barra de herramientas del lienzo 2D (`#btn-clear-path`) y en la gaveta lateral (`#btn-clear-path-sidebar`) a «🗑️ Borrar trazado», asegurando una nomenclatura 100% homogénea y en español técnico.
  - Actualización del mensaje emergente (toast) informativo al pulsar la acción: *"Trazado borrado. Listo para definir un nuevo trazado."*.
- **Limpieza del visor 2D/3D y acotaciones exclusivas de barrido (DEC-011):**
  - **Eliminación de vectores de interferencia y cotas hacia obstáculos:** Se suprimió el dibujado de líneas discontinuas y cartelas de distancia (`d_mín = X.XX m`) hacia cada elemento u obstáculo del plano en `web/js/view2d/viewer2d.js` y `web/js/view3d/viewer3d.js`. Se preservan exclusivamente las acotaciones técnicas de anchura de barrido (`simResult.dimensions`: inicio, entrada en curva, máx. barrido y salida).
  - **Eliminación del etiquetado textual sobre elementos del plano:** Se eliminó el renderizado automático de nombres de obstáculos (`obs.name`) y cajas de coordenadas flotantes fijas sobre nodos de ruta (`P1 (X, Y)`), asegurando un visor limpio y técnico.
  - **Herramienta para eliminar trazado y reiniciar maniobra:**
    - Incorporación de botón destacado de acción rápida `🗑️ Limpiar trazado` en la barra de herramientas superior del visor 2D (`#btn-clear-path`).
    - Incorporación de botón `🗑️ Borrar trazado` en la botonera de tramos de la Etapa 3 (Maniobra) de la gaveta lateral (`#btn-clear-path-sidebar`).
    - Implementación del método `clearVehicleTrajectory()` en `web/js/app.js` y `clearWaypoints()` en `web/js/view2d/viewer2d.js`, que vacía la maniobra, limpia los waypoints, reinicia el timeline a 0 y sitúa la simulación en reposo limpio.
    - Soporte para eliminación interactiva de cualquier punto de paso mediante clic derecho o doble clic sin restricciones de longitud mínima.

### Añadido
- **Autoencuadre Dinámico en Visor 3D al Pulsar Modo de Vista (DEC-022):**
  - Al pulsar el botón `Visor 3D` (o `Dividida 2D+3D`), la cámara tridimensional se redimensiona y ejecuta automáticamente un encuadre integral (`fitToScene()`).
  - Cálculo ampliado de la caja envolvente que contempla no solo los estados de trayectoria, sino los contornos poligonales completos del tractor y semirremolque, la envolvente física de barrido, los obstáculos 3D extruidos, los fondos CAD y los waypoints.
  - Centrado instantáneo del objetivo orbital (`controls.target`) y elevación en perspectiva isométrica proporcional a las dimensiones del escenario.

### Corregido
- **Corrección de las Curvas de Telemetría a lo largo del recorrido (PK) (INC-006 / DEC-013):**
  - **Diagnóstico y causa raíz:** Los métodos `_renderPKCurves` y `_updatePKCursor` en `web/js/app.js` leían la propiedad inexistente `st.distAlongPathM` de cada estado generado por el motor (`buildDetailedState` solo devolvía `dist`). Al evaluar `scaleX(undefined)`, las coordenadas X resultaban en `NaN`, generando trazados SVG inválidos (`M NaN 65.0 L NaN...`) invisibles en el navegador. La función de clic interactivo fallaba de manera similar al restar `undefined - targetDist`.
  - **Solución cinemática y matemática:** Incorporación de la propiedad canónica `distAlongPathM: dist` en `buildDetailedState` (`kinematics.js` y `worker_source.js`) junto con resolución defensiva `st.distAlongPathM ?? st.dist ?? 0`.
  - **Sincronización en vivo y tiempo real:** Conexión de `_updatePKCursor` dentro de `_syncFrameToViewers` para desplazar de forma continua la línea del cursor y los marcadores de ángulo de dirección $\delta(s)$ y articulación $\gamma(s)$ durante la reproducción y el arrastre del timeline.
  - **Nomenclatura unificada y layout:** Cambio del título oficial a **«Curvas de telemetría a lo largo del recorrido (PK)»** (`curves_panel_title`), reposicionamiento a `bottom: 68px;` con bordes redondeados para no colisionar con la barra de reproducción, y ocultación dinámica de la leyenda de articulación para vehículos rígidos.
  - **Verificación:** Añadido caso de prueba `TEST-39` en `tests/test_engine.mjs` con 100 % de aserciones superadas (55/55 pruebas).
- **Corrección de la navegación de etapas y herramientas en Mozilla Firefox (INC-005 / DEC-010):**
  - **Diagnóstico y causa raíz:** Se identificó que la inyección dinámica de `OrbitControls.js` mediante `document.createElement("script")` se ejecutaba de forma asíncrona en Firefox bajo `file://`. Esto generaba una condición de carrera donde `DOMContentLoaded` instanciaba `SweptPathApp` antes de que `window.THREE.OrbitControls` estuviera registrado, lanzando `TypeError: THREE.OrbitControls is not a constructor` en `Viewer3D._initScene()`. Al no estar capturada, la excepción abortaba la inicialización antes de conectar los *listeners* de clic del Stepper y la barra de actividad lateral.
  - **Carga defensiva 3D y degradación elegante:** En `web/js/view3d/viewer3d.js`, se endureció la comprobación de disponibilidad (`Boolean(window.THREE) && typeof window.THREE.OrbitControls === "function"`) y se encapsuló `_initScene()` dentro de un bloque `try...catch` con banner de aviso de degradación en caso de fallo, garantizando que el visor 2D y el flujo principal nunca queden bloqueados.
  - **Restitución de scripts síncronos:** En `scripts/build_standalone_html.mjs`, se restituyó la inclusión estática síncrona en `<head>` de `three.min.js` y `OrbitControls.js`.
  - **Sincronización del estado de la gaveta lateral:** En `web/js/app.js`, se desacopló el estado de apertura/cierre de la variable interna no persistida, sincronizándolo de forma bidireccional con la clase `.sidebar-collapsed` del contenedor `.app-layout`. Se habilitó además el comportamiento interactivo tipo VS Code (pulsar el botón activo en la barra lateral pliega la gaveta; pulsar cualquier herramienta la despliega).
  - **Verificación cross-browser automatizada:** Verificación exhaustiva con Mozilla Firefox 157.0 en modo headless mediante capturas gráficas y aserciones DOM, confirmando el funcionamiento impecable de los clics en las 6 etapas del Stepper, barra de actividad lateral, botones internos de avance y plegado/desplegado de herramientas.

### Añadido
- **Muestreo Angular y Espacial Adaptativo en Envolventes (MEJ-03):**
  - Implementación en `web/js/engine/envelope.js` de la función `computeAdaptiveSampledIndices(states, options)` que sustituye el submuestreo rígido por una selección dinámica condicionada a la variación angular ($\Delta \theta \le 1.5^\circ - 2.0^\circ$) y al desplazamiento espacial ($\Delta s \le 0.60\text{ m}$).
  - Reducción del error de flecha cordal en curvas cerradas a menos de $2\text{ mm}$ (frente a los $10\text{ cm}$ anteriores con `stride = 10`), garantizando la preservación estricta de los extremos inicial y final.
  - Verificado en el nuevo caso de prueba `TEST-37` en `tests/test_engine.mjs`.
- **Memoria Técnica Justificativa Oficial para Proyectos de Carreteras (MEJ-04):**
  - Incorporación en `web/js/export/exporters.js` del generador `generateMarkdownTechnicalReport` y del descargador directo `downloadMarkdownTechnicalReport`, además de la adición de la Sección 5 ("Justificación y Dictamen de Conformidad Normativa") en el informe HTML/PDF imprimible.
  - Cuadro de comprobación normativa explícita frente a la Norma 3.1-IC (Tabla A3.1), Guía de Nudos Viarios (Tabla 2.3-D), RD 2822/1998 Anexo IX y Directiva 96/53/CE, evaluando la concordancia de vehículo patrón, gálibos máximos, radio en eje director delantero ($R_f$) y distancias libres de resguardo.
  - Plantilla formal de diligencia y visado para el Ingeniero de Caminos, Canales y Puertos proyectista.
  - Integración del botón de descarga directa en la Etapa 6 de la interfaz (`#btn-export-report-md`) y en la cabecera de la vista previa del informe imprimible.
  - Verificado en el nuevo caso de prueba `TEST-38` en `tests/test_engine.mjs`.
- **Implementación de Vehículos Patrón Españoles (MEJ-01):** Incorporación de los 4 vehículos reglamentarios de la Norma 3.1-IC (Orden FOM/273/2016, Anexo 3, Tabla A3.1) en `web/js/models/vehicles.js` y en la UI:
  - `spain_furgon_f`: Furgón patrón ($L=6.35\text{ m}$, $W=2.05\text{ m}$, $L_{wb}=4.00\text{ m}$, $R_f=7.50\text{ m}$).
  - `spain_camion_ligero_c`: Camión rígido patrón ($L=10.55\text{ m}$, $W=2.55\text{ m}$, $L_{wb}=6.25\text{ m}$, $R_f=9.10\text{ m}$).
  - `spain_camion_articulado_t`: Conjunto articulado patrón ($L_{total}=16.50\text{ m}$, tractora $L=6.30\text{ m}$, $L_{wb}=3.90\text{ m}$, semirremolque caja $13.60\text{ m}$, $L_{trailer}=6.95\text{ m}$, $R_f=10.30\text{ m}$).
  - `spain_autobus_rigido_a`: Autobús rígido de 3 ejes patrón ($L=15.00\text{ m}$, $W=2.55\text{ m}$, batalla efectiva tándem $8.15\text{ m}$, $R_f=10.50\text{ m}$).
- **Selector de Punto de Referencia de Trazado de Maniobra (MEJ-02):**
  - Implementación en `web/js/engine/kinematics.js` (`simulateManeuver`) de la opción `steeringReferencePoint: 'front_axle' | 'rear_axle'`.
  - Conversión cinemática automática de radio $R_{rear} = \sqrt{\max(0.25, R_{front}^2 - L_{wb}^2)}$ cuando se define el radio en el eje director (conforme al criterio de la Guía de Nudos Viarios 2.3.2.1).
  - Propagación a través de `web/js/engine/envelope.js`, Web Workers (`worker_source.js`) y sincronización en la interfaz de usuario (`web/index.html` y `web/js/app.js` en la Etapa 3).
  - Nuevo caso de prueba `TEST-36` en `tests/test_engine.mjs` validando la exactitud de conversión del radio a $< 10^{-13}\text{ m}$.
  - Recompilación de los bundles HTML autónomos (`web/index.html`, `index.html`, `simulacion_threejs.html`, `TurnSim_Standalone.html`).
- **Auditoría Documental de la Normativa Española:** Revisión directa y extracción íntegra de parámetros de los documentos oficiales en PDF:
  - `NORMA 3.1-IC de la Instrucción de carreteras.pdf` (Orden FOM/273/2016, Anexo 3 «Dimensiones de los vehículos patrón», Tabla A3.1 y Figuras A3.1 a A3.6).
  - `Guia_de_nudos_viarios-Orden_circular_32-2012.pdf` (Capítulo 2.3 «Vehículos», Tabla 2.3-A, 2.3-B, 2.3-C, Tabla 2.3-D «Radio mínimo de giro a velocidad de maniobra» y Figuras 2.3-B a 2.3-H).
- **Nueva Estructura Documental Consolidada (`docs/`):**
  - `docs/referencias_normativas/`: Repositorio de los PDFs oficiales y `README.md` con verificación criptográfica SHA-256.
  - `docs/normativa/`: Análisis detallado de la Norma 3.1-IC (`analisis_norma_31_ic.md`), Guía de Nudos Viarios (`analisis_guia_nudos_viarios.md`) y parámetros técnicos consolidados (`parametros_vehiculos_patron.md`).
  - `docs/ingenieria/`: Auditoría técnica del motor cinemático (`auditoria_modelos_cinematicos.md`), geometría vehicular (`auditoria_geometria_vehicular.md`), envolventes de barrido (`auditoria_envolventes_barrido.md`) y propuestas de mejora priorizadas (`propuestas_mejora.md`).
  - `docs/validacion/`: Plan de validación (`plan_validacion.md`), casos de prueba (`casos_prueba.md`), resultados cuantitativos comparativos (`resultados_comparativos.md`) y conclusiones técnicas (`conclusiones_validacion.md`).
  - `docs/contexto/`: Documento maestro (`documento_maestro.md`), arquitectura (`arquitectura.md`), decisiones técnicas (`decisiones_tecnicas.md`), hoja de ruta (`hoja_ruta.md`) y archivo histórico (`historico_octubre_2026/`).
  - `docs/README.md`: Índice general de la documentación.
- **Herramientas de Validación Independiente y Benchmarks:**
  - `scripts/benchmark_normativa_python.py`: Benchmark analítico independiente en Python 3 utilizando NumPy y Shapely (GEOS) para el cálculo de régimen permanente circular y unión de envolventes de barrido en 90°.
  - `scripts/test_normativa_espanola.mjs`: Suite de validación en Node.js que ejecuta los 4 vehículos patrón españoles sobre el motor de TurnSim, comprobando ángulos, radios y envolventes frente a tolerancias analíticas estrictas (20 pruebas superadas, 0 fallos).
- **Hallazgo Crítico de Ingeniería de Carreteras:** Identificación de la diferencia entre el punto de control de trazado en la Guía de Nudos Viarios (apartado 2.3.2.1: centro del eje director delantero) y el punto de control de `simulateManeuver` (eje motriz trasero), formulando la transformación matemática $R_{rear} = \sqrt{R_{front}^2 - L^2}$ y confirmando la plena adecuación del guiado *Pure Pursuit* (`simulatePathFollowing`).

## 2026-11-10

### Añadido
- **Rediseño integral de interfaz y experiencia de usuario (UX/UI):** Implementación de la arquitectura híbrida recomendada (*TurnSim Fusion*), integrando el lienzo gráfico dominante y la barra de actividades lateral de la Propuesta B, el asistente secuencial de 6 etapas (*Workflow Stepper*) de la Propuesta C y la precisión técnica CAD de la Propuesta A.
- **Cabecera híbrida con Stepper interactivo (`.top-navbar` y `.header-stepper`):** Navegación fluida por las 6 etapas del análisis viario (1. Escenario ➔ 2. Vehículo ➔ 3. Maniobra ➔ 4. Simulación ➔ 5. Análisis ➔ 6. Exportar) con sincronización bidireccional entre etapas y gaveta lateral.
- **Barra de actividades vertical (`.activity-bar`, 52 px):** Acceso directo mediante iconos a cada área de trabajo y control de colapso de la gaveta lateral (`Ctrl+B`).
- **Gaveta lateral retráctil (`.drawer-panel`, 340 px):** Reorganización modular de controles por bloques de etapa con botones de avance secuencial ("Avanzar a..." / "◀ ..."), permitiendo expandir el área útil del visor gráfico al 90-94 % del ancho de pantalla.
- **Cápsula flotante ergonómica de simulación (`.bottom-timeline-bar.simulation-capsule`):** Controles de reproducción Play/Pause, velocidad, deslizador continuo con gradiente cromático de riesgo y microindicadores de telemetría en vivo.
- **Barra de estado CAD inferior (`.cad-statusbar`):** Visualización en tiempo real de coordenadas métricas $(X, Y, Z)$ del cursor en planta 2D, estado de imantación (*snap*), cuadrícula métrica y acreditación normativa (Directiva 96/53/CE).

### Modificado
- `web/css/styles.css`: Incorporación de los estilos visuales para la cabecera híbrida, barra de actividades, gaveta retráctil, HUDs flotantes y cápsula de simulación.
- `web/js/app.js`: Implementación del controlador `_initHybridWorkflow()` para gestionar el cambio de etapas, activación de gavetas y seguimiento dinámico de coordenadas.
- `scripts/build_standalone_html.mjs`: Actualización de la plantilla HTML maestra con la nueva distribución espacial y compilación de los puntos de entrada autónomos (`index.html`, `simulacion_threejs.html`, etc.).
- Batería de verificación `tests/test_engine.mjs`: 47 pruebas superadas con éxito (0 fallos).

## 2026-11-09

### Añadido
- Informes completos de auditoría científica, matemática, ingenieril y de arquitectura en los directorios `TurnSim_Engineering_Audit/` (12 documentos técnicos) y `TurnSim_Audit/` (9 documentos de evaluación).
- Botones de acceso directo en la barra superior del visor 2D: "✏️ Trazar ruta" y "📍 Ir al PK".
- Sistema de memoria y contexto persistente del proyecto compuesto por `DME.md`, `ESTADO_PROYECTO.md`, `DECISIONES.md`, `INCIDENCIAS.md`, `TODO.md`, `ARCHIVOS.md`, `CONTEXTO_SESION.md` y `CHANGELOG.md`.
- Soporte para vehículos rígidos de 2 y 3 ejes, autobuses de 12 m y 15 m, y conjuntos articulados multicuerpo en cascada (tren de carretera de 18,75 m y megacamión modular EMS de 25,25 m).

# Registro de decisiones técnicas del proyecto

## DEC-001 - Arquitectura cliente autónoma compatible con protocolo file://

- **Fecha:** 2026-11-09
- **Decisión:** Mantener todo el motor cinemático, visor y exportación en código cliente puro sin exigir servidor Node/Python ni peticiones fetch externas en los paquetes compilados.
- **Motivo:** Permitir que los ingenieros de proyectos utilicen TurnSim en entornos corporativos cerrados o directamente desde memorias USB y unidades de red abriendo el archivo HTML.
- **Alternativas consideradas:** Backend en Python (FastAPI) o Node.js; descartadas por requerir instalación de entornos y dependencias en equipos cliente.
- **Consecuencias:** Se requiere un script de compilación (`scripts/build_standalone_html.mjs`) que embeba estilos, scripts y librerías en un único archivo HTML.
- **Estado:** VIGENTE



## DEC-002 - Adopción de formulación cinemática continua con integración RK4

- **Fecha:** 2026-11-09
- **Decisión:** Modelar la cinemática de la tractora y semirremolque mediante ecuaciones diferenciales ordinarias resueltas con Runge-Kutta de orden 4 (RK4) a paso de arco ($ds \le 0.05$ m).
- **Motivo:** Garantizar precisión submilimétrica frente a la aproximación por cuerdas de Euler simple, evitando distorsiones en maniobras cerradas.
- **Alternativas consideradas:** Método de Euler simple (descartado por deriva acumulativa); resolución analítica por segmentos (no aplicable a trayectorias arbitrarias).
- **Consecuencias:** Mayor fidelidad física y exactitud requerida para proyectos de ingeniería civil y auditorías viarias.
- **Estado:** VIGENTE



## DEC-003 - Reemplazo de polígonos por cápsulas con redondeo continuo (Clipper2)

- **Fecha:** 2026-11-09
- **Decisión:** Generar la envolvente de barrido mediante la unión booleana de cápsulas orientadas con esquinas redondeadas (`jtRound`) mediante la biblioteca Clipper2.
- **Motivo:** Eliminar los vértices espurios en estrella ("dientes de sierra") producidos por uniones discretas de polígonos en giros de gran curvatura.
- **Alternativas consideradas:** Incremento ciego de densidad de muestreo (descartado por saturar la CPU).
- **Consecuencias:** Contornos limpios, continuos y válidos para exportación DXF y aprobación administrativa.
- **Estado:** VIGENTE



## DEC-004 - Arquitectura híbrida de interfaz y experiencia de usuario (TurnSim Fusion)

- **Fecha:** 2026-11-10
- **Decisión:** Sustituir la interfaz monolítica de barra lateral fija de 410 px por una arquitectura híbrida compuesta por cabecera compacta con Stepper de 6 etapas, barra vertical de actividades de 52 px con gaveta retráctil, cápsula flotante de simulación y barra de estado CAD métrica.
- **Motivo:** Reducir la sobrecarga cognitiva de más de 50 controles simultáneos, elevar el área útil del visor gráfico del 65 % al 90-94 % de la pantalla y proporcionar una secuencia metodológica clara tanto para técnicos noveles como para ingenieros proyectistas experimentados.
- **Alternativas consideradas:** Mantener interfaz tipo CAD tradicional con cinta ribbon rígida o asistente guiado rígido tipo wizard modal (descartadas por saturación de controles y falta de flexibilidad para usuarios expertos).
- **Consecuencias:** Mayor agilidad operativa, ergonomía en pantallas de ordenador portátil (1366x768 y 1440x900) y conservación íntegra del 100 % de las herramientas y atajos de teclado existentes.
- **Estado:** VIGENTE



## DEC-005 - Persistencia de plantillas en la gaveta y desacoplamiento de controles temporales

- **Fecha:** 2026-11-10
- **Decisión:** Mantener las tarjetas de selección de vehículos y maniobras dentro del flujo de la gaveta lateral retráctil, moviendo los botones de reproducción y el deslizador de tiempo a una cápsula flotante inferior (`.sim-playback-capsule`) anclada sobre los visores.
- **Motivo:** Separar conceptualmente la parametrización del proyecto (gaveta) del control visual de la reproducción cinemática (lienzo).
- **Alternativas consideradas:** Reubicar controles en la barra de actividades (descartado por falta de espacio horizontal).
- **Consecuencias:** Interacción más intuitiva y espacio despejado para observar la trayectoria del vehículo.
- **Estado:** VIGENTE



## DEC-006 - Reorganización modular del código en paquetes monobloque (`web/js/`)

- **Fecha:** 2026-11-10
- **Decisión:** Desacoplar el código en módulos ES específicos: `models/vehicles.js`, `engine/kinematics.js`, `engine/envelope.js`, `engine/collisions.js`, `export/exporters.js`, `export/dxf_importer.js`, `view2d/viewer2d.js`, `view3d/viewer3d.js` y `app.js`.
- **Motivo:** Mejorar la mantenibilidad, escalabilidad y testabilidad del proyecto sin romper el empaquetado autónomo en un solo archivo HTML para producción.
- **Alternativas consideradas:** Mantener un único archivo monolítico `app.js` de más de 3.000 líneas (descartado por deuda técnica y dificultad de depuración).
- **Consecuencias:** Mayor claridad en las pruebas unitarias y facilidad para incorporar nuevas normativas y modelos.
- **Estado:** VIGENTE



## DEC-007 - Integración de Web Workers para el cálculo cinemático en segundo plano

- **Fecha:** 2026-11-10
- **Decisión:** Implementar el cálculo de trayectorias, barridos y colisiones en un Web Worker dedicado (`worker_client.js` y `worker_source.js`), manteniendo un fallback de ejecución en el hilo principal para entornos restringidos (`file://` sin workers o navegadores antiguos).
- **Motivo:** Evitar el bloqueo del hilo de renderizado (UI freeze) durante cálculos pesados con pasos finos de integración ($ds = 0.01$ m) y geometrías complejas.
- **Alternativas consideradas:** Ejecución síncrona exclusiva (descartada por degradar la experiencia de usuario con tirones en la animación).
- **Consecuencias:** Interfaz responsiva a 60 FPS con indicador visual no intrusivo `#calc-indicator` mientras el cálculo finaliza en segundo plano.
- **Estado:** VIGENTE



## DEC-008 - Sistema de Deshacer/Rehacer (Undo/Redo) transaccional con atajos de teclado CAD

- **Fecha:** 2026-11-10
- **Decisión:** Implementar una pila transaccional de estados con límite de 30 pasos, controlada mediante `Ctrl+Z` (deshacer) y `Ctrl+Y` / `Ctrl+Shift+Z` (rehacer).
- **Motivo:** Proporcionar al usuario la seguridad de revertir cambios accidentales en waypoints, obstáculos o parámetros de vehículos.
- **Alternativas consideradas:** Confirmaciones modales en cada acción destructiva (descartadas por entorpecer la fluidez de trabajo).
- **Consecuencias:** Mayor productividad y reducción de errores en el trazado de rutas complejas.
- **Estado:** VIGENTE



## DEC-009 - Soporte para importación de fondos vectoriales DXF (R12 / AC1009)

- **Fecha:** 2026-11-10
- **Decisión:** Desarrollar un analizador nativo DXF (`dxf_importer.js`) capaz de procesar entidades `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE` y `ARC`, con selector de capas y conversión automática a obstáculos colisionables.
- **Motivo:** Permitir contrastar la maniobra del vehículo directamente sobre el plano de alineaciones viarias o la cartografía municipal real suministrada por el cliente.
- **Alternativas consideradas:** Exigir formatos rasterizados PNG/JPG calibrados (descartado por pérdida de precisión vectorial y escala métrica).
- **Consecuencias:** Flujo directo de trabajo CAD sin necesidad de vectorización intermedia.
- **Estado:** VIGENTE



## DEC-010 - Sistema de Internacionalización Bilingüe (Español / Inglés) con Detección Automática

- **Fecha:** 2026-11-10
- **Decisión:** Implementar un gestor de idiomas `I18nManager` (`locales.js`) con diccionario bilingüe completo (`es` y `en`), detección inicial del idioma del navegador (`navigator.language`), persistencia en `localStorage` y botón de alternancia rápida `🌐 EN` / `🌐 ES` en la cabecera.
- **Motivo:** Garantizar la usabilidad en proyectos internacionales y la redacción de informes técnicos oficiales en español conforme a la terminología de la Dirección General de Carreteras (Norma 3.1-IC).
- **Alternativas consideradas:** Utilizar bibliotecas externas como `i18next` (descartada para preservar la arquitectura monobloque sin dependencias).
- **Consecuencias:** Soporte multilingüe instantáneo y sin retrasos de red.
- **Estado:** VIGENTE



## DEC-011 - Puntos de paso dinámicos (Waypoints) con curvas de enlace tangentes automáticas

- **Fecha:** 2026-11-10
- **Decisión:** Permitir el trazado interactivo de rutas mediante la adición, desplazamiento y borrado de puntos de paso en el visor 2D, calculando automáticamente alineaciones rectas y curvas de radio mínimo tangente.
- **Motivo:** Facilitar la creación de maniobras complejas en glorietas, intersecciones y curvas de retorno sin requerir la parametrización manual de ángulos y distancias.
- **Alternativas consideradas:** Entrada numérica exclusiva de radios y ángulos en tablas (descartada por lentitud en la fase de anteproyecto).
- **Consecuencias:** Modelado ágil de escenarios viarios reales en cuestión de segundos.
- **Estado:** VIGENTE



## DEC-012 - Extrusión volumétrica tridimensional de obstáculos CAD y señalización visual de cálculo

- **Fecha:** 2026-11-11
- **Decisión:**
  1. Extruir automáticamente en Three.js (`web/js/view3d/viewer3d.js`) tanto los obstáculos geométricos rectangulares/circulares como las entidades poligonales cerradas importadas desde archivos DXF con altura parametrizable y aristas resaltadas (`EdgesGeometry`).
  2. Incorporar el badge visual `#calc-indicator` en la cabecera del visor 2D que informa al usuario en tiempo real cuando el worker cinemático en segundo plano está recalculando las envolventes.
- **Motivo:** Proporcionar una comprensión espacial inmediata de los gálibos y evitar la sensación de congelación durante simulaciones densas.
- **Alternativas consideradas:** Renderizado 3D plano exclusivo en el suelo (descartado por no permitir verificar el gálibo vertical ni la cercanía de fachadas).
- **Consecuencias:** Visión 3D inmersiva con volúmenes arquitectónicos reales y experiencia de usuario fluida con transparencia total del estado del motor cinemático.
- **Estado:** VIGENTE



## DEC-013 - Robustez de coordenadas de telemetría PK, sincronización continua y nomenclatura unificada

- **Fecha:** 2026-11-11
- **Decisión:**
  1. Garantizar la presencia canónica y dual de `dist` y `distAlongPathM` en todos los objetos de estado cinemático generados por `buildDetailedState` (tanto en el motor principal como en el worker en segundo plano), aplicando además resolución defensiva `st.distAlongPathM ?? st.dist ?? 0` en todos los componentes consumidores.
  2. Conectar la sincronización reactiva continua del cursor de telemetría (`_updatePKCursor`) durante la reproducción y el desplazamiento del deslizador temporal (`_syncFrameToViewers`), asegurando el movimiento sincronizado en tiempo real de la línea de estación y de los marcadores de ángulo de dirección ($\delta$) y articulación ($\gamma$).
  3. Desplazar la cota inferior del panel de telemetría a `bottom: 68px;` con bordes redondeados y sombra suave para evitar colisiones visuales con la cápsula flotante de reproducción inferior (`bottom: 12px; height: 48px;`).
  4. Homogeneizar el título normativo del panel a **«Curvas de telemetría a lo largo del recorrido (PK)»** en el diccionario de internacionalización (`curves_panel_title`), en las plantillas HTML y en el visor.
- **Motivo:** Eliminar la corrupción geométrica generada por valores `NaN` en los atributos `d` y `cx` de las curvas SVG cuando `distAlongPathM` no estaba definido, dotar al gráfico de interactividad bidireccional completa (clic para saltar a PK y arrastre) y atender a la nomenclatura solicitada por el usuario.
- **Alternativas consideradas:** Reemplazar el gráfico vectorial SVG por un canvas de dibujo directo o una librería externa de terceros (descartada para mantener cero dependencias y máxima ligereza en bundles autónomos de un solo archivo).
- **Consecuencias:** Visualización vectorial matemática nítida, interactividad fluida y concordancia formal con los informes técnicos de ingeniería.
- **Estado:** VIGENTE



## DEC-014 - Integración de Ortofotografías Aéreas Oficiales PNOA (IGN) en el Visor 2D

- **Fecha:** 2026-11-11
- **Decisión:**
  1. Integrar soporte directo para la capa de imágenes aéreas de alta resolución del Plan Nacional de Ortofotografía Aérea (PNOA) del Instituto Geográfico Nacional de España (IGN) en el visor 2D Canvas (`web/js/view2d/viewer2d.js`) mediante el servicio OGC WMTS conforme a la Directiva INSPIRE (`OI.OrthoimageCoverage`, `GoogleMapsCompatible`).
  2. Implementar un conversor de proyección cartográfica conforme entre el espacio métrico cartesiano local de TurnSim (m) y Web Mercator EPSG:3857, escalando dinámicamente las teselas al nivel de resolución óptimo del visor con caché LRU de imágenes en memoria.
  3. Incorporar el algoritmo geodésico analítico `utmToLatLon` (elipsoide GRS80 / WGS84) para posicionar proyectos en cualquier huso UTM de España (28, 29, 30 y 31).
  4. Proveer un modal de configuración `#modal-pnoa-config` con geocodificación mediante búsqueda textual, control de opacidad (10% a 100%), accesos rápidos a 5 emplazamientos viarios y logísticos patrón de España, y botones de activación rápida en la barra de herramientas del lienzo y en el panel de capas.
  5. Permitir el trazado interactivo de rutas vehiculares directamente sobre la imagen aérea para verificar la inscripción de vehículos pesados en glorietas, intersecciones y dársenas reales.
- **Motivo:** Permitir a ingenieros y proyectistas contrastar la maniobra y el barrido del vehículo directamente sobre la infraestructura física real sin necesidad de disponer previamente de un plano topográfico o CAD vectorizado.
- **Alternativas consideradas:** Requerir la carga de imágenes ráster georreferenciadas locales GeoTIFF o Worldfiles (descartada por obligar al usuario a manipular ficheros GIS pesados) o utilizar servicios de mapas comerciales con claves API de pago (descartada por no ajustarse al principio de datos abiertos oficiales del IGN/CNIG).
- **Consecuencias:** Capacidades GIS directas y nativas en TurnSim sin bibliotecas externas pesadas, total trazabilidad territorial en España y máxima comodidad operativa para diseñar trazados sobre infraestructuras existentes.
- **Estado:** VIGENTE



## DEC-015 - Buscador Toponímico Integrado (OpenStreetMap Nominatim) y Desbloqueo Multiescala Total de Ortofotografías PNOA (IGN)

- **Fecha:** 2026-11-11
- **Decisión:**
  1. Integrar un buscador toponímico en tiempo real directamente en la barra de herramientas del visor 2D (`#pane-2d .pane-toolbar`) con acceso directo a la base de datos geográfica de OpenStreetMap a través de su API pública de geocodificación Nominatim, acotada al territorio nacional español (`countrycodes=es` y cabecera en español).
  2. Implementar un componente de autocompletado interactivo con lista desplegable flotante (`#toponym-dropdown-results`) con debounce de 300 ms, navegación por teclado (flechas Arriba/Abajo, Enter y Escape), discriminación de nombre de entidad, municipio y provincia, y centrado instantáneo de la ortofoto y de la cámara en las coordenadas del lugar seleccionado.
  3. Desbloquear el rango completo de niveles de resolución del servicio WMTS PNOA del Instituto Geográfico Nacional (IGN) (`TileMatrix` de 4 a 20), eliminando la cota fija inferior que provocaba la desaparición de la ortofoto y el mensaje de advertencia a escala 1:1260.
  4. Habilitar la visualización fluida y continua en todas las escalas cartográficas:
     - Escalas comarcales y regionales ($1:50.000$ a $1:10.000$, niveles 12 a 15).
     - Escalas viarias intermedias ($1:5.000$ a $1:1.000$, niveles 16 a 18).
     - Escalas de proyecto de máximo detalle ($1:500$, $1:200$, $1:100$, nivel 20 a 14 cm/píxel con interpolación continua en el canvas transform).
  5. Desbloquear el zoom out libre en el evento `wheel` del ratón rebajando el suelo de escala de `3.0` px/m (1:1260) a `0.005` px/m (escala 1:750.000 para vistas provinciales y autonómicas completas) e implementar un paso de cuadrícula métrico adaptativo (`gridStep` de 5 m a 5000 m) que previene sobrecargas de dibujo.
  6. Resolver el solapamiento visual en la cabecera del visor reubicando la botonera de vistas `.floating-view-hud` (Planta 2D / Visor 3D / Dividida) en la esquina superior izquierda (`top: 10px; left: 14px;`), dejando libre todo el centro y la derecha para `.pane-toolbar`, evitando que los botones de herramientas (`✏️ Trazar ruta`, `🗑️ Borrar trazado`) queden tapados.
  7. Ampliar la memoria caché LRU de teselas PNOA a 512 imágenes para una navegación sin retardos, y extender el sistema de internacionalización `I18nManager` para traducir reactivamente atributos `data-i18n-placeholder` y `data-i18n-title`, asegurando toponimia 100% en español.
- **Motivo:** Atender a las peticiones del usuario permitiendo buscar cualquier topónimo de España (poblaciones, polígonos, calles, glorietas) sin necesidad de abrir menús secundarios y garantizar la inspección visual de la ortofotografía aérea tanto con perspectiva global como a nivel de bordillo o rueda de camión.
- **Alternativas consideradas:** Limitar la búsqueda al diálogo modal o restringir el zoom a un intervalo estrecho (descartadas por entorpecer el flujo de trabajo del proyectista).
- **Consecuencias:** Experiencia GIS de alta agilidad, ergonomía limpia sin solapamiento de botones en el visor, autonomía completa para posicionar y trazar rutas en cualquier punto de España y visualización ininterrumpida a cualquier nivel de acercamiento o alejamiento.
- **Estado:** VIGENTE



## DEC-016 - Normalización Ortotipográfica y Capitalización en Español de Informes Técnicos (prose-guard-es)

- **Fecha:** 2026-11-11
- **Decisión:**
  1. Sustituir en los informes técnicos (versión imprimible HTML/PDF y memoria técnica Markdown) el texto de diligencia `"Autor del Estudio: Ingeniero de Caminos, Canales y Puertos"` por `"Autor del estudio:"` con puntos de relleno para firma facultativa.
  2. Aplicar la regla de estilo académico y ortotipografía en español (skill `prose-guard-es`): eliminación rigurosa de mayúsculas a la inglesa (*Title Case*) en títulos, subtítulos, cabeceras de tablas y secciones tanto en los informes técnicos generados (`exporters.js`) como en los títulos de modales y diccionarios i18n (`locales.js`).
  3. Los títulos se normalizan a mayúscula exclusivamente en la letra inicial y nombres propios:
     - `# Memoria técnica de justificación de trayectoria de barrido`
     - `## 1. Vehículo de diseño y trazabilidad geométrica`
     - `## 2. Definición geométrica de la maniobra`
     - `## 3. Comprobación de elementos viarios, márgenes y distancias libres`
     - `## 4. Cuadro de conformidad normativa española y europea`
     - `## 5. Diligencia de responsabilidad y visado facultativo`
     - `Guía técnica, metodología cinemática y normativa`
     - `Capa de ortofotografías aéreas PNOA (IGN)`
- **Motivo:** Cumplir con los estándares de redacción técnica y académica en español según la RAE y la guía de estilo de `prose-guard-es`, eliminando calcos de mayúsculas del inglés y adaptando los campos de autoría a los requerimientos del usuario.
- **Alternativas consideradas:** Mantener mayúsculas en cada palabra (descartado por constituir un anglicismo ortotipográfico).
- **Consecuencias:** Informes y memorias oficiales con acabado profesional impecable, plenamente conformes con las normas de publicación de la ingeniería civil en España.
- **Estado:** VIGENTE



## DEC-017 - Carga de Archivos Geoespaciales GeoJSON y Georreferenciación Recíproca con Ortofoto PNOA (IGN)

- **Fecha:** 2026-11-11
- **Decisión:**
  1. Desarrollar el módulo autónomo `web/js/export/geojson_importer.js` que admite archivos `.geojson` y `.json` según el estándar RFC 7946, tanto con coordenadas geodésicas WGS84 / ETRS89 en grados sexagesimales como proyectadas UTM en metros (husos 28 a 31 de España).
  2. Proyectar las coordenadas geográficas al sistema métrico plano local de TurnSim mediante la misma formulación de Web Mercator (EPSG:3857) escalada por el coseno de la latitud del centroide ($\cos \text{lat}_0$) que utiliza el renderizador de teselas PNOA en `Viewer2D`:
     $$wx = (x_{3857} - \text{anchorX}_{3857}) \cdot \cos(\text{lat}_0)$$
     $$wy = (y_{3857} - \text{anchorY}_{3857}) \cdot \cos(\text{lat}_0)$$
     garantizando una coincidencia nanométrica exacta entre las líneas vectoriales del archivo y los píxeles de la ortofotografía aérea oficial del PNOA.
  3. Clasificación automatizada de capas y propiedades (`eje`/`centerline` a maniobra cinemática; `bordillo`/`curb` a obstáculos de borde; `isleta`/`island` a islotes y rotondas; `edificio`/`building` a obstáculos tridimensionales; `mobiliario` a columnas/farolas; `calzada` a líneas de fondo técnico).
  4. Georreferenciación reactiva instantánea: al cargar un archivo GeoJSON, la capa PNOA se activa y centra automáticamente en las coordenadas del archivo (`centerLat`, `centerLon`), sincronizando el selector de capas y ajustando la cámara con `fitToScene()`.
  5. Creación del archivo de prueba representativo `ejemplo_glorieta_espana.geojson` (Glorieta M-501 en Boadilla del Monte, Madrid) con bordillos, islote central, isletas deflectoras, báculos de iluminación y eje de maniobra.
- **Motivo:** Proporcionar al proyectista de carreteras e ingeniería civil la capacidad de importar cartografía SIG y datos de planeamiento territorial directamente en formato abierto GeoJSON, visualizándolos con perfecta alineación espacial sobre la ortofotografía aérea oficial del Instituto Geográfico Nacional.
- **Alternativas consideradas:** Delegar la conversión en herramientas GIS externas como QGIS (descartado por romper la autonomía monobloque en el navegador).
- **Consecuencias:** Coexistencia nativa entre planos CAD (.DXF) y cartografía GIS (.GeoJSON), georreferenciación automática sin pasos manuales y máxima precisión de análisis sobre imágenes aéreas de alta resolución.
- **Estado:** VIGENTE



## DEC-018 - Persistencia de Pose Base en Reposo al Borrar Trazado (UX de Limpieza de Maniobra)

- **Fecha:** 2026-11-11
- **Decisión:**
  1. En `clearVehicleTrajectory()`, cancelar de forma síncrona cualquier temporizador activo (`clearTimeout(this._recomputeTimer)`), limpiar los waypoints en el visor en modo silencioso (`this.viewer2D.clearWaypoints(true)`) para prevenir disparos recursivos desfasados, y resetear `this.maneuver.segments = []`.
  2. En `recomputeAll()`, cuando `segments` está vacío, no asignar `simResult = null` (lo que provocaba la desaparición total del camión de la pantalla al ocultar `Viewer2D` y `Viewer3D` la malla del vehículo), sino generar un estado de simulación de reposo estático mediante `buildCompleteSimulationResult` en la pose de partida $(X_0, Y_0, \theta_0, \gamma_0)$.
  3. Este estado de reposo contiene exactamente 1 fotograma, mantiene el modelo 2D y 3D visible en su punto de origen en la calzada, inicializa el slider en 0/0, sitúa el PK en 0.00 m, y actualiza el panel de telemetría indicando `LISTO (VEHÍCULO EN REPOSO)`.
  4. La herramienta `✏️ Trazar ruta` y los botones de adición de tramos quedan inmediatamente operativos para trazar una nueva trayectoria a partir de la posición del vehículo.
- **Motivo:** Resolver la incidencia reportada por el usuario en la que la herramienta «Borrar trazado» parecía no funcionar o hacía desaparecer el camión, impidiendo iniciar una nueva maniobra con feedback visual adecuado.
- **Alternativas consideradas:** Reestablecer la maniobra a un escenario predeterminado (descartado porque el usuario desea limpiar para dibujar su propio trazado desde cero).
- **Consecuencias:** Comportamiento intuitivo, robusto e instantáneo: el vehículo vuelve al reposo en su origen listo para trazar una nueva ruta, sin parpadeos ni desapariciones de elementos.
- **Estado:** VIGENTE



## DEC-019 - Inicialización en Visor Vacío con Indicación Inicial, Pestaña 1 por Defecto y Reubicación de Banner de Asistencia

- **Fecha:** 2026-11-11
- **Decisión:**
  1. **Visor vacío al inicio:** Al cargar la aplicación, el visor se inicializa completamente limpio (`simResult = null`), sin dibujar el camión ni envolventes, mostrando en el centro una caja técnica con indicación inicial clara: «Para comenzar una simulación: ✏️ Pulse «Trazar ruta» para dibujar una trayectoria sobre el plano · 📂 O cargue un plano CAD (.DXF) o cartografía geoespacial (.GeoJSON)».
  2. **Pestaña activa al inicio:** La interfaz abre en la Etapa 1 («1. Escenario y Entorno CAD») tanto en el Stepper horizontal de la cabecera (`#step-node-1`), como en la barra de actividad lateral (`#act-btn-1`), el título de la gaveta (`#drawer-active-title`) y el bloque de contenido (`#stage-block-1`), dejando el drop zone de archivos CAD/GeoJSON accesible inmediatamente.
  3. **No-obstrucción de la botonera:** Se reubica el banner de asistencia del modo trazado (`waypointMode`) en el lienzo 2D desde la parte superior (`by = 16`, que tapaba la barra de herramientas del visor) a la parte inferior central (`by = this.height - 42`), garantizando que los botones de herramientas (`✏️ Trazar ruta`, `🗑️ Borrar trazado`, `📏 Medir`, `🛰️ Ortofoto PNOA`, `⚙️` y buscador toponímico) queden 100% visibles y accesibles en todo momento.
- **Motivo:** Atender con exactitud a las tres directrices de usabilidad solicitadas por el usuario, evitando sobrecarga visual inicial y solapamientos de controles en el visor técnico.
- **Alternativas consideradas:** Mantener el banner arriba desplazado a la izquierda (descartado por colisionar con los botones de vista 2D/3D).
- **Consecuencias:** Experiencia de bienvenida limpia y orientada a la acción, flujo natural desde la etapa 1 y ergonomía técnica sin solapamiento de textos sobre botones.
- **Estado:** VIGENTE

## DEC-020 - Trazado mediante Spline CAD continua (Catmull-Rom Centripetal)

- **Fecha:** 2026-11-12
- **Decisión:** Implementar la generación y visualización de rutas por puntos de paso (waypoints) mediante Splines CAD continuas con formulación Catmull-Rom Centripetal ($\alpha = 0.5$) como método principal por defecto, manteniendo selector dual con el método de polilínea con acuerdos circulares tradicionales (Fillet R).
- **Motivo:** Evitar los cambios angulares bruscos y quiebros en vértices que se producen al forzar empalmes circulares cuando los puntos están próximos, dotando al usuario de flexibilidad y continuidad en el dibujo de curvas (glorietas, eses y accesos logísticos) idéntica a los paquetes CAD viarios profesionales (AutoTURN, Civil 3D, MicroStation).
- **Alternativas consideradas:**
  1. Spline B-Spline / Bézier aproximante: descartada porque no pasa estrictamente por los puntos clicados por el usuario, obligando a manejar polos externos no intuitivos.
  2. Forzar un paso fino de Pure Pursuit síncrono sin segmentos: descartada para preservar la compatibilidad con el formato DXF (exportación de arcos/rectas tangenciales) y la simulación multieje y marcha atrás.
- **Consecuencias:** Maniobras suaves y continuas sin saltos de volante artificiales en la telemetría, comprobación en tiempo real de viabilidad frente al radio mínimo del camión y compatibilidad 100 % con el motor cinemático RK4, exportaciones e historial de deshacer/rehacer.
- **Estado:** VIGENTE

## DEC-021 - Interpolación cúbica PCHIP anti-overshoot en splines de trazado y avance temporal por velocidad métrica constante en representación

- **Fecha:** 2026-11-12
- **Decisión:**
  1. Sustituir la interpolación estándar de Catmull-Rom por interpolación de Hermite con preservación de forma (PCHIP - Piecewise Cubic Hermite Interpolating Polynomial) en `sampleCatmullRomSpline` y `samplePchipSpline`, limitando las derivadas locales según la pendiente de los intervalos contiguos.
  2. Alinear la pose inicial del vehículo (`startPose`) considerando el eje de referencia de dirección (`steeringReferencePoint`): si se selecciona `front_axle` (obligatorio en vehículos de la normativa española 3.1-IC), la posición inicial del eje motriz se retrocede la distancia de batalla ($L_{wb}$) en la dirección del primer tramo, garantizando que el eje director coincida milimétricamente con el primer punto clicado en el plano.
  3. Ejecutar las splines en `simulateManeuver()` como tramos cinemáticos directos continuos (`seg.type === "spline"`), integrando punto a punto sin segmentación discreta aproximada y acotando el radio cinemático mínimo mediante la batalla y el ángulo máximo de dirección en vez de forzar un radio artificial de $0,5\text{ m}$.
  4. Sustituir el avance de animación por estados por segundo (`dt * 28.0`) en `_startAnimationLoop()` por un avance isométrico a velocidad constante en calzada: $\Delta s = v_{\text{nominal}} \cdot \text{playSpeed} \cdot dt$ ($v_{\text{nominal}} = 2,0\text{ m/s}$), indexando los estados mediante búsqueda binaria sobre la distancia métrica acumulada (`dist`).
- **Motivo:**
  1. Catmull-Rom generaba sobreoscilaciones (sag) de hasta $-1,25\text{ m}$ al inicio de curvas cerradas y la segmentación anterior introducía derivas que provocaban un barrido del semirremolque fuera de la línea dibujada.
  2. En curvas con paso angular fijo de $0,5^\circ$, el avance por estados hacía que el camión acelerara de forma desmesurada en curvas abiertas ($v \propto R \cdot \Delta\theta$), pasando de $1,4\text{ m/s}$ en recta a más de $6\text{ m/s}$ en curvas de $R = 25\text{ m}$.
- **Alternativas consideradas:** Mantener avance por fotogramas recalculando un factor corrector por curvatura local (descartado por complejidad y potencial fluctuación temporal).
- **Consecuencias:** Coincidencia milimétrica de la trayectoria con la línea dibujada en pantalla, eliminación total de látigos o invasiones indeseadas del semirremolque y reproducción visual fluida y realista a velocidad métrica rigurosamente constante en cualquier tipo de alineación (recta, curva o spline).
- **Estado:** VIGENTE

## DEC-022 - Autoencuadre dinámico de escena al activar el visor 3D

- **Fecha:** 2026-11-12
- **Decisión:**
  1. En `setViewMode(mode)`, cada vez que el usuario selecciona el modo de visualización `3d` o `split` (mediante los botones `.view-mode-btn` del HUD superior o de la gaveta lateral de capas), se invoca automáticamente `viewer3D.fitToScene()` tras el reajuste del layout (`viewer3D.resize()`).
  2. Ampliar el cálculo de la caja envolvente en `Viewer3D.fitToScene()` para englobar no solo los centros de ejes de la maniobra, sino también los vértices poligonales del tractor y semirremolque (`s.tractorPolygon`, `s.trailerPolygon`), el perímetro de la envolvente de barrido (`simResult.envelope`), los obstáculos activos, las entidades de fondo CAD y los puntos de paso (waypoints).
  3. Configurar el objetivo orbital (`controls.target`) en el centroide tridimensional $(\bar{x}, 0, -\bar{y})$ y la cámara en perspectiva isométrica con ángulo de elevación óptimo y distancia proporcional a la diagonal del escenario ($span$), garantizando que todo el camión y su entorno queden centrados y a la vista.
- **Motivo:** Evitar que al cambiar al visor 3D la cámara quede descolocada en coordenadas por defecto o vacías, obligando al usuario a pulsar atajos de teclado adicionales (`KeyF`) o mover manualmente los controles para localizar el camión.
- **Alternativas consideradas:** Requerir al usuario pulsar el botón de encuadre manual (descartado por perjudicar la inmediatez de uso).
- **Consecuencias:** Experiencia fluida e instantánea: al hacer clic en «Visor 3D» o «Dividida 2D+3D», la escena 3D se visualiza perfectamente centrada y proporcionada desde el primer instante.
- **Estado:** VIGENTE

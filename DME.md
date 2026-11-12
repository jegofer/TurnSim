# Documento maestro de especificaciones (DME)

## 1. Identificación del proyecto
- **Nombre:** TurnSim / Open Swept Path Analyzer (OSPA)
- **Repositorio:** `https://github.com/jegofer/TurnSim`
- **Tipo de aplicación:** Software científico-técnico y herramienta web de ingeniería civil, diseño geométrico de carreteras y análisis de trayectorias de barrido de vehículos pesados (*Swept Path Analysis*).
- **Entorno de ejecución:** 100% cliente en navegador web (JavaScript ES2022 modular y paquete monolítico autónomo compatible con protocolo `file://` sin dependencias de servidor).

## 2. Objetivo principal
Proporcionar una alternativa profesional, libre y científicamente rigurosa a soluciones comerciales como AutoTURN o Vehicle Tracking, permitiendo modelizar, simular cinemáticamente, detectar interferencias y acotar envolventes de giro de vehículos rígidos, articulados (tractora con semirremolque) y conjuntos multicuerpo (trenes de carretera de 18,75 m y megacamiones EMS de 25,25 m) sobre cartografía base y planos CAD (DXF).

## 3. Alcance
- Cinemática de vehículos rígidos y articulados de enganche por quinta rueda o enganche en voladizo (barra de tracción/lanza).
- Cálculo de trayectorias de barrido mediante integración numérica Runge-Kutta de 4º orden (RK4) y modelo de cuerda cerrada de contraste (*schlepp*).
- Generación de envolventes perimetrales continuas mediante uniones booleanas y cálculo de offset poligonal con márgenes de seguridad redondeados (Clipper / ClipperOffset).
- Detección continua de colisiones (*Continuous Collision Detection*, CCD) con cápsula convexa frente a obstáculos poligonales y circulares analíticos.
- Compatibilidad CAD: Importación de capas vectoriales DXF (R12 a 2018), autodetección de ejes y obstáculos, y exportación multicapa DXF (con acotaciones de ancho de barrido) y SVG métrico.
- Trazado interactivo de rutas mediante puntos de paso (*waypoints*) con cálculo automático de acuerdos circulares tangentes.
- Verificación reglamentaria automática de la corona de giro según Directiva 96/53/CE y Reglamento (UE) 1230/2012 / 2021/535 Anexo XIII.

## 4. Fuentes de información
- Directiva 96/53/CE del Consejo y Reglamento (UE) 1230/2012 / Reglamento de Ejecución (UE) 2021/535 (Anexo XIII: maniobrabilidad y barrido de vehículos pesados).
- Norma 3.1-IC Trazado de la Instrucción de Carreteras (Ministerio de Transportes y Movilidad Sostenible de España).
- Publicaciones técnicas y contrastes analíticos de la curva tractriz (Leibniz, Huygens) y modelos cinemáticos de arrastre (*Schleppkurven* / FGSV).
- Repositorio y código de contraste: `brombirium/schlepp` (modelo de cuerda simple para validación cruzada).

## 5. Datos de partida
- Catálogo de vehículos comerciales y normativos parametrizados con dimensiones de ficha técnica: Renault Trucks T 480 (4x2) + Schmitz Cargobull S.KO Cool, Mercedes Actros 1845 LS + Schmitz S.CS, DAF XF 480 + Semirremolque estándar europeo (13,62 m), Volvo FH 500, Scania R 450, camiones rígidos de 2 y 3 ejes, autobuses de 12 m y 15 m, tren de carretera de 18,75 m y conjunto modular EMS de 25,25 m (B-Double).
- Fórmulas de batalla efectiva (*effective wheelbase*) para trídem con ejes fijos y autodireccionales pasivos.

## 6. Sistema de referencia / formatos / estándares
- **Sistema de coordenadas interno:** Coordenadas cartesianas locales métricas (m) con orientación matemática estándar ($0^\circ$ en eje $+X$, ángulos positivos en sentido antihorario).
- **Georreferenciación:** Compatibilidad con coordenadas UTM ETRS89 / EPSG:25830 mediante compensación local de offset para evitar pérdida de precisión flotante en punto simple de 32/64 bits.
- **Formatos de intercambio:** DXF (ASCII R12-2018), SVG con escala métrica, JSON (`.turnsim.json`) para persistencia de proyectos.

## 7. Requisitos técnicos
- Funcionamiento sin servidor (autónomo y offline, sin bloqueos CORS bajo `file://`).
- Arquitectura de cálculo asíncrono desacoplada: Web Worker para cálculos pesados con repliegue transparente a hilo principal síncrono si el entorno bloquea workers en local.
- Precisión analítica: Deriva angular en tractriz $< 10^{-11}\text{ rad}$ frente a solución analítica, estabilidad de batalla fija con error $< 10^{-14}\text{ m}$.
- Sin fugas de memoria ni acumulación indefinida de polígonos durante la simulación interactiva.

## 8. Criterios y decisiones adoptadas
- Prioridad absoluta a la corrección matemática y fiabilidad ingenieril sobre efectos cosméticos visuales.
- Uso de integrador RK4 como método estándar para ecuaciones diferenciales de arrastre de semirremolque y arcos circulares.
- Implementación de un visor inicial en blanco (esperando acción de dibujo o carga de plano) para evitar simulaciones fantasma o confusiones de coordenadas.
- Entrada polimórfica en constructores de maniobra: soporte idéntico para pares `[x, y]` y objetos `{x, y, radius}`.

## 9. Metodología de trabajo
- Desarrollo guiado por pruebas de verificación matemática y geométrica continua (`tests/test_engine.mjs`).
- Generación automática de versiones cliente monolíticas mediante script de empaquetado (`scripts/build_standalone_html.mjs`).
- Auditoría técnica multidisciplinar estructurada en informes independientes para validar fundamentos mecánicos, geométricos y de software.

## 10. Productos y resultados esperados
- Aplicación web interactiva 2D (Canvas) y 3D (Three.js) de trazado y simulación de giros.
- Paquete HTML independiente `TurnSim_Standalone.html` e `index.html` sin dependencias externas.
- Archivos de intercambio DXF y SVG métricos con trazado de bandas de rodadura, envolventes de carrocería y cotas transversales de barrido.
- Informes de verificación normativa según estándares europeos de accesos y glorietas.

## 11. Estructura de archivos
- `/web/js/engine/`: Núcleo cinemático (`kinematics.js`), envolventes poligonales (`envelope.js`), colisiones y escenarios (`collisions.js`).
- `/web/js/view2d/`: Visor interactivo 2D sobre Canvas HTML5 (`viewer2d.js`).
- `/web/js/view3d/`: Visor tridimensional basado en Three.js (`viewer3d.js`).
- `/web/js/export/`: Importador CAD (`dxf_importer.js`) y exportadores DXF/SVG (`exporters.js`).
- `/web/js/models/`: Catálogo y cálculo geométrico de vehículos (`vehicles.js`).
- `/web/js/app.js`: Controlador principal de interfaz y gestión de estado.
- `/tests/`: Batería de pruebas numéricas e ingenieriles (`test_engine.mjs`).
- `/scripts/`: Scripts de empaquetado autónomo (`build_standalone_html.mjs`).
- `/TurnSim_Engineering_Audit/`: Informes técnicos de la auditoría matemática y estructural.

## 12. Estado actual del proyecto
- Motor cinemático y geométrico plenamente validado (47/47 pruebas unitarias superadas).
- Trazador interactivo de rutas por waypoints corregido y verificado: posicionamiento en P1, cálculo dinámico a partir de P2 y reproducción fluida.
- Carga e importación de planos CAD DXF operativa con ajuste automático de escala (`fitToScene`).
- Pantalla inicial limpia y en reposo hasta interacción del usuario.

## 13. Tareas completadas
- Ejecución completa de las Fases 1, 2 y 3 del plan de mejoras y auditoría técnica.
- Corrección de visualización de planos CAD y recalibrado del zoom de escena.
- Resolución de la incidencia de waypoints con valores `NaN` y congelación de animación.
- Integración de Web Worker con soporte de vehículo completo en paquetes autónomos.
- Mantenimiento y verificación de 47 pruebas analíticas y normativas.

## 14. Tareas pendientes
- Implementar la importación directa de alineaciones complejas desde LandXML o archivos de trazado civil.
- Ampliar el catálogo de vehículos con configuraciones especiales de transporte especial (góndolas de ejes múltiples direccionales forzados).
- Generación de informe PDF de justificación técnica para visados de proyectos de carreteras.

## 15. Incidencias y problemas conocidos
- INC-001: Desplazamiento del vehículo a (0, 0) y bloqueo de reproducción al trazar ruta con ratón (RESUELTA).
- INC-002: Planos CAD DXF no visibles al cargar por escala inicial fija (RESUELTA).
- INC-003: Referencia indefinida a funciones de vehículo dentro del Web Worker en compilaciones autónomas (RESUELTA).

## 16. Soluciones adoptadas
- Polimorfismo en `buildSegmentsFromWaypoints` para admitir tuplas `[x, y]` y objetos `{x, y}`.
- Inclusión del módulo `vehicles.js` en el script generador de código en línea para Web Worker.
- Inclusión de entidades CAD y waypoints en el cálculo de extensión espacial del método `fitToScene`.

## 17. Restricciones y aspectos que NO deben modificarse
- No romper la autonomía local (`file://` sin servidor HTTP ni dependencias de CDN en tiempo de ejecución).
- No degradar el método de integración RK4 a Euler simple en giros cerrados ni comprometer la precisión de la batalla rígida.
- No modificar las dimensiones declaradas en el catálogo normativo de vehículos sin contrastar ficha técnica de fabricante.

## 18. Información pendiente de verificar
- Comportamiento de convergencia en maniobras marcha atrás con más de 2 remolques articulados en cascada para ángulos de tijera $> 90^\circ$.
- Precisión de importación de entidades SPLINE de AutoCAD de orden $> 3$ aproximadas por polilíneas discretizadas.

## 19. Criterios de control de calidad
- Ejecución de `node tests/test_engine.mjs` con 100% de pruebas superadas tras cualquier modificación del motor.
- Comprobación de que `node scripts/build_standalone_html.mjs` regenera todos los ficheros HTML sin errores.
- Verificación de ausencia de advertencias de consola o referencias no definidas en navegadores modernos (Chromium, Firefox, WebKit).

## 20. Historial de cambios del DME
- **2026-11-09:** Creación inicial del documento maestro conforme a la estructura de 20 secciones tras la auditoría técnica y la resolución de incidencias en el trazador interactivo y motor cinemático.

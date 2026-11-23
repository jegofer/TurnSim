# CONTEXTO DE SESIÓN

## PROYECTO
TurnSim / Open Swept Path Analyzer (OSPA)

## OBJETIVO
Herramienta web de cálculo cinemático de giros y análisis de trayectorias de barrido de vehículos pesados (*Swept Path Analysis*) orientada a ingeniería de carreteras, 100% autónoma y ejecutable en navegador sin servidor.

## SITUACIÓN ACTUAL
Motor cinemático, envolventes y detección de colisiones plenamente validados con la normativa española de carreteras (Norma 3.1-IC y Guía de Nudos Viarios OC 32/2012). 62/62 pruebas unitarias superadas en `test_engine.mjs` y 20/20 pruebas superadas en `test_normativa_espanola.mjs` (82 pruebas en total, 100% PASS). La aplicación es 100% monobloque e independiente (`file://` o HTTP), soporta maniobras combinadas avance/marcha atrás desde cualquier vértice (menú contextual clic derecho, conmutador `D/R` + tecla `R` y detección automática de cúspides $> 125^\circ$), cálculo booleano optimizado (Divide & Conquer en Clipper, offset reutilizado, ventana deslizante $O(1)$ y poda AABB en colisiones CCD de `s.trailers`), y generación de informes técnicos con planta enfocada al `bbox + 2 m` de la trayectoria, plano general de situación en la esquina superior izquierda y formulario de diligencia técnica en el panel 6.

## ÚLTIMO TRABAJO REALIZADO
- **Informe Técnico Enfocado (`bbox + 2 m`), Plano General y Diligencia Técnica (DEC-023):**
  - Apartado 3 del informe HTML/PDF (`web/js/export/exporters.js`): planta principal recortada al `bbox + 2,0 m` de la trayectoria de barrido (`focusOnTrajectory: true`) para ver en detalle la envolvente y contexto inmediato, con recuadro flotante en la esquina superior izquierda («Situación general») mostrando el plano CAD/GeoJSON completo e indicador `#detail-viewport-indicator`.
  - Formulario de **Diligencia técnica del proyecto** en el panel 6 (`Autor del estudio`, `Colegiado n.º`, `Fecha`, `Organismo o consultora`) con inyección en HTML/PDF y Markdown y persistencia en `.turnsim.json` (`TEST-44`).
- **Aceleración del Motor de Envolventes, Colisiones y Preview Interactivo (DEC-024 / INC-008):**
  - Unión booleana jerárquica por bloques (`CHUNK_SIZE = 36`) en `computeSweptEnvelope`, reutilización de `baseExPolygons` para `ClipperOffset` (eliminando la doble unión booleana) y punteros monótonos $O(1)$ en `computeCrossSectionWidth` (`web/js/engine/envelope.js`).
  - Corregida la ausencia de poda AABB en `s.trailers` y sus cápsulas CCD en `evaluateObstacleInterferences` (`web/js/engine/collisions.js`), añadiendo búsqueda semilla inicial `seedIdx`/`centerSeedIdx` (reducción de **7.585 ms a 898 ms** en 60 obstáculos de 20 vértices).
  - Diferido `viewer3D.setData` cuando `viewMode === "2d"` y modo `previewMode` ligero al arrastrar waypoints (`TEST-45`).
- **Maniobras Combinadas Avance / Marcha Atrás en Vértices (DEC-025):**
  - `splitWaypointsByDirection` en `web/js/engine/kinematics.js` con partición automática en sub-tramos, tangente inicial acoplada (`initialTangentRad`) en cúspides, corrección exacta `front_axle` en retroceso y detección automática opcional de cúspides ($\Delta\theta \ge 125^\circ$).
  - Menú contextual `#wp-context-menu` con clic derecho sobre cualquier vértice, conmutador `▶ Avance (D) / ◀ Retroceso (R)` + tecla `R`, diferenciación visual en planta 2D (azul avance / ámbar discontinuo retroceso + insignia `⇄ R` / `⇄ D`) y prueba `TEST-46`.
- **Compilación y Subida a GitHub:**
  - Regenerados los 5 bundles monobloque (`node scripts/build_standalone_html.mjs`), verificadas `62/62` pruebas en `tests/test_engine.mjs` y `20/20` en `scripts/test_normativa_espanola.mjs`, y publicados los commits `f41d6ea`, `7da37a9`, `619b4be` y `1a0e2ec` en `origin/main`.

## PRÓXIMA ACCIÓN
- Preparación y ensayo de nuevos escenarios viarios complejos (curvas en S sin recta intermedia, glorietas con radio interior $< 15\text{ m}$).

## DECISIONES IMPORTANTES
- El integrador numérico estándar para el arrastre del semirremolque es Runge-Kutta de 4º orden (RK4), garantizando error residual $< 10^{-11}\text{ rad}$ frente a la tractriz analítica.
- Las splines de trazado utilizan interpolación PCHIP para eliminar sobreoscilaciones y garantizar fidelidad estricta al trazado dibujado por el usuario.
- La velocidad de animación se calcula por distancia métrica acumulada a velocidad constante en calzada, evitando variaciones artificiales en curvas.
- Todo el software debe ejecutarse de forma 100% autónoma en local bajo `file://` sin dependencias de servidor ni bloqueos CORS.

## RESTRICCIONES IMPORTANTES
- No degradar el método de integración ni alterar las dimensiones de los perfiles de vehículos catalogados.
- Cada cambio en el código fuente debe validarse ejecutando `node tests/test_engine.mjs` y regenerando los paquetes autónomos mediante `node scripts/build_standalone_html.mjs`.

## PROBLEMAS ABIERTOS
- Ninguna incidencia activa (todas las incidencias reportadas han quedado resueltas).

## ARCHIVOS CLAVE
- `web/js/engine/kinematics.js`: Motor cinemático (RK4, tractriz analítica, PCHIP splines y generador de tramos).
- `web/js/app.js`: Orquestador de la aplicación, bucle de animación a velocidad métrica constante y sincronización de vistas.
- `web/js/view2d/viewer2d.js`: Visor 2D Canvas (renderizado, waypoints, planos CAD y cotas).
- `web/js/export/exporters.js`: Generador de memorias técnicas e informes imprimibles.

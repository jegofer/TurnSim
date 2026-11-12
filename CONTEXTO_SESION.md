# CONTEXTO DE SESIÓN

## PROYECTO
TurnSim / Open Swept Path Analyzer (OSPA)

## OBJETIVO
Herramienta web de cálculo cinemático de giros y análisis de trayectorias de barrido de vehículos pesados (*Swept Path Analysis*) orientada a ingeniería de carreteras, 100% autónoma y ejecutable en navegador sin servidor.

## SITUACIÓN ACTUAL
Motor cinemático y geométrico plenamente validado con la normativa española de carreteras (Norma 3.1-IC y Guía de Nudos Viarios OC 32/2012). 59/59 pruebas unitarias superadas en `test_engine.mjs` y 20/20 pruebas superadas en `test_normativa_espanola.mjs` (79 pruebas en total, 100% PASS). La aplicación es 100% monobloque e independiente, funciona al abrirse directamente por doble clic (`file://`) o HTTP, inicia con el visor limpio y enfocado en la acción con apertura directa en la Etapa 1 («1. Escenario y Entorno CAD»), dispone de presets oficiales españoles (F, C, T, A), soporte dual para planos CAD (.DXF) y cartografía geoespacial (.GeoJSON), georreferenciación milimétrica con la ortofoto aérea PNOA (IGN), buscador toponímico OpenStreetMap, trazado mediante Splines continuas PCHIP anti-overshoot y velocidad de animación métrica uniforme y rigurosamente constante en calzada.

## ÚLTIMO TRABAJO REALIZADO
- **Interpolación PCHIP Anti-Overshoot y Corrección de Barrido en Splines (DEC-021 / INC-007):**
  - Identificadas y subsanadas las causas de la desviación de la envolvente de barrido fuera de la línea dibujada:
    1. Desfase de origen por punto de referencia: con `steeringReferencePoint: 'front_axle'` (por defecto en vehículos españoles de la Norma 3.1-IC), `startPose` ubicaba el eje motriz trasero en el punto $P_0$, dejando el eje director desplazado hacia delante la distancia de batalla ($L_{wb}$ de 3,80 a 7,15 m). Se ajustó `buildSegmentsFromSplineWaypoints` para retroceder la pose inicial del eje motriz cuando la referencia es el eje director, logrando coincidencia milimétrica en el origen.
    2. Caída a radio de 0,5 m: en curvas cerradas donde $R \le L_{wb}$, la conversión cinemática fijaba un radio artificial de $0,5\text{ m}$ que provocaba giros extremos y latigazos del semirremolque. Se acotó el radio mediante $R_{\text{mín}} = L_{wb} / \tan(\delta_{\text{máx}})$.
    3. Sobreoscilación (sag) en Catmull-Rom: sustituida por interpolación cúbica de Hermite con preservación de forma (PCHIP) en `sampleCatmullRomSpline` y `samplePchipSpline`, anulando sobreoscilaciones en tangentes de entrada a curva.
    4. Ejecución cinemática directa de splines: implementado ejecutor para `seg.type === 'spline'` en `simulateManeuver()`, integrando punto a punto a lo largo de la spline sin degradación por segmentación en micro-arcos.
  - Corrección de radio en tramos rectos para asegurar finitud numérica en `TEST-43` (59/59 PASS).
- **Velocidad de Animación Constante en Maniobra (DEC-021 / INC-007):**
  - Identificada la causa de la aceleración del vehículo en tramos de curva: `_startAnimationLoop()` avanzaba un número fijo de estados discretos por segundo (`dt * 28.0`), provocando que en curvas donde $\Delta s = R \cdot \Delta\theta$, la velocidad en calzada se multiplicara en función del radio (de $1,4\text{ m/s}$ en recta a más de $6\text{ m/s}$ en curvas abiertas).
  - Implementado avance temporal isométrico a velocidad métrica constante en calzada ($v = 2,0\text{ m/s}$ a $1\times$): $\Delta s = v_{\text{nominal}} \cdot \text{playSpeed} \cdot dt$.
  - Mapeo exacto de distancia a fotograma mediante búsqueda binaria en el vector de estados (`_findFrameIndexForDist`).
  - Sincronización bidireccional de la distancia métrica acumulada (`currentAnimDistM`) en el deslizador temporal `#slider-timeline`, botón `#btn-play-reset`, salto a fotograma (`jumpToFrame`), avance paso a paso (`stepFrame`) y borrado de trazado.
- **Soporte Visual e Informes de Tramos Spline:**
  - En `_renderSegmentsListUI()` (`web/js/app.js`), diseño de tarjeta técnica para tramos `spline` mostrando longitud total y radio mínimo.
  - En `web/js/export/exporters.js`, formateo de tramos spline en la tabla del informe imprimible HTML y en la memoria técnica Markdown.
- **Autoencuadre Dinámico en Visor 3D (DEC-022):**
  - Implementado autoencuadre integral de la escena (`viewer3D.fitToScene()`) de forma automática cada vez que se pulsa el botón «Visor 3D» o «Dividida 2D+3D» en el HUD superior o en la gaveta lateral de capas.
  - Ampliado el cálculo del cuadro límite tridimensional para abarcar contornos del vehículo, semirremolque, envolventes, obstáculos y entidades CAD de fondo.
- **Compilación y Verificación de Pruebas:**
  - Regenerados los bundles monobloque (`web/index.html`, `web/simulacion_threejs.html`, `simulacion_threejs.html`, `index.html`, `TurnSim_Standalone.html`) mediante `node scripts/build_standalone_html.mjs`.
  - Verificada la suite completa de 59 pruebas en `tests/test_engine.mjs` (59 superadas, 0 fallidas).
  - Verificada la batería de validación con normativa española en `scripts/test_normativa_espanola.mjs` (20 superadas, 0 fallidas).

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

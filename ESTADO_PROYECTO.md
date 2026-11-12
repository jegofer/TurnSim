# Estado del proyecto

### Estado general
- **Proyecto:** TurnSim / Open Swept Path Analyzer (OSPA)
- **Objetivo:** Herramienta web de ingeniería civil para el análisis cinemático de trayectorias de barrido de vehículos pesados (*Swept Path Analysis*) sin dependencias de servidor.
- **Estado:** COMPLETADO / OPERATIVO
- **Fecha de actualización:** 2026-11-12
- **Última tarea completada:** 
  1. Interpolación cúbica PCHIP anti-overshoot en splines CAD de trazado (`sampleCatmullRomSpline` y `samplePchipSpline`), corrigiendo la sobreoscilación y la desviación del barrido fuera de la línea dibujada (INC-007 / DEC-021).
  2. Alineación milimétrica de origen cuando la referencia es el eje director delantero (`front_axle`) e integración directa de splines en `simulateManeuver()` (`seg.type === 'spline'`).
  3. Control de velocidad de animación constante en calzada en metros por segundo ($v = 2,0\text{ m/s}$ a $1\times$) mediante búsqueda binaria de distancia acumulada, eliminando la aceleración anómala en tramos de curva (INC-007 / DEC-021).
  4. Suite de pruebas con 59/59 pruebas generales y 20/20 pruebas normativas superadas al 100% (79 pruebas en total).
- **Próxima tarea que debe realizarse:** Según nuevas instrucciones del usuario.

### Progreso

| Tarea | Estado | Observaciones |
|---|---|---|
| Auditoría matemática, ingenieril y de arquitectura | COMPLETADA | Documentada íntegramente en `TurnSim_Engineering_Audit/` y `TurnSim_Audit/` |
| Auditoría documental de la Normativa Española | COMPLETADA | Extraída directamente de los PDFs de Norma 3.1-IC y Guía de Nudos Viarios (`docs/normativa/`) |
| Integración numérica Runge-Kutta 4º orden (RK4) | COMPLETADA | Deriva de tractriz analítica menor a $10^{-11}\text{ rad}$, validada en TEST-21 y VAL-ART-EQ |
| Envolvente continua de barrido con Clipper | COMPLETADA | Uniones booleanas sin autointersecciones y concordancia con Shapely dentro del 0,7% |
| Detección continua de colisiones (CCD) | COMPLETADA | Verificación con cápsula convexa que previene efecto túnel (TEST-24) |
| Distancias analíticas a obstáculos circulares y bordillos | COMPLETADA | Error de cuerda nulo comprobado en TEST-30 y TEST-31 |
| Cinemática multicuerpo en cascada (EMS 25,25 m y tren 18,75 m) | COMPLETADA | Implementada y verificada en TEST-28 y TEST-29 |
| Invarianza de coordenadas UTM ETRS89 | COMPLETADA | Cálculo local con restitución íntegra a coordenadas reales en DXF (TEST-26) |
| Validación numérica de Vehículos Patrón Españoles | COMPLETADA | 20 pruebas normativas superadas en `scripts/test_normativa_espanola.mjs` y benchmark Python |
| Reorganización documental de la carpeta `docs/` | COMPLETADA | Estructura limpia con `referencias_normativas/`, `normativa/`, `ingenieria/`, `validacion/`, `contexto/` |
| Presets de Vehículos Patrón Españoles (MEJ-01) | COMPLETADA | Furgón F, Camión C, Articulado T y Autobús A integrados en catálogo y selector UI |
| Selector de punto de referencia de dirección (MEJ-02) | COMPLETADA | Conmutación entre eje delantero director ($R_f$) y eje motriz ($R_r$) con conversión exacta $R_r = \sqrt{R_f^2 - L^2}$ |
| Muestreo angular adaptativo de envolventes (MEJ-03) | COMPLETADA | Implementado en `computeSweptEnvelope` con $\Delta\theta \le 1.5^\circ - 2.0^\circ$ y flecha cordal $< 2\text{ mm}$ (TEST-37) |
| Memoria técnica justificativa oficial PDF/MD (MEJ-04) | COMPLETADA | Generación y descarga directa de memorias con cuadro normativo oficial y diligencia colegial (TEST-38) |
| Curvas de telemetría a lo largo del recorrido PK | COMPLETADA | Corrección de NaN, sincronización dinámica de cursor, clic interactivo y test automatizado (TEST-39) |
| Capa de Ortofotografías Aéreas PNOA (IGN) | COMPLETADA | Streaming WMTS, proyección Web Mercator, conversor UTM, buscador de lugares y trazado directo sobre imagen aérea (TEST-40) |
| Traducción al español de controles y visor de telemetría | COMPLETADA | Botón «Borrar trazado», panel de telemetría, leyendas y rotulación de ejes en español técnico (TEST-40) |
| Buscador toponímico OSM y PNOA multiescala total | COMPLETADA | Buscador en barra de visor 2D con autocompletado OSM España y desbloqueo de niveles WMTS 4 a 20 sin corte a 1:1260 (TEST-41) |
| Normalización ortotipográfica en español (prose-guard-es) | COMPLETADA | Diligencia «Autor del estudio:», eliminación de mayúsculas a la inglesa en títulos, tablas y memorias (DEC-016) |
| Corrección de «Borrar trazado» con vehículo en reposo | COMPLETADA | Estado base estático, eliminación de timers zombi y vehículo siempre visible listo para nueva ruta (DEC-018) |
| Carga de GeoJSON con georreferenciación recíproca PNOA | COMPLETADA | Importador `geojson_importer.js`, autoalineación milimétrica con ortofoto IGN y test `TEST-42` (DEC-017) |
| Archivo de ejemplo de glorieta en España GeoJSON | COMPLETADA | Glorieta M-501 (Boadilla del Monte, Madrid) generada en `ejemplo_glorieta_espana.geojson` |
| Visor vacío inicial, Etapa 1 activa y asistencia no invasiva | COMPLETADA | Visor limpio al cargar con indicación inicial, apertura en Etapa 1 y banner reubicado abajo (DEC-019) |
| Trazado mediante Spline CAD continua (Catmull-Rom) | COMPLETADA | Trazado continuo suave para glorietas y accesos con test TEST-43 (DEC-020) |
| Interpolación PCHIP anti-overshoot y ajuste en origen | COMPLETADA | Monotonicidad estricta sin sag, alineación en eje director y tramos directos spline (DEC-021) |
| Velocidad de animación constante en calzada | COMPLETADA | Avance temporal por distancia métrica acumulada en lugar de estados por segundo (DEC-021) |
| Autoencuadre dinámico al activar Visor 3D | COMPLETADA | Reencuadre y cálculo de envolvente 3D integral al cambiar de vista (DEC-022) |
| Traducción al español de importador CAD/GIS y etapas | COMPLETADA | Modal de correspondencia de capas DXF, drop-zone, títulos de etapa y paridad bilingüe en i18n |

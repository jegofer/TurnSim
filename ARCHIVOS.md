# Registro de archivos y recursos

| Archivo | Ubicación | Tipo | Función | Estado | Importancia |
|---|---|---|---|---|---|
| `DME.md` | `./` | Documentación | Documento maestro de especificaciones y fuente de verdad técnica | Válido | Crítica |
| `ESTADO_PROYECTO.md` | `./` | Documentación | Resumen del estado actual del proyecto y tabla de progreso | Válido | Alta |
| `DECISIONES.md` | `./` | Documentación | Registro de decisiones técnicas y arquitectónicas acordadas | Válido | Alta |
| `INCIDENCIAS.md` | `./` | Documentación | Registro estructurado de problemas técnicos detectados y soluciones | Válido | Alta |
| `TODO.md` | `./` | Documentación | Planificación de tareas pendientes clasificadas por prioridad | Válido | Alta |
| `ARCHIVOS.md` | `./` | Documentación | Inventario de archivos clave verificados del proyecto | Válido | Alta |
| `CONTEXTO_SESION.md` | `./` | Documentación | Ficha concisa de contexto para arranque rápido en nuevas sesiones | Válido | Crítica |
| `CHANGELOG.md` | `./` | Documentación | Historial cronológico de cambios realizados en el proyecto | Válido | Media |
| `index.html` | `./` | Resultados finales | Paquete monobloque HTML autónomo para distribución y apertura local directa | Válido | Crítica |
| `TurnSim_Standalone.html` | `./` | Resultados finales | Copia autónoma con dependencias embebidas y visor 2D/3D integrado | Válido | Crítica |
| `web/index.html` | `./web/` | Archivos de trabajo | Interfaz HTML principal de la aplicación web de ingeniería | Válido | Crítica |
| `web/css/styles.css` | `./web/css/` | Archivos de trabajo | Hojas de estilo CSS responsivas para paneles, visores y controles | Válido | Media |
| `web/js/app.js` | `./web/js/` | Archivos de trabajo | Controlador orquestador de interfaz, eventos y ciclo de simulación | Válido | Crítica |
| `web/js/engine/kinematics.js` | `./web/js/engine/` | Archivos de trabajo | Núcleo cinemático: integración RK4, tractriz y generador de tramos | Válido | Crítica |
| `web/js/engine/envelope.js` | `./web/js/engine/` | Archivos de trabajo | Generación de envolventes perimetrales continuas y cotas de barrido | Válido | Crítica |
| `web/js/engine/collisions.js` | `./web/js/engine/` | Archivos de trabajo | Detección continua de colisiones (CCD) y distancias analíticas | Válido | Crítica |
| `web/js/models/vehicles.js` | `./web/js/models/` | Archivos de trabajo | Catálogo técnico de vehículos y cálculo de batallas efectivas de trídem | Válido | Crítica |
| `web/js/view2d/viewer2d.js` | `./web/js/view2d/` | Archivos de trabajo | Visor interactivo en Canvas 2D con soporte de planos CAD y waypoints | Válido | Crítica |
| `web/js/view3d/viewer3d.js` | `./web/js/view3d/` | Archivos de trabajo | Visor 3D interactivo en Three.js con sombras, chasis y ruedas | Válido | Alta |
| `web/js/export/dxf_importer.js` | `./web/js/export/` | Archivos de trabajo | Parser cliente de archivos CAD DXF con autodetección de capas | Válido | Alta |
| `web/js/export/geojson_importer.js` | `./web/js/export/` | Archivos de trabajo | Parser cliente de cartografía GeoJSON con georreferenciación recíproca PNOA | Válido | Alta |
| `web/js/export/exporters.js` | `./web/js/export/` | Archivos de trabajo | Generadores de archivos de salida en formato DXF multicapa y SVG métrico | Válido | Alta |
| `tests/test_engine.mjs` | `./tests/` | Scripts | Batería de 59 pruebas automáticas de verificación matemática e ingenieril | Válido | Crítica |
| `scripts/test_normativa_espanola.mjs` | `./scripts/` | Scripts | Batería de 20 pruebas automáticas de validación con la normativa española de carreteras | Válido | Crítica |
| `scripts/build_standalone_html.mjs` | `./scripts/` | Scripts | Script generador de los archivos HTML autónomos monobloque | Válido | Alta |
| `ejemplo_glorieta_espana.geojson` | `./` | Datos de prueba | Escenario de prueba geoespacial oficial (Glorieta M-501 Boadilla del Monte) | Válido | Alta |

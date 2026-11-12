# Tareas pendientes

## CRÍTICAS
*(Actualmente no existen tareas críticas bloqueantes; el núcleo cinemático, la interfaz y las pruebas unitarias se encuentran en estado verde al 100%).*

## ALTAS
- [x] **Trazado de rutas continuas mediante Spline CAD e interpolación PCHIP anti-overshoot (DEC-020 / DEC-021):**
  - **Por qué:** Evitar quiebros angulares en vértices y eliminar sobreoscilaciones (*sag*) en entradas de curva, logrando que el eje director recorra con exactitud milimétrica la traza dibujada por el usuario.
  - **Resultado:** Implementado en `web/js/engine/kinematics.js` con PCHIP, soporte nativo de tramos spline (`seg.type === 'spline'`), alineación en eje director y verificación en `TEST-43` (59/59 PASS).

- [x] **Control de velocidad isométrica constante en representación y animación (DEC-021):**
  - **Por qué:** El avance por estados discretos por segundo aceleraba visualmente el vehículo en tramos de curva abierta al ser el paso métrico proporcional al radio ($\Delta s = R \cdot \Delta\theta$).
  - **Resultado:** Implementado en `web/js/app.js` (`_startAnimationLoop` y `_findFrameIndexForDist`) con avance métrico constante a $2,0\text{ m/s}$ y sincronización completa con el slider temporal.

- [x] **Generación de informe técnico oficial de justificación (PDF / Markdown) (MEJ-04):**
  - **Por qué:** Los ingenieros de caminos precisan adjuntar a los proyectos de trazado y accesos una memoria técnica que certifique el cumplimiento del barrido, márgenes libres mínimos y radios normativos (Directiva 96/53/CE y Norma 3.1-IC).
  - **Resultado:** Implementado en `web/js/export/exporters.js`, `web/js/app.js` y `web/index.html` con exportación dual PDF y Markdown, validado en TEST-38.

- [ ] **Validación con casos de ensayo reales de obras lineales y glorietas complejas:**
  - **Por qué:** Corroborar la precisión en escenarios viarios con curvas en S enlazadas sin recta intermedia y glorietas de radio interior reducido ($R < 15\text{ m}$).
  - **Dependencias:** Trazador interactivo y parser DXF operativos.
  - **Archivos afectados:** `tests/test_engine.mjs`, `TurnSim_CAD_Test/`.
  - **Resultado esperado:** Conjunto de 3 escenarios de prueba basados en proyectos reales con márgenes de error documentados.

## MEDIAS
- [x] **Muestreo angular adaptativo en cálculo de envolvente de barrido (MEJ-03):**
  - **Por qué:** Optimizar la unión booleana de polígonos insertando estados intermedios según el salto angular acumulado ($\Delta \theta \le 1.5^\circ - 2.0^\circ$) en lugar de depender únicamente de un muestreo uniforme por longitud de arco.
  - **Resultado:** Implementado en `computeAdaptiveSampledIndices` (`web/js/engine/envelope.js`), reduciendo la flecha cordal a $< 2\text{ mm}$, validado en TEST-37.

- [ ] **Importador de alineaciones en formato LandXML:**
  - **Por qué:** Facilitar la importación directa de ejes proyectados desde herramientas de diseño civil (Autodesk Civil 3D, Istram, Clip).
  - **Dependencias:** Parser XML cliente.
  - **Archivos afectados:** `web/js/export/landxml_importer.js`, `web/js/app.js`.
  - **Resultado esperado:** Capacidad de cargar un archivo `.xml` LandXML y extraer automáticamente el eje de la carretera como secuencia de rectas, curvas circulares y clotoides.

- [ ] **Modelización de transporte especial con ejes direccionales forzados:**
  - **Por qué:** Los semirremolques de transporte especial (góndolas extensibles de 4 a 8 líneas de ejes) emplean dirección hidráulica forzada sincronizada con el ángulo de la quinta rueda en lugar de ejes fijos o autodireccionales pasivos.
  - **Dependencias:** `web/js/models/vehicles.js`, `web/js/engine/kinematics.js`.
  - **Archivos afectados:** `web/js/models/vehicles.js`, `web/js/engine/kinematics.js`.
  - **Resultado esperado:** Posibilidad de definir leyes de giro forzado $\delta_i = k_i \cdot \gamma$ para cada eje del semirremolque.

## BAJAS
- [ ] **Selector de colores y capas personalizadas para exportación DXF:**
  - **Por qué:** Adaptarse a las plantillas y normas gráficas de diferentes administraciones o empresas consultoras.
  - **Dependencias:** `exporters.js`.
  - **Archivos afectados:** `web/js/export/exporters.js`, `web/js/app.js`.
  - **Resultado esperado:** Diálogo de configuración previa a la descarga de archivos DXF.

- [ ] **Tema visual conmutable (Modo oscuro / Modo plano técnico claro):**
  - **Por qué:** Mejorar la visualización en entornos de oficina y facilitar capturas de pantalla sobre fondo blanco para informes impresos.
  - **Dependencias:** Sistema de variables CSS en `styles.css`.
  - **Archivos afectados:** `web/css/styles.css`, `web/js/view2d/viewer2d.js`.
  - **Resultado esperado:** Botón de cambio de tema que invierte contraste de cuadrícula, fondo y colores de trazado.

## IDEAS / MEJORAS FUTURAS
- [ ] **Comprobación de despeje inferior en perfiles longitudinales (*ground clearance*):**
  - **Por qué:** Evaluar el riesgo de empanzamiento en cambios bruscos de rasante cóncavos o convexos (vados y resaltos).
- [ ] **Plugin o conector de exportación para QGIS:**
  - **Por qué:** Facilitar el intercambio directo de capas de barrido con proyectos SIG territoriales en formato GeoJSON o GeoPackage.

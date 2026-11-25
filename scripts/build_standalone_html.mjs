/**
 * Empaquetador autónomo (sin dependencias externas) para generar los puntos de entrada HTML
 * (`web/index.html`, `web/simulacion_threejs.html` y `simulacion_threejs.html`) a partir de los
 * módulos ES6 en `web/js/` y `web/css/styles.css`.
 *
 * Garantiza que la aplicación funcione al 100 % tanto al abrirse directamente con doble clic
 * mediante el protocolo `file://` (sin errores CORS) como servida por HTTP.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT_DIR, "web");

function stripImportsAndExports(code) {
  return code
    // Eliminar sentencias import ... from "..."; (incluyendo multilínea)
    .replace(/import\s+[\s\S]*?from\s+["'][^"']+["']\s*;?/g, "")
    // Convertir export default function / class
    .replace(/export\s+default\s+function\s+/g, "function ")
    .replace(/export\s+default\s+class\s+/g, "class ")
    .replace(/export\s+default\s+[^;]+;?/g, "")
    // Convertir export class / export function / export const / export let en declaraciones estándar
    .replace(/export\s+(class|function|const|let|var)\s+/g, "$1 ")
    // Eliminar export { ... };
    .replace(/export\s*\{[^}]*\}\s*;?/g, "")
    .trim();
}

// 1. Generación de web/js/engine/worker_source.js con las funciones puras del motor (PERF-06)
const clipperRaw = fs.readFileSync(path.join(WEB_DIR, "js/vendor/clipper.js"), "utf8");
const vehRaw = fs.readFileSync(path.join(WEB_DIR, "js/models/vehicles.js"), "utf8");
const kinRaw = fs.readFileSync(path.join(WEB_DIR, "js/engine/kinematics.js"), "utf8");
const envRaw = fs.readFileSync(path.join(WEB_DIR, "js/engine/envelope.js"), "utf8");
const colRaw = fs.readFileSync(path.join(WEB_DIR, "js/engine/collisions.js"), "utf8");

const workerMessageHandler = `
self.onmessage = function(e) {
  var data = e.data || {};
  var id = data.id;
  var action = data.action;
  var payload = data.payload || {};
  if (action === "RECOMPUTE_ALL") {
    try {
      var simResult = buildCompleteSimulationResult(payload.vehicle, payload.maneuver, payload.options);
      var interferenceReport = evaluateObstacleInterferences(simResult, payload.obstacles, {
        safetyMargin: payload.safetyMarginM,
        enableCCD: !(payload.options && payload.options.previewMode)
      });
      self.postMessage({ id: id, success: true, simResult: simResult, interferenceReport: interferenceReport });
    } catch (err) {
      self.postMessage({ id: id, success: false, error: err ? err.message : "Error" });
    }
  } else if (action === "RECOMPUTE_INTERFERENCES") {
    try {
      var interferenceReport = evaluateObstacleInterferences(payload.simResult, payload.obstacles, payload.safetyMarginM);
      self.postMessage({ id: id, success: true, interferenceReport: interferenceReport });
    } catch (err) {
      self.postMessage({ id: id, success: false, error: err ? err.message : "Error" });
    }
  }
};
`;

const workerFullSource = `${stripImportsAndExports(clipperRaw)}\n\n${stripImportsAndExports(vehRaw)}\n\n${stripImportsAndExports(kinRaw)}\n\n${stripImportsAndExports(envRaw)}\n\n${stripImportsAndExports(colRaw)}\n\n${workerMessageHandler}`;
fs.writeFileSync(
  path.join(WEB_DIR, "js/engine/worker_source.js"),
  `export const INLINE_WORKER_SOURCE = ${JSON.stringify(workerFullSource)};\n`,
  "utf8"
);

const MODULE_ORDER = [
  "js/vendor/clipper.js",
  "js/vendor/earcut.js",
  "js/i18n/locales.js",
  "js/models/vehicles.js",
  "js/engine/kinematics.js",
  "js/engine/envelope.js",
  "js/engine/collisions.js",
  "js/engine/worker_source.js",
  "js/engine/worker_client.js",
  "js/export/exporters.js",
  "js/export/dxf_importer.js",
  "js/export/geojson_importer.js",
  "js/view2d/viewer2d.js",
  "js/view3d/viewer3d.js",
  "js/app.js"
];

const cssContent = fs.readFileSync(path.join(WEB_DIR, "css/styles.css"), "utf8");

const bundledJsParts = [];
for (const relMod of MODULE_ORDER) {
  const fullPath = path.join(WEB_DIR, relMod);
  const raw = fs.readFileSync(fullPath, "utf8");
  bundledJsParts.push(
    `/* === MÓDULO: ${relMod} === */\n` + stripImportsAndExports(raw)
  );
}
const bundledJs = `(function() {\n"use strict";\n\n${bundledJsParts.join("\n\n")}\n\n})();`;

const htmlDocument = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TurnSim (OSPA) — Simulador de Trayectorias de Barrido de Vehículos Pesados (Swept Path Analysis)</title>
  <meta name="description" content="Aplicación web técnica para el análisis cinemático y geométrico de trayectorias de barrido (Swept Path Analysis) de camiones articulados y vehículos pesados. Visualización 2D/3D, importación/exportación CAD DXF, detección de colisiones e informes PDF." />
  <meta name="keywords" content="swept path analysis, trayectoria de barrido, giro de camiones, vehículos articulados, tractriz, ingeniería civil, diseño viario, seguridad vial, logística industrial, CAD DXF, Directiva 96/53/CE" />
  <meta name="author" content="TurnSim / Open Swept Path Analyzer (OSPA)" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://ospa-turnsim.github.io/" />
  <link rel="alternate" hreflang="es" href="https://ospa-turnsim.github.io/" />
  <link rel="alternate" hreflang="en" href="https://ospa-turnsim.github.io/?lang=en" />
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#0f172a" />

  <!-- Open Graph / Social Sharing -->
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="es_ES" />
  <meta property="og:site_name" content="TurnSim / OSPA" />
  <meta property="og:title" content="TurnSim (OSPA) — Simulador de Trayectorias de Barrido de Vehículos Pesados" />
  <meta property="og:description" content="Simulador cinemático y geométrico en navegador para maniobras de vehículos articulados con soporte CAD DXF, visor 2D/3D sincronizado y control de colisiones." />

  <!-- Twitter Cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="TurnSim (OSPA) — Swept Path Analysis Web App" />
  <meta name="twitter:description" content="Análisis de envolventes de barrido, radios de giro e interferencias con obstáculos para vehículos pesados directamente en el navegador." />

  <!-- Favicon vectorial inline (0 peticiones de red adicionales, compatible con file://) -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%230f172a'/%3E%3Cpath d='M12 48 C12 26 26 14 52 14' stroke='%23ef4444' stroke-width='5' fill='none' stroke-dasharray='6 4'/%3E%3Cpath d='M22 52 C22 34 32 24 52 24' stroke='%2338bdf8' stroke-width='4' fill='none'/%3E%3Crect x='34' y='16' width='16' height='9' rx='2' fill='%230284c7'/%3E%3C/svg%3E" />

  <!-- Datos estructurados Schema.org JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "TurnSim — Open Swept Path Analyzer (OSPA)",
    "alternateName": ["TurnSim", "OSPA"],
    "description": "Simulador web de trayectorias de barrido (Swept Path Analysis) y verificación de gálibos horizontales para conjuntos articulados tractora-semirremolque.",
    "applicationCategory": "EngineeringApplication",
    "applicationSubCategory": "Civil Engineering & Transportation CAD",
    "operatingSystem": "All (Web Browser, HTML5 Canvas, WebGL)",
    "inLanguage": "es-ES",
    "isAccessibleForFree": true,
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR"
    },
    "featureList": [
      "Integración cinemática RK4 de tractora y semirremolque",
      "Cálculo exacto de envolvente de barrido y margen de seguridad",
      "Detección de colisiones e interferencias con obstáculos",
      "Importación y detección automática de capas CAD DXF",
      "Visualización 2D técnica y 3D interactiva sincronizada",
      "Exportación a DXF, SVG e informe técnico PDF"
    ]
  }
  </script>

  <!-- Three.js y OrbitControls para el visor 3D (con degradación elegante sin red) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <style>
${cssContent}
  </style>
</head>
<body>
  <div class="fusion-app-shell">
    <!-- 1. CABECERA HÍBRIDA (TOP NAVBAR + STEPPER + ACCIONES RÁPIDAS) -->
    <header class="top-navbar">
      <div class="brand-group">
        <div class="brand-badge">T</div>
        <div class="brand-title">TurnSim</div>
        <div class="project-pill" title="Título del proyecto o expediente de simulación">
          <input type="text" id="inp-project-name" value="Estudio de Seguridad Vial — Simulación de Barrido" class="project-name-input" />
        </div>
      </div>

      <!-- STEPPER COMPACTO DE 6 ETAPAS -->
      <nav class="header-stepper">
        <div class="stepper-pill active" data-stage="1" id="step-node-1">
          <div class="step-dot">1</div>
          <span>1. Escenario</span>
        </div>
        <span class="stepper-sep">▶</span>
        <div class="stepper-pill" data-stage="2" id="step-node-2">
          <div class="step-dot">2</div>
          <span>2. Vehículo</span>
        </div>
        <span class="stepper-sep">▶</span>
        <div class="stepper-pill" data-stage="3" id="step-node-3">
          <div class="step-dot">3</div>
          <span>3. Maniobra</span>
        </div>
        <span class="stepper-sep">▶</span>
        <div class="stepper-pill" data-stage="4" id="step-node-4">
          <div class="step-dot">4</div>
          <span>4. Simulación</span>
        </div>
        <span class="stepper-sep">▶</span>
        <div class="stepper-pill" data-stage="5" id="step-node-5">
          <div class="step-dot">5</div>
          <span>5. Análisis</span>
        </div>
        <span class="stepper-sep">▶</span>
        <div class="stepper-pill" data-stage="6" id="step-node-6">
          <div class="step-dot">6</div>
          <span>6. Exportar</span>
        </div>
      </nav>

      <!-- ACCIONES RÁPIDAS DE CABECERA -->
      <div class="header-actions">
        <button type="button" id="btn-jump-critical-pk" class="status-alert-badge" title="Situar la simulación en el punto de máxima proximidad u obstáculo crítico">
          <span>⚠️</span>
          <span id="btn-jump-critical-text">Ir al PK crítico</span>
        </button>
        <span id="global-interference-badge" class="status-banner-pill status-CLEAR">VERIFICANDO...</span>
        <button type="button" id="btn-undo" class="hdr-btn" title="Deshacer última acción (Ctrl+Z)" disabled>↩️</button>
        <button type="button" id="btn-redo" class="hdr-btn" title="Rehacer última acción (Ctrl+Y)" disabled>↪️</button>
        <button type="button" id="btn-save-project-top" class="hdr-btn" title="Guardar proyecto (.turnsim.json)">💾</button>
        <button type="button" id="btn-load-project-top" class="hdr-btn" title="Cargar proyecto (.turnsim.json)">📂</button>
        <button type="button" id="btn-lang-toggle" class="hdr-btn" title="Cambiar idioma / Switch language">🌐 EN</button>
        <button type="button" id="btn-open-methodology" class="hdr-btn" title="Consultar guía técnica, formulación cinemática RK4 y normativa">📘</button>
      </div>
    </header>

    <!-- Banner flotante de recuperación de guardado automático (UX-07) -->
    <div id="autosave-banner" class="autosave-banner" style="display:none;">
      <span class="autosave-text">💾 Sesión previa guardada detectada. ¿Desea recuperarla?</span>
      <button type="button" id="btn-restore-autosave" class="btn btn-primary btn-sm">Restaurar</button>
      <button type="button" id="btn-dismiss-autosave" class="btn btn-outline btn-sm">✕</button>
    </div>

    <!-- 2. CONTENIDO PRINCIPAL: BARRA DE ACTIVIDAD + GAVETA + ESPACIO CENTRAL -->
    <div class="app-layout">
      <!-- BARRA DE ACTIVIDAD VERTICAL (52 px) -->
      <aside class="activity-bar">
        <button type="button" class="act-btn active" data-stage="1" id="act-btn-1" title="1. Escenario y entorno CAD / GIS">📁</button>
        <button type="button" class="act-btn" data-stage="2" id="act-btn-2" title="2. Vehículo de diseño">🚛</button>
        <button type="button" class="act-btn" data-stage="3" id="act-btn-3" title="3. Maniobra y trazado">✏️</button>
        <button type="button" class="act-btn" data-stage="4" id="act-btn-4" title="4. Simulación cinemática y capas">⏱️</button>
        <button type="button" class="act-btn" data-stage="5" id="act-btn-5" title="5. Análisis de resguardo y obstáculos">⚠️</button>
        <button type="button" class="act-btn" data-stage="6" id="act-btn-6" title="6. Informes técnicos y exportación">📄</button>
        <div class="act-spacer"></div>
        <button type="button" class="act-btn" id="btn-toggle-sidebar" title="Plegar / desplegar panel lateral (Ctrl+B)">◀</button>
      </aside>

      <!-- GAVETA LATERAL RETRÁCTIL (DRAWER) -->
      <aside class="left-sidebar drawer-panel" id="left-sidebar">
        <div class="drawer-header">
          <span class="drawer-title" id="drawer-active-title">1. Escenario y entorno CAD / GIS</span>
          <button type="button" id="btn-close-drawer" class="drawer-close-btn" title="Plegar panel (Ctrl+B)">✕</button>
        </div>

        <div class="sidebar-scroll">
          <!-- ETAPA 1: ESCENARIO Y CAD -->
          <div class="stage-section-block" id="stage-block-1">
            <!-- Zona de Carga de archivo CAD DXF / GIS GeoJSON -->
            <div id="dxf-drop-zone" class="dxf-drop-zone" title="Arrastre aquí un archivo .dxf o uno o varios archivos .geojson, o haga clic para seleccionarlos">
              <div class="dxf-drop-title" data-i18n="dxf_drop_title">📂 Cargar plano CAD o GIS (.DXF, .GeoJSON)</div>
              <div class="dxf-drop-hint" data-i18n="dxf_drop_hint">Arrastre un DXF multicapa o 1 o varios GeoJSON (ejes + obstáculos), o haga clic para examinar</div>
              <input type="file" id="inp-dxf-file" accept=".dxf,.geojson,.json" multiple style="display:none;" />
            </div>

            <div class="form-group" style="margin-top:10px;">
              <label class="form-label" for="select-scenario">Escenario viario preconfigurado</label>
              <select id="select-scenario"></select>
            </div>

            <div class="nav-step-buttons">
              <button type="button" class="btn btn-primary btn-sm btn-block btn-goto-stage" data-target="2">Avanzar a 2. Vehículo ▶</button>
            </div>
          </div>

          <!-- ETAPA 2: VEHÍCULO DE DISEÑO -->
          <div class="stage-section-block" id="stage-block-2" style="display:none;">
            <!-- SECCIÓN A: SELECCIÓN DE VEHÍCULO -->
            <details class="panel-section" open>
              <summary><h2>A. Selección de vehículo de diseño</h2></summary>
              <div class="section-body">
                <div class="form-group">
                  <label class="form-label" for="select-vehicle">Conjunto articulado preconfigurado</label>
                  <select id="select-vehicle"></select>
                </div>

                <div class="subtitle-divider" style="margin-top:10px;">Selección independiente y combinaciones</div>
                <div class="form-group">
                  <label class="form-label" for="select-tractor">Cabeza tractora (4x2)</label>
                  <select id="select-tractor"></select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="select-trailer">Semirremolque (3 ejes)</label>
                  <select id="select-trailer"></select>
                </div>

                <div style="margin-bottom:5px;">
                  <span id="vehicle-verification-badge" class="badge badge-verified">Verificado</span>
                </div>
                <div id="vehicle-summary-box" class="vehicle-summary-box"></div>
                <div id="vehicle-validation-messages"></div>
              </div>
            </details>

            <!-- SECCIÓN B: PERSONALIZACIÓN GEOMÉTRICA -->
            <details class="panel-section">
              <summary><h2>B. Personalización geométrica</h2></summary>
              <div class="section-body">
                <div class="subtitle-divider">Cabeza tractora (4x2)</div>
                <div class="form-row">
                  <div>
                    <label class="form-label" for="inp-tr-wb">Batalla L<sub>wb</sub> (m)</label>
                    <input type="number" id="inp-tr-wb" step="0.05" min="2.5" max="6.5" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-tr-w">Anchura W (m)</label>
                    <input type="number" id="inp-tr-w" step="0.02" min="2.0" max="3.0" />
                  </div>
                </div>
                <div class="form-row-3">
                  <div>
                    <label class="form-label" for="inp-tr-fo">Vol. del. (m)</label>
                    <input type="number" id="inp-tr-fo" step="0.02" min="0.5" max="2.5" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-tr-ro">Vol. tras. (m)</label>
                    <input type="number" id="inp-tr-ro" step="0.02" min="0.4" max="2.5" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-tr-track">Vía ejes (m)</label>
                    <input type="number" id="inp-tr-track" step="0.02" min="1.6" max="2.4" />
                  </div>
                </div>
                <div class="form-row">
                  <div>
                    <label class="form-label" for="inp-tr-hitch" title="Positivo = por delante del eje motriz trasero">Avance 5.ª rueda h (m)</label>
                    <input type="number" id="inp-tr-hitch" step="0.02" min="-1.5" max="1.5" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-tr-steer">Ángulo máx. dir. δ (°)</label>
                    <input type="number" id="inp-tr-steer" step="0.5" min="25" max="55" />
                  </div>
                </div>

                <div id="badge-rigid-vehicle" class="badge-rigid-pill" style="display:none;">Vehículo rígido sin semirremolque (Cuerpo único)</div>
                <div id="group-trailer-params">
                  <div class="subtitle-divider">Semirremolque (3 ejes trídem)</div>
                  <div class="form-row">
                    <div>
                      <label class="form-label" for="inp-tl-wb">Kingpin a trídem L<sub>t</sub> (m)</label>
                      <input type="number" id="inp-tl-wb" step="0.05" min="4.5" max="11.0" />
                    </div>
                    <div>
                      <label class="form-label" for="inp-tl-w">Anchura W<sub>t</sub> (m)</label>
                      <input type="number" id="inp-tl-w" step="0.02" min="2.0" max="3.0" />
                    </div>
                  </div>
                  <div class="form-row-3">
                    <div>
                      <label class="form-label" for="inp-tl-fo">Vol. del. (m)</label>
                      <input type="number" id="inp-tl-fo" step="0.05" min="0.5" max="2.5" />
                    </div>
                    <div>
                      <label class="form-label" for="inp-tl-ro">Vol. tras. (m)</label>
                      <input type="number" id="inp-tl-ro" step="0.05" min="0.5" max="4.5" />
                    </div>
                    <div>
                      <label class="form-label" for="inp-tl-spacing">Sep. ejes (m)</label>
                      <input type="number" id="inp-tl-spacing" step="0.02" min="1.0" max="2.0" />
                    </div>
                  </div>
                  <div class="form-row">
                    <div>
                      <label class="form-label" for="inp-lim-artic">Límite tijera γ<sub>máx</sub> (°)</label>
                      <input type="number" id="inp-lim-artic" step="1" min="45" max="110" />
                    </div>
                    <div style="display:flex;align-items:flex-end;">
                      <button type="button" id="btn-reset-vehicle" class="btn btn-outline btn-block" style="margin:0;">Restaurar original</button>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <div class="nav-step-buttons form-row">
              <button type="button" class="btn btn-outline btn-sm btn-goto-stage" data-target="1">◀ Escenario</button>
              <button type="button" class="btn btn-primary btn-sm btn-goto-stage" data-target="3">3. Maniobra ▶</button>
            </div>
          </div>

          <!-- ETAPA 3: MANIOBRA Y TRAZADO -->
          <div class="stage-section-block" id="stage-block-3" style="display:none;">
            <!-- SECCIÓN C: CONFIGURACIÓN DE LA MANIOBRA -->
            <details class="panel-section" open>
              <summary><h2>C. Configuración de la maniobra</h2></summary>
              <div class="section-body">
                <div class="subtitle-divider">Posición y orientación inicial</div>
                <div class="form-row-3">
                  <div>
                    <label class="form-label" for="inp-pose-x">X<sub>0</sub> (m)</label>
                    <input type="number" id="inp-pose-x" step="0.5" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-pose-y">Y<sub>0</sub> (m)</label>
                    <input type="number" id="inp-pose-y" step="0.5" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-pose-heading">Azimut θ<sub>0</sub> (°)</label>
                    <input type="number" id="inp-pose-heading" step="5" />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label" for="inp-pose-artic">Articulación inicial tractora-remolque γ<sub>0</sub> (°)</label>
                  <input type="number" id="inp-pose-artic" step="2" min="-75" max="75" value="0" />
                </div>

                <div class="subtitle-divider">Trazado interactivo y tramos de maniobra</div>
                <div class="form-row" style="margin-bottom:8px;">
                  <button type="button" id="btn-draw-waypoints-sidebar" class="btn btn-primary btn-sm" style="flex:1;" title="Activar trazado / edición interactiva en el visor 2D (clic en plano para añadir o arrastrar puntos)">✏️ Trazar ruta 2D</button>
                  <button type="button" id="btn-clear-path-sidebar" class="btn btn-outline btn-sm" style="color:#f87171;border-color:#ef4444;" title="Borrar el trazado del vehículo y reiniciar la maniobra para empezar de nuevo" data-i18n="btn_clear_path">🗑️ Borrar trazado</button>
                </div>
                <div id="segments-list" class="segment-list"></div>
                <div class="form-row">
                  <button type="button" id="btn-add-straight" class="btn btn-outline btn-sm">+ Añadir recta</button>
                  <button type="button" id="btn-add-arc" class="btn btn-outline btn-sm">+ Añadir curva</button>
                </div>

                <details style="margin-top:8px;background:rgba(11,17,32,0.6);padding:6px 8px;border-radius:5px;border:1px solid #334155;">
                  <summary style="cursor:pointer;font-size:11.5px;font-weight:600;color:#38bdf8;">Generar por puntos de paso (Waypoints X, Y)</summary>
                  <div style="margin-top:6px;">
                    <label class="form-label" for="inp-waypoints-text">Lista de coordenadas X, Y [D|R] (una por línea)</label>
                    <textarea id="inp-waypoints-text" rows="3" style="width:100%;background:#0b1120;color:#f8fafc;border:1px solid #334155;border-radius:4px;font-family:monospace;font-size:11px;padding:5px;">0, 0
20, 0
20, 20</textarea>
                    <div style="margin-top:5px;display:flex;align-items:center;gap:6px;font-size:11px;color:#cbd5e1;">
                      <input type="checkbox" id="chk-auto-cusps" checked style="width:auto;margin:0;" />
                      <label for="chk-auto-cusps" style="margin:0;cursor:pointer;" data-i18n="lbl_auto_cusps">Detectar cúspides marcha atrás automáticamente (&gt; 125°)</label>
                    </div>
                    <div class="form-row-3" style="margin-top:5px;">
                      <div>
                        <label class="form-label" for="sel-waypoints-mode">Método trazado</label>
                        <select id="sel-waypoints-mode">
                          <option value="spline" selected>⚡ Spline CAD (Continuo)</option>
                          <option value="fillet">📐 Polilínea + Arcos R</option>
                        </select>
                      </div>
                      <div id="col-waypoints-radius" style="display:none;">
                        <label class="form-label" for="inp-waypoints-radius">Radio acuerdo (m)</label>
                        <input type="number" id="inp-waypoints-radius" value="12.5" step="0.5" min="5" />
                      </div>
                      <div>
                        <label class="form-label" for="sel-waypoints-dir">Sentido</label>
                        <select id="sel-waypoints-dir">
                          <option value="1">Avance</option>
                          <option value="-1">Marcha atrás</option>
                        </select>
                      </div>
                    </div>
                    <button type="button" id="btn-apply-waypoints" class="btn btn-primary btn-sm btn-block">Generar tramos desde puntos</button>
                  </div>
                </details>

                <div class="subtitle-divider">Paso de integración numérica</div>
                <div class="form-row">
                  <div>
                    <label class="form-label" for="inp-step-straight">Paso recta Δs (m)</label>
                    <input type="number" id="inp-step-straight" value="0.15" step="0.05" min="0.05" max="0.50" />
                  </div>
                  <div>
                    <label class="form-label" for="inp-step-arc">Paso curva Δθ (°)</label>
                    <input type="number" id="inp-step-arc" value="1.0" step="0.25" min="0.25" max="3.0" />
                  </div>
                </div>
              </div>
            </details>

            <div class="nav-step-buttons form-row">
              <button type="button" class="btn btn-outline btn-sm btn-goto-stage" data-target="2">◀ Vehículo</button>
              <button type="button" class="btn btn-primary btn-sm btn-goto-stage" data-target="4">4. Simulación ▶</button>
            </div>
          </div>

          <!-- ETAPA 4: SIMULACIÓN Y CAPAS -->
          <div class="stage-section-block" id="stage-block-4" style="display:none;">
            <!-- SECCIÓN D1: CAPAS Y VISUALIZACIÓN -->
            <details class="panel-section" open>
              <summary><h2>D. Capas técnicas visibles</h2></summary>
              <div class="section-body">
                <label class="form-label">Modo de visualización principal</label>
                <div class="view-mode-tabs">
                  <button type="button" class="view-mode-btn active" data-mode="2d">Planta 2D</button>
                  <button type="button" class="view-mode-btn" data-mode="3d">Visor 3D</button>
                  <button type="button" class="view-mode-btn" data-mode="split">Dividida 2D+3D</button>
                </div>

                <div class="subtitle-divider">Capas técnicas visibles</div>
                <div class="layers-grid">
                  <label class="layer-check"><input type="checkbox" id="chk-layer-envelope" checked /> Envolvente física</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-margin" checked /> Margen seguridad</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-wheels" checked /> Huellas de ruedas</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-refs" checked /> Trazas ejes ref.</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-ghosts" checked /> Siluetas paso</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-obstacles" checked /> Obstáculos viarios</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-ref-axes" checked /> Ejes viales de referencia</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-cad-bg" checked /> Plano fondo CAD</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-dims" checked /> Cotas y holguras</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-axles" checked /> Ruedas y kingpin</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-grid" checked /> Cuadrícula métrica</label>
                  <label class="layer-check"><input type="checkbox" id="chk-layer-pnoa" /> 🛰️ Ortofoto PNOA (IGN)</label>
                </div>
              </div>
            </details>

            <div class="nav-step-buttons form-row">
              <button type="button" class="btn btn-outline btn-sm btn-goto-stage" data-target="3">◀ Maniobra</button>
              <button type="button" class="btn btn-primary btn-sm btn-goto-stage" data-target="5">5. Análisis ▶</button>
            </div>
          </div>

          <!-- ETAPA 5: ANÁLISIS Y COLISIONES -->
          <div class="stage-section-block" id="stage-block-5" style="display:none;">
            <!-- SECCIÓN D2: MARGEN Y OBSTÁCULOS -->
            <details class="panel-section" open>
              <summary><h2>E. Margen y obstáculos viarios</h2></summary>
              <div class="section-body">
                <div class="subtitle-divider">Margen de seguridad y obstáculos</div>
                <div class="form-row">
                  <div>
                    <label class="form-label" for="inp-safety-margin">Margen lateral d<sub>seg</sub> (m)</label>
                    <input type="number" id="inp-safety-margin" value="0.30" step="0.05" min="0.0" max="2.0" />
                  </div>
                  <div style="display:flex;align-items:flex-end;">
                    <button type="button" id="btn-add-obstacle" class="btn btn-outline btn-block" style="margin:0;">+ Añadir obstáculo</button>
                  </div>
                </div>
                <div style="font-size:10.5px;color:#94a3b8;margin-bottom:5px;">
                  💡 En la vista 2D puede mover un obstáculo manteniendo pulsado <strong>Shift + arrastrar</strong>.
                </div>
                <div id="obstacles-list" class="obstacle-list"></div>
              </div>
            </details>

            <div class="nav-step-buttons form-row">
              <button type="button" class="btn btn-outline btn-sm btn-goto-stage" data-target="4">◀ Simulación</button>
              <button type="button" class="btn btn-primary btn-sm btn-goto-stage" data-target="6">6. Exportar ▶</button>
            </div>
          </div>

          <!-- ETAPA 6: INFORMES Y EXPORTACIÓN -->
          <div class="stage-section-block" id="stage-block-6" style="display:none;">
            <!-- SECCIÓN E: INFORMES Y EXPORTACIÓN -->
            <details class="panel-section" open>
              <summary><h2>F. Informes técnicos y exportación CAD</h2></summary>
              <div class="section-body">
                <div class="subsection-title" style="margin-top:0;" data-i18n="diligence_section_title">Diligencia técnica del proyecto</div>
                <div class="form-group">
                  <label for="inp-diligence-author" data-i18n="lbl_diligence_author">Autor del estudio</label>
                  <input type="text" id="inp-diligence-author" placeholder="Nombre y apellidos del técnico" />
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="inp-diligence-collegiate" data-i18n="lbl_diligence_collegiate">Colegiado n.º</label>
                    <input type="text" id="inp-diligence-collegiate" placeholder="N.º colegiado" />
                  </div>
                  <div class="form-group">
                    <label for="inp-diligence-date" data-i18n="lbl_diligence_date">Fecha</label>
                    <input type="text" id="inp-diligence-date" placeholder="Ej. 23/11/2026" />
                  </div>
                </div>
                <div class="form-group" style="margin-bottom:10px;">
                  <label for="inp-diligence-organization" data-i18n="lbl_diligence_organization">Organismo o consultora</label>
                  <input type="text" id="inp-diligence-organization" placeholder="Empresa, consultora u organismo" />
                </div>

                <button type="button" id="btn-export-report-pdf" class="btn btn-primary btn-block">
                  📄 1. Generar Informe Técnico PDF Estructurado
                </button>
                <button type="button" id="btn-export-snapshot" class="btn btn-outline btn-block">
                  🖼️ 2. Exportación Gráfica del Visor (PDF / PNG)
                </button>
                <div class="form-row" style="margin-top:4px;">
                  <button type="button" id="btn-export-dxf" class="btn btn-outline btn-sm">📐 Descargar DXF (CAD)</button>
                  <button type="button" id="btn-export-svg" class="btn btn-outline btn-sm">📏 Descargar SVG Escala</button>
                </div>
                <div class="form-row" style="margin-top:6px;">
                  <button type="button" id="btn-export-session" class="btn btn-outline btn-sm">💾 Guardar proyecto</button>
                  <button type="button" id="btn-import-session" class="btn btn-outline btn-sm">📂 Cargar proyecto</button>
                  <input type="file" id="inp-session-file" accept=".json,.turnsim.json" style="display:none;" />
                </div>
              </div>
            </details>

            <div class="nav-step-buttons form-row">
              <button type="button" class="btn btn-outline btn-sm btn-goto-stage" data-target="5">◀ Análisis</button>
              <button type="button" class="btn btn-primary btn-sm btn-goto-stage" data-target="4">✓ Volver al Visor</button>
            </div>
          </div>
        </div>
      </aside>

      <!-- 3. ÁREA CENTRAL DE VISUALIZACIÓN Y TELEMETRÍA -->
      <main class="workspace-main">
        <!-- HUD SUPERIOR FLOTANTE DE VISTAS (EN CABECERA DEL VISOR) -->
        <div class="floating-view-hud">
          <div class="view-mode-tabs">
            <button type="button" class="view-mode-btn active" data-mode="2d">Planta 2D</button>
            <button type="button" class="view-mode-btn" data-mode="3d">Visor 3D</button>
            <button type="button" class="view-mode-btn" data-mode="split">Dividida 2D+3D</button>
          </div>
        </div>

        <!-- Contenedor de visores 2D / 3D / Split -->
        <div id="viewports-grid" class="viewports-grid mode-2d" style="position:relative;">
          <!-- Indicador flotante de cálculo cinemático en progreso (UX / anti-incertidumbre) -->
          <div id="calculating-indicator" class="calculating-pill" style="display:none;">
            <span class="calc-spinner"></span>
            <span id="calc-indicator-text" data-i18n="calc_indicator_text">Calculando trayectoria y envolventes de barrido...</span>
          </div>

          <!-- Panel 2D (Planta técnica principal) -->
          <div id="pane-2d" class="viewport-pane">
            <div class="pane-badge">PLANTA TÉCNICA 2D (MÉTRICA CAD/GIS)</div>
            <div class="pane-toolbar">
              <button type="button" id="btn-draw-waypoints" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);color:#38bdf8;border-color:#0284c7;font-weight:600;" title="Activar trazado / edición interactiva de ruta por puntos de paso (clic en plano para añadir o mover waypoints)">✏️ Trazar ruta</button>
              <button type="button" id="btn-toggle-draw-dir" class="btn btn-sm btn-outline" style="display:none;background:rgba(15,23,42,0.85);color:#38bdf8;border-color:#0284c7;font-weight:600;" title="Alternar sentido de trazado desde el último vértice (Atajo: tecla R)">▶ Avance (D)</button>
              <button type="button" id="btn-toggle-spline-mode" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);font-size:11px;color:#38bdf8;border-color:#0284c7;" title="Alternar entre Spline CAD continua (sin quiebros en vértices) y Polilínea tradicional con acuerdos fijos">⚡ Spline CAD</button>
              <button type="button" id="btn-clear-path" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);color:#f87171;border-color:#ef4444;" title="Borrar el trazado del vehículo y reiniciar la maniobra para empezar de nuevo" data-i18n="btn_clear_path">🗑️ Borrar trazado</button>
              <button type="button" id="btn-measure-tool" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);" title="Activar herramienta para medir distancias métricas en planta (clic en P1 y clic en P2, con snap automático)">📏 Medir distancia</button>
              <button type="button" id="btn-toggle-pnoa" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);" title="Activar o desactivar la capa de ortofotografía aérea oficial del PNOA (IGN)">🛰️ Ortofoto PNOA</button>
              <button type="button" id="btn-config-pnoa" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);padding:4px 7px;" title="Configurar ubicación, buscador y opacidad de la ortofoto PNOA">⚙️</button>
              <!-- Buscador Toponímico OpenStreetMap (España) -->
              <div class="toponym-search-container" id="toponym-search-container">
                <input type="text" id="inp-viewer-toponym" class="toponym-input" placeholder="🔍 Buscar lugar en España (OSM)..." title="Buscar municipios, calles, glorietas o carreteras en España (OpenStreetMap) y centrar la ortofoto PNOA" data-i18n-placeholder="placeholder_toponym_search" data-i18n-title="toponym_search_title" autocomplete="off" spellcheck="false" />
                <button type="button" id="btn-clear-toponym" class="btn-clear-toponym" title="Limpiar búsqueda" style="display:none;">✕</button>
                <div id="toponym-dropdown-results" class="toponym-dropdown"></div>
              </div>
              <button type="button" id="btn-clear-measure" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);display:none;" title="Borrar cota medida (Esc)">✕</button>
              <span id="measure-result-pill" class="badge" style="display:none;background:rgba(14,165,233,0.18);color:#38bdf8;border:1px solid #0284c7;font-family:monospace;font-size:11px;padding:3px 9px;border-radius:4px;align-self:center;"></span>
              <button type="button" id="btn-fit-2d" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);">⊡ Encuadrar 2D</button>
            </div>
            <canvas id="canvas-2d"></canvas>
            <div id="wp-context-menu" class="wp-context-menu" style="display:none;"></div>
          </div>

          <!-- Panel 3D (Three.js complementario) -->
          <div id="pane-3d" class="viewport-pane">
            <div class="pane-badge">PERSPECTIVA 3D SINCRONIZADA (THREE.JS)</div>
            <div class="pane-toolbar" style="right:14px;">
              <button type="button" id="btn-fit-3d" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);">⊡ Encuadrar 3D</button>
            </div>
            <div id="container-3d" style="width:100%;height:100%;"></div>
          </div>

          <!-- Leyenda interactiva superpuesta en el visor -->
          <details class="viewport-legend">
            <summary>📋 Leyenda de líneas y barrido</summary>
            <div class="legend-body">
              <div class="legend-section-title">Áreas y contornos de barrido</div>
              <div class="legend-item">
                <span class="legend-swatch swatch-envelope"></span>
                <span><strong>Envolvente física de barrido:</strong> área máxima ocupada por la carrocería (tractora + semirremolque).</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch swatch-margin"></span>
                <span><strong>Margen de seguridad (d<sub>seg</sub>):</strong> banda perimetral de resguardo lateral alrededor de la envolvente.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch swatch-ghost"></span>
                <span><strong>Siluetas de paso:</strong> contornos del vehículo muestreados a intervalos a lo largo de la maniobra.</span>
              </div>

              <div class="legend-section-title">Trayectorias de ejes y articulación</div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-front-axle"></span></span>
                <span><strong>Eje directriz delantero:</strong> centro del eje delantero direccionable de la tractora.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-rear-axle"></span></span>
                <span><strong>Eje motriz de referencia (P<sub>ref</sub>):</strong> centro del eje trasero motriz de la tractora.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-hitch"></span></span>
                <span><strong>Quinta rueda (Kingpin):</strong> trayectoria del pivote de acoplamiento tractora-semirremolque.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-trailer-axle"></span></span>
                <span><strong>Centro del trídem del semirremolque:</strong> trayectoria tractriz del eje central trasero (arrastre interior).</span>
              </div>

              <div class="legend-section-title">Huellas de neumáticos y acotaciones</div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-wheel-tractor"></span></span>
                <span><strong>Huellas de ruedas (tractora):</strong> rodadura individual izquierda y derecha de los ejes de la tractora.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-wheel-trailer"></span></span>
                <span><strong>Huellas de ruedas (semirremolque):</strong> rodadura exterior izquierda y derecha del grupo trídem.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-dim"></span></span>
                <span><strong>Cotas de anchura barrida:</strong> secciones transversales de ancho de barrido en curva.</span>
              </div>
              <div class="legend-item">
                <span class="legend-swatch"><span class="swatch-line swatch-clearance"></span></span>
                <span><strong>Vector de holgura mínima:</strong> distancia libre crítica entre vehículo y obstáculo viario.</span>
              </div>
            </div>
          </details>
        </div>

        <!-- Panel de Curvas de Telemetría a lo largo del recorrido PK (UX-09) -->
        <div id="panel-pk-curves" class="panel-pk-curves collapsed">
          <div class="pk-curves-header">
            <div class="pk-curves-title">
              <span data-i18n="curves_panel_title">📈 Curvas de telemetría a lo largo del recorrido (PK)</span>
            </div>
            <div class="pk-curves-legend">
              <div class="pk-legend-item">
                <span class="pk-legend-line pk-legend-steer"></span>
                <span data-i18n="curves_steer_label">Ángulo de dirección δ(s)</span>
              </div>
              <div id="pk-legend-artic-item" class="pk-legend-item">
                <span class="pk-legend-line pk-legend-artic"></span>
                <span data-i18n="curves_artic_label">Ángulo de articulación γ(s)</span>
              </div>
              <button type="button" id="btn-close-curves" class="btn btn-sm btn-outline" style="padding:1px 6px;margin-left:8px;" title="Cerrar panel de curvas de telemetría">✕</button>
            </div>
          </div>
          <div id="pk-curves-svg-container" class="pk-curves-svg-container" title="Haga clic en cualquier punto de la curva para situar la simulación en ese PK"></div>
        </div>

        <!-- CÁPSULA FLOTANTE DE SIMULACIÓN Y TELEMETRÍA (BARRA INFERIOR) -->
        <footer class="bottom-timeline-bar simulation-capsule">
          <button type="button" id="btn-play-toggle" class="btn btn-primary btn-sm btn-play-capsule">▶ Reproducir</button>
          <button type="button" id="btn-play-reset" class="btn btn-outline btn-sm">⏮ Inicio</button>
          <button type="button" id="btn-toggle-curves" class="btn btn-outline btn-sm" title="Mostrar u ocultar curvas de telemetría a lo largo del recorrido (PK)" data-i18n="btn_toggle_curves">📈 Curvas de telemetría</button>
          <select id="sel-play-speed" style="width:74px;" title="Velocidad de reproducción">
            <option value="0.5">0.5x</option>
            <option value="1" selected>1.0x</option>
            <option value="2">2.0x</option>
            <option value="4">4.0x</option>
          </select>
          <input type="range" id="slider-timeline" class="timeline-slider capsule-track" min="0" max="100" value="0" />
          <div id="timeline-readout" class="timeline-readout-capsule">
            PK 0.00 m
          </div>

          <!-- Microindicadores de telemetría en vivo -->
          <div class="capsule-kpis">
            <div class="kpi-micro">Barrido: <span id="kpi-swept-width">—</span></div>
            <div class="kpi-micro" style="display:none;">Recorrido: <span id="kpi-total-dist">—</span></div>
            <div class="kpi-micro">δ: <span id="kpi-max-steer">—</span></div>
            <div class="kpi-micro">γ: <span id="kpi-max-artic">—</span></div>
            <div class="kpi-micro warn">Holgura: <span id="kpi-min-clearance">—</span></div>
          </div>
        </footer>

        <!-- BARRA DE ESTADO CAD INFERIOR -->
        <footer class="cad-statusbar">
          <div id="cad-cursor-coords" class="cad-coords">COORD: X = 0.00 m | Y = 0.00 m | Z = 0.00 m</div>
          <div class="cad-flags">
            <span class="cad-flag-pill on">🧲 SNAP [VÉRTICES ON]</span>
            <span class="cad-flag-pill on">▦ REJILLA [5.0m]</span>
            <span class="cad-flag-pill">ESCALA 1:500</span>
            <span class="cad-flag-pill ok">✓ DIRECTIVA 96/53/CE</span>
          </div>
        </footer>
      </main>
    </div>
  </div>

  <!-- Modal de Configuración y Búsqueda de Ortofotografía Aérea PNOA (IGN) -->
  <dialog id="modal-pnoa-config" class="modal-dialog-large" style="display:none;position:fixed;inset:0;margin:auto;max-width:620px;max-height:85vh;overflow-y:auto;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:8px;padding:22px;box-shadow:0 12px 36px rgba(0,0,0,0.65);z-index:9999;">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:14px;">
      <h2 style="margin:0;font-size:16px;color:#38bdf8;font-weight:700;" data-i18n="dialog_pnoa_title">🛰️ Capa de ortofotografías aéreas PNOA (IGN)</h2>
      <button type="button" id="btn-close-pnoa-modal" class="btn btn-sm btn-outline" aria-label="Cerrar modal">✕</button>
    </div>
    <div style="line-height:1.5;font-size:12px;color:#cbd5e1;">
      <p style="margin-top:0;margin-bottom:12px;">
        Visualice ortofotografías aéreas de alta resolución del <strong>Plan Nacional de Ortofotografía Aérea (PNOA)</strong> provistas por el Instituto Geográfico Nacional (IGN) y dibuje la ruta del vehículo pesado directamente sobre la infraestructura real.
      </p>

      <!-- Activar / Desactivar y Opacidad -->
      <div style="background:rgba(30,41,59,0.5);border:1px solid #334155;border-radius:6px;padding:10px 14px;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;color:#f8fafc;">
          <input type="checkbox" id="modal-chk-pnoa-active" />
          <span>Activar capa de ortofotografía PNOA</span>
        </label>
        <div>
          <label class="form-label" for="slider-pnoa-opacity" style="display:flex;justify-content:space-between;">
            <span>Opacidad de la imagen aérea:</span>
            <strong id="lbl-pnoa-opacity-val" style="color:#38bdf8;">80%</strong>
          </label>
          <input type="range" id="slider-pnoa-opacity" min="10" max="100" step="5" value="80" style="width:100%;accent-color:#0284c7;" />
        </div>
      </div>

      <!-- Buscador Geográfico -->
      <div style="background:rgba(30,41,59,0.5);border:1px solid #334155;border-radius:6px;padding:10px 14px;margin-bottom:12px;">
        <label class="form-label" for="inp-pnoa-search">Buscar municipio, glorieta o polígono industrial en España:</label>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <input type="text" id="inp-pnoa-search" placeholder="Ej. Alcalá de Henares, M-40, Mercamadrid, Plaza Zaragoza..." style="flex:1;background:#0b1120;border:1px solid #334155;border-radius:4px;padding:5px 8px;color:#f8fafc;font-size:11.5px;" />
          <button type="button" id="btn-pnoa-search" class="btn btn-primary btn-sm">🔍 Buscar</button>
        </div>
        <div id="pnoa-search-status" style="font-size:11px;min-height:16px;margin-top:5px;"></div>
      </div>

      <!-- Ubicaciones de prueba rápida -->
      <div style="background:rgba(30,41,59,0.5);border:1px solid #334155;border-radius:6px;padding:10px 14px;margin-bottom:12px;">
        <div class="form-label">Ubicaciones de prueba rápida en España (1 clic):</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          <button type="button" class="btn btn-outline btn-sm btn-pnoa-preset" data-lat="40.3872" data-lon="-3.8785" data-zone="30" data-x="425420" data-y="4471080" data-name="Madrid — Glorieta M-501 (Boadilla)">🔘 Madrid (Glorieta M-501)</button>
          <button type="button" class="btn btn-outline btn-sm btn-pnoa-preset" data-lat="41.6455" data-lon="-1.0028" data-zone="30" data-x="666270" data-y="4612340" data-name="Zaragoza — PLAZA Logística">🔘 Zaragoza (PLAZA Logística)</button>
          <button type="button" class="btn btn-outline btn-sm btn-pnoa-preset" data-lat="39.4312" data-lon="-0.3340" data-zone="30" data-x="729510" data-y="4368140" data-name="Valencia — Acceso ZAL Portuaria">🔘 Valencia (Acceso ZAL)</button>
          <button type="button" class="btn btn-outline btn-sm btn-pnoa-preset" data-lat="41.3250" data-lon="2.1245" data-zone="31" data-x="426740" data-y="4575190" data-name="Barcelona — ZAL Prat">🔘 Barcelona (ZAL Prat)</button>
          <button type="button" class="btn btn-outline btn-sm btn-pnoa-preset" data-lat="37.4085" data-lon="-6.0020" data-zone="30" data-x="765450" data-y="4144670" data-name="Sevilla — Glorieta Cartuja">🔘 Sevilla (Glorieta Cartuja)</button>
        </div>
      </div>

      <!-- Coordenadas avanzadas (Lat/Lon o UTM) -->
      <details style="background:rgba(30,41,59,0.3);border:1px solid #334155;border-radius:6px;padding:8px 12px;margin-bottom:14px;">
        <summary style="cursor:pointer;font-weight:600;color:#38bdf8;font-size:11.5px;">Ajuste manual de coordenadas (Geográficas / UTM ETRS89)</summary>
        <div style="margin-top:8px;">
          <div class="form-row" style="margin-bottom:6px;">
            <div>
              <label class="form-label" for="inp-pnoa-lat">Latitud WGS84 (°)</label>
              <input type="number" step="0.0001" id="inp-pnoa-lat" value="40.3872" style="width:100%;background:#0b1120;border:1px solid #334155;border-radius:4px;padding:4px;color:#f8fafc;" />
            </div>
            <div>
              <label class="form-label" for="inp-pnoa-lon">Longitud WGS84 (°)</label>
              <input type="number" step="0.0001" id="inp-pnoa-lon" value="-3.8785" style="width:100%;background:#0b1120;border:1px solid #334155;border-radius:4px;padding:4px;color:#f8fafc;" />
            </div>
          </div>
          <div class="form-row" style="margin-bottom:6px;">
            <div>
              <label class="form-label" for="inp-pnoa-utmx">UTM ETRS89 X (m)</label>
              <input type="number" step="1" id="inp-pnoa-utmx" value="425420" style="width:100%;background:#0b1120;border:1px solid #334155;border-radius:4px;padding:4px;color:#f8fafc;" />
            </div>
            <div>
              <label class="form-label" for="inp-pnoa-utmy">UTM ETRS89 Y (m)</label>
              <input type="number" step="1" id="inp-pnoa-utmy" value="4471080" style="width:100%;background:#0b1120;border:1px solid #334155;border-radius:4px;padding:4px;color:#f8fafc;" />
            </div>
            <div style="max-width:80px;">
              <label class="form-label" for="sel-pnoa-huso">Huso</label>
              <select id="sel-pnoa-huso" style="width:100%;background:#0b1120;border:1px solid #334155;border-radius:4px;padding:4px;color:#f8fafc;">
                <option value="28">28</option>
                <option value="29">29</option>
                <option value="30" selected>30</option>
                <option value="31">31</option>
              </select>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:6px;">
            <button type="button" id="btn-pnoa-apply-coords" class="btn btn-outline btn-sm">Aplicar coordenadas</button>
          </div>
        </div>
      </details>

      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #334155;padding-top:12px;">
        <button type="button" id="btn-pnoa-recenter-view" class="btn btn-outline btn-sm" title="Centrar el visor en el origen (0,0) de la imagen aérea">⊡ Centrar visor en origen</button>
        <button type="button" id="btn-pnoa-save-close" class="btn btn-primary btn-sm">Aceptar y ver ortofoto</button>
      </div>
    </div>
  </dialog>

  <!-- Modal accesible de Guía Técnica, Metodología y Normativa (SEO-03) -->
  <dialog id="modal-methodology" class="modal-dialog-large" style="display:none;position:fixed;inset:0;margin:auto;max-width:860px;max-height:85vh;overflow-y:auto;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:8px;padding:24px;box-shadow:0 12px 36px rgba(0,0,0,0.65);z-index:9999;">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:12px;margin-bottom:16px;">
      <h2 style="margin:0;font-size:18px;color:#38bdf8;font-weight:700;" data-i18n="dialog_methodology_title">Guía técnica, metodología cinemática y normativa</h2>
      <button type="button" id="btn-close-methodology" class="btn btn-sm btn-outline" aria-label="Cerrar modal">✕</button>
    </div>
    <article style="line-height:1.6;font-size:13px;color:#cbd5e1;">
      <h3 style="color:#38bdf8;margin-top:16px;margin-bottom:6px;">1. Modelo cinemático de tractriz e integración Runge-Kutta 4 (RK4)</h3>
      <p>TurnSim modela el arrastre cinemático de conjuntos articulados mediante las ecuaciones diferenciales no holónomas de la curva tractriz generalizada. La orientación instantánea de la tractora y la geometría de la quinta rueda definen la trayectoria del kingpin, transmitiendo el arrastre al eje virtual del semirremolque mediante la formulación:</p>
      <p style="font-family:monospace;background:#1e293b;padding:8px 12px;border-radius:4px;border-left:3px solid #38bdf8;">dθ_t / ds = -sin(θ_t - θ_tr) / L_t</p>
      <p>La integración espacial a lo largo del recorrido se realiza mediante un esquema numérico Runge-Kutta de 4.º orden (RK4), garantizando una convergencia con tolerancia analítica inferior a 1 mm frente a soluciones infinitesimales continuas.</p>

      <h3 style="color:#38bdf8;margin-top:16px;margin-bottom:6px;">2. Directiva Europea 96/53/CE y Reglamento General de Vehículos</h3>
      <p>Conforme a la Directiva 96/53/CE del Consejo de la Unión Europea y el anexo IX del Reglamento General de Vehículos (Real Decreto 2822/1998):</p>
      <ul style="padding-left:20px;">
        <li><strong>Corona circular de giro reglamentaria:</strong> Todo conjunto articulado de hasta 16,50 m debe inscribirse en una corona circular con radio exterior R_ext = 12,50 m sin invasión exterior, manteniendo un radio interior libre mínimo R_int = 5,30 m.</li>
        <li><strong>Anchura máxima barrida:</strong> La anchura total barrida durante el giro de 360° en corona reglamentaria no debe exceder 7,20 m.</li>
        <li><strong>Ángulo de articulación admisible:</strong> Se evalúa el riesgo de tijera (jackknifing) cuando la articulación relativa γ entre tractora y semirremolque se aproxima a los límites geométricos de interferencia de la cabina.</li>
      </ul>

      <h3 style="color:#38bdf8;margin-top:16px;margin-bottom:6px;">3. Envolventes de barrido (Swept Path Envelopes) y margen de seguridad</h3>
      <p>La envolvente física de barrido representa la proyección horizontal del área total barrida por las carrocerías de la cabeza tractora y el semirremolque durante la maniobra. Adicionalmente, TurnSim calcula un <em>margen de seguridad</em> paramétrico (por defecto 0,30 m), generando un pasillo de gálibo holgado recomendado en el diseño de accesos viarios, plataformas logísticas y curvas cerradas.</p>

      <h3 style="color:#38bdf8;margin-top:16px;margin-bottom:6px;">4. Especificación técnica y catálogo de capas CAD DXF</h3>
      <p>El importador CAD reconoce entidades en archivos DXF (versiones R12 a R2018) y clasifica automáticamente las capas:</p>
      <ul style="padding-left:20px;">
        <li><strong>Eje de trayectoria:</strong> EJE_TRAZADO, TURNSIM_TRAYECTORIA, AXIS, PATH, CENTERLINE.</li>
        <li><strong>Obstáculos y edificación:</strong> EDIFICIOS, MUROS, PILARES, COLUMNAS, VALLADO_PERIMETRAL, FENCE, OBSTACULOS.</li>
        <li><strong>Bordillos y límites de calzada:</strong> CALZADA, VIALES, BORDILLOS, KERB, CURB, ROAD_EDGES.</li>
        <li><strong>Muelles de carga e instalaciones:</strong> MUELLES_CARGA, DOCK, PLATAFORMA.</li>
        <li><strong>Zonas restringidas / peatonales:</strong> PEATONAL, ISLETAS, RESTRICTED, ACERAS.</li>
      </ul>

      <h3 style="color:#38bdf8;margin-top:16px;margin-bottom:6px;">5. Preguntas frecuentes técnicas (FAQ)</h3>
      <p><strong>¿Requiere conexión a un servidor para procesar planos DXF?</strong> No. El parser DXF, el motor de cálculo cinemático y los algoritmos de detección de colisiones se ejecutan íntegramente en el navegador web (100 % local en cliente), garantizando la total privacidad de planos técnicos e instalaciones industriales.</p>
      <p><strong>¿Qué formatos vectoriales permite exportar?</strong> Informes de auditoría técnica en PDF estructurado, planos vectoriales multicapa en CAD DXF con capas independientes para envolventes y cotas de barrido, e ilustraciones vectoriales SVG a escala métrica 1:1.</p>
    </article>
  </dialog>

  <!-- Código completo compilado desde web/js/ para ejecución local sin servidor ni restricciones CORS -->
  <script>
${bundledJs}
  </script>
</body>
</html>
`;

const targets = [
  path.join(WEB_DIR, "index.html"),
  path.join(WEB_DIR, "simulacion_threejs.html"),
  path.join(ROOT_DIR, "simulacion_threejs.html"),
  path.join(ROOT_DIR, "index.html"),
  path.join(ROOT_DIR, "TurnSim_Standalone.html")
];

for (const t of targets) {
  fs.writeFileSync(t, htmlDocument, "utf8");
  console.log(`Generado con éxito: ${path.relative(ROOT_DIR, t)} (${(htmlDocument.length / 1024).toFixed(1)} KB)`);
}

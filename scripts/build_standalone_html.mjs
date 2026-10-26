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

const MODULE_ORDER = [
  "js/models/vehicles.js",
  "js/engine/kinematics.js",
  "js/engine/envelope.js",
  "js/engine/collisions.js",
  "js/export/exporters.js",
  "js/view2d/viewer2d.js",
  "js/view3d/viewer3d.js",
  "js/app.js"
];

function stripImportsAndExports(code) {
  return code
    // Eliminar sentencias import ... from "..."; (incluyendo multilínea)
    .replace(/import\s+[\s\S]*?from\s+["'][^"']+["']\s*;?/g, "")
    // Convertir export class / export function / export const / export let en declaraciones estándar
    .replace(/export\s+(class|function|const|let|var)\s+/g, "$1 ")
    .trim();
}

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
  <title>TurnSim — Simulador de Barrido de Vehículos Pesados</title>
  <!-- Three.js y OrbitControls para el visor 3D (con degradación elegante si no hay red) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <style>
${cssContent}
  </style>
</head>
<body>
  <div class="app-layout">
    <!-- PANEL LATERAL IZQUIERDO DE CONFIGURACIÓN (Secciones A - E según apartado 7.1) -->
    <aside class="left-sidebar">
      <div class="sidebar-header">
        <div class="brand-container">
          <svg class="brand-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 17h2.5l2-5h5l2 5H20" stroke="#38bdf8" />
            <path d="M7 12h10" stroke="#38bdf8" />
            <rect x="2" y="7" width="7" height="9" rx="1.5" stroke="#38bdf8" fill="rgba(56, 189, 248, 0.15)" />
            <rect x="11" y="5" width="11" height="11" rx="1.5" stroke="#38bdf8" fill="rgba(56, 189, 248, 0.1)" />
            <circle cx="5.5" cy="17" r="1.5" fill="#38bdf8" />
            <circle cx="15.5" cy="17" r="1.5" fill="#38bdf8" />
            <circle cx="18.5" cy="17" r="1.5" fill="#38bdf8" />
          </svg>
          <span class="brand-title">TurnSim</span>
        </div>
        <h1>SIMULADOR DE BARRIDO DE VEHÍCULOS PESADOS</h1>
      </div>

      <div class="sidebar-scroll">
        <!-- SECCIÓN A: SELECCIÓN DE VEHÍCULO -->
        <details class="panel-section" open>
          <summary>A. Selección de vehículo de diseño</summary>
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
          <summary>B. Personalización geométrica</summary>
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
        </details>

        <!-- SECCIÓN C: CONFIGURACIÓN DE LA MANIOBRA -->
        <details class="panel-section" open>
          <summary>C. Configuración de la maniobra</summary>
          <div class="section-body">
            <div class="form-group">
              <label class="form-label" for="select-scenario">Escenario viario preconfigurado</label>
              <select id="select-scenario"></select>
            </div>

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

            <div class="subtitle-divider">Tramos sucesivos de la maniobra</div>
            <div id="segments-list" class="segment-list"></div>
            <div class="form-row">
              <button type="button" id="btn-add-straight" class="btn btn-outline btn-sm">+ Añadir recta</button>
              <button type="button" id="btn-add-arc" class="btn btn-outline btn-sm">+ Añadir curva</button>
            </div>

            <details style="margin-top:8px;background:rgba(11,17,32,0.6);padding:6px 8px;border-radius:5px;border:1px solid #334155;">
              <summary style="cursor:pointer;font-size:11.5px;font-weight:600;color:#38bdf8;">Generar por puntos de paso (Waypoints X, Y)</summary>
              <div style="margin-top:6px;">
                <label class="form-label" for="inp-waypoints-text">Lista de coordenadas X, Y (una por línea)</label>
                <textarea id="inp-waypoints-text" rows="3" style="width:100%;background:#0b1120;color:#f8fafc;border:1px solid #334155;border-radius:4px;font-family:monospace;font-size:11px;padding:5px;">0, 0
20, 0
20, 20</textarea>
                <div class="form-row" style="margin-top:5px;">
                  <div>
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

        <!-- SECCIÓN D: VISUALIZACIÓN Y OBSTÁCULOS -->
        <details class="panel-section" open>
          <summary>D. Visualización y obstáculos</summary>
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
              <label class="layer-check"><input type="checkbox" id="chk-layer-dims" checked /> Cotas y holguras</label>
              <label class="layer-check"><input type="checkbox" id="chk-layer-axles" checked /> Ruedas y kingpin</label>
              <label class="layer-check"><input type="checkbox" id="chk-layer-grid" checked /> Cuadrícula métrica</label>
            </div>

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

        <!-- SECCIÓN E: INFORMES Y EXPORTACIÓN -->
        <details class="panel-section" open>
          <summary>E. Informes técnicos y exportación CAD</summary>
          <div class="section-body">
            <div class="form-group">
              <label class="form-label" for="inp-project-name">Título del proyecto / expediente</label>
              <input type="text" id="inp-project-name" value="Estudio de Seguridad Vial — Andros La Serna" />
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
          </div>
        </details>
      </div>
    </aside>

    <!-- ÁREA CENTRAL DE VISUALIZACIÓN Y TELEMETRÍA -->
    <main class="workspace-main">
      <!-- Barra superior de telemetría -->
      <header class="top-telemetry-bar">
        <div class="telemetry-kpis">
          <div class="kpi-pill">
            <span class="kpi-label">Anchura máx. barrida</span>
            <span id="kpi-swept-width" class="kpi-value">—</span>
          </div>
          <div class="kpi-pill">
            <span class="kpi-label">Recorrido eje ref.</span>
            <span id="kpi-total-dist" class="kpi-value">—</span>
          </div>
          <div class="kpi-pill">
            <span class="kpi-label">Dirección máx. (δ)</span>
            <span id="kpi-max-steer" class="kpi-value">—</span>
          </div>
          <div class="kpi-pill">
            <span class="kpi-label">Articulación máx. (γ)</span>
            <span id="kpi-max-artic" class="kpi-value">—</span>
          </div>
          <div class="kpi-pill">
            <span class="kpi-label">Holgura mín. obstáculo</span>
            <span id="kpi-min-clearance" class="kpi-value">—</span>
          </div>
        </div>
        <div>
          <span id="global-interference-badge" class="status-banner-pill status-CLEAR">VERIFICANDO...</span>
        </div>
      </header>

      <!-- Contenedor de visores 2D / 3D / Split -->
      <div id="viewports-grid" class="viewports-grid mode-2d">
        <!-- Panel 2D (Planta técnica principal) -->
        <div id="pane-2d" class="viewport-pane">
          <div class="pane-badge">PLANTA TÉCNICA 2D (MÉTRICA CAD/GIS)</div>
          <div class="pane-toolbar">
            <button type="button" id="btn-measure-tool" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);" title="Activar herramienta para medir distancias métricas en planta (clic en P1 y clic en P2, con snap automático)">📏 Medir distancia</button>
            <button type="button" id="btn-clear-measure" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);display:none;" title="Borrar cota medida (Esc)">✕</button>
            <span id="measure-result-pill" class="badge" style="display:none;background:rgba(14,165,233,0.18);color:#38bdf8;border:1px solid #0284c7;font-family:monospace;font-size:11px;padding:3px 9px;border-radius:4px;align-self:center;"></span>
            <button type="button" id="btn-fit-2d" class="btn btn-sm btn-outline" style="background:rgba(15,23,42,0.85);">⊡ Encuadrar 2D</button>
          </div>
          <canvas id="canvas-2d"></canvas>
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
        <details class="viewport-legend" open>
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

      <!-- Barra inferior de línea temporal y reproducción -->
      <footer class="bottom-timeline-bar">
        <button type="button" id="btn-play-toggle" class="btn btn-primary btn-sm">▶ Reproducir</button>
        <button type="button" id="btn-play-reset" class="btn btn-outline btn-sm">⏮ Inicio</button>
        <select id="sel-play-speed" style="width:78px;" title="Velocidad de reproducción">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1.0x</option>
          <option value="2">2.0x</option>
          <option value="4">4.0x</option>
        </select>
        <input type="range" id="slider-timeline" class="timeline-slider" min="0" max="100" value="0" />
        <div id="timeline-readout" style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-secondary);min-width:290px;text-align:right;">
          PK 0.00 m
        </div>
      </footer>
    </main>
  </div>

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
  path.join(ROOT_DIR, "index.html")
];

for (const t of targets) {
  fs.writeFileSync(t, htmlDocument, "utf8");
  console.log(`Generado con éxito: ${path.relative(ROOT_DIR, t)} (${(htmlDocument.length / 1024).toFixed(1)} KB)`);
}

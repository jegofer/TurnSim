/**
 * Controlador principal de la aplicación web de simulación de trayectorias de barrido
 * Integra los módulos de vehículos, cinemática, envolventes, colisiones, visores 2D/3D e informes.
 * Cumple íntegramente los apartados 7, 8, 9, 10, 11 y 12 de PROMT_ORIGINAL.md.
 */

import {
  TRACTOR_CATALOG,
  TRAILER_CATALOG,
  buildCombinedVehicle,
  VEHICLE_CATALOG,
  cloneVehicleProfile,
  computeDerivedVehicleMetrics,
  validateVehicleParams
} from "./models/vehicles.js";
import { buildSegmentsFromWaypoints, buildSegmentsFromSplineWaypoints, sampleCatmullRomSpline } from "./engine/kinematics.js";
import { buildCompleteSimulationResult } from "./engine/envelope.js";
import {
  PRESET_SCENARIOS,
  evaluateObstacleInterferences
} from "./engine/collisions.js";
import {
  generateSVGDiagram,
  generateDXFContent,
  openStructuredTechnicalReport,
  exportGraphicViewSnapshot,
  downloadMarkdownTechnicalReport,
  downloadTextFile
} from "./export/exporters.js";
import {
  parseDXF,
  detectSuggestedLayerMapping,
  buildScenarioFromDXF
} from "./export/dxf_importer.js";
import {
  buildScenarioFromGeoJSON,
  inspectGeoJSONFile,
  buildScenarioFromGeoJSONFiles,
  buildPnoaConfigFromUtmOrigin
} from "./export/geojson_importer.js";
import { Viewer2D } from "./view2d/viewer2d.js";
import { Viewer3D } from "./view3d/viewer3d.js";
import { I18nManager } from "./i18n/locales.js";
import { EngineWorkerClient } from "./engine/worker_client.js";

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pila acotada de historial para comandos Deshacer / Rehacer (UX-07)
 */
export class CommandHistory {
  constructor(maxStates = 30) {
    this.maxStates = maxStates;
    this.stack = [];
    this.index = -1;
  }

  pushState(snapshot) {
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push(JSON.stringify(snapshot));
    if (this.stack.length > this.maxStates) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  canUndo() {
    return this.index > 0;
  }

  canRedo() {
    return this.index < this.stack.length - 1;
  }

  undo() {
    if (!this.canUndo()) return null;
    this.index--;
    return JSON.parse(this.stack[this.index]);
  }

  redo() {
    if (!this.canRedo()) return null;
    this.index++;
    return JSON.parse(this.stack[this.index]);
  }
}

export class SweptPathApp {
  constructor() {
    // Gestor de internacionalización i18n (SEO-05)
    this.i18n = new I18nManager();

    // Cliente de cálculo en segundo plano Web Worker con repliegue síncrono (PERF-06)
    this.workerClient = new EngineWorkerClient();

    // Historial acotado a 30 estados para Deshacer / Rehacer (UX-07)
    this.history = new CommandHistory(30);
    this._autosaveTimer = null;
    this.isCurvesPanelOpen = false;

    // Estado activo
    this.selectedVehicleId = "spain_camion_articulado_t";
    this.selectedTractorKey = "spain_tractor_t";
    this.selectedTrailerKey = "spain_semitrailer_t";
    this.vehicle = cloneVehicleProfile(this.selectedVehicleId);
    this.isCustomModified = false;
    this.trajectoryMode = "spline"; // 'spline' (Spline CAD continua) | 'fillet' (Polilínea con acuerdos)

    // Inicialización con visor vacío hasta que el usuario dibuje una ruta o cargue un plano CAD
    this.selectedScenarioId = "";
    this.safetyMarginM = 0.50;
    this.maneuver = {
      startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
      segments: []
    };
    this.obstacles = [];
    this.referenceAxes = [];
    this.cadBackgroundEntities = [];
    this.currentParsedDXF = null;
    this.activeGeoOrigin = null;

    this.discretization = {
      straightStepM: 0.15,
      arcStepDeg: 1.0,
      integrationMethod: "rk4"
    };

    this.viewMode = "2d"; // '2d' | '3d' | 'split'
    this.simResult = null;
    this.interferenceReport = null;

    // Estado de reproducción y temporizadores de recálculo
    this.isPlaying = false;
    this.playSpeed = 1.0;
    this.currentFrameFloat = 0;
    this.currentAnimDistM = 0;
    this.lastAnimTime = 0;
    this._animRafId = null;
    this._recomputeTimer = null;
    this._interferenceTimer = null;

    // Instancias de visores
    const canvas2D = document.getElementById("canvas-2d");
    const container3D = document.getElementById("container-3d");
    this.viewer2D = new Viewer2D(canvas2D);
    this.viewer3D = new Viewer3D(container3D);

    // Callback cuando el usuario arrastra un obstáculo con Shift+Click en el visor 2D
    this.viewer2D.onObstacleMoved = (movedObs) => {
      this._recomputeInterferencesOnly();
      this._syncObstacleCardDOM(movedObs);
    };
    this.viewer2D.onObstacleDragEnd = () => {
      this._renderObstaclesListUI();
      this.history.pushState(this.getSnapshot());
      this._updateUndoRedoButtonsUI();
    };

    // Callbacks para trazado y edición de waypoints interactivos (UX-04)
    this.viewer2D.onWaypointsChange = (pts, meta = {}) => {
      const isDragging = Boolean(meta && meta.isDragging);
      const txtEl = document.getElementById("inp-waypoints-text");
      if (!pts || pts.length === 0) {
        if (txtEl) txtEl.value = "";
        this.maneuver.segments = [];
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this.scheduleRecompute(40, false);
        return;
      }
      if (txtEl) {
        txtEl.value = pts
          .map((p) => {
            const px = Array.isArray(p) ? p[0] : (p?.x ?? 0);
            const py = Array.isArray(p) ? p[1] : (p?.y ?? 0);
            const pDir = !Array.isArray(p) && p?.direction === -1 ? " R" : "";
            return `${Number(px).toFixed(2)} ${Number(py).toFixed(2)}${pDir}`;
          })
          .join("\n");
      }

      if (pts.length === 1) {
        const p0 = pts[0];
        const px = Array.isArray(p0) ? p0[0] : (p0?.x ?? 0);
        const py = Array.isArray(p0) ? p0[1] : (p0?.y ?? 0);
        this.maneuver.startPose = {
          ...this.maneuver.startPose,
          x: Number(px.toFixed(3)),
          y: Number(py.toFixed(3))
        };
        this.maneuver.segments = [];
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this.scheduleRecompute(40, false);
        return;
      }

      const filletR = parseFloat(document.getElementById("inp-waypoints-radius")?.value) || 12.5;
      const dir = parseInt(document.getElementById("sel-waypoints-dir")?.value, 10) || 1;
      const mode = document.getElementById("sel-waypoints-mode")?.value || this.trajectoryMode || "spline";
      const built = buildSegmentsFromWaypoints(pts, filletR, dir, { mode, vehicle: this.vehicle, autoDetectCusps: false });
      this.maneuver.startPose = {
        ...this.maneuver.startPose,
        ...built.startPose
      };
      this.maneuver.segments = built.segments;
      if (!isDragging) {
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this.history.pushState(this.getSnapshot());
        this._updateUndoRedoButtonsUI();
        this.scheduleRecompute(16, false, false);
      } else {
        this.scheduleRecompute(24, false, true);
      }
    };

    this.viewer2D.onWaypointContextMenu = (info) => {
      this._showWaypointContextMenu(info);
    };

    this.viewer2D.onActiveDrawDirectionChange = (dir) => {
      this._updateDrawDirectionButtonUI(dir);
    };

    this.viewer2D.onAutoCuspDetected = (wpIndex, newDir) => {
      const label = newDir === -1 ? "Marcha atrás (◀ R)" : "Avance (▶ D)";
      this.showToast(`Cúspide detectada en P${wpIndex + 1}: cambio automático a ${label}`, "info", 2600);
    };

    this.viewer2D.onAdoptReferenceAxis = (axis, meta = {}) => {
      this._adoptReferenceAxisAsWaypoints(axis, meta);
    };

    this._initUI();
    this.history.pushState(this.getSnapshot());
    this._updateUndoRedoButtonsUI();
    this.recomputeAll(true);
    this._checkAutosaveRecovery();
  }

  _setComputingStatus(computing) {
    this.isComputing = computing;
    if (this.viewer2D) {
      this.viewer2D.isComputing = computing;
      if (!this.simResult) this.viewer2D.render();
    }
    const indicator = document.getElementById("calculating-indicator");
    if (indicator) {
      indicator.style.display = computing ? "flex" : "none";
    }
    const badge = document.getElementById("global-interference-badge");
    if (badge && computing) {
      badge.className = "status-banner-pill status-COMPUTING";
      badge.textContent = "⏳ CALCULANDO TRAYECTORIA...";
    }
  }

  scheduleRecompute(delayMs = 120, fitCamera = false, previewMode = false) {
    if (this._recomputeTimer) clearTimeout(this._recomputeTimer);
    if (this.maneuver && this.maneuver.segments && this.maneuver.segments.length > 0) {
      this._setComputingStatus(true);
    }
    this._recomputeTimer = setTimeout(() => {
      this._recomputeTimer = null;
      this.recomputeAll(fitCamera, previewMode);
    }, delayMs);
  }

  scheduleInterferencesRecompute(delayMs = 50) {
    if (this._interferenceTimer) clearTimeout(this._interferenceTimer);
    this._interferenceTimer = setTimeout(() => {
      this._interferenceTimer = null;
      this._recomputeInterferencesOnly();
    }, delayMs);
  }

  getSnapshot() {
    return {
      vehicle: JSON.parse(JSON.stringify(this.vehicle)),
      selectedVehicleId: this.selectedVehicleId,
      selectedTractorKey: this.selectedTractorKey,
      selectedTrailerKey: this.selectedTrailerKey,
      selectedScenarioId: this.selectedScenarioId,
      maneuver: JSON.parse(JSON.stringify(this.maneuver)),
      obstacles: JSON.parse(JSON.stringify(this.obstacles)),
      referenceAxes: JSON.parse(JSON.stringify(this.referenceAxes || [])),
      safetyMarginM: this.safetyMarginM,
      discretization: JSON.parse(JSON.stringify(this.discretization))
    };
  }

  restoreSnapshot(s) {
    if (!s) return;
    this.vehicle = JSON.parse(JSON.stringify(s.vehicle));
    this.selectedVehicleId = s.selectedVehicleId || "custom";
    this.selectedTractorKey = s.selectedTractorKey || (s.vehicle?.tractorKey || "spain_tractor_t");
    this.selectedTrailerKey = s.selectedTrailerKey || (s.vehicle?.trailerKey || "spain_semitrailer_t");
    this.selectedScenarioId = s.selectedScenarioId || this.selectedScenarioId;
    this.maneuver = JSON.parse(JSON.stringify(s.maneuver));
    this.obstacles = JSON.parse(JSON.stringify(s.obstacles));
    if (Array.isArray(s.referenceAxes)) {
      this.referenceAxes = JSON.parse(JSON.stringify(s.referenceAxes));
    }
    this.safetyMarginM = typeof s.safetyMarginM === "number" ? s.safetyMarginM : 0.30;
    if (s.discretization) {
      this.discretization = { ...this.discretization, ...s.discretization };
    }

    const vehSel = document.getElementById("select-vehicle");
    if (vehSel) vehSel.value = this.selectedVehicleId;
    const trSel = document.getElementById("select-tractor");
    if (trSel) trSel.value = this.selectedTractorKey;
    const tlSel = document.getElementById("select-trailer");
    if (tlSel) tlSel.value = this.selectedTrailerKey;
    const scSel = document.getElementById("select-scenario");
    if (scSel) scSel.value = this.selectedScenarioId;
    const smInp = document.getElementById("inp-safety-margin");
    if (smInp) smInp.value = this.safetyMarginM;

    this._populateVehicleInputs();
    this._populateManeuverInputs();
    this._renderObstaclesListUI();
    this.recomputeAll(false);
  }

  undo() {
    const prevState = this.history.undo();
    if (prevState) {
      this.restoreSnapshot(prevState);
      this._updateUndoRedoButtonsUI();
      this.showToast(this.i18n.t("toast_undo"), "info");
    }
  }

  redo() {
    const nextState = this.history.redo();
    if (nextState) {
      this.restoreSnapshot(nextState);
      this._updateUndoRedoButtonsUI();
      this.showToast(this.i18n.t("toast_redo"), "info");
    }
  }

  _updateUndoRedoButtonsUI() {
    const btnUndo = document.getElementById("btn-undo");
    const btnRedo = document.getElementById("btn-redo");
    if (btnUndo) btnUndo.disabled = !this.history.canUndo();
    if (btnRedo) btnRedo.disabled = !this.history.canRedo();
  }

  _getDiligenceData() {
    return {
      author: document.getElementById("inp-diligence-author")?.value.trim() || "",
      collegiate: document.getElementById("inp-diligence-collegiate")?.value.trim() || "",
      organization: document.getElementById("inp-diligence-organization")?.value.trim() || "",
      date: document.getElementById("inp-diligence-date")?.value.trim() || ""
    };
  }

  _setDiligenceData(diligence = {}) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && typeof val === "string") el.value = val;
    };
    setVal("inp-diligence-author", diligence.author ?? "");
    setVal("inp-diligence-collegiate", diligence.collegiate ?? "");
    setVal("inp-diligence-organization", diligence.organization ?? "");
    setVal("inp-diligence-date", diligence.date ?? "");
  }

  exportSessionJSON() {
    const sessionData = {
      turnsim_version: "1.0.0",
      application: "TurnSim / Open Swept Path Analyzer (OSPA)",
      timestamp: new Date().toISOString(),
      projectName: document.getElementById("inp-project-name")?.value.trim() || "",
      diligence: this._getDiligenceData(),
      waypoints: this.viewer2D?.waypoints || [],
      vehicle: this.vehicle,
      selectedVehicleId: this.selectedVehicleId,
      selectedTractorKey: this.selectedTractorKey,
      selectedTrailerKey: this.selectedTrailerKey,
      maneuver: this.maneuver,
      obstacles: this.obstacles,
      safetyMarginM: this.safetyMarginM,
      discretization: this.discretization,
      viewMode: this.viewMode,
      pnoaConfig: {
        enabled: Boolean(this.viewer2D?.layers?.pnoa && this.viewer2D?.pnoaConfig?.enabled),
        opacity: this.viewer2D?.pnoaConfig?.opacity,
        centerLat: this.viewer2D?.pnoaConfig?.centerLat,
        centerLon: this.viewer2D?.pnoaConfig?.centerLon,
        utmZone: this.viewer2D?.pnoaConfig?.utmZone,
        anchorWorldX: this.viewer2D?.pnoaConfig?.anchorWorldX,
        anchorWorldY: this.viewer2D?.pnoaConfig?.anchorWorldY
      }
    };
    const jsonStr = JSON.stringify(sessionData, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`TurnSim_Proyecto_${dateStr}.turnsim.json`, jsonStr, "application/json;charset=utf-8");
    this.showToast(this.i18n.t("toast_session_saved"), "success");
  }

  importSessionJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.vehicle || !data.maneuver) {
          throw new Error("El archivo no presenta la estructura requerida de proyecto TurnSim.");
        }
        this.vehicle = data.vehicle;
        if (typeof data.projectName === "string") {
          const projEl = document.getElementById("inp-project-name");
          if (projEl) projEl.value = data.projectName;
        }
        if (data.diligence && typeof data.diligence === "object") {
          this._setDiligenceData(data.diligence);
        }
        if (Array.isArray(data.waypoints) && this.viewer2D) {
          this.viewer2D.setWaypoints(data.waypoints);
        }
        this.selectedVehicleId = data.selectedVehicleId || "custom";
        this.selectedTractorKey = data.selectedTractorKey || (data.vehicle.tractorKey || "renault_t_480");
        this.selectedTrailerKey = data.selectedTrailerKey || (data.vehicle.trailerKey || "schmitz_sko_cool");
        this.maneuver = data.maneuver;
        if (Array.isArray(data.obstacles)) {
          this.obstacles = data.obstacles;
        }
        if (typeof data.safetyMarginM === "number") {
          this.safetyMarginM = data.safetyMarginM;
        }
        if (data.discretization) {
          this.discretization = { ...this.discretization, ...data.discretization };
        }
        if (data.pnoaConfig && typeof data.pnoaConfig === "object") {
          this.viewer2D.setPnoaConfig(data.pnoaConfig);
          const chkLayerPnoa = document.getElementById("chk-layer-pnoa");
          if (chkLayerPnoa) chkLayerPnoa.checked = Boolean(data.pnoaConfig.enabled);
          const btnTogglePnoa = document.getElementById("btn-toggle-pnoa");
          if (btnTogglePnoa) {
            btnTogglePnoa.classList.toggle("active", Boolean(data.pnoaConfig.enabled));
          }
        }
        this._populateVehicleInputs();
        this._populateManeuverInputs();
        this._renderObstaclesListUI();
        this.history.pushState(this.getSnapshot());
        this._updateUndoRedoButtonsUI();
        this.recomputeAll(true);
        this.showToast(this.i18n.t("toast_session_loaded"), "success");
      } catch (err) {
        this.showToast(`Error al cargar proyecto: ${err.message}`, "danger");
      }
    };
    reader.readAsText(file);
  }

  _scheduleAutosave() {
    if (this._autosaveTimer) clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => {
      try {
        if (typeof localStorage === "undefined") return;
        const autosaveData = {
          timestamp: new Date().toISOString(),
          snapshot: this.getSnapshot()
        };
        localStorage.setItem("turnsim_session_autosave", JSON.stringify(autosaveData));
      } catch (_) {}
    }, 1500);
  }

  _checkAutosaveRecovery() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem("turnsim_session_autosave");
      if (!raw) return;
      const autosave = JSON.parse(raw);
      if (!autosave || !autosave.snapshot || !autosave.timestamp) return;

      const banner = document.getElementById("autosave-banner");
      if (banner) {
        banner.style.display = "flex";
        const dateObj = new Date(autosave.timestamp);
        const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const txt = banner.querySelector(".autosave-text");
        if (txt) {
          txt.textContent = `💾 Sesión previa guardada detectada (${timeStr}). ¿Desea recuperarla?`;
        }
        const btnRestore = document.getElementById("btn-restore-autosave");
        if (btnRestore) {
          btnRestore.onclick = () => {
            this.restoreSnapshot(autosave.snapshot);
            banner.style.display = "none";
            this.showToast(this.i18n.t("toast_autosave_restored"), "success");
          };
        }
        const btnDismiss = document.getElementById("btn-dismiss-autosave");
        if (btnDismiss) {
          btnDismiss.onclick = () => {
            banner.style.display = "none";
          };
        }
      }
    } catch (_) {}
  }

  toggleCurvesPanel(force) {
    const panel = document.getElementById("panel-pk-curves");
    const btn = document.getElementById("btn-toggle-curves");
    if (!panel) return;
    const isCurrentlyOpen = !panel.classList.contains("collapsed");
    const nextOpen = typeof force === "boolean" ? force : !isCurrentlyOpen;
    panel.classList.toggle("collapsed", !nextOpen);
    this.isCurvesPanelOpen = nextOpen;
    if (btn) {
      btn.classList.toggle("active", nextOpen);
      btn.textContent = nextOpen ? "📈 Ocultar telemetría" : "📈 Curvas de telemetría";
    }
    if (nextOpen) {
      this._renderPKCurves();
    }
  }

  _renderPKCurves() {
    const container = document.getElementById("pk-curves-svg-container");
    if (!container) return;

    if (!this.simResult || !this.simResult.states || !this.simResult.states.length) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;font-style:italic;padding:12px;text-align:center;">
          ℹ️ Defina o trace una maniobra para visualizar las curvas de telemetría de dirección y articulación.
        </div>`;
      return;
    }

    const states = this.simResult.states;
    const getStateDist = (s) => (typeof s.distAlongPathM === "number" ? s.distAlongPathM : (typeof s.dist === "number" ? s.dist : 0));
    const lastDist = getStateDist(states[states.length - 1]);
    const totalDist = Math.max(0.01, this.simResult.summary?.totalDistanceM || lastDist || 1);
    const hasTrailer = Boolean(this.vehicle && this.vehicle.hasTrailer);

    // Ajustar visibilidad de la leyenda de articulación si el vehículo es rígido o articulado
    const legendArticEl = document.getElementById("pk-legend-artic-item") || document.querySelector(".pk-legend-item:has(.pk-legend-artic)");
    if (legendArticEl) {
      legendArticEl.style.display = hasTrailer ? "flex" : "none";
    }

    const W = 1000;
    const H = 120;
    const padL = 50;
    const padR = 25;
    const padT = 15;
    const padB = 25;

    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxAngle = 45;
    for (const s of states) {
      if (Math.abs(s.steerAngleDeg) > maxAngle) maxAngle = Math.ceil(Math.abs(s.steerAngleDeg) / 5) * 5;
      if (hasTrailer && Math.abs(s.articulationAngleDeg) > maxAngle) maxAngle = Math.ceil(Math.abs(s.articulationAngleDeg) / 5) * 5;
    }
    maxAngle = Math.max(30, Math.min(85, maxAngle));

    const scaleX = (dist) => padL + (dist / totalDist) * plotW;
    const scaleY = (angle) => padT + plotH / 2 - (angle / maxAngle) * (plotH / 2);

    let gridSvg = `<line x1="${padL}" y1="${padT + plotH / 2}" x2="${padL + plotW}" y2="${padT + plotH / 2}" stroke="#334155" stroke-dasharray="4 3" stroke-width="1" />`;
    gridSvg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#475569" stroke-width="1.2" />`;
    gridSvg += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#475569" stroke-width="1.2" />`;

    // Rótulos de ejes en español técnico
    gridSvg += `<text x="${padL}" y="${padT - 4}" fill="#38bdf8" font-size="9" text-anchor="start" font-weight="600">Ángulo (°)</text>`;
    gridSvg += `<text x="${padL + plotW}" y="${padT + plotH + 18}" fill="#94a3b8" font-size="9" text-anchor="end">PK / Distancia s (m)</text>`;

    const yTicks = [-maxAngle, -maxAngle / 2, 0, maxAngle / 2, maxAngle];
    for (const yt of yTicks) {
      const y = scaleY(yt);
      gridSvg += `<text x="${padL - 6}" y="${y + 3.5}" fill="#94a3b8" font-size="9" text-anchor="end" font-family="monospace">${yt.toFixed(0)}°</text>`;
      if (yt !== 0) {
        gridSvg += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#1e293b" stroke-width="1" />`;
      }
    }

    const xStep = totalDist > 40 ? 10 : 5;
    for (let d = 0; d <= totalDist; d += xStep) {
      const x = scaleX(d);
      gridSvg += `<line x1="${x}" y1="${padT + plotH}" x2="${x}" y2="${padT + plotH + 4}" stroke="#475569" stroke-width="1" />`;
      gridSvg += `<text x="${x}" y="${padT + plotH + 15}" fill="#94a3b8" font-size="9" text-anchor="middle" font-family="monospace">${d} m</text>`;
    }

    let steerPath = "";
    let articPath = "";
    for (let i = 0; i < states.length; i++) {
      const st = states[i];
      const sDist = getStateDist(st);
      const x = scaleX(sDist).toFixed(1);
      const ySteer = scaleY(st.steerAngleDeg).toFixed(1);
      steerPath += (i === 0 ? `M ${x} ${ySteer}` : ` L ${x} ${ySteer}`);

      if (hasTrailer) {
        const yArtic = scaleY(st.articulationAngleDeg).toFixed(1);
        articPath += (i === 0 ? `M ${x} ${yArtic}` : ` L ${x} ${yArtic}`);
      }
    }

    const curIdx = Math.floor(this.currentFrameFloat || 0);
    const curState = states[Math.min(states.length - 1, curIdx)] || states[0];
    const curDist = getStateDist(curState);
    const curX = scaleX(curDist).toFixed(1);
    const curIndicator = `
      <line id="pk-cursor-line" x1="${curX}" y1="${padT}" x2="${curX}" y2="${padT + plotH}" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="3 2" />
      <circle id="pk-cursor-circle-steer" cx="${curX}" cy="${scaleY(curState.steerAngleDeg).toFixed(1)}" r="3.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1.2" />
      ${hasTrailer ? `<circle id="pk-cursor-circle-artic" cx="${curX}" cy="${scaleY(curState.articulationAngleDeg).toFixed(1)}" r="3.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" />` : ""}
    `;

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${gridSvg}
        <path d="${steerPath}" fill="none" stroke="#38bdf8" stroke-width="2" />
        ${hasTrailer ? `<path d="${articPath}" fill="none" stroke="#f59e0b" stroke-width="1.8" />` : ""}
        ${curIndicator}
      </svg>
    `;

    container.onclick = (e) => {
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, (clickX - (padL * rect.width) / W) / ((plotW * rect.width) / W)));
      const targetDist = ratio * totalDist;

      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < states.length; i++) {
        const sDist = getStateDist(states[i]);
        const diff = Math.abs(sDist - targetDist);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      this.jumpToFrame(closestIdx);
    };
  }

  _updatePKCursor(frameIdx) {
    if (!this.simResult || !this.simResult.states || !this.simResult.states.length) return;
    const states = this.simResult.states;
    const clamped = Math.min(states.length - 1, Math.max(0, frameIdx));
    const st = states[clamped];
    if (!st) return;

    const getStateDist = (s) => (typeof s.distAlongPathM === "number" ? s.distAlongPathM : (typeof s.dist === "number" ? s.dist : 0));
    const lastDist = getStateDist(states[states.length - 1]);
    const totalDist = Math.max(0.01, this.simResult.summary?.totalDistanceM || lastDist || 1);
    const sDist = getStateDist(st);
    const hasTrailer = Boolean(this.vehicle && this.vehicle.hasTrailer);

    const W = 1000;
    const H = 120;
    const padL = 50;
    const padR = 25;
    const padT = 15;
    const padB = 25;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxAngle = 45;
    for (const s of states) {
      if (Math.abs(s.steerAngleDeg) > maxAngle) maxAngle = Math.ceil(Math.abs(s.steerAngleDeg) / 5) * 5;
      if (hasTrailer && Math.abs(s.articulationAngleDeg) > maxAngle) maxAngle = Math.ceil(Math.abs(s.articulationAngleDeg) / 5) * 5;
    }
    maxAngle = Math.max(30, Math.min(85, maxAngle));

    const curX = (padL + (sDist / totalDist) * plotW).toFixed(1);
    const steerY = (padT + plotH / 2 - (st.steerAngleDeg / maxAngle) * (plotH / 2)).toFixed(1);

    const line = document.getElementById("pk-cursor-line");
    if (line) {
      line.setAttribute("x1", curX);
      line.setAttribute("x2", curX);
    }
    const cSteer = document.getElementById("pk-cursor-circle-steer");
    if (cSteer) {
      cSteer.setAttribute("cx", curX);
      cSteer.setAttribute("cy", steerY);
    }
    const cArtic = document.getElementById("pk-cursor-circle-artic");
    if (cArtic && hasTrailer) {
      const articY = (padT + plotH / 2 - (st.articulationAngleDeg / maxAngle) * (plotH / 2)).toFixed(1);
      cArtic.setAttribute("cx", curX);
      cArtic.setAttribute("cy", articY);
    }
  }

  showToast(message, type = "info", durationMs = 3500) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icons = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      danger: "🚫"
    };
    toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);

    let remainingMs = Math.max(800, Number(durationMs) || 3500);
    let startedAt = Date.now();
    let hideTimer = null;
    let isHovered = false;

    const dismiss = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 260);
    };

    const scheduleDismiss = (delay) => {
      if (hideTimer) clearTimeout(hideTimer);
      startedAt = Date.now();
      hideTimer = setTimeout(() => {
        if (!isHovered) dismiss();
      }, delay);
    };

    toast.addEventListener("mouseenter", () => {
      isHovered = true;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      remainingMs = Math.max(1200, remainingMs - (Date.now() - startedAt));
    });

    toast.addEventListener("mouseleave", () => {
      isHovered = false;
      scheduleDismiss(remainingMs);
    });

    scheduleDismiss(remainingMs);
  }

  _buildCriticalToastInfo(repItem, fallbackStatus = null) {
    if (!repItem) {
      return { message: "No hay interacción crítica evaluada para saltar.", type: "info" };
    }
    const pkStr = Number.isFinite(repItem.distAlongPathM) ? `${repItem.distAlongPathM.toFixed(2)} m` : "—";
    const obsName = repItem.name || "Obstáculo";
    const status = repItem.status || fallbackStatus || "INFO";
    const dist = Number.isFinite(repItem.minDistanceM) ? repItem.minDistanceM : null;

    if (status === "COLLISION") {
      return {
        type: "danger",
        message: `Colisión en PK ${pkStr} con «${obsName}»: la envolvente del vehículo invade físicamente el obstáculo (${repItem.statusLabel || "colisión geométrica"}).`
      };
    }
    if (status === "RESTRICTED_INVASION") {
      return {
        type: "danger",
        message: `Invasión de zona restringida en PK ${pkStr} en «${obsName}»: la trayectoria penetra en el área excluida.`
      };
    }
    if (status === "MARGIN_VIOLATION") {
      const distTxt = dist !== null ? `${dist.toFixed(2)} m` : "insuficiente";
      return {
        type: "warning",
        message: `Margen insuficiente en PK ${pkStr} frente a «${obsName}»: separación libre de ${distTxt}, inferior al margen de seguridad (${this.safetyMarginM.toFixed(2)} m).`
      };
    }
    if (status === "NOT_EVALUABLE") {
      return {
        type: "warning",
        message: `Interacción no evaluable en PK ${pkStr} con «${obsName}»: ${repItem.statusLabel || "requiere verificación adicional"}.`
      };
    }
    const clearTxt = dist !== null ? `${dist.toFixed(2)} m` : "verificada";
    return {
      type: "info",
      message: `Punto más próximo en PK ${pkStr} frente a «${obsName}»: holgura libre de ${clearTxt} (cumple el margen de seguridad).`
    };
  }

  jumpToFrame(frameIdx, centerPt = null, options = {}) {
    if (!this.simResult || !this.simResult.states.length) return;
    this.isPlaying = false;
    this._updatePlayButtonUI();
    this.currentFrameFloat = Math.max(0, Math.min(this.simResult.states.length - 1, frameIdx));
    const clampedIdx = Math.floor(this.currentFrameFloat);
    const activeState = this.simResult.states[clampedIdx];
    this.currentAnimDistM = activeState?.dist ?? 0;
    const slider = document.getElementById("slider-timeline");
    if (slider) slider.value = clampedIdx;

    const targetPt = (centerPt && Array.isArray(centerPt))
      ? centerPt
      : (activeState ? [activeState.x, activeState.y] : null);

    if (targetPt) {
      this.viewer2D.camX = targetPt[0];
      this.viewer2D.camY = targetPt[1];
      if (options.zoomToPoint) {
        this.viewer2D.scale = Math.max(this.viewer2D.scale, 18.0);
      }
    }
    this._syncFrameToViewers(clampedIdx);

    if (options.flash && targetPt) {
      this.viewer2D.triggerFlashCircle(targetPt[0], targetPt[1], options.flashColor || "#ef4444");
    }
  }

  toggleSidebar(forceState) {
    const layout = document.querySelector(".app-layout");
    const toggleBtn = document.getElementById("btn-toggle-sidebar");
    if (!layout) return;
    const isCurrentlyCollapsed = layout.classList.contains("sidebar-collapsed");
    const nextCollapsed = typeof forceState === "boolean" ? forceState : !isCurrentlyCollapsed;
    layout.classList.toggle("sidebar-collapsed", nextCollapsed);
    this.leftSidebarCollapsed = nextCollapsed;
    if (toggleBtn) {
      toggleBtn.textContent = nextCollapsed ? "▶" : "◀";
      toggleBtn.title = nextCollapsed ? "Desplegar panel lateral (Ctrl+B)" : "Plegar panel lateral (Ctrl+B)";
    }
    setTimeout(() => {
      this.viewer2D.resize();
      this.viewer3D.resize();
    }, 240);
  }

  _updateDrawDirectionButtonUI(dir = this.viewer2D?.activeDrawDirection || 1) {
    const btnDir = document.getElementById("btn-toggle-draw-dir");
    if (!btnDir) return;
    const isRev = dir === -1;
    btnDir.textContent = isRev
      ? this.i18n.t("btn_dir_reverse")
      : this.i18n.t("btn_dir_forward");
    btnDir.classList.toggle("btn-draw-dir-reverse", isRev);
  }

  _toggleActiveDrawDirection() {
    if (!this.viewer2D) return;
    const nextDir = this.viewer2D.activeDrawDirection === -1 ? 1 : -1;
    this.viewer2D.setActiveDrawDirection(nextDir);
    const wps = this.viewer2D.waypoints;
    // Si ya hay al menos 2 vértices trazados, marcar el último vértice como punto de inversión para los próximos clics
    if (wps && wps.length >= 2) {
      const last = wps[wps.length - 1];
      wps[wps.length - 1] = {
        x: this.viewer2D._wpX(last),
        y: this.viewer2D._wpY(last),
        direction: nextDir,
        directionExplicit: true
      };
      if (typeof this.viewer2D.onWaypointsChange === "function") {
        this.viewer2D.onWaypointsChange(wps, { isDragging: false });
      }
      this.viewer2D.render();
    }
  }

  _setWaypointDirectionFrom(index, newDir) {
    const wps = this.viewer2D?.waypoints;
    if (!wps || index < 0 || index >= wps.length) return;
    for (let i = index; i < wps.length; i++) {
      const curr = wps[i];
      if (i > index && curr && !Array.isArray(curr) && curr.directionExplicit) {
        break;
      }
      wps[i] = {
        x: this.viewer2D._wpX(curr),
        y: this.viewer2D._wpY(curr),
        direction: newDir,
        directionExplicit: i === index
      };
    }
    this.viewer2D.setActiveDrawDirection(wps[wps.length - 1].direction);
    if (typeof this.viewer2D.onWaypointsChange === "function") {
      this.viewer2D.onWaypointsChange(wps, { isDragging: false });
    }
    this.viewer2D.render();
  }

  _hideWaypointContextMenu() {
    const menu = document.getElementById("wp-context-menu");
    if (menu) menu.style.display = "none";
  }

  _showWaypointContextMenu({ index, clientX, clientY, waypoint }) {
    const menu = document.getElementById("wp-context-menu");
    if (!menu) return;
    const currDir = this.viewer2D._wpDir(waypoint, 1);
    const isRev = currDir === -1;
    menu.innerHTML = `
      <div class="wp-ctx-header">Vértice P${index + 1} (${this.viewer2D._wpX(waypoint).toFixed(1)}, ${this.viewer2D._wpY(waypoint).toFixed(1)})</div>
      <button type="button" class="wp-ctx-item ${isRev ? "active-dir" : ""}" data-action="reverse">
        ${this.i18n.t("ctx_wp_reverse_from")}
      </button>
      <button type="button" class="wp-ctx-item ${!isRev ? "active-dir" : ""}" data-action="forward">
        ${this.i18n.t("ctx_wp_forward_from")}
      </button>
      <div class="wp-ctx-sep"></div>
      <button type="button" class="wp-ctx-item wp-ctx-danger" data-action="delete">
        ${this.i18n.t("ctx_wp_delete")}
      </button>
    `;

    menu.style.display = "block";
    const mw = menu.offsetWidth || 220;
    const mh = menu.offsetHeight || 130;
    const left = Math.min(window.innerWidth - mw - 8, Math.max(8, clientX));
    const top = Math.min(window.innerHeight - mh - 8, Math.max(8, clientY));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.querySelector('[data-action="reverse"]')?.addEventListener("click", () => {
      this._setWaypointDirectionFrom(index, -1);
      this._hideWaypointContextMenu();
    });
    menu.querySelector('[data-action="forward"]')?.addEventListener("click", () => {
      this._setWaypointDirectionFrom(index, 1);
      this._hideWaypointContextMenu();
    });
    menu.querySelector('[data-action="delete"]')?.addEventListener("click", () => {
      this.viewer2D.waypoints.splice(index, 1);
      if (typeof this.viewer2D.onWaypointsChange === "function") {
        this.viewer2D.onWaypointsChange(this.viewer2D.waypoints, { isDragging: false });
      }
      this.viewer2D.render();
      this._hideWaypointContextMenu();
    });
  }

  toggleWaypointMode(active) {
    const isActive = this.viewer2D.toggleWaypointMode(active);
    const btn = document.getElementById("btn-draw-waypoints");
    const btnSidebar = document.getElementById("btn-draw-waypoints-sidebar");
    const btnDir = document.getElementById("btn-toggle-draw-dir");
    if (btn) {
      btn.classList.toggle("active", isActive);
      btn.textContent = isActive ? "✏️ Trazar [Activo]" : "✏️ Trazar/Editar ruta";
    }
    if (btnSidebar) {
      btnSidebar.classList.toggle("active", isActive);
      btnSidebar.textContent = isActive ? "✏️ Trazar en plano [Activo]" : "✏️ Trazar / Editar ruta en plano 2D";
    }
    if (btnDir) {
      btnDir.style.display = isActive ? "inline-flex" : "none";
      this._updateDrawDirectionButtonUI();
    }
    if (isActive) {
      const detailsSections = document.querySelectorAll(".left-sidebar details");
      if (detailsSections[2] && !detailsSections[2].open) {
        detailsSections[2].open = true;
      }
      this.showToast("Modo trazado activo: Clic para añadir · Tecla R o clic dcho. en vértice para marcha atrás", "info", 3500);
    }
    return isActive;
  }

  clearVehicleTrajectory() {
    if (this._recomputeTimer) {
      clearTimeout(this._recomputeTimer);
      this._recomputeTimer = null;
    }
    if (this.isPlaying) {
      this.togglePlay();
    }
    if (this.viewer2D.waypointMode) {
      this.toggleWaypointMode(false);
    }
    // Limpiar waypoints en el visor sin emitir evento redundante
    this.viewer2D.clearWaypoints(true);
    const txtEl = document.getElementById("inp-waypoints-text");
    if (txtEl) txtEl.value = "";
    this.maneuver.segments = [];
    this.currentFrameFloat = 0;
    this.currentAnimDistM = 0;
    const slider = document.getElementById("slider-timeline");
    if (slider) {
      slider.value = 0;
      slider.max = 0;
    }
    const pkEl = document.getElementById("timeline-pk-val");
    if (pkEl) pkEl.textContent = "PK 0.00 m";
    this._populateManeuverInputs();
    this._renderSegmentsListUI();
    this.recomputeAll(false);
    this.history.pushState(this.getSnapshot());
    this._updateUndoRedoButtonsUI();
    this.showToast("Trazado borrado. El vehículo permanece en reposo en el origen, listo para una nueva maniobra.", "info");
  }

  toggleMeasureMode(active) {
    const isActive = this.viewer2D.toggleMeasureMode(active);
    const btn = document.getElementById("btn-measure-tool");
    if (btn) {
      btn.classList.toggle("active", isActive);
      btn.textContent = isActive ? "📏 Medir [Activo]" : "📏 Medir distancia";
    }
    return isActive;
  }

  stepFrame(delta) {
    if (!this.simResult || !this.simResult.states.length) return;
    this.isPlaying = false;
    this._updatePlayButtonUI();
    const total = this.simResult.states.length;
    this.currentFrameFloat = Math.max(0, Math.min(total - 1, Math.round(this.currentFrameFloat) + delta));
    this.currentAnimDistM = this.simResult.states[Math.floor(this.currentFrameFloat)]?.dist ?? 0;
    this._syncFrameToViewers(Math.floor(this.currentFrameFloat));
  }

  _initUI() {
    // 1. Selector de vehículo preconfigurado y selectores independientes (Sección A)
    const vehSelect = document.getElementById("select-vehicle");
    const tractorSelect = document.getElementById("select-tractor");
    const trailerSelect = document.getElementById("select-trailer");

    const appendOptGroup = (selectEl, label, items) => {
      if (!items.length) return;
      const grp = document.createElement("optgroup");
      grp.label = label;
      for (const { value, text } of items) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = text;
        grp.appendChild(opt);
      }
      selectEl.appendChild(grp);
    };

    // Llenar tractoras / chasis base organizados por normativa primero y marcas comerciales después
    if (tractorSelect) {
      tractorSelect.innerHTML = "";
      const tractorGroups = [
        {
          label: "📏 Normativa y estándares — Cabezas tractoras",
          keys: ["spain_tractor_t", "generic_schlepp_tractor"]
        },
        {
          label: "🚛 Marcas comerciales — Cabezas tractoras 4x2",
          keys: ["renault_t_480", "mercedes_actros_1845", "daf_xf_480", "volvo_fh_500", "scania_r_450"]
        },
        {
          label: "📏 Normativa y estándares — Turismos y furgonetas",
          keys: ["standard_turismo_p", "standard_furgoneta_l2", "spain_furgon_f"]
        },
        {
          label: "📏 Normativa y estándares — Camiones rígidos y autobuses",
          keys: ["spain_camion_ligero_c", "spain_autobus_rigido_a", "rigid_truck_2axle", "rigid_truck_3axle", "city_bus_12m", "coach_bus_15m"]
        }
      ];
      const usedTractorKeys = new Set();
      for (const g of tractorGroups) {
        const items = [];
        for (const key of g.keys) {
          const tr = TRACTOR_CATALOG[key];
          if (!tr) continue;
          usedTractorKeys.add(key);
          items.push({ value: key, text: `${tr.name} (Batalla: ${tr.wheelbase.toFixed(2)} m)` });
        }
        appendOptGroup(tractorSelect, g.label, items);
      }
      const extraTractors = Object.entries(TRACTOR_CATALOG)
        .filter(([k]) => !usedTractorKeys.has(k))
        .map(([k, tr]) => ({ value: k, text: `${tr.name} (Batalla: ${tr.wheelbase.toFixed(2)} m)` }));
      appendOptGroup(tractorSelect, "Otros chasis", extraTractors);

      tractorSelect.value = this.selectedTractorKey;
      tractorSelect.addEventListener("change", () => {
        this.selectedTractorKey = tractorSelect.value;
        this._onIndependentVehicleChange();
      });
    }

    // Llenar semirremolques organizados por normativa primero y marcas comerciales después
    if (trailerSelect) {
      trailerSelect.innerHTML = "";
      const trailerGroups = [
        {
          label: "📏 Normativa y estándares — Semirremolques",
          keys: ["spain_semitrailer_t", "generic_cisterna_1150", "generic_schlepp_trailer"]
        },
        {
          label: "🚛 Marcas comerciales — Semirremolques",
          keys: ["schmitz_sko_cool", "schmitz_scs_universal", "krone_profi_liner"]
        },
        {
          label: "🚫 Sin semirremolque",
          keys: ["none"]
        }
      ];
      const usedTrailerKeys = new Set();
      for (const g of trailerGroups) {
        const items = [];
        for (const key of g.keys) {
          const tl = TRAILER_CATALOG[key];
          if (!tl) continue;
          usedTrailerKeys.add(key);
          const desc = key === "none" ? tl.name : `${tl.name} (L_t: ${tl.wheelbase.toFixed(2)} m, Ancho: ${tl.width.toFixed(2)} m)`;
          items.push({ value: key, text: desc });
        }
        appendOptGroup(trailerSelect, g.label, items);
      }
      const extraTrailers = Object.entries(TRAILER_CATALOG)
        .filter(([k]) => !usedTrailerKeys.has(k))
        .map(([k, tl]) => ({ value: k, text: `${tl.name} (L_t: ${tl.wheelbase.toFixed(2)} m, Ancho: ${tl.width.toFixed(2)} m)` }));
      appendOptGroup(trailerSelect, "Otros semirremolques", extraTrailers);

      trailerSelect.value = this.selectedTrailerKey;
      trailerSelect.addEventListener("change", () => {
        this.selectedTrailerKey = trailerSelect.value;
        this._onIndependentVehicleChange();
      });
    }

    // Llenar conjuntos preconfigurados: primero normativa/estándares por categoría, después marcas comerciales
    vehSelect.innerHTML = "";
    const vehicleGroups = [
      {
        label: "📏 Normativa y estándares — Turismos y furgonetas",
        keys: ["standard_turismo_p", "standard_furgoneta_l2", "spain_furgon_f"]
      },
      {
        label: "📏 Normativa y estándares — Camiones rígidos y autobuses",
        keys: ["spain_camion_ligero_c", "spain_autobus_rigido_a", "rigid_truck_2axle", "rigid_truck_3axle", "city_bus_12m", "coach_bus_15m"]
      },
      {
        label: "📏 Normativa y estándares — Articulados, trenes y EMS",
        keys: ["spain_camion_articulado_t", "road_train_1875", "ems_megatruck_2525", "generic_schlepp_1650"]
      },
      {
        label: "🚛 Marcas comerciales — Conjuntos articulados",
        keys: ["renault_t_4x2_sko", "mercedes_actros_4x2_scs", "daf_xf_4x2_eu", "volvo_fh_scs", "scania_r_sko"]
      }
    ];
    const usedVehKeys = new Set();
    for (const g of vehicleGroups) {
      const items = [];
      for (const key of g.keys) {
        const v = VEHICLE_CATALOG[key];
        if (!v) continue;
        usedVehKeys.add(key);
        items.push({ value: v.id, text: v.name });
      }
      appendOptGroup(vehSelect, g.label, items);
    }
    const extraVehicles = Object.values(VEHICLE_CATALOG)
      .filter((v) => !usedVehKeys.has(v.id))
      .map((v) => ({ value: v.id, text: v.name }));
    appendOptGroup(vehSelect, "Otros vehículos", extraVehicles);

    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "⚙️ [Personalizado / Combinación libre]";
    vehSelect.appendChild(customOpt);

    vehSelect.value = this.selectedVehicleId;
    vehSelect.addEventListener("change", () => {
      const val = vehSelect.value;
      if (val === "custom") {
        // Si veníamos de un vehículo rígido sin cabeza tractora, restaurar una tractora por defecto para combinar
        if (TRACTOR_CATALOG[this.selectedTractorKey]?.isRigid) {
          this.selectedTractorKey = "spain_tractor_t";
          if (tractorSelect) tractorSelect.value = this.selectedTractorKey;
        }
        if (this.selectedTrailerKey === "none") {
          this.selectedTrailerKey = "spain_semitrailer_t";
          if (trailerSelect) trailerSelect.value = this.selectedTrailerKey;
        }
        this.vehicle = buildCombinedVehicle(this.selectedTractorKey, this.selectedTrailerKey);
        this.selectedVehicleId = "custom";
      } else {
        this.selectedVehicleId = val;
        this.vehicle = cloneVehicleProfile(val);
        if (this.vehicle.tractorKey) {
          this.selectedTractorKey = this.vehicle.tractorKey;
          if (tractorSelect) tractorSelect.value = this.selectedTractorKey;
        }
        if (this.vehicle.trailerKey) {
          this.selectedTrailerKey = this.vehicle.trailerKey;
          if (trailerSelect) trailerSelect.value = this.selectedTrailerKey;
        } else if (!this.vehicle.hasTrailer || !this.vehicle.trailer) {
          this.selectedTrailerKey = "none";
          if (trailerSelect) trailerSelect.value = "none";
        }
      }
      this.isCustomModified = false;
      this._populateVehicleInputs();
      this.recomputeAll(false);
    });

    // 2. Botón de restaurar dimensiones originales (Sección B)
    document.getElementById("btn-reset-vehicle").addEventListener("click", () => {
      if (this.selectedVehicleId && this.selectedVehicleId !== "custom" && VEHICLE_CATALOG[this.selectedVehicleId]) {
        this.vehicle = cloneVehicleProfile(this.selectedVehicleId);
      } else {
        this.vehicle = buildCombinedVehicle(this.selectedTractorKey, this.selectedTrailerKey);
      }
      this.isCustomModified = false;
      this._populateVehicleInputs();
      this.recomputeAll(false);
    });

    // Inputs numéricos de personalización geométrica (Sección B)
    const vehicleInputBindings = [
      ["inp-tr-wb", ["tractor", "wheelbase"]],
      ["inp-tr-fo", ["tractor", "frontOverhang"]],
      ["inp-tr-ro", ["tractor", "rearOverhang"]],
      ["inp-tr-w", ["tractor", "width"]],
      ["inp-tr-track", ["tractor", "trackWidth"]],
      ["inp-tr-hitch", ["tractor", "hitchOffset"]],
      ["inp-tr-steer", ["tractor", "maxSteerAngleDeg"]],
      ["inp-tl-wb", ["trailer", "wheelbase"]],
      ["inp-tl-fo", ["trailer", "frontOverhang"]],
      ["inp-tl-ro", ["trailer", "rearOverhang"]],
      ["inp-tl-w", ["trailer", "width"]],
      ["inp-tl-spacing", ["trailer", "axleSpacing"]],
      ["inp-lim-artic", ["limits", "maxArticulationAngleDeg"]]
    ];

    for (const [elId, path] of vehicleInputBindings) {
      const el = document.getElementById(elId);
      if (!el) continue;
      el.addEventListener("input", () => {
        const val = parseFloat(el.value);
        if (!Number.isFinite(val)) return;
        this.vehicle[path[0]][path[1]] = val;
        this.isCustomModified = true;
        this.scheduleRecompute(120, false);
      });
    }

    // 3. Selector de escenarios preconfigurados (Sección C)
    const scenSelect = document.getElementById("select-scenario");
    scenSelect.innerHTML = "";

    const optEmpty = document.createElement("option");
    optEmpty.value = "";
    optEmpty.textContent = "-- Visor limpio / Sin escenario --";
    scenSelect.appendChild(optEmpty);

    for (const sc of Object.values(PRESET_SCENARIOS)) {
      const opt = document.createElement("option");
      opt.value = sc.id;
      opt.textContent = sc.name;
      scenSelect.appendChild(opt);
    }
    scenSelect.value = this.selectedScenarioId || "";
    scenSelect.addEventListener("change", () => {
      this.selectedScenarioId = scenSelect.value;
      if (!this.selectedScenarioId) {
        this.maneuver = {
          startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
          segments: []
        };
        this.obstacles = [];
        this.referenceAxes = [];
        this.cadBackgroundEntities = [];
        this.activeGeoOrigin = null;
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this._renderObstaclesListUI();
        this.recomputeAll(true);
        return;
      }
      const sc = PRESET_SCENARIOS[this.selectedScenarioId];
      if (!sc) return;
      this.safetyMarginM = sc.safetyMarginM;
      this.maneuver = JSON.parse(JSON.stringify(sc.maneuver));
      this.obstacles = JSON.parse(JSON.stringify(sc.obstacles));
      this.referenceAxes = [];
      this.cadBackgroundEntities = [];
      this.activeGeoOrigin = null;
      document.getElementById("inp-safety-margin").value = this.safetyMarginM;
      this._populateManeuverInputs();
      this._renderObstaclesListUI();
      this._renderSegmentsListUI();
      this.recomputeAll(true);
    });

    // Importador DXF en cliente (Sección C)
    this._initDxfImporterUI();

    // Pose inicial
    for (const [id, key] of [
      ["inp-pose-x", "x"],
      ["inp-pose-y", "y"],
      ["inp-pose-heading", "headingDeg"],
      ["inp-pose-artic", "initialArticulationDeg"]
    ]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener("input", () => {
        const val = parseFloat(el.value);
        if (!Number.isFinite(val)) return;
        this.maneuver.startPose[key] = val;
        this.scheduleRecompute(120, false);
      });
    }

    const selSteeringRef = document.getElementById("sel-steering-ref-point");
    if (selSteeringRef) {
      selSteeringRef.value = this.maneuver.steeringReferencePoint || "rear_axle";
      selSteeringRef.addEventListener("change", (e) => {
        this.maneuver.steeringReferencePoint = e.target.value;
        this._renderSegmentsListUI();
        this.scheduleRecompute(60, false);
      });
    }

    // Botones para añadir tramo recto o curvo
    document.getElementById("btn-add-straight").addEventListener("click", () => {
      this.maneuver.segments.push({ type: "straight", length: 10.0, direction: 1 });
      this._renderSegmentsListUI();
      this.recomputeAll(false);
    });

    document.getElementById("btn-add-arc").addEventListener("click", () => {
      this.maneuver.segments.push({ type: "arc", radius: 12.5, angle: 90.0, direction: 1 });
      this._renderSegmentsListUI();
      this.recomputeAll(false);
    });

    // Generador por puntos de paso (waypoints)
    document.getElementById("btn-apply-waypoints").addEventListener("click", () => {
      const raw = document.getElementById("inp-waypoints-text").value.trim();
      const filletR = parseFloat(document.getElementById("inp-waypoints-radius").value) || 12.5;
      const dir = parseInt(document.getElementById("sel-waypoints-dir").value, 10) || 1;
      const autoDetectCusps = Boolean(document.getElementById("chk-auto-cusps")?.checked);
      const pts = [];
      for (const line of raw.split(/\n|;/)) {
        const parts = line.trim().split(/[\s,]+/);
        if (parts.length >= 2) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            const flag = (parts[2] || "").toUpperCase();
            if (flag === "R") {
              pts.push({ x, y, direction: -1, directionExplicit: true });
            } else if (flag === "D") {
              pts.push({ x, y, direction: 1, directionExplicit: true });
            } else {
              pts.push([x, y]);
            }
          }
        }
      }
      if (pts.length === 1) {
        const p0x = Array.isArray(pts[0]) ? pts[0][0] : pts[0].x;
        const p0y = Array.isArray(pts[0]) ? pts[0][1] : pts[0].y;
        this.maneuver.startPose = {
          ...this.maneuver.startPose,
          x: p0x,
          y: p0y
        };
        this.maneuver.segments = [];
        this.viewer2D.setWaypoints(pts);
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this.recomputeAll(true);
      } else if (pts.length >= 2) {
        const mode = document.getElementById("sel-waypoints-mode")?.value || this.trajectoryMode || "spline";
        const built = buildSegmentsFromWaypoints(pts, filletR, dir, { mode, vehicle: this.vehicle, autoDetectCusps });
        this.maneuver.startPose = {
          ...this.maneuver.startPose,
          ...built.startPose
        };
        this.maneuver.segments = built.segments;
        this.viewer2D.setWaypoints(pts);
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this.recomputeAll(true);
      }
    });

    const btnToggleDrawDir = document.getElementById("btn-toggle-draw-dir");
    if (btnToggleDrawDir) {
      btnToggleDrawDir.addEventListener("click", () => {
        this._toggleActiveDrawDirection();
      });
    }

    const chkAutoCusps = document.getElementById("chk-auto-cusps");
    if (chkAutoCusps) {
      chkAutoCusps.addEventListener("change", () => {
        if (this.viewer2D) {
          this.viewer2D.autoDetectCusps = chkAutoCusps.checked;
        }
      });
    }

    document.addEventListener("click", (e) => {
      const menu = document.getElementById("wp-context-menu");
      if (menu && menu.style.display !== "none" && !menu.contains(e.target)) {
        this._hideWaypointContextMenu();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this._hideWaypointContextMenu();
      } else if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (document.activeElement?.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (this.viewer2D?.waypointMode) {
          e.preventDefault();
          this._toggleActiveDrawDirection();
          const label = this.viewer2D.activeDrawDirection === -1 ? "◀ Retroceso (R)" : "▶ Avance (D)";
          this.showToast(`Sentido de trazado: ${label}`, "info", 1800);
        }
      }
    });

    // Selector y conmutador de método de curvatura (Spline CAD vs Polilínea con acuerdos)
    const selWaypointsMode = document.getElementById("sel-waypoints-mode");
    const colWaypointsRadius = document.getElementById("col-waypoints-radius");
    const btnToggleSpline = document.getElementById("btn-toggle-spline-mode");

    const updateTrajectoryMode = (newMode) => {
      this.trajectoryMode = newMode;
      if (selWaypointsMode) selWaypointsMode.value = newMode;
      if (colWaypointsRadius) {
        colWaypointsRadius.style.display = newMode === "fillet" ? "block" : "none";
      }
      if (btnToggleSpline) {
        btnToggleSpline.textContent = newMode === "spline" ? "⚡ Spline CAD" : "📐 Polilínea";
        btnToggleSpline.title = newMode === "spline"
          ? "Modo activo: Spline CAD continua (clic para cambiar a Polilínea + Arcos)"
          : "Modo activo: Polilínea con acuerdos fijos (clic para cambiar a Spline CAD continua)";
        btnToggleSpline.style.borderColor = newMode === "spline" ? "#0284c7" : "#64748b";
        btnToggleSpline.style.color = newMode === "spline" ? "#38bdf8" : "#94a3b8";
      }
      if (this.viewer2D) {
        this.viewer2D.setTrajectoryMode(newMode);
      }
      if (this.viewer2D?.waypoints?.length >= 2) {
        const filletR = parseFloat(document.getElementById("inp-waypoints-radius")?.value) || 12.5;
        const dir = parseInt(document.getElementById("sel-waypoints-dir")?.value, 10) || 1;
        const built = buildSegmentsFromWaypoints(this.viewer2D.waypoints, filletR, dir, { mode: newMode, vehicle: this.vehicle });
        this.maneuver.startPose = {
          ...this.maneuver.startPose,
          ...built.startPose
        };
        this.maneuver.segments = built.segments;
        this._populateManeuverInputs();
        this._renderSegmentsListUI();
        this.recomputeAll(false);
      }
    };

    if (selWaypointsMode) {
      selWaypointsMode.addEventListener("change", (e) => updateTrajectoryMode(e.target.value));
    }
    if (btnToggleSpline) {
      btnToggleSpline.addEventListener("click", () => {
        const nextMode = this.trajectoryMode === "spline" ? "fillet" : "spline";
        updateTrajectoryMode(nextMode);
      });
    }

    // Discretización numérica
    document.getElementById("inp-step-straight").addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v) && v >= 0.02 && v <= 1.0) {
        this.discretization.straightStepM = v;
        this.recomputeAll(false);
      }
    });

    document.getElementById("inp-step-arc").addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v) && v >= 0.2 && v <= 5.0) {
        this.discretization.arcStepDeg = v;
        this.recomputeAll(false);
      }
    });

    // 4. Modo de visualización (2D / 3D / Split) y Capas (Sección D)
    const modeButtons = document.querySelectorAll(".view-mode-btn");
    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setViewMode(btn.dataset.mode);
      });
    });

    // Botones de encuadre en el visor
    document.getElementById("btn-fit-2d").addEventListener("click", () => {
      this.viewer2D.fitToScene();
    });
    document.getElementById("btn-fit-3d").addEventListener("click", () => {
      this.viewer3D.fitToScene();
    });

    // Control de Deshacer / Rehacer (UX-07)
    const btnUndo = document.getElementById("btn-undo");
    const btnRedo = document.getElementById("btn-redo");
    if (btnUndo) {
      btnUndo.addEventListener("click", () => this.undo());
    }
    if (btnRedo) {
      btnRedo.addEventListener("click", () => this.redo());
    }

    // Guardado y carga de proyectos .turnsim.json (UX-07)
    const btnSaveTop = document.getElementById("btn-save-project-top");
    const btnSaveSec = document.getElementById("btn-export-session");
    if (btnSaveTop) btnSaveTop.addEventListener("click", () => this.exportSessionJSON());
    if (btnSaveSec) btnSaveSec.addEventListener("click", () => this.exportSessionJSON());

    const inpSession = document.getElementById("inp-session-file");
    const btnLoadTop = document.getElementById("btn-load-project-top");
    const btnLoadSec = document.getElementById("btn-import-session");
    if (btnLoadTop && inpSession) btnLoadTop.addEventListener("click", () => inpSession.click());
    if (btnLoadSec && inpSession) btnLoadSec.addEventListener("click", () => inpSession.click());
    if (inpSession) {
      inpSession.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          this.importSessionJSON(e.target.files[0]);
          inpSession.value = "";
        }
      });
    }

    // Conmutador bilingüe ES / EN (SEO-05)
    const btnLang = document.getElementById("btn-lang-toggle");
    if (btnLang) {
      btnLang.addEventListener("click", () => {
        this.i18n.toggleLanguage();
        this._updateStageTitlesUI();
        this._updateVehicleSummaryAndValidationUI();
        this._updateTopTelemetryBar();
        this._renderSegmentsListUI();
        this._renderObstaclesListUI();
      });
    }
    this.i18n.updateDOM();

    // Panel de curvas PK (UX-09)
    const btnCurves = document.getElementById("btn-toggle-curves");
    const btnCloseCurves = document.getElementById("btn-close-curves");
    if (btnCurves) {
      btnCurves.addEventListener("click", () => this.toggleCurvesPanel());
    }
    if (btnCloseCurves) {
      btnCloseCurves.addEventListener("click", () => this.toggleCurvesPanel(false));
    }

    // Herramienta de medición interactiva de distancias en planta 2D
    const btnMeasure = document.getElementById("btn-measure-tool");
    const btnClearMeasure = document.getElementById("btn-clear-measure");
    const pillMeasure = document.getElementById("measure-result-pill");

    if (btnMeasure) {
      btnMeasure.addEventListener("click", () => {
        this.toggleMeasureMode();
      });
    }

    if (btnClearMeasure) {
      btnClearMeasure.addEventListener("click", () => {
        this.viewer2D.clearMeasurement();
      });
    }

    // Herramienta de trazado interactivo de waypoints en planta 2D (UX-04)
    const btnWaypoints = document.getElementById("btn-draw-waypoints");
    const btnWaypointsSidebar = document.getElementById("btn-draw-waypoints-sidebar");
    if (btnWaypoints) {
      btnWaypoints.addEventListener("click", () => {
        this.toggleWaypointMode();
      });
    }
    if (btnWaypointsSidebar) {
      btnWaypointsSidebar.addEventListener("click", () => {
        this.toggleWaypointMode();
      });
    }

    // Herramienta para eliminar el trazado y empezar de nuevo
    const btnClearPath = document.getElementById("btn-clear-path");
    const btnClearPathSidebar = document.getElementById("btn-clear-path-sidebar");
    if (btnClearPath) {
      btnClearPath.addEventListener("click", () => this.clearVehicleTrajectory());
    }
    if (btnClearPathSidebar) {
      btnClearPathSidebar.addEventListener("click", () => this.clearVehicleTrajectory());
    }

    this.viewer2D.onWaypointModeChange = (isActive) => {
      if (btnWaypoints) {
        btnWaypoints.classList.toggle("active", isActive);
        btnWaypoints.textContent = isActive ? "✏️ Trazar [Activo]" : "✏️ Trazar/Editar ruta";
      }
      if (btnWaypointsSidebar) {
        btnWaypointsSidebar.classList.toggle("active", isActive);
        btnWaypointsSidebar.textContent = isActive ? "✏️ Trazar en plano [Activo]" : "✏️ Trazar / Editar ruta en plano 2D";
      }
    };

    // Botón de salto rápido a interacción crítica en barra superior (UX-05)
    const btnJumpCritical = document.getElementById("btn-jump-critical-pk");
    if (btnJumpCritical) {
      btnJumpCritical.addEventListener("click", () => {
        const rep = this.interferenceReport;
        if (rep && rep.criticalInteraction && rep.criticalInteraction.stepIndex !== undefined) {
          const crit = rep.criticalInteraction;
          const flashColor = rep.globalStatus === "COLLISION" || rep.globalStatus === "RESTRICTED_INVASION"
            ? "#ef4444"
            : (rep.globalStatus === "CLEAR" ? "#38bdf8" : "#f59e0b");
          this.jumpToFrame(
            crit.stepIndex,
            crit.pointOnVehicle || crit.pointOnObstacle,
            { zoomToPoint: true, flash: true, flashColor }
          );
          const toastInfo = this._buildCriticalToastInfo(crit, rep.globalStatus);
          this.showToast(toastInfo.message, toastInfo.type, 5000);
        } else {
          this.showToast("No hay interacción crítica evaluada para saltar.", "info", 5000);
        }
      });
    }

    // Botón de plegado del panel lateral (UX-08)
    const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener("click", () => {
        this.toggleSidebar();
      });
    }

    // Modal de guía técnica y metodología (SEO-03)
    const btnMethodology = document.getElementById("btn-open-methodology");
    const modalMethodology = document.getElementById("modal-methodology");
    const btnCloseMethodology = document.getElementById("btn-close-methodology");
    if (btnMethodology && modalMethodology) {
      btnMethodology.addEventListener("click", () => {
        if (typeof modalMethodology.showModal === "function") {
          modalMethodology.showModal();
        } else {
          modalMethodology.style.display = "flex";
        }
      });
    }
    if (btnCloseMethodology && modalMethodology) {
      btnCloseMethodology.addEventListener("click", () => {
        if (typeof modalMethodology.close === "function") {
          modalMethodology.close();
        } else {
          modalMethodology.style.display = "none";
        }
      });
    }

    // Atajos de teclado globales accesibles (UX-06)
    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement ? document.activeElement.tagName.toUpperCase() : "";
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        this.toggleSidebar();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        this.redo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        this.exportSessionJSON();
        return;
      }

      if (isInput) return;

      if (e.code === "Space") {
        e.preventDefault();
        this.isPlaying = !this.isPlaying;
        this._updatePlayButtonUI();
        if (this.isPlaying) this._startAnimationLoop();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        this.stepFrame(-1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        this.stepFrame(1);
      } else if (e.code === "KeyF") {
        e.preventDefault();
        if (this.viewMode === "3d" && this.viewer3D.available) {
          this.viewer3D.fitToScene();
        } else {
          this.viewer2D.fitToScene();
        }
      } else if (e.code === "KeyT") {
        e.preventDefault();
        this.toggleWaypointMode();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        this.toggleMeasureMode();
      }
    });

    this.viewer2D.onMeasureUpdate = (info) => {
      if (info) {
        if (btnClearMeasure) btnClearMeasure.style.display = "inline-block";
        if (pillMeasure) {
          pillMeasure.style.display = "inline-block";
          pillMeasure.textContent = `📏 ${info.distM.toFixed(2)} m (ΔX: ${Math.abs(info.dxM).toFixed(2)} m, ΔY: ${Math.abs(info.dyM).toFixed(2)} m, ∠${info.angleDeg.toFixed(0)}°)`;
        }
      } else {
        if (btnClearMeasure) btnClearMeasure.style.display = "none";
        if (pillMeasure) pillMeasure.style.display = "none";
      }
    };

    this.viewer2D.onMeasureStateChange = (isActive, info) => {
      if (btnMeasure) {
        btnMeasure.classList.toggle("active", isActive);
        btnMeasure.textContent = isActive ? "📏 Medir [Activo]" : "📏 Medir distancia";
      }
      if (!isActive && !info) {
        if (btnClearMeasure) btnClearMeasure.style.display = "none";
        if (pillMeasure) pillMeasure.style.display = "none";
      }
    };

    // Checkboxes de capas
    const layerCheckBindings = [
      ["chk-layer-envelope", "envelope"],
      ["chk-layer-margin", "margin"],
      ["chk-layer-wheels", "wheelTraces"],
      ["chk-layer-refs", "refTraces"],
      ["chk-layer-ghosts", "ghosts"],
      ["chk-layer-obstacles", "obstacles"],
      ["chk-layer-ref-axes", "referenceAxes"],
      ["chk-layer-cad-bg", "cadBackground"],
      ["chk-layer-dims", "dimensions"],
      ["chk-layer-axles", "axlesAndPoints"],
      ["chk-layer-grid", "grid"],
      ["chk-layer-pnoa", "pnoa"]
    ];

    for (const [chkId, layerName] of layerCheckBindings) {
      const el = document.getElementById(chkId);
      if (!el) continue;
      el.addEventListener("change", () => {
        this.viewer2D.layers[layerName] = el.checked;
        if (layerName === "pnoa") {
          this.viewer2D.pnoaConfig.enabled = el.checked;
          const btnTogglePnoa = document.getElementById("btn-toggle-pnoa");
          if (btnTogglePnoa) {
            btnTogglePnoa.classList.toggle("active", el.checked);
            btnTogglePnoa.style.borderColor = el.checked ? "#0284c7" : "#334155";
            btnTogglePnoa.style.color = el.checked ? "#38bdf8" : "#94a3b8";
            btnTogglePnoa.style.background = el.checked ? "rgba(2, 132, 199, 0.28)" : "rgba(15,23,42,0.85)";
          }
        }
        if (layerName in this.viewer3D.layers) {
          this.viewer3D.layers[layerName] = el.checked;
          this.viewer3D.updateLayerVisibility();
        }
        this.viewer2D.render();
      });
    }

    // Configuración y gestión de capa PNOA (IGN)
    this._setupPnoaUI();

    // Margen de seguridad
    const marginInput = document.getElementById("inp-safety-margin");
    marginInput.value = this.safetyMarginM;
    marginInput.addEventListener("input", () => {
      const v = parseFloat(marginInput.value);
      if (Number.isFinite(v) && v >= 0 && v <= 3.0) {
        this.safetyMarginM = v;
        this.scheduleRecompute(120, false);
      }
    });

    // Botón para añadir obstáculo personalizado
    document.getElementById("btn-add-obstacle").addEventListener("click", () => {
      const newIdx = this.obstacles.length + 1;
      this.obstacles.push({
        id: `obs_custom_${Date.now()}`,
        name: `Obstáculo / Elemento #${newIdx}`,
        type: "building",
        shape: "rect",
        x: 12.0,
        y: 6.0,
        length: 4.0,
        width: 2.5,
        headingDeg: 0,
        heightM: 2.5,
        color: "#ef4444",
        enabled: true
      });
      this._renderObstaclesListUI();
      this._recomputeInterferencesOnly();
    });

    // 5. Controles de reproducción (Barra inferior)
    document.getElementById("btn-play-toggle").addEventListener("click", () => {
      this.isPlaying = !this.isPlaying;
      this._updatePlayButtonUI();
    });

    document.getElementById("btn-play-reset").addEventListener("click", () => {
      this.isPlaying = false;
      this.currentFrameFloat = 0;
      this.currentAnimDistM = 0;
      this._updatePlayButtonUI();
      this._syncFrameToViewers(0);
    });

    document.getElementById("sel-play-speed").addEventListener("change", (e) => {
      this.playSpeed = parseFloat(e.target.value) || 1.0;
    });

    const timelineSlider = document.getElementById("slider-timeline");
    timelineSlider.addEventListener("input", () => {
      this.isPlaying = false;
      this._updatePlayButtonUI();
      const idx = parseInt(timelineSlider.value, 10) || 0;
      this.currentFrameFloat = idx;
      this.currentAnimDistM = this.simResult?.states?.[idx]?.dist ?? 0;
      this._syncFrameToViewers(idx);
    });

    // 6. Botones de exportación e informes (Sección E)
    document.getElementById("btn-export-report-pdf").addEventListener("click", () => {
      const projectName =
        document.getElementById("inp-project-name").value.trim() ||
        "Estudio de Seguridad Vial — Simulación de Barrido";
      const scenarioObj = PRESET_SCENARIOS[this.selectedScenarioId];
      openStructuredTechnicalReport({
        projectName,
        scenarioName: scenarioObj ? scenarioObj.name : "Maniobra personalizada",
        vehicle: this.vehicle,
        maneuver: this.maneuver,
        simResult: this.simResult,
        interferenceReport: this.interferenceReport,
        obstacles: this.obstacles,
        layerVisibility: this.viewer2D.layers,
        cadBackgroundEntities: this.cadBackgroundEntities,
        referenceAxes: this.referenceAxes,
        diligence: this._getDiligenceData()
      });
    });

    document.getElementById("btn-export-snapshot").addEventListener("click", () => {
      const scenarioObj = PRESET_SCENARIOS[this.selectedScenarioId];
      let canvasEl = document.getElementById("canvas-2d");
      let label = "Planta Técnica 2D";
      if (this.viewMode === "3d" && this.viewer3D.available && this.viewer3D.renderer) {
        this.viewer3D.renderer.render(this.viewer3D.scene, this.viewer3D.camera);
        canvasEl = this.viewer3D.renderer.domElement;
        label = "Perspectiva 3D (Three.js)";
      }
      exportGraphicViewSnapshot({
        canvasElement: canvasEl,
        viewModeLabel: label,
        vehicle: this.vehicle,
        scenarioName: scenarioObj ? scenarioObj.name : "Maniobra personalizada",
        simResult: this.simResult,
        interferenceReport: this.interferenceReport
      });
    });

    const btnExportReportMd = document.getElementById("btn-export-report-md");
    if (btnExportReportMd) {
      btnExportReportMd.addEventListener("click", () => {
        const projectName =
          document.getElementById("inp-project-name").value.trim() ||
          "Estudio de Seguridad Vial — Simulación de Barrido";
        const scenarioObj = PRESET_SCENARIOS[this.selectedScenarioId];
        downloadMarkdownTechnicalReport({
          projectName,
          scenarioName: scenarioObj ? scenarioObj.name : "Maniobra personalizada",
          vehicle: this.vehicle,
          maneuver: this.maneuver,
          simResult: this.simResult,
          interferenceReport: this.interferenceReport,
          obstacles: this.obstacles,
          diligence: this._getDiligenceData()
        });
      });
    }

    document.getElementById("btn-export-dxf").addEventListener("click", () => {
      const dxf = generateDXFContent(this.simResult, this.obstacles, this.cadBackgroundEntities);
      downloadTextFile(
        `barrido_${this.vehicle.id}_${this.selectedScenarioId}.dxf`,
        dxf,
        "application/dxf;charset=utf-8"
      );
    });

    document.getElementById("btn-export-svg").addEventListener("click", () => {
      const svg = generateSVGDiagram(
        this.simResult,
        this.interferenceReport,
        this.obstacles,
        this.viewer2D.layers,
        this.cadBackgroundEntities
      );
      downloadTextFile(
        `planta_barrido_${this.vehicle.id}_${this.selectedScenarioId}.svg`,
        svg,
        "image/svg+xml;charset=utf-8"
      );
    });

    this._populateVehicleInputs();
    this._populateManeuverInputs();
    this._renderObstaclesListUI();
    this._initHybridWorkflow();
  }

  _getStageTitle(stageNum) {
    const fallbackTitles = {
      1: "1. Escenario y entorno CAD / GIS",
      2: "2. Selección y cotas de vehículo",
      3: "3. Trazado y tramos de maniobra",
      4: "4. Simulación cinemática y capas",
      5: "5. Análisis de resguardo y obstáculos",
      6: "6. Informes técnicos y exportación"
    };
    const key = `stage_${stageNum}_title`;
    return this.i18n ? this.i18n.t(key, fallbackTitles[stageNum]) : fallbackTitles[stageNum];
  }

  _updateStageTitlesUI() {
    const titleEl = document.getElementById("drawer-active-title");
    if (titleEl && this.currentStage) {
      titleEl.textContent = this._getStageTitle(this.currentStage);
    }
    for (let i = 1; i <= 6; i++) {
      const btn = document.getElementById(`act-btn-${i}`);
      if (btn) {
        btn.title = this._getStageTitle(i);
      }
    }
  }

  _initHybridWorkflow() {
    this.currentStage = 4;

    const activateStage = (stageNum) => {
      this.currentStage = stageNum;

      // Actualizar píldoras del stepper
      document.querySelectorAll(".stepper-pill").forEach((pill) => {
        const s = parseInt(pill.dataset.stage, 10);
        pill.classList.toggle("active", s === stageNum);
        if (s < stageNum) {
          pill.classList.add("completed");
          const dot = pill.querySelector(".step-dot");
          if (dot) dot.textContent = "✓";
        } else {
          pill.classList.remove("completed");
          const dot = pill.querySelector(".step-dot");
          if (dot) dot.textContent = String(s);
        }
      });

      // Actualizar botones de la barra de actividades
      document.querySelectorAll(".act-btn[data-stage]").forEach((btn) => {
        const s = parseInt(btn.dataset.stage, 10);
        btn.classList.toggle("active", s === stageNum);
      });

      // Actualizar título de la gaveta
      const titleEl = document.getElementById("drawer-active-title");
      if (titleEl) {
        titleEl.textContent = this._getStageTitle(stageNum);
      }

      // Mostrar el bloque de la etapa y ocultar los demás
      for (let i = 1; i <= 6; i++) {
        const block = document.getElementById(`stage-block-${i}`);
        if (block) {
          block.style.display = i === stageNum ? "block" : "none";
        }
      }

      // Asegurar que la gaveta esté desplegada
      const layout = document.querySelector(".app-layout");
      if (layout && layout.classList.contains("sidebar-collapsed")) {
        this.toggleSidebar(false);
      }
    };

    // Listeners para clics en el stepper
    document.querySelectorAll(".stepper-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const s = parseInt(pill.dataset.stage, 10);
        if (Number.isFinite(s)) activateStage(s);
      });
    });

    // Listeners para clics en la barra de actividades
    document.querySelectorAll(".act-btn[data-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = parseInt(btn.dataset.stage, 10);
        if (!Number.isFinite(s)) return;
        const layout = document.querySelector(".app-layout");
        const isCollapsed = layout && layout.classList.contains("sidebar-collapsed");
        if (s === this.currentStage && !isCollapsed) {
          this.toggleSidebar(true);
        } else {
          activateStage(s);
        }
      });
    });

    // Listeners para botones de navegación interna "Avanzar a..." / "◀ ..."
    document.querySelectorAll(".btn-goto-stage").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = parseInt(btn.dataset.target, 10);
        if (Number.isFinite(s)) activateStage(s);
      });
    });

    // Botón de cierre de la gaveta (✕)
    const btnCloseDrawer = document.getElementById("btn-close-drawer");
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener("click", () => {
        this.toggleSidebar(true);
      });
    }

    // Coordenadas métricas dinámicas del cursor CAD en barra inferior
    const canvas = document.getElementById("canvas-2d");
    const coordsEl = document.getElementById("cad-cursor-coords");
    if (canvas && coordsEl) {
      canvas.addEventListener("mousemove", (e) => {
        if (!this.viewer2D) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const [wx, wy] = this.viewer2D.screenToWorld(mx, my);
        coordsEl.textContent = `COORD: X = ${wx.toFixed(2)} m | Y = ${wy.toFixed(2)} m | Z = 0.00 m`;
      });
    }

    // Estado inicial en Etapa 1: Escenario y Entorno CAD
    activateStage(1);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    const grid = document.getElementById("viewports-grid");
    grid.className = `viewports-grid mode-${mode}`;
    document.querySelectorAll(".view-mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });

    const triggerFit = () => {
      this.viewer2D.resize();
      this.viewer3D.resize();
      if (mode === "3d" || mode === "split") {
        if (!this.viewer3D.available && typeof this.viewer3D.initIfAvailable === "function") {
          this.viewer3D.initIfAvailable();
        }
        if (this._pending3DData && this.viewer3D.available) {
          this.viewer3D.setData(this._pending3DData);
          this._pending3DData = null;
        }
        if (this.viewer3D.available) {
          this.viewer3D.fitToScene();
        }
      } else if (mode === "2d") {
        this.viewer2D.fitToScene();
      }
    };

    // Encuadre inmediato y consolidación tras cálculo de dimensiones de layout
    triggerFit();
    setTimeout(triggerFit, 40);
  }

  _onIndependentVehicleChange() {
    const trObj = TRACTOR_CATALOG[this.selectedTractorKey];
    const isRigid = Boolean(trObj?.isRigid);
    if (isRigid) {
      this.selectedTrailerKey = "none";
    } else if (this.selectedTrailerKey === "none") {
      this.selectedTrailerKey = "schmitz_sko_cool";
    }

    let matchedPreset = null;
    for (const [presetId, preset] of Object.entries(VEHICLE_CATALOG)) {
      if (preset.tractorKey === this.selectedTractorKey && (isRigid || preset.trailerKey === this.selectedTrailerKey)) {
        matchedPreset = presetId;
        break;
      }
    }

    const vehSelect = document.getElementById("select-vehicle");
    if (matchedPreset) {
      this.selectedVehicleId = matchedPreset;
      if (vehSelect) vehSelect.value = matchedPreset;
      this.vehicle = cloneVehicleProfile(matchedPreset);
    } else {
      this.selectedVehicleId = "custom";
      if (vehSelect) vehSelect.value = "custom";
      this.vehicle = buildCombinedVehicle(this.selectedTractorKey, this.selectedTrailerKey);
    }
    this.isCustomModified = false;
    this._populateVehicleInputs();
    this.history.pushState(this.getSnapshot());
    this._updateUndoRedoButtonsUI();
    this.recomputeAll(false);
  }

  _populateVehicleInputs() {
    const v = this.vehicle;
    const isRigid = !v.hasTrailer || !v.trailer;
    const isMultiBodyFixed = Array.isArray(v.trailers) && v.trailers.length > 1;

    const tractorSelect = document.getElementById("select-tractor");
    const trailerSelect = document.getElementById("select-trailer");
    if (tractorSelect) {
      tractorSelect.disabled = isRigid || isMultiBodyFixed;
      tractorSelect.title = tractorSelect.disabled
        ? "No aplica: el vehículo seleccionado no utiliza una cabeza tractora independiente"
        : "Seleccionar cabeza tractora";
    }
    if (trailerSelect) {
      trailerSelect.disabled = isRigid || isMultiBodyFixed;
      if (isRigid) trailerSelect.value = "none";
      trailerSelect.title = trailerSelect.disabled
        ? "No aplica: el vehículo seleccionado no dispone de semirremolque independiente"
        : "Seleccionar semirremolque";
    }

    const trWb = document.getElementById("inp-tr-wb");
    if (trWb) trWb.value = v.tractor.wheelbase;
    const trFo = document.getElementById("inp-tr-fo");
    if (trFo) trFo.value = v.tractor.frontOverhang;
    const trRo = document.getElementById("inp-tr-ro");
    if (trRo) trRo.value = v.tractor.rearOverhang;
    const trW = document.getElementById("inp-tr-w");
    if (trW) trW.value = v.tractor.width;
    const trTrack = document.getElementById("inp-tr-track");
    if (trTrack) trTrack.value = v.tractor.trackWidth || (v.tractor.width - 0.40);
    const trHitch = document.getElementById("inp-tr-hitch");
    if (trHitch) {
      trHitch.value = isRigid ? 0 : v.tractor.hitchOffset;
      trHitch.disabled = isRigid;
    }
    const trSteer = document.getElementById("inp-tr-steer");
    if (trSteer) trSteer.value = v.tractor.maxSteerAngleDeg;

    const trailerGroup = document.getElementById("group-trailer-params");
    const rigidBadge = document.getElementById("badge-rigid-vehicle");
    if (trailerGroup) {
      trailerGroup.classList.toggle("trailer-disabled", isRigid);
    }
    if (rigidBadge) {
      rigidBadge.style.display = isRigid ? "block" : "none";
    }

    const tlSelect = document.getElementById("select-trailer");
    if (tlSelect) {
      tlSelect.value = isRigid ? "none" : (v.trailerKey || "schmitz_sko_cool");
      tlSelect.disabled = isRigid;
    }

    if (!isRigid && v.trailer) {
      const tlWb = document.getElementById("inp-tl-wb");
      if (tlWb) tlWb.value = v.trailer.wheelbase;
      const tlFo = document.getElementById("inp-tl-fo");
      if (tlFo) tlFo.value = v.trailer.frontOverhang;
      const tlRo = document.getElementById("inp-tl-ro");
      if (tlRo) tlRo.value = v.trailer.rearOverhang;
      const tlW = document.getElementById("inp-tl-w");
      if (tlW) tlW.value = v.trailer.width;
      const tlSpacing = document.getElementById("inp-tl-spacing");
      if (tlSpacing) tlSpacing.value = v.trailer.axleSpacing || 1.31;
      const limArtic = document.getElementById("inp-lim-artic");
      if (limArtic) limArtic.value = v.limits?.maxArticulationAngleDeg || 85;
    }
  }

  _updateVehicleSummaryAndValidationUI() {
    const v = this.vehicle;
    const metrics = computeDerivedVehicleMetrics(v);
    const validation = validateVehicleParams(v);

    if (this.viewer2D) {
      this.viewer2D.setMinVehicleTurnRadius(metrics.minRefRadius || metrics.minKerbTurningRadius || 6.8);
    }

    const badgeEl = document.getElementById("vehicle-verification-badge");
    if (this.isCustomModified) {
      badgeEl.className = "badge badge-provisional";
      badgeEl.textContent = "Perfil modificado manualmente por el usuario";
    } else if (v.verified) {
      badgeEl.className = "badge badge-verified";
      badgeEl.textContent = `✓ ${v.verificationBadge}`;
    } else {
      badgeEl.className = "badge badge-provisional";
      badgeEl.textContent = `⚠ ${v.verificationBadge}`;
    }

    const summaryEl = document.getElementById("vehicle-summary-box");
    summaryEl.innerHTML = `
      <div><strong>${v.manufacturer}</strong> — ${v.modelVariant || v.name}</div>
      <div class="vehicle-summary-grid">
        <div>L<sub>total</sub>: <strong>${metrics.totalCoupledLength.toFixed(3)} m</strong></div>
        <div>${v.hasTrailer ? "L<sub>tractora</sub>" : "L<sub>chasis</sub>"}: <strong>${metrics.tractorLength.toFixed(3)} m</strong></div>
        ${v.hasTrailer ? `<div>L<sub>semirrem.</sub>: <strong>${metrics.trailerLength.toFixed(3)} m</strong></div>` : `<div>Carrocería: <strong>Rígido (Cuerpo único)</strong></div>`}
        <div>R<sub>mín,pared</sub>: <strong>${metrics.minWallTurningRadius.toFixed(2)} m</strong></div>
      </div>
      <div style="margin-top:4px;font-size:10px;color:#94a3b8;">
        <strong>Fuente:</strong> ${(v.traceability?.sources || []).join(" · ")}
      </div>
    `;

    const valBox = document.getElementById("vehicle-validation-messages");
    const msgs = [];
    for (const err of validation.errors) {
      msgs.push(`<div class="validation-box validation-error">⛔ ${err}</div>`);
    }
    for (const warn of validation.warnings) {
      msgs.push(`<div class="validation-box validation-warn">⚠️ ${warn}</div>`);
    }
    valBox.innerHTML = msgs.join("");
  }

  _populateManeuverInputs() {
    const sp = this.maneuver.startPose || { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 };
    document.getElementById("inp-pose-x").value = sp.x ?? 0;
    document.getElementById("inp-pose-y").value = sp.y ?? 0;
    document.getElementById("inp-pose-heading").value = sp.headingDeg ?? 0;
    document.getElementById("inp-pose-artic").value = sp.initialArticulationDeg ?? 0;
    const selRef = document.getElementById("sel-steering-ref-point");
    if (selRef) {
      selRef.value = this.maneuver.steeringReferencePoint || "rear_axle";
    }
    this._renderSegmentsListUI();
  }

  _renderSegmentsListUI() {
    const container = document.getElementById("segments-list");
    container.innerHTML = "";

    if (!this.maneuver.segments || this.maneuver.segments.length === 0) {
      container.innerHTML = `<div style="padding:10px;text-align:center;color:#64748b;font-size:11px;border:1px dashed #334155;border-radius:4px;">No hay tramos configurados. Trace una ruta con ✏️ Trazar/Editar ruta o añada un tramo manual.</div>`;
      return;
    }

    if (this.trajectoryMode === "spline" && this.viewer2D?.waypoints?.length >= 2) {
      const nWp = this.viewer2D.waypoints.length;
      let totalLen = 0;
      let minR = Infinity;
      for (const s of this.maneuver.segments) {
        if (s.type === "straight") totalLen += s.length;
        else if (s.type === "arc") {
          totalLen += s.radius * (Math.abs(s.angle) * Math.PI / 180);
          if (s.radius < minR) minR = s.radius;
        }
      }
      const splineHeader = document.createElement("div");
      splineHeader.className = "spline-badge-card";
      splineHeader.style.cssText = "margin-bottom:8px;padding:8px;background:rgba(2,132,199,0.12);border:1px solid #0284c7;border-radius:6px;font-size:11px;";
      splineHeader.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
          <span style="color:#38bdf8;font-weight:600;">⚡ Spline CAD Continua</span>
          <span style="background:rgba(56,189,248,0.2);color:#38bdf8;font-size:10px;padding:1px 6px;border-radius:3px;font-family:monospace;">${nWp} waypoints</span>
        </div>
        <div style="color:#94a3b8;font-size:10.5px;line-height:1.4;">
          Longitud de eje: <b>${totalLen.toFixed(2)} m</b> · Radio mín.: <b style="color:${minR < (this.viewer2D?.minVehicleTurnRadius || 6.8) ? '#f87171' : '#38bdf8'};">${minR !== Infinity ? minR.toFixed(2) + ' m' : '—'}</b>
        </div>
      `;
      container.appendChild(splineHeader);
    }

    this.maneuver.segments.forEach((seg, idx) => {
      const card = document.createElement("div");
      card.className = "segment-item";

      const isStraight = seg.type === "straight";
      const isSpline = seg.type === "spline";
      const header = document.createElement("div");
      header.className = "segment-item-header";
      let segTitle = "Curva circular";
      if (isStraight) segTitle = "Tramo recto";
      else if (isSpline) segTitle = `Spline CAD continua (${seg.waypoints?.length || 0} pts)`;

      header.innerHTML = `
        <span>#${idx + 1} · ${segTitle}</span>
        <button type="button" class="btn btn-danger btn-sm" title="Eliminar tramo">✕</button>
      `;

      header.querySelector("button").addEventListener("click", () => {
        if (this.maneuver.segments.length <= 1) return;
        this.maneuver.segments.splice(idx, 1);
        this._renderSegmentsListUI();
        this.recomputeAll(false);
      });

      const body = document.createElement("div");
      body.className = "form-row-3";

      // Selector de sentido (Avance / Marcha atrás)
      const dirWrap = document.createElement("div");
      dirWrap.innerHTML = `
        <label class="form-label">Sentido</label>
        <select class="seg-dir">
          <option value="1" ${seg.direction !== -1 ? "selected" : ""}>Avance</option>
          <option value="-1" ${seg.direction === -1 ? "selected" : ""}>Atrás (R)</option>
        </select>
      `;
      dirWrap.querySelector(".seg-dir").addEventListener("change", (e) => {
        seg.direction = parseInt(e.target.value, 10) || 1;
        this.recomputeAll(false);
      });
      body.appendChild(dirWrap);

      if (isStraight) {
        const lenWrap = document.createElement("div");
        lenWrap.style.gridColumn = "span 2";
        lenWrap.innerHTML = `
          <label class="form-label">Longitud L (m)</label>
          <input type="number" step="0.5" min="0.5" max="200" value="${seg.length}" />
        `;
        lenWrap.querySelector("input").addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          if (Number.isFinite(val) && val > 0) {
            seg.length = val;
            this.scheduleRecompute(120, false);
          }
        });
        body.appendChild(lenWrap);
      } else if (isSpline) {
        const splineInfoWrap = document.createElement("div");
        splineInfoWrap.style.gridColumn = "span 2";
        const rMinStr = Number.isFinite(seg.minRadius) ? `${seg.minRadius.toFixed(2)} m` : "—";
        splineInfoWrap.innerHTML = `
          <label class="form-label">Curvatura y longitud</label>
          <div style="font-size:11px;color:#94a3b8;padding-top:6px;line-height:1.4;">
            L = <b>${(seg.totalLength || 0).toFixed(2)} m</b> · R<sub>mín</sub> = <b style="color:#38bdf8;">${rMinStr}</b>
          </div>
        `;
        body.appendChild(splineInfoWrap);
      } else {
        const radWrap = document.createElement("div");
        const globalRef = this.maneuver.steeringReferencePoint || "rear_axle";
        const isFront = (seg.steeringReferencePoint || globalRef) === "front_axle";
        const Lwb = this.vehicle?.tractor?.wheelbase || 3.8;
        const eqInfo = isFront && seg.radius > Lwb
          ? ` (Eje motriz calculado: ${Math.sqrt(seg.radius * seg.radius - Lwb * Lwb).toFixed(2)} m)`
          : "";

        radWrap.innerHTML = `
          <label class="form-label" title="${isFront ? 'Radio referido al centro del eje director delantero (Norma 3.1-IC / Guía Nudos)' : 'Radio referido al centro del eje motriz trasero'}">Radio R (m)${isFront ? ' [Directriz]' : ''}</label>
          <input type="number" step="0.25" min="2.0" max="200" value="${seg.radius}" title="${isFront ? `Radio eje director = ${seg.radius} m${eqInfo}` : `Radio eje motriz = ${seg.radius} m`}" />
        `;
        radWrap.querySelector("input").addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          if (Number.isFinite(val) && val >= 1.0) {
            seg.radius = val;
            this.scheduleRecompute(120, false);
          }
        });

        const angWrap = document.createElement("div");
        angWrap.innerHTML = `
          <label class="form-label">Ángulo (° +Izq/-Der)</label>
          <input type="number" step="5" min="-360" max="360" value="${seg.angle}" />
        `;
        angWrap.querySelector("input").addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          if (Number.isFinite(val)) {
            seg.angle = val;
            this.scheduleRecompute(120, false);
          }
        });

        body.appendChild(radWrap);
        body.appendChild(angWrap);
      }

      card.appendChild(header);
      card.appendChild(body);
      container.appendChild(card);
    });
  }

  _syncObstacleCardDOM(movedObs) {
    if (!movedObs) return;
    const container = document.getElementById("obstacles-list");
    if (!container) return;
    const card = Array.from(container.querySelectorAll(".obstacle-item")).find(
      (el) => el.dataset.obsId === String(movedObs.id)
    );
    if (!card) return;
    const xInput = card.querySelector(".obs-x");
    const yInput = card.querySelector(".obs-y");
    if (xInput && document.activeElement !== xInput) xInput.value = movedObs.x ?? 0;
    if (yInput && document.activeElement !== yInput) yInput.value = movedObs.y ?? 0;

    // Actualizar las insignias de distancia mínima de todos los obstáculos sin recrear el DOM
    for (const itemEl of container.querySelectorAll(".obstacle-item")) {
      const obsId = itemEl.dataset.obsId;
      const badgeSlot = itemEl.querySelector(".obs-badge-slot");
      if (!badgeSlot) continue;
      const rep = this.interferenceReport?.obstacleReports?.find((r) => String(r.obstacleId) === obsId);
      badgeSlot.innerHTML = rep
        ? `<span class="badge status-${escapeHTML(rep.status)}" style="font-size:10px;">${
            rep.minDistanceM !== null ? `${rep.minDistanceM.toFixed(2)} m` : "N/E"
          }</span>`
        : "";
    }
  }

  _renderObstaclesListUI() {
    const container = document.getElementById("obstacles-list");
    container.innerHTML = "";

    if (!this.obstacles || this.obstacles.length === 0) {
      container.innerHTML = `<div style="padding:10px;text-align:center;color:#64748b;font-size:11px;border:1px dashed #334155;border-radius:4px;">Sin obstáculos activos. Se pueden importar desde archivo DXF o añadir manualmente.</div>`;
      return;
    }

    this.obstacles.forEach((obs, idx) => {
      const card = document.createElement("div");
      card.className = "obstacle-item";
      card.dataset.obsId = String(obs.id);

      // Buscar estado de este obstáculo en el informe de interferencias
      const rep = this.interferenceReport?.obstacleReports?.find((r) => r.obstacleId === obs.id);
      const distBadge = rep
        ? `<span class="badge status-${escapeHTML(rep.status)}" style="font-size:10px;">${
            rep.minDistanceM !== null ? `${rep.minDistanceM.toFixed(2)} m` : "N/E"
          }</span>`
        : "";

      const canJump = rep && rep.stepIndex !== undefined;
      const jumpLabel = rep?.distAlongPathM !== undefined
        ? `📍 Ir al PK (${rep.distAlongPathM.toFixed(1)}m)`
        : "📍 Ir al PK";
      const jumpBtnHtml = canJump
        ? `<button type="button" class="btn btn-sm btn-outline btn-jump-pk" style="padding:2px 7px;font-size:10px;background:rgba(15,23,42,0.7);color:#38bdf8;border-color:#0284c7;font-weight:600;" title="Saltar al punto de mayor aproximación a este obstáculo (${rep.distAlongPathM?.toFixed(1) ?? 0} m) y centrar la vista">${jumpLabel}</button>`
        : "";

      const header = document.createElement("div");
      header.className = "obstacle-item-header";
      header.innerHTML = `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" class="obs-toggle" ${obs.enabled !== false ? "checked" : ""} />
          <span>${escapeHTML(obs.name)}</span>
        </label>
        <div style="display:flex;align-items:center;gap:5px;">
          ${jumpBtnHtml}
          <span class="obs-badge-slot">${distBadge}</span>
          <button type="button" class="btn btn-danger btn-sm obs-del" title="Eliminar obstáculo">✕</button>
        </div>
      `;

      header.querySelector(".obs-toggle").addEventListener("change", (e) => {
        obs.enabled = e.target.checked;
        this._recomputeInterferencesOnly();
        this._renderObstaclesListUI();
      });

      header.querySelector(".obs-del").addEventListener("click", () => {
        this.obstacles.splice(idx, 1);
        this._recomputeInterferencesOnly();
        this._renderObstaclesListUI();
      });

      const jumpBtnEl = header.querySelector(".btn-jump-pk");
      if (jumpBtnEl && rep) {
        jumpBtnEl.addEventListener("click", () => {
          const flashColor = rep.status === "COLLISION" || rep.status === "RESTRICTED_INVASION"
            ? "#ef4444"
            : (rep.status === "CLEAR" ? "#38bdf8" : "#f59e0b");
          this.jumpToFrame(
            rep.stepIndex,
            rep.pointOnVehicle || rep.pointOnObstacle,
            { zoomToPoint: true, flash: true, flashColor }
          );
          const toastInfo = this._buildCriticalToastInfo(rep);
          this.showToast(toastInfo.message, toastInfo.type, 5000);
        });
      }

      card.appendChild(header);

      // Si el obstáculo es rectangular (por defecto o forma rect/rectangle) (UX-05)
      const isRect = obs.shape === "rect" || obs.shape === "rectangle" || (!obs.shape && !obs.vertices);
      if (isRect) {
        const coordsRow = document.createElement("div");
        coordsRow.className = "form-row-3";
        coordsRow.innerHTML = `
          <div>
            <label class="form-label">X centro (m)</label>
            <input type="number" step="0.25" class="obs-x" value="${obs.x ?? 0}" />
          </div>
          <div>
            <label class="form-label">Y centro (m)</label>
            <input type="number" step="0.25" class="obs-y" value="${obs.y ?? 0}" />
          </div>
          <div>
            <label class="form-label">Largo L (m)</label>
            <input type="number" step="0.25" min="0.2" class="obs-len" value="${obs.length ?? 4}" />
          </div>
        `;

        const propsRow = document.createElement("div");
        propsRow.className = "form-row-3";
        propsRow.style.marginTop = "5px";
        propsRow.innerHTML = `
          <div>
            <label class="form-label">Ancho W (m)</label>
            <input type="number" step="0.25" min="0.2" class="obs-width" value="${obs.width ?? 2}" />
          </div>
          <div>
            <label class="form-label">Giro (°)</label>
            <input type="number" step="1" min="0" max="360" class="obs-heading" value="${obs.headingDeg ?? 0}" />
          </div>
          <div>
            <label class="form-label">Tipo</label>
            <select class="obs-type">
              <option value="building" ${obs.type === "building" ? "selected" : ""}>Edificio</option>
              <option value="road_edge" ${obs.type === "road_edge" ? "selected" : ""}>Bordillo</option>
              <option value="loading_dock" ${obs.type === "loading_dock" ? "selected" : ""}>Muelle</option>
              <option value="restricted_zone" ${obs.type === "restricted_zone" ? "selected" : ""}>Restringida</option>
              <option value="fence" ${obs.type === "fence" ? "selected" : ""}>Vallado</option>
            </select>
          </div>
        `;

        coordsRow.querySelector(".obs-x").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.x = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        coordsRow.querySelector(".obs-y").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.y = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        coordsRow.querySelector(".obs-len").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > 0.1) {
            obs.length = v;
            this.scheduleInterferencesRecompute(50);
          }
        });

        propsRow.querySelector(".obs-width").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > 0.1) {
            obs.width = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        propsRow.querySelector(".obs-heading").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.headingDeg = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        propsRow.querySelector(".obs-type").addEventListener("change", (e) => {
          obs.type = e.target.value;
          this.scheduleInterferencesRecompute(50);
        });

        card.appendChild(coordsRow);
        card.appendChild(propsRow);
      } else if (obs.shape === "circle" || obs.shape === "arc_curb") {
        const coordsRow = document.createElement("div");
        coordsRow.className = "form-row-3";
        coordsRow.innerHTML = `
          <div>
            <label class="form-label">X centro (m)</label>
            <input type="number" step="0.25" class="obs-x" value="${obs.x ?? 0}" />
          </div>
          <div>
            <label class="form-label">Y centro (m)</label>
            <input type="number" step="0.25" class="obs-y" value="${obs.y ?? 0}" />
          </div>
          <div>
            <label class="form-label">Radio (m)</label>
            <input type="number" step="0.25" min="0.2" class="obs-dim" value="${obs.radius ?? 3}" />
          </div>
        `;
        coordsRow.querySelector(".obs-x").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.x = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        coordsRow.querySelector(".obs-y").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.y = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        coordsRow.querySelector(".obs-dim").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > 0.1) {
            obs.radius = v;
            this.scheduleInterferencesRecompute(50);
          }
        });
        card.appendChild(coordsRow);
      }

      container.appendChild(card);
    });
  }

  _recomputeInterferencesOnly() {
    if (!this.simResult) return;
    this.workerClient.recomputeInterferences(
      {
        simResult: this.simResult,
        obstacles: this.obstacles,
        safetyMarginM: this.safetyMarginM
      },
      (err, result) => {
        if (err) {
          console.error("Error al recalcular interferencias:", err);
          return;
        }
        this.interferenceReport = result.interferenceReport;
        this.viewer2D.setData({
          vehicle: this.vehicle,
          simResult: this.simResult,
          obstacles: this.obstacles,
          interferenceReport: this.interferenceReport,
          cadBackgroundEntities: this.cadBackgroundEntities,
          referenceAxes: this.referenceAxes
        });
        this.viewer3D.updateObstaclesAndInterferences(this.obstacles, this.interferenceReport);
        this._updateTopTelemetryBar();
        this._renderPKCurves();
      }
    );
  }

  recomputeAll(fitCamera = false, previewMode = false) {
    this._updateVehicleSummaryAndValidationUI();
    if (!previewMode) {
      this._scheduleAutosave();
    }

    // Si no hay tramos definidos en la maniobra
    if (!this.maneuver || !this.maneuver.segments || this.maneuver.segments.length === 0) {
      const hasSceneContent =
        (this.cadBackgroundEntities && this.cadBackgroundEntities.length > 0) ||
        (this.referenceAxes && this.referenceAxes.length > 0) ||
        (this.obstacles && this.obstacles.length > 0) ||
        (this.viewer2D && this.viewer2D.waypoints && this.viewer2D.waypoints.length > 0) ||
        (this.viewer2D && this.viewer2D.layers && this.viewer2D.layers.pnoa && this.viewer2D.pnoaConfig && this.viewer2D.pnoaConfig.enabled);

      // Si no hay contenido ni plano de fondo en la escena, mantener el visor completamente vacío
      if (!hasSceneContent) {
        this.simResult = null;
        this.interferenceReport = null;

        const slider = document.getElementById("slider-timeline");
        if (slider) {
          slider.value = 0;
          slider.max = 0;
        }
        const pkEl = document.getElementById("timeline-pk-val");
        if (pkEl) pkEl.textContent = "PK 0.00 m";

        this.viewer2D.setData({
          vehicle: this.vehicle,
          simResult: null,
          obstacles: [],
          interferenceReport: null,
          cadBackgroundEntities: [],
          referenceAxes: []
        });

        this.viewer3D.setData({
          vehicle: this.vehicle,
          simResult: null,
          obstacles: [],
          interferenceReport: null,
          cadBackgroundEntities: [],
          referenceAxes: []
        });

        if (fitCamera) {
          this.viewer2D.fitToScene();
          this.viewer3D.fitToScene();
        }

        this._updateTopTelemetryBar();
        this._renderObstaclesListUI();
        this._renderSegmentsListUI();
        this._renderPKCurves();
        this._setComputingStatus(false);
        return;
      }

      // Si hay plano CAD, GeoJSON u obstáculos, generar estado base en reposo para ubicar el vehículo en el origen
      const idleSimResult = buildCompleteSimulationResult(
        this.vehicle,
        {
          startPose: this.maneuver?.startPose || { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
          steeringReferencePoint: this.maneuver?.steeringReferencePoint || "rear_axle",
          segments: []
        },
        {
          safetyMarginM: this.safetyMarginM
        }
      );
      this.simResult = idleSimResult;
      this.interferenceReport = null;

      const slider = document.getElementById("slider-timeline");
      if (slider) {
        slider.value = 0;
        slider.max = 0;
      }
      const pkEl = document.getElementById("timeline-pk-val");
      if (pkEl) pkEl.textContent = "PK 0.00 m";

      this.viewer2D.setData({
        vehicle: this.vehicle,
        simResult: this.simResult,
        obstacles: this.obstacles,
        interferenceReport: null,
        cadBackgroundEntities: this.cadBackgroundEntities,
        referenceAxes: this.referenceAxes
      });

      this.viewer3D.setData({
        vehicle: this.vehicle,
        simResult: this.simResult,
        obstacles: this.obstacles,
        interferenceReport: null,
        cadBackgroundEntities: this.cadBackgroundEntities,
        referenceAxes: this.referenceAxes,
        waypoints: this.viewer2D?.waypoints
      });

      if (fitCamera) {
        this.viewer2D.fitToScene();
        this.viewer3D.fitToScene();
      }

      this._updateTopTelemetryBar();
      this._renderObstaclesListUI();
      this._renderSegmentsListUI();
      this._renderPKCurves();
      this._setComputingStatus(false);
      return;
    }

    this._setComputingStatus(true);
    const simOpts = previewMode
      ? {
          ...this.discretization,
          straightStepM: Math.max(0.15, Number(this.discretization?.straightStepM || 0.05)),
          arcStepDeg: Math.max(1.5, Number(this.discretization?.arcStepDeg || 0.5)),
          steeringReferencePoint: this.maneuver.steeringReferencePoint || "rear_axle",
          safetyMarginM: this.safetyMarginM,
          previewMode: true
        }
      : {
          ...this.discretization,
          steeringReferencePoint: this.maneuver.steeringReferencePoint || "rear_axle",
          safetyMarginM: this.safetyMarginM,
          previewMode: false
        };
    this.workerClient.recomputeAll(
      {
        vehicle: this.vehicle,
        maneuver: this.maneuver,
        options: simOpts,
        obstacles: this.obstacles,
        safetyMarginM: this.safetyMarginM
      },
      (err, result) => {
        this._setComputingStatus(false);
        if (err) {
          console.error("Error en recálculo general:", err);
          return;
        }
        this.simResult = result.simResult;
        this.interferenceReport = result.interferenceReport;

        const totalStates = this.simResult.states.length;
        const slider = document.getElementById("slider-timeline");
        if (slider) {
          slider.max = Math.max(0, totalStates - 1);
          if (this.currentFrameFloat >= totalStates) {
            this.currentFrameFloat = Math.max(0, totalStates - 1);
          }
          slider.value = Math.floor(this.currentFrameFloat);
        }

        this.viewer2D.setData({
          vehicle: this.vehicle,
          simResult: this.simResult,
          obstacles: this.obstacles,
          interferenceReport: this.interferenceReport,
          cadBackgroundEntities: this.cadBackgroundEntities,
          referenceAxes: this.referenceAxes
        });

        const data3D = {
          vehicle: this.vehicle,
          simResult: this.simResult,
          obstacles: this.obstacles,
          interferenceReport: this.interferenceReport,
          cadBackgroundEntities: this.cadBackgroundEntities,
          referenceAxes: this.referenceAxes,
          waypoints: this.viewer2D?.waypoints
        };
        if (this.viewMode === "2d") {
          this._pending3DData = data3D;
        } else {
          this._pending3DData = null;
          this.viewer3D.setData(data3D);
        }

        if (fitCamera) {
          this.viewer2D.fitToScene();
          if (this.viewMode !== "2d") this.viewer3D.fitToScene();
        }

        this._syncFrameToViewers(Math.floor(this.currentFrameFloat));
        this._updateTopTelemetryBar();
        if (!previewMode) {
          this._renderObstaclesListUI();
          this._renderPKCurves();
        }
      }
    );
  }

  _updateTopTelemetryBar() {
    const sweptEl = document.getElementById("kpi-swept-width");
    const distEl = document.getElementById("kpi-total-dist");
    const steerEl = document.getElementById("kpi-max-steer");
    const articEl = document.getElementById("kpi-max-artic");
    const clearanceEl = document.getElementById("kpi-min-clearance");
    const statusBadge = document.getElementById("global-interference-badge");
    const btnJump = document.getElementById("btn-jump-critical-pk");

    if (!this.simResult) {
      if (sweptEl) sweptEl.textContent = "—";
      if (distEl) distEl.textContent = "—";
      if (steerEl) steerEl.textContent = `0.0° / ${this.vehicle?.tractor?.maxSteerAngleDeg || 38}°`;
      if (articEl) articEl.textContent = this.vehicle?.hasTrailer ? "0.0°" : "N/A (Rígido)";
      if (clearanceEl) clearanceEl.textContent = "—";
      if (statusBadge) {
        statusBadge.className = "status-banner-pill status-CLEAR";
        statusBadge.textContent = "LISTO (SIN SIMULACIÓN ACTIVA)";
        statusBadge.style.cursor = "default";
        statusBadge.onclick = null;
      }
      if (btnJump) {
        btnJump.textContent = "📍 Ir al PK crítico";
        btnJump.title = "Situar la simulación en el punto de máxima proximidad u obstáculo crítico";
      }
      return;
    }

    const sum = this.simResult.summary;
    if (sweptEl) sweptEl.textContent = `${sum.maxSweptWidthM.toFixed(2)} m`;
    if (distEl) distEl.textContent = `${sum.totalDistanceM.toFixed(2)} m`;
    if (steerEl) steerEl.textContent = `${sum.maxSteerAngleDeg.toFixed(1)}° / ${this.vehicle.tractor.maxSteerAngleDeg}°`;
    if (articEl) articEl.textContent = this.vehicle.hasTrailer
      ? `${sum.maxArticulationAngleDeg.toFixed(1)}° / ${this.vehicle.limits?.maxArticulationAngleDeg || 85}°`
      : "N/A (Rígido)";

    const rep = this.interferenceReport;
    if (clearanceEl) {
      if (rep && rep.minClearanceM !== null) {
        clearanceEl.textContent = `${rep.minClearanceM.toFixed(2)} m`;
      } else {
        clearanceEl.textContent = "—";
      }
    }

    if (btnJump) {
      if (rep && rep.criticalInteraction && rep.criticalInteraction.stepIndex !== undefined) {
        btnJump.textContent = `📍 Ir al PK (${rep.criticalInteraction.distAlongPathM.toFixed(1)} m)`;
        btnJump.title = `Situar simulación en el punto de máxima proximidad (PK ${rep.criticalInteraction.distAlongPathM.toFixed(2)} m · ${rep.criticalInteraction.name})`;
      } else {
        btnJump.textContent = "📍 Ir al PK crítico";
        btnJump.title = "Situar la simulación en el punto de máxima proximidad u obstáculo crítico";
      }
    }

    if (statusBadge && rep) {
      statusBadge.className = `status-banner-pill status-${rep.globalStatus}`;
      statusBadge.textContent = rep.globalStatusLabel;
      if (rep.criticalInteraction && rep.criticalInteraction.stepIndex !== undefined && rep.globalStatus !== "CLEAR") {
        statusBadge.style.cursor = "pointer";
        statusBadge.title = `Haga clic para saltar al punto crítico en PK ${rep.criticalInteraction.distAlongPathM?.toFixed(2) ?? 0} m`;
        statusBadge.onclick = () => {
          const crit = rep.criticalInteraction;
          const flashColor = rep.globalStatus === "COLLISION" || rep.globalStatus === "RESTRICTED_INVASION"
            ? "#ef4444"
            : "#f59e0b";
          this.jumpToFrame(
            crit.stepIndex,
            crit.pointOnVehicle || crit.pointOnObstacle,
            { zoomToPoint: true, flash: true, flashColor }
          );
          const toastInfo = this._buildCriticalToastInfo(crit, rep.globalStatus);
          this.showToast(toastInfo.message, toastInfo.type, 5000);
        };
      } else {
        statusBadge.style.cursor = "default";
        statusBadge.title = "";
        statusBadge.onclick = null;
      }
    } else if (statusBadge && !rep) {
      statusBadge.className = "status-banner-pill status-CLEAR";
      statusBadge.textContent = (!this.maneuver || !this.maneuver.segments || this.maneuver.segments.length === 0)
        ? "LISTO (VEHÍCULO EN REPOSO)"
        : "SIN INTERFERENCIAS DETECTADAS";
      statusBadge.style.cursor = "default";
      statusBadge.onclick = null;
    }
  }

  _syncFrameToViewers(frameIdx) {
    if (!this.simResult || !this.simResult.states.length) return;
    const clamped = Math.max(0, Math.min(this.simResult.states.length - 1, frameIdx));
    this.viewer2D.setFrameIndex(clamped);
    this.viewer3D.setFrameIndex(clamped);

    const st = this.simResult.states[clamped];
    const slider = document.getElementById("slider-timeline");
    slider.value = clamped;

    const labelEl = document.getElementById("timeline-readout");
    if (st && labelEl) {
      const dirBadge = st.direction === -1 ? "ATRÁS" : "AVANCE";
      const steerVal = Number(st.steerAngleDeg ?? 0).toFixed(1);
      const articVal = Number(st.articulationAngleDeg ?? st.articulationDeg ?? 0).toFixed(1);
      labelEl.textContent = `PK ${st.dist.toFixed(2)} m / ${this.simResult.summary.totalDistanceM.toFixed(2)} m (${dirBadge}) · δ=${steerVal}° · γ=${articVal}°`;
    }

    if (this.isCurvesPanelOpen) {
      this._updatePKCursor(clamped);
    }
  }

  _updatePlayButtonUI() {
    const btn = document.getElementById("btn-play-toggle");
    btn.textContent = this.isPlaying ? "⏸ Pausar" : "▶ Reproducir";
    if (this.isPlaying) {
      this._startAnimationLoop();
    } else if (this._animRafId !== null) {
      cancelAnimationFrame(this._animRafId);
      this._animRafId = null;
      this.lastAnimTime = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Módulo de Importación CAD / GIS (DXF y GeoJSON con georreferenciación PNOA)
  // ---------------------------------------------------------------------------
  _initDxfImporterUI() {
    const fileInput = document.getElementById("inp-dxf-file");
    const dropZone = document.getElementById("dxf-drop-zone");

    if (dropZone && fileInput) {
      dropZone.setAttribute("tabindex", "0");
      dropZone.setAttribute("role", "button");
      dropZone.setAttribute("aria-label", "Zona de carga de archivo CAD DXF o GeoJSON. Pulse Intro o Espacio para seleccionar archivo");

      dropZone.addEventListener("click", () => fileInput.click());
      dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInput.click();
        }
      });

      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
      });
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this._loadVectorFiles(e.dataTransfer.files);
        }
      });

      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this._loadVectorFiles(e.target.files);
          fileInput.value = "";
        }
      });
    }
  }

  _loadVectorFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    const geoFiles = files.filter((f) => {
      const n = (f.name || "").toLowerCase();
      return n.endsWith(".geojson") || n.endsWith(".json");
    });
    const dxfFiles = files.filter((f) => (f.name || "").toLowerCase().endsWith(".dxf"));

    if (geoFiles.length > 0) {
      this._loadGeoJsonFiles(geoFiles);
    } else if (dxfFiles.length > 0) {
      this._loadDxfFile(dxfFiles[0]);
    } else {
      this._loadDxfFile(files[0]);
    }
  }

  _loadVectorFile(file) {
    if (!file) return;
    this._loadVectorFiles([file]);
  }

  _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`No se pudo leer el archivo ${file.name}.`));
      reader.readAsText(file);
    });
  }

  async _loadGeoJsonFiles(files) {
    if (!files || files.length === 0) return;
    try {
      const inspected = [];
      for (const file of files) {
        const text = await this._readFileAsText(file);
        inspected.push(inspectGeoJSONFile(text, file.name));
      }
      this._showGeoJsonImportModal(inspected);
    } catch (err) {
      console.error("Error al procesar archivo(s) GeoJSON:", err);
      this.showToast(`Error al procesar GeoJSON: ${err.message}`, "danger");
    }
  }

  _applyPnoaConfigToUI(pnoaConfig) {
    if (!pnoaConfig) return;
    this.viewer2D.setPnoaConfig(pnoaConfig);
    const chkPnoa = document.getElementById("chk-layer-pnoa");
    if (chkPnoa) chkPnoa.checked = Boolean(pnoaConfig.enabled);
    const btnPnoa = document.getElementById("btn-toggle-pnoa");
    if (btnPnoa) {
      if (pnoaConfig.enabled) {
        btnPnoa.classList.add("active");
        btnPnoa.style.background = "rgba(2, 132, 199, 0.4)";
      } else {
        btnPnoa.classList.remove("active");
        btnPnoa.style.background = "";
      }
    }
    const modalLat = document.getElementById("inp-pnoa-lat");
    const modalLon = document.getElementById("inp-pnoa-lon");
    if (modalLat) modalLat.value = pnoaConfig.centerLat;
    if (modalLon) modalLon.value = pnoaConfig.centerLon;
  }

  _showGeoJsonImportModal(inspectedFiles) {
    const existing = document.getElementById("geojson-modal-container");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "geojson-modal-container";
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "modal-geojson-title");

    const hasAnyUtm = inspectedFiles.some((f) => f.isUtm);
    const canAppend = Boolean(
      this.activeGeoOrigin &&
      ((this.obstacles && this.obstacles.length > 0) ||
       (this.referenceAxes && this.referenceAxes.length > 0) ||
       (this.cadBackgroundEntities && this.cadBackgroundEntities.length > 0))
    );

    const roleOptions = [
      ["reference_axes", "Ejes viales de referencia (guía + snap)"],
      ["obstacles", "Obstáculos físicos (colisión)"],
      ["boundaries", "Bordes de calzada / bordillos"],
      ["restricted", "Zonas restringidas / excluidas"],
      ["background", "Fondo contextual (solo visual)"],
      ["auto", "Detección automática por propiedades"]
    ];

    const rowsHtml = inspectedFiles.map((info, idx) => {
      const geomSummary = Object.entries(info.geomCounts || {})
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      const crsLabel = info.isUtm ? "UTM" : "WGS84";
      const opts = roleOptions
        .map(([val, lbl]) => `<option value="${val}" ${info.suggestedRole === val ? "selected" : ""}>${escapeHTML(lbl)}</option>`)
        .join("");
      return `
        <div class="layer-field-row" style="margin-bottom:10px;padding:8px;background:rgba(15,23,42,0.55);border:1px solid #334155;border-radius:6px;">
          <div class="layer-field-label" style="margin-bottom:4px;">
            <span style="font-weight:600;color:#e2e8f0;">📄 ${escapeHTML(info.fileName)}</span>
            <span class="layer-match-badge">${info.featureCount} ent. · ${crsLabel}</span>
          </div>
          <div style="font-size:10.5px;color:#94a3b8;margin-bottom:6px;">Geometrías: ${escapeHTML(geomSummary || "Ninguna")}</div>
          <select id="modal-geojson-role-${idx}" style="width:100%;">${opts}</select>
        </div>
      `;
    }).join("");

    backdrop.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 id="modal-geojson-title">🌍 Importación GIS GeoJSON (${inspectedFiles.length} archivo${inspectedFiles.length > 1 ? "s" : ""})</h3>
          <button type="button" class="btn btn-sm btn-outline" id="btn-geojson-modal-close" aria-label="Cerrar ventana">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-top:0;margin-bottom:12px;color:#94a3b8;font-size:11px;">
            Todos los archivos seleccionados se proyectarán sobre un <strong>origen georreferenciado común</strong> alineado con la ortofoto PNOA. Confirme el rol de cada archivo:
          </p>
          ${rowsHtml}
          ${hasAnyUtm ? `
            <div class="form-row" style="margin-top:10px;">
              <div>
                <label class="form-label" for="modal-geojson-utm-zone">Huso UTM (ETRS89 España)</label>
                <select id="modal-geojson-utm-zone" style="width:100%;">
                  <option value="28">Huso 28 (Canarias)</option>
                  <option value="29">Huso 29 (Galicia / Oeste)</option>
                  <option value="30" selected>Huso 30 (Centro / Península)</option>
                  <option value="31">Huso 31 (Cataluña / Baleares)</option>
                </select>
              </div>
            </div>
          ` : ""}
          ${canAppend ? `
            <div style="margin-top:10px;padding:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.35);border-radius:6px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:#e2e8f0;cursor:pointer;">
                <input type="checkbox" id="modal-geojson-append" checked />
                <span>Añadir a la escena actual (conservar capas y origen georreferenciado existentes)</span>
              </label>
            </div>
          ` : ""}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline btn-sm" id="btn-geojson-modal-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-geojson-modal-apply">✓ Cargar capas GeoJSON</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const onKeydownModal = (e) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeydownModal);
    const closeModal = () => {
      window.removeEventListener("keydown", onKeydownModal);
      backdrop.remove();
    };

    document.getElementById("btn-geojson-modal-close").addEventListener("click", closeModal);
    document.getElementById("btn-geojson-modal-cancel").addEventListener("click", closeModal);

    document.getElementById("btn-geojson-modal-apply").addEventListener("click", () => {
      try {
        const utmZoneEl = document.getElementById("modal-geojson-utm-zone");
        const utmZone = utmZoneEl ? parseInt(utmZoneEl.value, 10) || 30 : 30;
        const appendEl = document.getElementById("modal-geojson-append");
        const appendMode = Boolean(appendEl && appendEl.checked && this.activeGeoOrigin);

        const entries = inspectedFiles.map((info, idx) => ({
          fileName: info.fileName,
          features: info.features,
          role: document.getElementById(`modal-geojson-role-${idx}`)?.value || info.suggestedRole || "auto"
        }));

        const scenario = buildScenarioFromGeoJSONFiles(entries, {
          utmZone,
          sharedOrigin: appendMode ? this.activeGeoOrigin : null
        });

        this._applyGeoJsonScenario(scenario, inspectedFiles.map((f) => f.fileName), appendMode);
        closeModal();
      } catch (err) {
        console.error("Error al aplicar capas GeoJSON:", err);
        this.showToast(`Error al cargar GeoJSON: ${err.message}`, "danger");
      }
    });
  }

  _applyGeoJsonScenario(scenario, fileNames = [], appendMode = false) {
    this.selectedScenarioId = "custom_geojson";
    const scSelect = document.getElementById("select-scenario");
    if (scSelect) {
      let customOpt = scSelect.querySelector("option[value='custom_geojson']");
      if (!customOpt) {
        customOpt = document.createElement("option");
        customOpt.value = "custom_geojson";
        scSelect.appendChild(customOpt);
      }
      const label = fileNames.length > 1 ? `GeoJSON (${fileNames.length} capas)` : `GeoJSON: ${fileNames[0] || "Escenario"}`;
      customOpt.textContent = label;
      scSelect.value = "custom_geojson";
    }

    if (appendMode) {
      this.obstacles = [...(this.obstacles || []), ...(scenario.obstacles || [])];
      this.referenceAxes = [...(this.referenceAxes || []), ...(scenario.referenceAxes || [])];
      this.cadBackgroundEntities = [...(this.cadBackgroundEntities || []), ...(scenario.backgroundEntities || [])];
    } else {
      this.obstacles = scenario.obstacles || [];
      this.referenceAxes = scenario.referenceAxes || [];
      this.cadBackgroundEntities = scenario.backgroundEntities || [];
      this.activeGeoOrigin = scenario.sharedOrigin || null;
    }

    this._renderObstaclesListUI();

    if (!appendMode) {
      if (scenario.maneuver && scenario.maneuver.segments && scenario.maneuver.segments.length > 0) {
        this.maneuver = scenario.maneuver;
        this.viewer2D.clearWaypoints(true);
      } else {
        this.maneuver = {
          startPose: {
            x: scenario.bounds ? Number((scenario.bounds.minX + 5).toFixed(2)) : 0,
            y: scenario.bounds ? Number((scenario.bounds.minY + 5).toFixed(2)) : 0,
            headingDeg: 0,
            initialArticulationDeg: 0
          },
          segments: []
        };
        this.viewer2D.clearWaypoints(true);
      }
      this._populateManeuverInputs();
      this._renderSegmentsListUI();
      if (scenario.pnoaConfig) {
        this._applyPnoaConfigToUI(scenario.pnoaConfig);
      }
    }

    this.viewer2D.setData({
      vehicle: this.vehicle,
      simResult: this.simResult,
      obstacles: this.obstacles,
      interferenceReport: this.interferenceReport,
      cadBackgroundEntities: this.cadBackgroundEntities,
      referenceAxes: this.referenceAxes
    });

    this.viewer3D.setData({
      vehicle: this.vehicle,
      simResult: this.simResult,
      obstacles: this.obstacles,
      interferenceReport: this.interferenceReport,
      cadBackgroundEntities: this.cadBackgroundEntities,
      referenceAxes: this.referenceAxes,
      waypoints: this.viewer2D?.waypoints
    });

    if (this.maneuver && this.maneuver.segments && this.maneuver.segments.length > 0) {
      this.recomputeAll(!appendMode);
    } else {
      this.recomputeAll(false);
      this.viewer2D.fitToScene();
      this.viewer3D.fitToScene();
    }

    this.history.pushState(this.getSnapshot());
    this._updateUndoRedoButtonsUI();

    const axesCount = this.referenceAxes.length;
    const obsCount = this.obstacles.length;
    const bgCount = this.cadBackgroundEntities.length;
    this.showToast(
      `GeoJSON ${appendMode ? "añadido" : "cargado"}: ${axesCount} ejes de referencia, ${obsCount} obstáculos, ${bgCount} elem. de fondo. Ortofoto PNOA alineada.`,
      "success",
      4500
    );
  }

  _adoptReferenceAxisAsWaypoints(axis, meta = {}) {
    if (!axis || !Array.isArray(axis.vertices) || axis.vertices.length < 2) return;
    let pts = axis.vertices.map(([x, y]) => [Number(x), Number(y)]);

    // Orientar el eje desde el extremo más cercano al punto donde hizo Shift+Clic el usuario
    if (Array.isArray(meta.clickWorld) && meta.clickWorld.length >= 2) {
      const [cx, cy] = meta.clickWorld;
      const dStart = Math.hypot(pts[0][0] - cx, pts[0][1] - cy);
      const dEnd = Math.hypot(pts[pts.length - 1][0] - cx, pts[pts.length - 1][1] - cy);
      if (dEnd < dStart) {
        pts = pts.reverse();
      }
    }

    // Simplificar si el eje CAD/GIS viene hiper-densificado (> 40 vértices) preservando puntos clave
    if (pts.length > 40) {
      const reduced = [pts[0]];
      let accum = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        accum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (accum >= 3.0) {
          reduced.push(pts[i]);
          accum = 0;
        }
      }
      reduced.push(pts[pts.length - 1]);
      pts = reduced;
    }

    const dir = this.viewer2D?.activeDrawDirection === -1 ? -1 : 1;
    const wps = pts.map(([x, y]) => ({
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      direction: dir,
      directionExplicit: false
    }));

    this.viewer2D.setWaypoints(wps);
    if (typeof this.viewer2D.onWaypointsChange === "function") {
      this.viewer2D.onWaypointsChange(wps, { isDragging: false });
    }
    this.showToast(`Eje «${axis.name || axis.layer}» adoptado como trayectoria (${wps.length} vértices).`, "success", 3000);
  }

  _loadDxfFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = parseDXF(text);
        if (!parsed.layers || parsed.layers.length === 0) {
          this.showToast("El archivo DXF no contiene capas ni entidades legibles.", "warning");
          return;
        }
        this.currentParsedDXF = parsed;
        const suggested = detectSuggestedLayerMapping(parsed.layers);
        this._showDxfLayerMappingModal(parsed, suggested, file.name);
      } catch (err) {
        console.error("Error al procesar archivo DXF:", err);
        this.showToast(`Error al procesar el archivo DXF: ${err.message}`, "danger");
      }
    };
    reader.onerror = () => {
      this.showToast("No se pudo leer el archivo seleccionado.", "danger");
    };
    reader.readAsText(file);
  }

  _showDxfLayerMappingModal(parsedDxf, suggested, fileName) {
    const existing = document.getElementById("dxf-modal-container");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "dxf-modal-container";
    backdrop.className = "modal-backdrop";

    const layers = parsedDxf.layers;

    const buildOptions = (selectedVal, noneLabel = "-- Ninguna (Omitir) --") => {
      let html = `<option value="">${escapeHTML(noneLabel)}</option>`;
      for (const l of layers) {
        const stats = parsedDxf.layerStats[l];
        const count = stats ? ` (${stats.count} ent.)` : "";
        const isSel = l === selectedVal ? "selected" : "";
        const safeL = escapeHTML(l);
        html += `<option value="${safeL}" ${isSel}>${safeL}${count}</option>`;
      }
      return html;
    };

    const buildMultiOptions = (selectedList = []) => {
      let html = "";
      for (const l of layers) {
        const stats = parsedDxf.layerStats[l];
        const count = stats ? ` (${stats.count})` : "";
        const isSel = selectedList.includes(l) ? "selected" : "";
        const safeL = escapeHTML(l);
        html += `<option value="${safeL}" ${isSel}>${safeL}${count}</option>`;
      }
      return html;
    };

    const refAxesMatchBadge = (suggested.referenceAxisLayers && suggested.referenceAxisLayers.length > 0)
      ? `<span class="layer-match-badge">✓ ${suggested.referenceAxisLayers.length} capa(s) de ejes</span>`
      : "";

    const trajMatchBadge = suggested.trajectoryLayer
      ? `<span class="layer-match-badge">✓ Detectada automáticamente</span>`
      : `<span style="font-size:10px;color:#94a3b8;">Opcional (recomendado usar Ejes de referencia + Trazar/Editar ruta)</span>`;

    const obsMatchBadge = suggested.obstacleLayers.length > 0
      ? `<span class="layer-match-badge">✓ ${suggested.obstacleLayers.length} capa(s) sugeridas</span>`
      : "";

    // Detectar si las coordenadas del DXF parecen UTM (ETRS89 España) para ofrecer alineación PNOA
    let rawMinX = Infinity, rawMaxX = -Infinity, rawMinY = Infinity, rawMaxY = -Infinity;
    const scalePreview = parsedDxf.suggestedScale || 1.0;
    for (const ent of parsedDxf.entities || []) {
      for (const pt of ent.vertices || []) {
        const vx = pt[0] * scalePreview;
        const vy = pt[1] * scalePreview;
        if (vx < rawMinX) rawMinX = vx;
        if (vx > rawMaxX) rawMaxX = vx;
        if (vy < rawMinY) rawMinY = vy;
        if (vy > rawMaxY) rawMaxY = vy;
      }
    }
    const midX = 0.5 * (rawMinX + rawMaxX);
    const midY = 0.5 * (rawMinY + rawMaxY);
    const isUtmPreview = Number.isFinite(midX) && midX > 100000 && midX < 900000 && midY > 3000000 && midY < 5500000;

    // Lista de capas candidatas a fondo contextual (todas con checkbox marcado por defecto)
    const assignedSet = new Set([
      ...(suggested.referenceAxisLayers || []),
      ...(suggested.obstacleLayers || []),
      ...(suggested.boundaryLayers || []),
      ...(suggested.restrictedLayers || []),
      ...(suggested.trajectoryLayer ? [suggested.trajectoryLayer] : [])
    ]);
    const bgLayersHtml = layers.map((l) => {
      const stats = parsedDxf.layerStats[l];
      const count = stats ? stats.count : 0;
      const safeL = escapeHTML(l);
      const isSpecial = assignedSet.has(l);
      return `
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:${isSpecial ? "#64748b" : "#cbd5e1"};padding:2px 0;cursor:pointer;">
          <input type="checkbox" class="modal-bg-layer-chk" value="${safeL}" checked />
          <span>${safeL}</span>
          <span style="color:#64748b;font-size:10px;">(${count} ent.)</span>
        </label>
      `;
    }).join("");

    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "modal-dxf-title");

    backdrop.innerHTML = `
      <div class="modal-dialog" style="max-height:88vh;display:flex;flex-direction:column;">
        <div class="modal-header">
          <h3 id="modal-dxf-title">📂 Importación de plano CAD DXF: ${escapeHTML(fileName)}</h3>
          <button type="button" class="btn btn-sm btn-outline" id="btn-modal-close" aria-label="Cerrar ventana">✕</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;">
          <p style="margin-top:0;margin-bottom:12px;color:#94a3b8;font-size:11px;">
            TurnSim ha analizado el plano y ha asignado las capas que coinciden con la plantilla técnica recomendada.
            Puede confirmar o modificar la correspondencia de capas desde los desplegables:
          </p>

          <!-- 1. EJES VIALES DE REFERENCIA (GUÍA Y SNAP) -->
          <div class="layer-field-row">
            <div class="layer-field-label">
              <span>Ejes viales de referencia (guía visual + snap magnético):</span>
              ${refAxesMatchBadge}
            </div>
            <select id="modal-sel-ref-axes" multiple size="3" style="width:100%;background:#0b1120;color:#f8fafc;border:1px solid #0891b2;border-radius:4px;padding:4px;">
              ${buildMultiOptions(suggested.referenceAxisLayers || [])}
            </select>
            <div class="layer-desc-hint">Se muestran en cian eje-punto; al trazar ruta permiten imantar vértices y adoptar un eje con Shift+Clic.</div>
          </div>

          <!-- 2. OBSTÁCULOS Y EDIFICIOS -->
          <div class="layer-field-row">
            <div class="layer-field-label">
              <span>Obstáculos físicos / envolventes / edificaciones:</span>
              ${obsMatchBadge}
            </div>
            <select id="modal-sel-obstacles" multiple size="3" style="width:100%;background:#0b1120;color:#f8fafc;border:1px solid #334155;border-radius:4px;padding:4px;">
              ${buildMultiOptions(suggested.obstacleLayers)}
            </select>
            <div class="layer-desc-hint">Líneas abiertas o polígonos que provocan colisión física (Ctrl/Cmd para selección múltiple).</div>
          </div>

          <!-- 3. BORDILLOS Y DELIMITACIONES -->
          <div class="layer-field-row">
            <div class="layer-field-label">
              <span>Bordes de calzada / bordillos:</span>
            </div>
            <select id="modal-sel-boundaries" multiple size="2" style="width:100%;background:#0b1120;color:#f8fafc;border:1px solid #334155;border-radius:4px;padding:4px;">
              ${buildMultiOptions(suggested.boundaryLayers)}
            </select>
          </div>

          <!-- 4. ZONAS RESTRINGIDAS -->
          <div class="layer-field-row">
            <div class="layer-field-label">
              <span>Zonas restringidas / excluidas:</span>
            </div>
            <select id="modal-sel-restricted" multiple size="2" style="width:100%;background:#0b1120;color:#f8fafc;border:1px solid #334155;border-radius:4px;padding:4px;">
              ${buildMultiOptions(suggested.restrictedLayers)}
            </select>
          </div>

          <!-- 5. EJE DE TRAYECTORIA DIRECTA (OPCIONAL) -->
          <div class="layer-field-row">
            <div class="layer-field-label">
              <span>Trayectoria automática única (opcional):</span>
              ${trajMatchBadge}
            </div>
            <select id="modal-sel-trajectory" style="width:100%;">
              ${buildOptions(suggested.trajectoryLayer, "-- No importar trayectoria automática (trazar manualmente sobre el plano) --")}
            </select>
          </div>

          <!-- Sentido y radio de acuerdo -->
          <div class="form-row" style="margin-bottom:12px;">
            <div>
              <label class="form-label" for="modal-sel-dir">Sentido de marcha</label>
              <select id="modal-sel-dir" style="width:100%;">
                <option value="1" selected>Avance (sentido de dibujo)</option>
                <option value="-1">Marcha atrás (retroceso)</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="modal-inp-agreement">Radio mínimo de acuerdo (m)</label>
              <input type="number" id="modal-inp-agreement" value="12.5" step="0.5" min="5" max="50" style="width:100%;" />
            </div>
          </div>

          ${isUtmPreview ? `
            <!-- GEORREFERENCIACIÓN UTM -> PNOA -->
            <div class="layer-field-row" style="padding:8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.35);border-radius:6px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:#e2e8f0;cursor:pointer;margin-bottom:6px;">
                <input type="checkbox" id="modal-dxf-enable-pnoa" checked />
                <span>🛰️ Coordenadas UTM detectadas: alinear ortofoto aérea PNOA (ETRS89)</span>
              </label>
              <div style="display:flex;align-items:center;gap:8px;">
                <label class="form-label" for="modal-dxf-utm-zone" style="margin:0;white-space:nowrap;">Huso UTM:</label>
                <select id="modal-dxf-utm-zone" style="flex:1;">
                  <option value="28">Huso 28 (Canarias)</option>
                  <option value="29">Huso 29 (Galicia / Oeste)</option>
                  <option value="30" selected>Huso 30 (Centro / Península)</option>
                  <option value="31">Huso 31 (Cataluña / Baleares)</option>
                </select>
              </div>
            </div>
          ` : ""}

          <!-- 6. RESTO DE CAPAS CONTEXTUALES -->
          <details style="margin-top:8px;border:1px solid #334155;border-radius:6px;padding:6px 8px;background:rgba(15,23,42,0.45);">
            <summary style="cursor:pointer;font-size:11.5px;font-weight:600;color:#cbd5e1;">
              Capas contextuales de fondo (desmarque las que desee omitir)
            </summary>
            <div style="display:flex;gap:8px;margin:6px 0;">
              <button type="button" class="btn btn-xs btn-outline" id="btn-bg-layers-all">Todas</button>
              <button type="button" class="btn btn-xs btn-outline" id="btn-bg-layers-none">Ninguna</button>
            </div>
            <div style="max-height:120px;overflow-y:auto;padding-right:4px;">
              ${bgLayersHtml}
            </div>
          </details>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-outline btn-sm" id="btn-modal-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-modal-apply">✓ Aplicar plano</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const onKeydownModal = (e) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeydownModal);

    const closeModal = () => {
      window.removeEventListener("keydown", onKeydownModal);
      backdrop.remove();
    };
    document.getElementById("btn-modal-close").addEventListener("click", closeModal);
    document.getElementById("btn-modal-cancel").addEventListener("click", closeModal);

    document.getElementById("btn-bg-layers-all")?.addEventListener("click", () => {
      backdrop.querySelectorAll(".modal-bg-layer-chk").forEach((c) => { c.checked = true; });
    });
    document.getElementById("btn-bg-layers-none")?.addEventListener("click", () => {
      backdrop.querySelectorAll(".modal-bg-layer-chk").forEach((c) => { c.checked = false; });
    });

    document.getElementById("btn-modal-apply").addEventListener("click", () => {
      const trajLayer = document.getElementById("modal-sel-trajectory").value || null;

      const getSelected = (selId) => {
        const el = document.getElementById(selId);
        return el ? Array.from(el.selectedOptions).map((o) => o.value) : [];
      };

      const refAxisLayers = getSelected("modal-sel-ref-axes");
      const obsLayers = getSelected("modal-sel-obstacles");
      const bndLayers = getSelected("modal-sel-boundaries");
      const rstLayers = getSelected("modal-sel-restricted");
      const excludedBackgroundLayers = Array.from(backdrop.querySelectorAll(".modal-bg-layer-chk"))
        .filter((c) => !c.checked)
        .map((c) => c.value);
      const direction = parseInt(document.getElementById("modal-sel-dir").value, 10) || 1;
      const agreementRadius = parseFloat(document.getElementById("modal-inp-agreement").value) || 12.5;
      const enablePnoa = Boolean(document.getElementById("modal-dxf-enable-pnoa")?.checked);
      const utmZone = parseInt(document.getElementById("modal-dxf-utm-zone")?.value, 10) || 30;

      const mapping = {
        trajectoryLayer: trajLayer,
        referenceAxisLayers: refAxisLayers,
        obstacleLayers: obsLayers,
        boundaryLayers: bndLayers,
        restrictedLayers: rstLayers,
        excludedBackgroundLayers
      };

      try {
        const scenario = buildScenarioFromDXF(parsedDxf, mapping, {
          direction,
          agreementRadius,
          scale: parsedDxf.suggestedScale || 1.0
        });

        if (scenario.maneuver && scenario.maneuver.segments && scenario.maneuver.segments.length > 0) {
          this.maneuver = scenario.maneuver;
          this.viewer2D.clearWaypoints(true);
          this._populateManeuverInputs();
          this._renderSegmentsListUI();
        } else {
          this.maneuver = {
            startPose: {
              x: scenario.bounds ? Number((scenario.bounds.minX + 5).toFixed(2)) : 0,
              y: scenario.bounds ? Number((scenario.bounds.minY + 5).toFixed(2)) : 0,
              headingDeg: 0,
              initialArticulationDeg: 0
            },
            segments: []
          };
          this.viewer2D.clearWaypoints(true);
          this.simResult = null;
          this.interferenceReport = null;
          this._populateManeuverInputs();
          this._renderSegmentsListUI();
        }

        this.obstacles = scenario.obstacles || [];
        this.referenceAxes = scenario.referenceAxes || [];
        this.cadBackgroundEntities = scenario.backgroundEntities || [];
        this._renderObstaclesListUI();

        // Alineación PNOA si el DXF viene en UTM y el usuario la activó
        let pnoaAligned = false;
        if (enablePnoa && scenario.originOffset && scenario.isUtmLikely) {
          const pnoaCfg = buildPnoaConfigFromUtmOrigin(scenario.originOffset, utmZone);
          if (pnoaCfg) {
            this._applyPnoaConfigToUI(pnoaCfg);
            this.activeGeoOrigin = {
              isUtm: true,
              utmZone,
              utmCenterX: scenario.originOffset.x,
              utmCenterY: scenario.originOffset.y,
              centerLon: pnoaCfg.centerLon,
              centerLat: pnoaCfg.centerLat
            };
            pnoaAligned = true;
          }
        } else {
          this.activeGeoOrigin = null;
        }

        this.viewer2D.setData({
          vehicle: this.vehicle,
          simResult: this.simResult,
          obstacles: this.obstacles,
          interferenceReport: this.interferenceReport,
          cadBackgroundEntities: this.cadBackgroundEntities,
          referenceAxes: this.referenceAxes
        });

        this.viewer3D.setData({
          vehicle: this.vehicle,
          simResult: this.simResult,
          obstacles: this.obstacles,
          interferenceReport: this.interferenceReport,
          cadBackgroundEntities: this.cadBackgroundEntities,
          referenceAxes: this.referenceAxes,
          waypoints: this.viewer2D?.waypoints
        });

        closeModal();

        if (this.maneuver && this.maneuver.segments && this.maneuver.segments.length > 0) {
          this.recomputeAll(true);
        } else {
          this.viewer2D.fitToScene();
          this.viewer3D.fitToScene();
          this._updateTopTelemetryBar();
          const pnoaMsg = pnoaAligned ? " Ortofoto PNOA alineada." : "";
          this.showToast(
            `Plano DXF cargado: ${this.referenceAxes.length} ejes de referencia, ${this.obstacles.length} obstáculos, ${this.cadBackgroundEntities.length} elem. de fondo.${pnoaMsg}`,
            "success",
            4500
          );
        }
      } catch (err) {
        console.error("Error al construir escenario desde DXF:", err);
        this.showToast(`Error al generar la simulación desde el DXF: ${err.message}`, "danger");
      }
    });
  }

  _setupPnoaUI() {
    const btnTogglePnoa = document.getElementById("btn-toggle-pnoa");
    const btnConfigPnoa = document.getElementById("btn-config-pnoa");
    const chkLayerPnoa = document.getElementById("chk-layer-pnoa");
    const modalPnoa = document.getElementById("modal-pnoa-config");
    const btnCloseModal = document.getElementById("btn-close-pnoa-modal");
    const btnSaveClose = document.getElementById("btn-pnoa-save-close");
    const chkActive = document.getElementById("modal-chk-pnoa-active");
    const sliderOpacity = document.getElementById("slider-pnoa-opacity");
    const lblOpacity = document.getElementById("lbl-pnoa-opacity-val");
    const inpSearch = document.getElementById("inp-pnoa-search");
    const btnSearch = document.getElementById("btn-pnoa-search");
    const searchStatus = document.getElementById("pnoa-search-status");
    const btnApplyCoords = document.getElementById("btn-pnoa-apply-coords");
    const btnRecenter = document.getElementById("btn-pnoa-recenter-view");

    const syncPnoaButtonState = () => {
      const active = Boolean(this.viewer2D.layers.pnoa && this.viewer2D.pnoaConfig.enabled);
      if (btnTogglePnoa) {
        btnTogglePnoa.classList.toggle("active", active);
        btnTogglePnoa.style.borderColor = active ? "#0284c7" : "#334155";
        btnTogglePnoa.style.color = active ? "#38bdf8" : "#94a3b8";
        btnTogglePnoa.style.background = active ? "rgba(2, 132, 199, 0.28)" : "rgba(15,23,42,0.85)";
      }
      if (chkLayerPnoa) {
        chkLayerPnoa.checked = active;
      }
      if (chkActive) {
        chkActive.checked = active;
      }
    };

    if (btnTogglePnoa) {
      btnTogglePnoa.addEventListener("click", () => {
        const next = !this.viewer2D.layers.pnoa;
        this.viewer2D.setPnoaConfig({ enabled: next });
        syncPnoaButtonState();
        this.showToast(next ? "🛰️ Capa de ortofotografía aérea PNOA activada." : "🛰️ Ortofoto PNOA desactivada.", "info");
      });
    }

    if (chkLayerPnoa) {
      chkLayerPnoa.addEventListener("change", () => {
        this.viewer2D.setPnoaConfig({ enabled: chkLayerPnoa.checked });
        syncPnoaButtonState();
      });
    }

    const openPnoaModal = () => {
      if (!modalPnoa) return;
      if (chkActive) chkActive.checked = Boolean(this.viewer2D.layers.pnoa && this.viewer2D.pnoaConfig.enabled);
      const op = Math.round((this.viewer2D.pnoaConfig.opacity || 0.8) * 100);
      if (sliderOpacity) sliderOpacity.value = op;
      if (lblOpacity) lblOpacity.textContent = `${op}%`;

      const inpLat = document.getElementById("inp-pnoa-lat");
      const inpLon = document.getElementById("inp-pnoa-lon");
      if (inpLat) inpLat.value = (this.viewer2D.pnoaConfig.centerLat || 40.3872).toFixed(5);
      if (inpLon) inpLon.value = (this.viewer2D.pnoaConfig.centerLon || -3.8785).toFixed(5);

      if (typeof modalPnoa.showModal === "function") {
        modalPnoa.showModal();
      } else {
        modalPnoa.style.display = "flex";
      }
    };

    const closePnoaModal = () => {
      if (!modalPnoa) return;
      if (typeof modalPnoa.close === "function") {
        modalPnoa.close();
      } else {
        modalPnoa.style.display = "none";
      }
    };

    if (btnConfigPnoa) {
      btnConfigPnoa.addEventListener("click", openPnoaModal);
    }
    if (btnCloseModal) {
      btnCloseModal.addEventListener("click", closePnoaModal);
    }
    if (btnSaveClose) {
      btnSaveClose.addEventListener("click", () => {
        if (chkActive) {
          this.viewer2D.setPnoaConfig({ enabled: chkActive.checked });
          syncPnoaButtonState();
        }
        closePnoaModal();
      });
    }

    if (chkActive) {
      chkActive.addEventListener("change", () => {
        this.viewer2D.setPnoaConfig({ enabled: chkActive.checked });
        syncPnoaButtonState();
      });
    }

    if (sliderOpacity) {
      sliderOpacity.addEventListener("input", () => {
        const val = parseInt(sliderOpacity.value, 10) || 80;
        if (lblOpacity) lblOpacity.textContent = `${val}%`;
        this.viewer2D.setPnoaConfig({ opacity: val / 100 });
      });
    }

    // Ubicaciones de prueba rápida (presets PNOA)
    const presetButtons = document.querySelectorAll(".btn-pnoa-preset");
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const lat = parseFloat(btn.dataset.lat);
        const lon = parseFloat(btn.dataset.lon);
        const zone = parseInt(btn.dataset.zone, 10) || 30;
        const utmX = parseFloat(btn.dataset.x) || 0;
        const utmY = parseFloat(btn.dataset.y) || 0;
        const name = btn.dataset.name || "Ubicación";

        this.applyPnoaLocation(lat, lon, name, zone, utmX, utmY);
      });
    });

    // Buscador Toponímico OpenStreetMap (España) en el Visor 2D y en el Modal
    this._setupToponymSearch(syncPnoaButtonState);

    // Aplicar coordenadas manuales
    if (btnApplyCoords) {
      btnApplyCoords.addEventListener("click", () => {
        const inpLat = document.getElementById("inp-pnoa-lat");
        const inpLon = document.getElementById("inp-pnoa-lon");
        const inpUtmX = document.getElementById("inp-pnoa-utmx");
        const inpUtmY = document.getElementById("inp-pnoa-utmy");
        const selHuso = document.getElementById("sel-pnoa-huso");

        const utmX = parseFloat(inpUtmX?.value);
        const utmY = parseFloat(inpUtmY?.value);
        const zone = parseInt(selHuso?.value, 10) || 30;

        if (Number.isFinite(utmX) && Number.isFinite(utmY) && utmX > 10000 && utmY > 10000) {
          this.viewer2D.setPnoaLocationFromUtm(utmX, utmY, zone);
        } else {
          const lat = parseFloat(inpLat?.value);
          const lon = parseFloat(inpLon?.value);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            this.viewer2D.setPnoaConfig({
              enabled: true,
              centerLat: lat,
              centerLon: lon,
              anchorWorldX: 0.0,
              anchorWorldY: 0.0
            });
          }
        }
        syncPnoaButtonState();
        this.viewer2D.camX = 0;
        this.viewer2D.camY = 0;
        this.viewer2D.render();
        this.showToast("🛰️ Coordenadas PNOA actualizadas.", "success");
      });
    }

    if (btnRecenter) {
      btnRecenter.addEventListener("click", () => {
        this.viewer2D.camX = 0;
        this.viewer2D.camY = 0;
        this.viewer2D.render();
        this.showToast("Visor centrado en el origen (0,0) de la ortofoto.", "info");
      });
    }
  }

  applyPnoaLocation(lat, lon, name = "Ubicación", zone = null, utmX = null, utmY = null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    this.viewer2D.setPnoaConfig({
      enabled: true,
      centerLat: lat,
      centerLon: lon,
      utmZone: zone ?? (lon < -6 ? 29 : lon < 0 ? 30 : 31),
      anchorWorldX: 0.0,
      anchorWorldY: 0.0
    });

    this.viewer2D.camX = 0;
    this.viewer2D.camY = 0;
    this.viewer2D.render();

    // Sincronizar botones y checkboxes de la interfaz
    const btnTogglePnoa = document.getElementById("btn-toggle-pnoa");
    const chkLayerPnoa = document.getElementById("chk-layer-pnoa");
    const chkActive = document.getElementById("modal-chk-pnoa-active");
    if (btnTogglePnoa) {
      btnTogglePnoa.classList.add("active");
      btnTogglePnoa.style.borderColor = "#0284c7";
      btnTogglePnoa.style.color = "#38bdf8";
      btnTogglePnoa.style.background = "rgba(2, 132, 199, 0.28)";
    }
    if (chkLayerPnoa) chkLayerPnoa.checked = true;
    if (chkActive) chkActive.checked = true;

    // Sincronizar inputs numéricos de coordenadas
    const inpLat = document.getElementById("inp-pnoa-lat");
    const inpLon = document.getElementById("inp-pnoa-lon");
    const inpUtmX = document.getElementById("inp-pnoa-utmx");
    const inpUtmY = document.getElementById("inp-pnoa-utmy");
    const selHuso = document.getElementById("sel-pnoa-huso");
    if (inpLat) inpLat.value = lat.toFixed(5);
    if (inpLon) inpLon.value = lon.toFixed(5);
    if (inpUtmX && utmX !== null) inpUtmX.value = Math.round(utmX);
    if (inpUtmY && utmY !== null) inpUtmY.value = Math.round(utmY);
    if (selHuso && zone !== null) selHuso.value = String(zone);

    const searchStatus = document.getElementById("pnoa-search-status");
    if (searchStatus) {
      searchStatus.innerHTML = `<span style="color:#22c55e;">✓ Ortofoto centrada en ${name}.</span>`;
    }

    this.showToast(`🛰️ Ortofoto PNOA posicionada en ${name}.`, "success");
  }

  _setupToponymSearch(syncPnoaButtonState) {
    const inpViewer = document.getElementById("inp-viewer-toponym");
    const btnClearViewer = document.getElementById("btn-clear-toponym");
    const dropdownViewer = document.getElementById("toponym-dropdown-results");

    const inpModal = document.getElementById("inp-pnoa-search");
    const btnModalSearch = document.getElementById("btn-pnoa-search");
    const modalSearchStatus = document.getElementById("pnoa-search-status");

    let debounceTimer = null;
    let activeIndex = -1;
    let currentResults = [];

    const formatToponymResult = (item) => {
      const addr = item.address || {};
      const road = addr.road || addr.street || addr.pedestrian || addr.highway || "";
      const city = addr.city || addr.town || addr.village || addr.municipality || "";
      const prov = addr.province || addr.state || "";

      let title = item.name || road || city || item.display_name.split(",")[0].trim();
      let subtitle = [road && road !== title ? road : null, city && city !== title ? city : null, prov]
        .filter(Boolean)
        .join(", ");

      if (!subtitle) {
        const parts = item.display_name.split(",");
        parts.shift();
        subtitle = parts.slice(0, 3).join(",").trim();
      }

      // Asegurar que nombres extranjeros como "Spain" se muestren siempre en español ("España")
      subtitle = subtitle.replace(/\bSpain\b/gi, "España");

      return {
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        title,
        subtitle,
        fullName: `${title} (${subtitle || "España"})`
      };
    };

    const fetchOsmPlaces = async (query) => {
      const q = query.trim();
      if (!q || q.length < 2) return [];
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=es&format=json&addressdetails=1&limit=6`;
      const res = await fetch(url, { headers: { "Accept-Language": "es,es-ES;q=0.9" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data.map(formatToponymResult) : [];
    };

    const closeDropdown = () => {
      if (dropdownViewer) {
        dropdownViewer.style.display = "none";
        dropdownViewer.innerHTML = "";
      }
      activeIndex = -1;
      currentResults = [];
    };

    const renderDropdown = (results, query) => {
      if (!dropdownViewer) return;
      dropdownViewer.innerHTML = "";
      currentResults = results;
      activeIndex = -1;

      if (!results || results.length === 0) {
        dropdownViewer.innerHTML = `<div class="toponym-message">No se encontraron lugares en España para «${query}».</div>`;
        dropdownViewer.style.display = "block";
        return;
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const el = document.createElement("div");
        el.className = "toponym-item";
        el.dataset.index = String(i);
        el.innerHTML = `
          <div class="toponym-item-title">📍 ${r.title}</div>
          <div class="toponym-item-subtitle">${r.subtitle}</div>
        `;
        el.addEventListener("click", () => {
          if (inpViewer) inpViewer.value = r.title;
          this.applyPnoaLocation(r.lat, r.lon, r.title);
          closeDropdown();
        });
        dropdownViewer.appendChild(el);
      }
      dropdownViewer.style.display = "block";
    };

    if (inpViewer) {
      inpViewer.addEventListener("input", () => {
        const val = inpViewer.value.trim();
        if (btnClearViewer) {
          btnClearViewer.style.display = val ? "inline-block" : "none";
        }
        clearTimeout(debounceTimer);
        if (val.length < 2) {
          closeDropdown();
          return;
        }

        if (dropdownViewer) {
          dropdownViewer.innerHTML = `<div class="toponym-message">🔍 Buscando en OpenStreetMap España...</div>`;
          dropdownViewer.style.display = "block";
        }

        debounceTimer = setTimeout(async () => {
          try {
            const places = await fetchOsmPlaces(val);
            renderDropdown(places, val);
          } catch (err) {
            if (dropdownViewer) {
              dropdownViewer.innerHTML = `<div class="toponym-message" style="color:#f87171;">Error al consultar OpenStreetMap. Verifique la conexión a internet.</div>`;
            }
          }
        }, 300);
      });

      inpViewer.addEventListener("keydown", (e) => {
        if (!dropdownViewer || dropdownViewer.style.display === "none") return;
        const items = dropdownViewer.querySelectorAll(".toponym-item");
        if (items.length === 0) return;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          activeIndex = (activeIndex + 1) % items.length;
          items.forEach((it, idx) => it.classList.toggle("selected", idx === activeIndex));
          items[activeIndex]?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          activeIndex = (activeIndex - 1 + items.length) % items.length;
          items.forEach((it, idx) => it.classList.toggle("selected", idx === activeIndex));
          items[activeIndex]?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
          e.preventDefault();
          const target = activeIndex >= 0 ? currentResults[activeIndex] : currentResults[0];
          if (target) {
            inpViewer.value = target.title;
            this.applyPnoaLocation(target.lat, target.lon, target.title);
            closeDropdown();
          }
        } else if (e.key === "Escape") {
          closeDropdown();
        }
      });
    }

    if (btnClearViewer) {
      btnClearViewer.addEventListener("click", () => {
        if (inpViewer) {
          inpViewer.value = "";
          inpViewer.focus();
        }
        btnClearViewer.style.display = "none";
        closeDropdown();
      });
    }

    document.addEventListener("click", (e) => {
      const container = document.getElementById("toponym-search-container");
      if (container && !container.contains(e.target)) {
        closeDropdown();
      }
    });

    // Búsqueda en el modal de configuración PNOA
    const executeModalSearch = async () => {
      const q = (inpModal?.value || "").trim();
      if (!q) return;
      if (modalSearchStatus) {
        modalSearchStatus.innerHTML = `<span style="color:#38bdf8;">Buscando «${q}» en España...</span>`;
      }
      try {
        const places = await fetchOsmPlaces(q);
        if (places && places.length > 0) {
          const first = places[0];
          this.applyPnoaLocation(first.lat, first.lon, first.fullName);
          if (modalSearchStatus) {
            modalSearchStatus.innerHTML = `<span style="color:#22c55e;">✓ Localizado: ${first.fullName}</span>`;
          }
          if (inpViewer) inpViewer.value = first.title;
        } else {
          if (modalSearchStatus) {
            modalSearchStatus.innerHTML = `<span style="color:#f87171;">No se encontraron lugares en España para «${q}».</span>`;
          }
        }
      } catch (err) {
        if (modalSearchStatus) {
          modalSearchStatus.innerHTML = `<span style="color:#f87171;">Error al consultar OpenStreetMap. Verifique la conexión a internet o introduzca coordenadas manualmente.</span>`;
        }
      }
    };

    if (btnModalSearch) {
      btnModalSearch.addEventListener("click", executeModalSearch);
    }
    if (inpModal) {
      inpModal.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          executeModalSearch();
        }
      });
    }
  }

  _findFrameIndexForDist(targetDist) {
    if (!this.simResult || !this.simResult.states || this.simResult.states.length === 0) return 0;
    const states = this.simResult.states;
    const n = states.length;
    const d0 = states[0].dist ?? 0;
    const dn = states[n - 1].dist ?? 0;
    if (targetDist <= d0) return 0;
    if (targetDist >= dn) return n - 1;

    let low = 0;
    let high = n - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const dMid = states[mid].dist ?? 0;
      if (dMid < targetDist) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (low >= n) return n - 1;
    if (low === 0) return 0;
    const prevD = states[low - 1].dist ?? 0;
    const nextD = states[low].dist ?? 0;
    return (targetDist - prevD < nextD - targetDist) ? low - 1 : low;
  }

  _startAnimationLoop() {
    if (this._animRafId !== null) return;
    this.lastAnimTime = 0;
    const step = (timestamp) => {
      if (!this.isPlaying) {
        this._animRafId = null;
        this.lastAnimTime = 0;
        return;
      }
      if (!this.lastAnimTime) this.lastAnimTime = timestamp;
      const dt = Math.min(0.1, (timestamp - this.lastAnimTime) / 1000);
      this.lastAnimTime = timestamp;

      if (this.simResult && this.simResult.states.length > 1) {
        const totalDist = this.simResult.summary.totalDistanceM || (this.simResult.states[this.simResult.states.length - 1].dist ?? 0);
        if (totalDist > 0) {
          // Velocidad nominal de avance en maniobra rigurosamente constante: 3.5 m/s (~12.6 km/h) a 1x
          const nominalSpeedMs = 3.5;
          this.currentAnimDistM = (this.currentAnimDistM ?? 0) + dt * nominalSpeedMs * this.playSpeed;
          if (this.currentAnimDistM >= totalDist) {
            this.currentAnimDistM = 0;
          }
          const frameIdx = this._findFrameIndexForDist(this.currentAnimDistM);
          this.currentFrameFloat = frameIdx;
          this._syncFrameToViewers(frameIdx);
        } else {
          this._syncFrameToViewers(0);
        }
      }
      this._animRafId = requestAnimationFrame(step);
    };
    this._animRafId = requestAnimationFrame(step);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.sweptPathApp = new SweptPathApp();
});

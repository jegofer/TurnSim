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
import { buildSegmentsFromWaypoints } from "./engine/kinematics.js";
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
  downloadTextFile
} from "./export/exporters.js";
import { Viewer2D } from "./view2d/viewer2d.js";
import { Viewer3D } from "./view3d/viewer3d.js";

export class SweptPathApp {
  constructor() {
    // Estado activo
    this.selectedVehicleId = "renault_t_4x2_sko";
    this.selectedTractorKey = "renault_t_480";
    this.selectedTrailerKey = "schmitz_sko_cool";
    this.vehicle = cloneVehicleProfile(this.selectedVehicleId);
    this.isCustomModified = false;

    this.selectedScenarioId = "industrial_turn_90";
    const defaultScenario = PRESET_SCENARIOS[this.selectedScenarioId];
    this.safetyMarginM = defaultScenario.safetyMarginM;
    this.maneuver = JSON.parse(JSON.stringify(defaultScenario.maneuver));
    this.obstacles = JSON.parse(JSON.stringify(defaultScenario.obstacles));

    this.discretization = {
      straightStepM: 0.15,
      arcStepDeg: 1.0,
      integrationMethod: "rk4"
    };

    this.viewMode = "2d"; // '2d' | '3d' | 'split'
    this.simResult = null;
    this.interferenceReport = null;

    // Estado de reproducción
    this.isPlaying = false;
    this.playSpeed = 1.0;
    this.currentFrameFloat = 0;
    this.lastAnimTime = 0;

    // Instancias de visores
    const canvas2D = document.getElementById("canvas-2d");
    const container3D = document.getElementById("container-3d");
    this.viewer2D = new Viewer2D(canvas2D);
    this.viewer3D = new Viewer3D(container3D);

    // Callback cuando el usuario arrastra un obstáculo con Shift+Click en el visor 2D
    this.viewer2D.onObstacleMoved = () => {
      this._recomputeInterferencesOnly();
      this._renderObstaclesListUI();
    };

    this._initUI();
    this.recomputeAll(true);
    this._startAnimationLoop();
  }

  _initUI() {
    // 1. Selector de vehículo preconfigurado y selectores independientes (Sección A)
    const vehSelect = document.getElementById("select-vehicle");
    const tractorSelect = document.getElementById("select-tractor");
    const trailerSelect = document.getElementById("select-trailer");

    // Llenar tractoras
    if (tractorSelect) {
      tractorSelect.innerHTML = "";
      for (const [key, tr] of Object.entries(TRACTOR_CATALOG)) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${tr.name} (Batalla: ${tr.wheelbase.toFixed(2)}m)`;
        tractorSelect.appendChild(opt);
      }
      tractorSelect.value = this.selectedTractorKey;
      tractorSelect.addEventListener("change", () => {
        this.selectedTractorKey = tractorSelect.value;
        this._onIndependentVehicleChange();
      });
    }

    // Llenar semirremolques
    if (trailerSelect) {
      trailerSelect.innerHTML = "";
      for (const [key, tl] of Object.entries(TRAILER_CATALOG)) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${tl.name} (L_t: ${tl.wheelbase.toFixed(2)}m, Ancho: ${tl.width.toFixed(2)}m)`;
        trailerSelect.appendChild(opt);
      }
      trailerSelect.value = this.selectedTrailerKey;
      trailerSelect.addEventListener("change", () => {
        this.selectedTrailerKey = trailerSelect.value;
        this._onIndependentVehicleChange();
      });
    }

    // Llenar conjuntos preconfigurados
    vehSelect.innerHTML = "";
    for (const v of Object.values(VEHICLE_CATALOG)) {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.name}`;
      vehSelect.appendChild(opt);
    }
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "⚙️ [Personalizado / Combinación libre]";
    vehSelect.appendChild(customOpt);

    vehSelect.value = this.selectedVehicleId;
    vehSelect.addEventListener("change", () => {
      const val = vehSelect.value;
      if (val === "custom") {
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
        this.recomputeAll(false);
      });
    }

    // 3. Selector de escenarios preconfigurados (Sección C)
    const scenSelect = document.getElementById("select-scenario");
    scenSelect.innerHTML = "";
    for (const sc of Object.values(PRESET_SCENARIOS)) {
      const opt = document.createElement("option");
      opt.value = sc.id;
      opt.textContent = sc.name;
      scenSelect.appendChild(opt);
    }
    scenSelect.value = this.selectedScenarioId;
    scenSelect.addEventListener("change", () => {
      this.selectedScenarioId = scenSelect.value;
      const sc = PRESET_SCENARIOS[this.selectedScenarioId];
      if (!sc) return;
      this.safetyMarginM = sc.safetyMarginM;
      this.maneuver = JSON.parse(JSON.stringify(sc.maneuver));
      this.obstacles = JSON.parse(JSON.stringify(sc.obstacles));
      document.getElementById("inp-safety-margin").value = this.safetyMarginM;
      this._populateManeuverInputs();
      this._renderObstaclesListUI();
      this.recomputeAll(true);
    });

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
        this.recomputeAll(false);
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
      const pts = [];
      for (const line of raw.split(/\n|;/)) {
        const parts = line.trim().split(/[\s,]+/);
        if (parts.length >= 2) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            pts.push([x, y]);
          }
        }
      }
      if (pts.length >= 2) {
        const built = buildSegmentsFromWaypoints(pts, filletR, dir);
        this.maneuver.startPose = {
          ...this.maneuver.startPose,
          ...built.startPose
        };
        this.maneuver.segments = built.segments;
        this._populateManeuverInputs();
        this.recomputeAll(true);
      }
    });

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

    // Herramienta de medición interactiva de distancias en planta 2D
    const btnMeasure = document.getElementById("btn-measure-tool");
    const btnClearMeasure = document.getElementById("btn-clear-measure");
    const pillMeasure = document.getElementById("measure-result-pill");

    if (btnMeasure) {
      btnMeasure.addEventListener("click", () => {
        const isActive = this.viewer2D.toggleMeasureMode();
        btnMeasure.classList.toggle("active", isActive);
        btnMeasure.textContent = isActive ? "📏 Medir [Activo]" : "📏 Medir distancia";
      });
    }

    if (btnClearMeasure) {
      btnClearMeasure.addEventListener("click", () => {
        this.viewer2D.clearMeasurement();
      });
    }

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
      ["chk-layer-dims", "dimensions"],
      ["chk-layer-axles", "axlesAndPoints"],
      ["chk-layer-grid", "grid"]
    ];

    for (const [chkId, layerName] of layerCheckBindings) {
      const el = document.getElementById(chkId);
      if (!el) continue;
      el.addEventListener("change", () => {
        this.viewer2D.layers[layerName] = el.checked;
        if (layerName in this.viewer3D.layers) {
          this.viewer3D.layers[layerName] = el.checked;
          this.viewer3D.updateLayerVisibility();
        }
        this.viewer2D.render();
      });
    }

    // Margen de seguridad
    const marginInput = document.getElementById("inp-safety-margin");
    marginInput.value = this.safetyMarginM;
    marginInput.addEventListener("input", () => {
      const v = parseFloat(marginInput.value);
      if (Number.isFinite(v) && v >= 0 && v <= 3.0) {
        this.safetyMarginM = v;
        this.recomputeAll(false);
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
        layerVisibility: this.viewer2D.layers
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

    document.getElementById("btn-export-dxf").addEventListener("click", () => {
      const dxf = generateDXFContent(this.simResult, this.obstacles);
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
        this.viewer2D.layers
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
  }

  setViewMode(mode) {
    this.viewMode = mode;
    const grid = document.getElementById("viewports-grid");
    grid.className = `viewports-grid mode-${mode}`;
    document.querySelectorAll(".view-mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    setTimeout(() => {
      this.viewer2D.resize();
      this.viewer3D.resize();
    }, 30);
  }

  _onIndependentVehicleChange() {
    let matchedPreset = null;
    for (const [presetId, preset] of Object.entries(VEHICLE_CATALOG)) {
      if (preset.tractorKey === this.selectedTractorKey && preset.trailerKey === this.selectedTrailerKey) {
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
    this.recomputeAll(false);
  }

  _populateVehicleInputs() {
    const v = this.vehicle;
    document.getElementById("inp-tr-wb").value = v.tractor.wheelbase;
    document.getElementById("inp-tr-fo").value = v.tractor.frontOverhang;
    document.getElementById("inp-tr-ro").value = v.tractor.rearOverhang;
    document.getElementById("inp-tr-w").value = v.tractor.width;
    document.getElementById("inp-tr-track").value = v.tractor.trackWidth;
    document.getElementById("inp-tr-hitch").value = v.tractor.hitchOffset;
    document.getElementById("inp-tr-steer").value = v.tractor.maxSteerAngleDeg;

    document.getElementById("inp-tl-wb").value = v.trailer.wheelbase;
    document.getElementById("inp-tl-fo").value = v.trailer.frontOverhang;
    document.getElementById("inp-tl-ro").value = v.trailer.rearOverhang;
    document.getElementById("inp-tl-w").value = v.trailer.width;
    document.getElementById("inp-tl-spacing").value = v.trailer.axleSpacing || 1.31;
    document.getElementById("inp-lim-artic").value = v.limits?.maxArticulationAngleDeg || 85;
  }

  _updateVehicleSummaryAndValidationUI() {
    const v = this.vehicle;
    const metrics = computeDerivedVehicleMetrics(v);
    const validation = validateVehicleParams(v);

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
        <div>L<sub>total</sub> acoplado: <strong>${metrics.totalCoupledLength.toFixed(3)} m</strong></div>
        <div>L<sub>tractora</sub>: <strong>${metrics.tractorLength.toFixed(3)} m</strong></div>
        <div>L<sub>semirrem.</sub>: <strong>${metrics.trailerLength.toFixed(3)} m</strong></div>
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
    this._renderSegmentsListUI();
  }

  _renderSegmentsListUI() {
    const container = document.getElementById("segments-list");
    container.innerHTML = "";

    this.maneuver.segments.forEach((seg, idx) => {
      const card = document.createElement("div");
      card.className = "segment-item";

      const isStraight = seg.type === "straight";
      const header = document.createElement("div");
      header.className = "segment-item-header";
      header.innerHTML = `
        <span>#${idx + 1} · ${isStraight ? "Tramo recto" : "Curva circular"}</span>
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
            this.recomputeAll(false);
          }
        });
        body.appendChild(lenWrap);
      } else {
        const radWrap = document.createElement("div");
        radWrap.innerHTML = `
          <label class="form-label">Radio R (m)</label>
          <input type="number" step="0.25" min="4.0" max="200" value="${seg.radius}" />
        `;
        radWrap.querySelector("input").addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          if (Number.isFinite(val) && val >= 2.0) {
            seg.radius = val;
            this.recomputeAll(false);
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
            this.recomputeAll(false);
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

  _renderObstaclesListUI() {
    const container = document.getElementById("obstacles-list");
    container.innerHTML = "";

    this.obstacles.forEach((obs, idx) => {
      const card = document.createElement("div");
      card.className = "obstacle-item";

      // Buscar estado de este obstáculo en el informe de interferencias
      const rep = this.interferenceReport?.obstacleReports?.find((r) => r.obstacleId === obs.id);
      const distBadge = rep
        ? `<span class="badge status-${rep.status}" style="font-size:10px;">${
            rep.minDistanceM !== null ? `${rep.minDistanceM.toFixed(2)} m` : "N/E"
          }</span>`
        : "";

      const header = document.createElement("div");
      header.className = "obstacle-item-header";
      header.innerHTML = `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" class="obs-toggle" ${obs.enabled !== false ? "checked" : ""} />
          <span>${obs.name}</span>
        </label>
        <div style="display:flex;align-items:center;gap:5px;">
          ${distBadge}
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

      card.appendChild(header);

      // Si el obstáculo tiene posición (x, y) editable (rect, circle, arc_curb)
      if (obs.shape === "rect" || obs.shape === "circle" || obs.shape === "arc_curb") {
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
            <label class="form-label">${obs.shape === "rect" ? "Largo (m)" : "Radio (m)"}</label>
            <input type="number" step="0.25" min="0.2" class="obs-dim" value="${
              obs.shape === "rect" ? obs.length ?? 4 : obs.radius ?? 3
            }" />
          </div>
        `;

        coordsRow.querySelector(".obs-x").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.x = v;
            this._recomputeInterferencesOnly();
          }
        });
        coordsRow.querySelector(".obs-y").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) {
            obs.y = v;
            this._recomputeInterferencesOnly();
          }
        });
        coordsRow.querySelector(".obs-dim").addEventListener("input", (e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > 0.1) {
            if (obs.shape === "rect") obs.length = v;
            else obs.radius = v;
            this._recomputeInterferencesOnly();
          }
        });

        card.appendChild(coordsRow);
      }

      container.appendChild(card);
    });
  }

  _recomputeInterferencesOnly() {
    if (!this.simResult) return;
    this.interferenceReport = evaluateObstacleInterferences(
      this.simResult,
      this.obstacles,
      this.safetyMarginM
    );
    this.viewer2D.setData({
      vehicle: this.vehicle,
      simResult: this.simResult,
      obstacles: this.obstacles,
      interferenceReport: this.interferenceReport
    });
    this.viewer3D.setData({
      vehicle: this.vehicle,
      simResult: this.simResult,
      obstacles: this.obstacles,
      interferenceReport: this.interferenceReport
    });
    this._updateTopTelemetryBar();
  }

  recomputeAll(fitCamera = false) {
    this._updateVehicleSummaryAndValidationUI();

    this.simResult = buildCompleteSimulationResult(this.vehicle, this.maneuver, {
      ...this.discretization,
      safetyMarginM: this.safetyMarginM
    });

    this.interferenceReport = evaluateObstacleInterferences(
      this.simResult,
      this.obstacles,
      this.safetyMarginM
    );

    const totalStates = this.simResult.states.length;
    const slider = document.getElementById("slider-timeline");
    slider.max = Math.max(0, totalStates - 1);
    if (this.currentFrameFloat >= totalStates) {
      this.currentFrameFloat = Math.max(0, totalStates - 1);
    }
    slider.value = Math.floor(this.currentFrameFloat);

    this.viewer2D.setData({
      vehicle: this.vehicle,
      simResult: this.simResult,
      obstacles: this.obstacles,
      interferenceReport: this.interferenceReport
    });

    this.viewer3D.setData({
      vehicle: this.vehicle,
      simResult: this.simResult,
      obstacles: this.obstacles,
      interferenceReport: this.interferenceReport
    });

    if (fitCamera) {
      this.viewer2D.fitToScene();
      this.viewer3D.fitToScene();
    }

    this._syncFrameToViewers(Math.floor(this.currentFrameFloat));
    this._updateTopTelemetryBar();
    this._renderObstaclesListUI();
  }

  _updateTopTelemetryBar() {
    if (!this.simResult) return;
    const sum = this.simResult.summary;
    document.getElementById("kpi-swept-width").textContent = `${sum.maxSweptWidthM.toFixed(2)} m`;
    document.getElementById("kpi-total-dist").textContent = `${sum.totalDistanceM.toFixed(2)} m`;
    document.getElementById("kpi-max-steer").textContent = `${sum.maxSteerAngleDeg.toFixed(1)}° / ${this.vehicle.tractor.maxSteerAngleDeg}°`;
    document.getElementById("kpi-max-artic").textContent = `${sum.maxArticulationAngleDeg.toFixed(1)}° / ${this.vehicle.limits?.maxArticulationAngleDeg || 85}°`;

    const rep = this.interferenceReport;
    const clearanceEl = document.getElementById("kpi-min-clearance");
    if (rep && rep.minClearanceM !== null) {
      clearanceEl.textContent = `${rep.minClearanceM.toFixed(2)} m`;
    } else {
      clearanceEl.textContent = "—";
    }

    const statusBadge = document.getElementById("global-interference-badge");
    if (rep) {
      statusBadge.className = `status-banner-pill status-${rep.globalStatus}`;
      statusBadge.textContent = rep.globalStatusLabel;
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
  }

  _updatePlayButtonUI() {
    const btn = document.getElementById("btn-play-toggle");
    btn.textContent = this.isPlaying ? "⏸ Pausar" : "▶ Reproducir";
  }

  _startAnimationLoop() {
    const step = (timestamp) => {
      if (!this.lastAnimTime) this.lastAnimTime = timestamp;
      const dt = Math.min(0.1, (timestamp - this.lastAnimTime) / 1000);
      this.lastAnimTime = timestamp;

      if (this.isPlaying && this.simResult && this.simResult.states.length > 1) {
        // Avanzar ~28 estados por segundo a velocidad 1x
        this.currentFrameFloat += dt * 28.0 * this.playSpeed;
        if (this.currentFrameFloat >= this.simResult.states.length) {
          this.currentFrameFloat = 0;
        }
        this._syncFrameToViewers(Math.floor(this.currentFrameFloat));
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.sweptPathApp = new SweptPathApp();
});

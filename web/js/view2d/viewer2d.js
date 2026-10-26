/**
 * Motor de visualización bidimensional técnica en planta (Canvas 2D CAD/GIS)
 * TurnSim — Simulador de Barrido de Vehículos Pesados
 */

import { getObstacleVertices } from "../engine/collisions.js";

export class Viewer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    // Transformación de vista: mundo (m) -> pantalla (px)
    // x_screen = centerX + (x_world - camX) * scale
    // y_screen = centerY - (y_world - camY) * scale  (+Y hacia arriba / Norte)
    this.camX = 14.0;
    this.camY = 12.0;
    this.scale = 18.0; // píxeles por metro

    this.simResult = null;
    this.vehicle = null;
    this.obstacles = [];
    this.interferenceReport = null;
    this.currentStateIndex = 0;

    this.layers = {
      grid: true,
      envelope: true,
      margin: true,
      refTraces: true,
      wheelTraces: true,
      ghosts: true,
      obstacles: true,
      dimensions: true,
      axlesAndPoints: true
    };

    this.isDragging = false;
    this.draggedObstacle = null;
    this.lastMouse = { x: 0, y: 0 };
    this.hoverWorld = null;
    this.onObstacleMoved = null;

    // Herramienta de medición de distancias
    this.measureMode = false;
    this.measurePoints = []; // [[x, y], [x, y]]
    this.activeSnap = null;
    this.onMeasureUpdate = null;
    this.onMeasureStateChange = null;

    this._bindEvents();
    this.resize();
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.resize());

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.measurePoints.length > 0 || this.measureMode) {
          this.clearMeasurement();
          if (this.measureMode) this.toggleMeasureMode(false);
        }
      }
    });

    this.canvas.addEventListener("contextmenu", (e) => {
      if (this.measureMode || this.measurePoints.length > 0) {
        e.preventDefault();
        this.clearMeasurement();
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const beforeWorld = this.screenToWorld(mx, my);

      const zoomFactor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      this.scale = Math.max(3.0, Math.min(140.0, this.scale * zoomFactor));

      const afterWorld = this.screenToWorld(mx, my);
      this.camX += beforeWorld[0] - afterWorld[0];
      this.camY += beforeWorld[1] - afterWorld[1];
      this.render();
    }, { passive: false });

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.lastMouse = { x: mx, y: my };

      const [wx, wy] = this.screenToWorld(mx, my);
      const snap = this._findSnapPoint(wx, wy);
      const targetPt = snap ? [snap.x, snap.y] : [Number(wx.toFixed(3)), Number(wy.toFixed(3))];

      if (this.measureMode) {
        if (this.measurePoints.length === 0 || this.measurePoints.length === 2) {
          this.measurePoints = [targetPt];
        } else if (this.measurePoints.length === 1) {
          this.measurePoints.push(targetPt);
        }
        if (typeof this.onMeasureUpdate === "function") {
          this.onMeasureUpdate(this.getMeasurementInfo());
        }
        this.render();
        return;
      }

      // Si se pulsa con Shift sobre el centro de un obstáculo editable (rect o circle), permite arrastrarlo
      if (e.shiftKey && this.obstacles && this.layers.obstacles) {
        for (const obs of this.obstacles) {
          if (obs.enabled === false || obs.shape === "polyline") continue;
          if (Math.hypot((obs.x || 0) - wx, (obs.y || 0) - wy) < 3.5) {
            this.draggedObstacle = obs;
            return;
          }
        }
      }
      this.isDragging = true;
    });

    window.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.hoverWorld = this.screenToWorld(mx, my);

      if (this.measureMode) {
        const snap = this._findSnapPoint(this.hoverWorld[0], this.hoverWorld[1]);
        this.activeSnap = snap;
        if (this.measurePoints.length === 1) {
          if (typeof this.onMeasureUpdate === "function") {
            this.onMeasureUpdate(this.getMeasurementInfo());
          }
          this.render();
          return;
        } else if (snap) {
          this.render();
          return;
        }
      }

      if (this.draggedObstacle) {
        const [wx, wy] = this.hoverWorld;
        this.draggedObstacle.x = Number(wx.toFixed(2));
        this.draggedObstacle.y = Number(wy.toFixed(2));
        if (typeof this.onObstacleMoved === "function") {
          this.onObstacleMoved(this.draggedObstacle);
        }
        this.render();
        return;
      }

      if (!this.isDragging) return;
      const dx = mx - this.lastMouse.x;
      const dy = my - this.lastMouse.y;
      this.lastMouse = { x: mx, y: my };
      this.camX -= dx / this.scale;
      this.camY += dy / this.scale;
      this.render();
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.draggedObstacle = null;
    });
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth || 800;
    const h = parent.clientHeight || 600;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
    this.render();
  }

  worldToScreen(wx, wy) {
    const sx = this.width / 2 + (wx - this.camX) * this.scale;
    const sy = this.height / 2 - (wy - this.camY) * this.scale;
    return [sx, sy];
  }

  screenToWorld(sx, sy) {
    const wx = this.camX + (sx - this.width / 2) / this.scale;
    const wy = this.camY - (sy - this.height / 2) / this.scale;
    return [wx, wy];
  }

  toggleMeasureMode(active) {
    this.measureMode = typeof active === "boolean" ? active : !this.measureMode;
    this.canvas.style.cursor = this.measureMode ? "crosshair" : "default";
    if (!this.measureMode && this.measurePoints.length === 1) {
      this.measurePoints = [];
    }
    if (typeof this.onMeasureStateChange === "function") {
      this.onMeasureStateChange(this.measureMode, this.getMeasurementInfo());
    }
    this.render();
    return this.measureMode;
  }

  clearMeasurement() {
    this.measurePoints = [];
    this.activeSnap = null;
    if (typeof this.onMeasureUpdate === "function") {
      this.onMeasureUpdate(null);
    }
    this.render();
  }

  getMeasurementInfo() {
    if (!this.measurePoints || this.measurePoints.length === 0) return null;
    const p1 = this.measurePoints[0];
    const p2 = this.measurePoints.length === 2
      ? this.measurePoints[1]
      : (this.activeSnap ? [this.activeSnap.x, this.activeSnap.y] : this.hoverWorld);

    if (!p2) return null;

    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.hypot(dx, dy);
    const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

    return {
      p1,
      p2,
      isComplete: this.measurePoints.length === 2,
      distM: Number(dist.toFixed(3)),
      dxM: Number(dx.toFixed(3)),
      dyM: Number(dy.toFixed(3)),
      angleDeg: Number(angleDeg.toFixed(1))
    };
  }

  _findSnapPoint(wx, wy, tolPx = 14) {
    const candidates = [];

    // Obstáculos
    if (this.obstacles && this.layers.obstacles) {
      for (const obs of this.obstacles) {
        if (obs.enabled === false) continue;
        const verts = getObstacleVertices(obs);
        for (const v of verts) {
          candidates.push({ x: v[0], y: v[1], label: obs.name });
        }
        if (Number.isFinite(obs.x) && Number.isFinite(obs.y)) {
          candidates.push({ x: obs.x, y: obs.y, label: `${obs.name} (centro)` });
        }
      }
    }

    // Vehículo activo en el fotograma actual
    if (this.simResult && this.simResult.states) {
      const s = this.simResult.states[this.currentStateIndex] || this.simResult.states[0];
      if (s) {
        candidates.push({ x: s.x, y: s.y, label: "Eje motriz tractora (P_ref)" });
        if (s.hitch) candidates.push({ x: s.hitch[0], y: s.hitch[1], label: "Quinta rueda (Kingpin)" });
        if (s.tractorFrontAxle && s.tractorFrontAxle.center) {
          candidates.push({ x: s.tractorFrontAxle.center[0], y: s.tractorFrontAxle.center[1], label: "Eje delantero directriz" });
        }
        if (Number.isFinite(s.tx) && Number.isFinite(s.ty)) {
          candidates.push({ x: s.tx, y: s.ty, label: "Centro trídem semirremolque" });
        }
        for (const pt of s.tractorPolygon || []) {
          candidates.push({ x: pt[0], y: pt[1], label: "Esquina tractora" });
        }
        for (const pt of s.trailerPolygon || []) {
          candidates.push({ x: pt[0], y: pt[1], label: "Esquina semirremolque" });
        }
      }
    }

    const [smx, smy] = this.worldToScreen(wx, wy);
    let best = null;
    let bestDist = tolPx;

    for (const c of candidates) {
      const [scx, scy] = this.worldToScreen(c.x, c.y);
      const d = Math.hypot(scx - smx, scy - smy);
      if (d < bestDist) {
        bestDist = d;
        best = { ...c, screenX: scx, screenY: scy };
      }
    }
    return best;
  }

  fitToScene() {
    if (!this.simResult || !this.simResult.states || this.simResult.states.length === 0) return;
    let minX = +Infinity;
    let minY = +Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const addPt = (x, y) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    for (const s of this.simResult.states) {
      for (const p of s.tractorPolygon) addPt(p[0], p[1]);
      if (s.trailerPolygon) {
        for (const p of s.trailerPolygon) addPt(p[0], p[1]);
      }
    }
    for (const obs of this.obstacles || []) {
      if (obs.enabled === false) continue;
      for (const p of getObstacleVertices(obs)) addPt(p[0], p[1]);
    }

    if (!Number.isFinite(minX)) return;
    this.camX = 0.5 * (minX + maxX);
    this.camY = 0.5 * (minY + maxY);
    const spanX = Math.max(12, maxX - minX + 8);
    const spanY = Math.max(12, maxY - minY + 8);
    this.scale = Math.max(4, Math.min(80, Math.min((this.width || 800) / spanX, (this.height || 600) / spanY)));
    this.render();
  }

  setData({ vehicle, simResult, obstacles, interferenceReport }) {
    this.vehicle = vehicle;
    this.simResult = simResult;
    this.obstacles = obstacles || [];
    this.interferenceReport = interferenceReport || null;
    if (this.simResult && this.currentStateIndex >= this.simResult.states.length) {
      this.currentStateIndex = 0;
    }
    this.render();
  }

  setFrameIndex(stateIdx) {
    if (!this.simResult || !this.simResult.states.length) return;
    this.currentStateIndex = Math.max(0, Math.min(this.simResult.states.length - 1, Math.floor(stateIdx)));
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.width || 800;
    const h = this.height || 600;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, w, h);

    if (this.layers.grid) {
      this._drawGrid(ctx, w, h);
    }

    if (!this.simResult || !this.simResult.states || this.simResult.states.length === 0) {
      if (this.measureMode || this.measurePoints.length > 0) {
        this._drawMeasurement(ctx);
      }
      return;
    }

    // 1. Envolvente de margen de seguridad
    if (this.layers.margin && this.simResult.marginLeftBoundary && this.simResult.marginRightBoundary) {
      this._drawSweptCorridor(
        ctx,
        this.simResult.states,
        true,
        this.simResult.marginLeftBoundary,
        this.simResult.marginRightBoundary,
        "rgba(250, 204, 21, 0.09)",
        "#eab308",
        [6, 4]
      );
    }

    // 2. Envolvente física de barrido (Hüllkurve)
    if (this.layers.envelope) {
      this._drawSweptCorridor(
        ctx,
        this.simResult.states,
        false,
        this.simResult.leftBoundary,
        this.simResult.rightBoundary,
        "rgba(239, 68, 68, 0.18)",
        "#ef4444",
        []
      );
    }

    // 3. Obstáculos del entorno
    if (this.layers.obstacles && this.obstacles) {
      this._drawObstacles(ctx);
    }

    // 4. Huellas de las ruedas
    if (this.layers.wheelTraces && this.simResult.traces && this.simResult.traces.wheels) {
      const wt = this.simResult.traces.wheels;
      this._drawPolyline(ctx, wt.tractor_front_left, "rgba(148, 163, 184, 0.55)", 1.1, [4, 3]);
      this._drawPolyline(ctx, wt.tractor_front_right, "rgba(148, 163, 184, 0.55)", 1.1, [4, 3]);
      this._drawPolyline(ctx, wt.tractor_rear_left, "rgba(148, 163, 184, 0.45)", 1.0, [3, 3]);
      this._drawPolyline(ctx, wt.tractor_rear_right, "rgba(148, 163, 184, 0.45)", 1.0, [3, 3]);
      this._drawPolyline(ctx, wt.trailer_tridem_left, "rgba(192, 132, 252, 0.55)", 1.2, [5, 3]);
      this._drawPolyline(ctx, wt.trailer_tridem_right, "rgba(192, 132, 252, 0.55)", 1.2, [5, 3]);
    }

    // 5. Siluetas intermedias (ghosts)
    if (this.layers.ghosts && this.simResult.ghosts) {
      for (const g of this.simResult.ghosts) {
        this._drawPolygon(ctx, g.tractorPolygon, null, "rgba(148, 163, 184, 0.30)", 1.0, []);
        if (g.trailerPolygon) {
          this._drawPolygon(ctx, g.trailerPolygon, null, "rgba(148, 163, 184, 0.28)", 1.0, [4, 3]);
        }
      }
    }

    // 6. Trayectorias de puntos de referencia
    if (this.layers.refTraces && this.simResult.traces) {
      this._drawPolyline(ctx, this.simResult.traces.tractor_front, "#38bdf8", 1.8, []);
      this._drawPolyline(ctx, this.simResult.traces.tractor_rear, "#22c55e", 2.0, [6, 4]);
      this._drawPolyline(ctx, this.simResult.traces.hitch, "#eab308", 1.7, []);
      this._drawPolyline(ctx, this.simResult.traces.trailer_rear, "#a855f7", 2.0, []);
    }

    // 7. Acotaciones de anchura barrida y vectores de distancia mínima a obstáculos
    if (this.layers.dimensions) {
      this._drawDimensions(ctx);
      this._drawInterferenceVectors(ctx);
    }

    // 8. Vehículo articulado en el fotograma actual
    const activeState = this.simResult.states[this.currentStateIndex] || this.simResult.states[0];
    if (activeState) {
      this._drawActiveVehicle(ctx, activeState);
    }

    // 9. Medición interactiva de distancias
    this._drawMeasurement(ctx);

    // 10. Escala gráfica, rosa de los vientos y coordenadas
    this._drawHUD(ctx, w, h);
  }

  _drawGrid(ctx, w, h) {
    const [minWX, maxWY] = this.screenToWorld(0, 0);
    const [maxWX, minWY] = this.screenToWorld(w, h);

    // Cuadrícula secundaria (1 m) si el zoom es suficiente
    if (this.scale >= 12) {
      ctx.strokeStyle = "rgba(30, 41, 59, 0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.floor(minWX); x <= Math.ceil(maxWX); x += 1) {
        const [sx] = this.worldToScreen(x, 0);
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      for (let y = Math.floor(minWY); y <= Math.ceil(maxWY); y += 1) {
        const [, sy] = this.worldToScreen(0, y);
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();
    }

    // Cuadrícula principal (5 m)
    ctx.strokeStyle = "rgba(51, 65, 85, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const startX5 = Math.floor(minWX / 5) * 5;
    const startY5 = Math.floor(minWY / 5) * 5;
    for (let x = startX5; x <= maxWX; x += 5) {
      const [sx] = this.worldToScreen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = startY5; y <= maxWY; y += 5) {
      const [, sy] = this.worldToScreen(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // Ejes cartesianos en (0, 0)
    const [ox, oy] = this.worldToScreen(0, 0);
    ctx.strokeStyle = "rgba(100, 116, 139, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(w, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, h);
    ctx.stroke();
  }

  _drawSweptCorridor(ctx, states, useMargin, leftPts, rightPts, fillColor, strokeColor, dash) {
    ctx.save();
    ctx.fillStyle = fillColor;
    const step = Math.max(1, Math.floor(states.length / 180));
    for (let i = 0; i < states.length; i += step) {
      const s = states[i];
      const tp = useMargin ? s.tractorMarginPolygon : s.tractorPolygon;
      const trp = useMargin ? s.trailerMarginPolygon : s.trailerPolygon;
      this._drawPolygon(ctx, tp, fillColor, null, 0, []);
      if (trp) this._drawPolygon(ctx, trp, fillColor, null, 0, []);
    }

    const first = states[0];
    const last = states[states.length - 1];
    this._drawPolygon(
      ctx,
      useMargin ? first.tractorMarginPolygon : first.tractorPolygon,
      null,
      strokeColor,
      1.3,
      dash
    );
    if (first.trailerPolygon) {
      this._drawPolygon(
        ctx,
        useMargin ? first.trailerMarginPolygon : first.trailerPolygon,
        null,
        strokeColor,
        1.3,
        dash
      );
    }
    this._drawPolygon(
      ctx,
      useMargin ? last.tractorMarginPolygon : last.tractorPolygon,
      null,
      strokeColor,
      1.3,
      dash
    );
    if (last.trailerPolygon) {
      this._drawPolygon(
        ctx,
        useMargin ? last.trailerMarginPolygon : last.trailerPolygon,
        null,
        strokeColor,
        1.3,
        dash
      );
    }

    this._drawPolyline(ctx, leftPts, strokeColor, 2.2, dash);
    this._drawPolyline(ctx, rightPts, strokeColor, 2.2, dash);
    ctx.restore();
  }

  _drawObstacles(ctx) {
    for (const obs of this.obstacles) {
      if (obs.enabled === false) continue;
      const verts = getObstacleVertices(obs);
      const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge";
      const color = obs.color || "#ef4444";

      if (isOpen) {
        this._drawPolyline(ctx, verts, color, 3.2, []);
      } else {
        const fill = obs.type === "restricted_zone"
          ? "rgba(234, 179, 8, 0.22)"
          : "rgba(239, 68, 68, 0.22)";
        const dash = obs.type === "restricted_zone" ? [6, 4] : [];
        this._drawPolygon(ctx, verts, fill, color, 2.2, dash);
      }

      if (verts.length > 0) {
        let cx = 0;
        let cy = 0;
        for (const [vx, vy] of verts) {
          cx += vx;
          cy += vy;
        }
        cx /= verts.length;
        cy /= verts.length;
        const [sx, sy] = this.worldToScreen(cx, cy);
        ctx.save();
        ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 4;
        ctx.fillText(obs.name, sx, sy);
        ctx.restore();
      }
    }
  }

  _drawDimensions(ctx) {
    if (!this.simResult.dimensions) return;
    for (const d of this.simResult.dimensions) {
      const [x1, y1] = this.worldToScreen(d.p1[0], d.p1[1]);
      const [x2, y2] = this.worldToScreen(d.p2[0], d.p2[1]);

      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const px = -Math.sin(angle) * 6;
      const py = Math.cos(angle) * 6;
      ctx.beginPath();
      ctx.moveTo(x1 - px, y1 - py);
      ctx.lineTo(x1 + px, y1 + py);
      ctx.moveTo(x2 - px, y2 - py);
      ctx.lineTo(x2 + px, y2 + py);
      ctx.stroke();

      const mx = 0.5 * (x1 + x2);
      const my = 0.5 * (y1 + y2);
      const text = `${d.title}: ${d.val}`;
      ctx.font = "bold 11.5px 'Segoe UI', system-ui, sans-serif";
      const tw = ctx.measureText(text).width + 12;
      ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(mx - tw / 2, my - 11, tw, 22, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mx, my);
      ctx.restore();
    }
  }

  _drawInterferenceVectors(ctx) {
    if (!this.interferenceReport || !this.interferenceReport.obstacleReports) return;
    for (const rep of this.interferenceReport.obstacleReports) {
      if (!rep.pointOnVehicle || !rep.pointOnObstacle) continue;
      const [vx, vy] = this.worldToScreen(rep.pointOnVehicle[0], rep.pointOnVehicle[1]);
      const [ox, oy] = this.worldToScreen(rep.pointOnObstacle[0], rep.pointOnObstacle[1]);

      ctx.save();
      if (rep.status === "COLLISION" || rep.status === "RESTRICTED_INVASION") {
        ctx.strokeStyle = "#ef4444";
        ctx.fillStyle = "rgba(239, 68, 68, 0.35)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(vx, vy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(vx - 7, vy - 7);
        ctx.lineTo(vx + 7, vy + 7);
        ctx.moveTo(vx + 7, vy - 7);
        ctx.lineTo(vx - 7, vy + 7);
        ctx.stroke();
      } else {
        const col = rep.status === "MARGIN_VIOLATION" ? "#f97316" : "#38bdf8";
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(ox, oy);
        ctx.stroke();
        ctx.setLineDash([]);

        const mx = 0.5 * (vx + ox);
        const my = 0.5 * (vy + oy);
        const label = `d_mín = ${rep.minDistanceM.toFixed(2)} m`;
        ctx.font = "bold 10.5px 'Segoe UI', system-ui, sans-serif";
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx - tw / 2, my - 9, tw, 18, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, mx, my);
      }
      ctx.restore();
    }
  }

  _drawActiveVehicle(ctx, s) {
    if (s.trailerPolygon) {
      this._drawPolygon(
        ctx,
        s.trailerPolygon,
        "rgba(241, 245, 249, 0.82)",
        "#0f172a",
        2.0,
        []
      );

      if (this.layers.axlesAndPoints && s.trailerAxles) {
        for (const axle of s.trailerAxles) {
          this._drawPolyline(ctx, [axle.left, axle.right], "#334155", 2.2, []);
          this._drawWheelRect(ctx, axle.left[0], axle.left[1], s.theading, 0.78, 0.30, "#0f172a");
          this._drawWheelRect(ctx, axle.right[0], axle.right[1], s.theading, 0.78, 0.30, "#0f172a");
        }
        const [txs, tys] = this.worldToScreen(s.tx, s.ty);
        this._drawDot(ctx, txs, tys, 4.5, "#a855f7");
      }
    }

    this._drawPolygon(
      ctx,
      s.tractorPolygon,
      "rgba(2, 132, 199, 0.85)",
      "#f8fafc",
      2.0,
      []
    );

    if (this.layers.axlesAndPoints) {
      this._drawPolyline(
        ctx,
        [s.tractorRearAxle.left, s.tractorRearAxle.right],
        "#0f172a",
        2.5,
        []
      );
      this._drawWheelRect(ctx, s.tractorRearAxle.left[0], s.tractorRearAxle.left[1], s.heading, 0.85, 0.38, "#0f172a");
      this._drawWheelRect(ctx, s.tractorRearAxle.right[0], s.tractorRearAxle.right[1], s.heading, 0.85, 0.38, "#0f172a");

      this._drawPolyline(
        ctx,
        [s.tractorFrontAxle.left, s.tractorFrontAxle.right],
        "#0f172a",
        2.2,
        []
      );
      const wheelHeading = s.heading + (s.steerAngleRad || 0);
      this._drawWheelRect(ctx, s.tractorFrontAxle.left[0], s.tractorFrontAxle.left[1], wheelHeading, 0.82, 0.28, "#0f172a");
      this._drawWheelRect(ctx, s.tractorFrontAxle.right[0], s.tractorFrontAxle.right[1], wheelHeading, 0.82, 0.28, "#0f172a");

      const [rxs, rys] = this.worldToScreen(s.x, s.y);
      this._drawDot(ctx, rxs, rys, 4.5, "#22c55e");

      const [fxs, fys] = this.worldToScreen(s.tractorFrontAxle.center[0], s.tractorFrontAxle.center[1]);
      this._drawDot(ctx, fxs, fys, 4.0, "#38bdf8");

      const [hxs, hys] = this.worldToScreen(s.hitch[0], s.hitch[1]);
      this._drawDot(ctx, hxs, hys, 5.0, "#eab308");
    }
  }

  _drawWheelRect(ctx, wx, wy, headingRad, lenM, widthM, color) {
    const halfL = lenM / 2;
    const halfW = widthM / 2;
    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);
    const corners = [
      [-halfL, -halfW],
      [-halfL, +halfW],
      [+halfL, +halfW],
      [+halfL, -halfW]
    ].map(([lx, ly]) => [wx + lx * cosH - ly * sinH, wy + lx * sinH + ly * cosH]);

    this._drawPolygon(ctx, corners, color, "#94a3b8", 0.8, []);
  }

  _drawDot(ctx, sx, sy, radiusPx, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawPolyline(ctx, pts, strokeColor, lineWidth = 1.5, dash = []) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = this.worldToScreen(pts[i][0], pts[i][1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawPolygon(ctx, pts, fillColor, strokeColor, lineWidth = 1.5, dash = []) {
    if (!pts || pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = this.worldToScreen(pts[i][0], pts[i][1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeColor && lineWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawSnapIndicator(ctx, snap) {
    if (!snap) return;
    const sx = snap.screenX;
    const sy = snap.screenY;

    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.fillStyle = "rgba(56, 189, 248, 0.28)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(sx - 6, sy - 6, 12, 12);
    ctx.fill();
    ctx.stroke();

    if (snap.label) {
      ctx.font = "600 10.5px 'Segoe UI', system-ui, sans-serif";
      const tw = ctx.measureText(snap.label).width + 10;
      ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
      ctx.fillRect(sx + 9, sy - 14, tw, 18);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 9, sy - 14, tw, 18);
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(snap.label, sx + 14, sy - 1);
    }
    ctx.restore();
  }

  _drawMeasurement(ctx) {
    if (!this.measurePoints || this.measurePoints.length === 0) {
      if (this.measureMode && this.activeSnap) {
        this._drawSnapIndicator(ctx, this.activeSnap);
      }
      return;
    }

    const info = this.getMeasurementInfo();
    if (!info) return;

    const [x1, y1] = this.worldToScreen(info.p1[0], info.p1[1]);
    const [x2, y2] = this.worldToScreen(info.p2[0], info.p2[1]);

    ctx.save();

    if (this.activeSnap) {
      this._drawSnapIndicator(ctx, this.activeSnap);
    }

    // Glow
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Línea de cota
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.0;
    ctx.setLineDash(info.isComplete ? [] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ticks perpendiculares en extremos
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const tickLen = 8;
    const px = -Math.sin(angle) * tickLen;
    const py = Math.cos(angle) * tickLen;

    ctx.beginPath();
    ctx.moveTo(x1 - px, y1 - py);
    ctx.lineTo(x1 + px, y1 + py);
    ctx.moveTo(x2 - px, y2 - py);
    ctx.lineTo(x2 + px, y2 + py);
    ctx.stroke();

    // Puntos extremos
    this._drawDot(ctx, x1, y1, 4.5, "#38bdf8");
    this._drawDot(ctx, x2, y2, 4.5, info.isComplete ? "#38bdf8" : "#f59e0b");

    // Etiqueta con cota métrica
    const mx = 0.5 * (x1 + x2);
    const my = 0.5 * (y1 + y2);
    const mainText = `${info.distM.toFixed(2)} m`;
    const subText = `ΔX: ${Math.abs(info.dxM).toFixed(2)}m  ΔY: ${Math.abs(info.dyM).toFixed(2)}m  ∠${info.angleDeg.toFixed(1)}°`;

    ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
    const w1 = ctx.measureText(mainText).width;
    ctx.font = "10px monospace";
    const w2 = ctx.measureText(subText).width;
    const badgeW = Math.max(w1, w2) + 20;
    const badgeH = 36;

    ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(mx - badgeW / 2, my - badgeH / 2, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mainText, mx, my - 7);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText(subText, mx, my + 8);

    ctx.restore();
  }

  _drawHUD(ctx, w, h) {
    ctx.save();

    // 1. Escala gráfica métrica dinámica (abajo a la derecha)
    const targetMeters = this.scale > 35 ? 2 : this.scale > 14 ? 5 : 10;
    const barPx = targetMeters * this.scale;
    const bx = w - barPx - 24;
    const by = h - 26;

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx - 12, by - 24, barPx + 24, 36, 6);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.moveTo(bx, by - 5);
    ctx.lineTo(bx, by + 5);
    ctx.moveTo(bx + barPx, by - 5);
    ctx.lineTo(bx + barPx, by + 5);
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${targetMeters} m (1:${Math.round(96 / (this.scale * 0.0254))})`, bx + barPx / 2, by - 8);

    // 2. Flecha Norte (+Y) arriba a la derecha
    const nx = w - 36;
    const ny = 42;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "#334155";
    ctx.beginPath();
    ctx.arc(nx, ny, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.moveTo(nx, ny - 13);
    ctx.lineTo(nx - 5, ny + 4);
    ctx.lineTo(nx + 5, ny + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("N", nx, ny + 15);

    // 3. Coordenadas del cursor
    if (this.hoverWorld) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(14, h - 32, 225, 22);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `X: ${this.hoverWorld[0].toFixed(2)} m | Y: ${this.hoverWorld[1].toFixed(2)} m`,
        22,
        h - 17
      );
    }

    ctx.restore();
  }
}

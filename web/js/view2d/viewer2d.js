/**
 * Motor de visualización bidimensional técnica en planta (Canvas 2D CAD/GIS)
 * TurnSim — Simulador de Barrido de Vehículos Pesados
 */

import { getObstacleVertices } from "../engine/collisions.js";
import { sampleCatmullRomSpline, splitWaypointsByDirection } from "../engine/kinematics.js";

/**
 * Conversión de coordenadas UTM (ETRS89 / WGS84) a coordenadas geográficas (Latitud, Longitud en grados decimales).
 * Algoritmo geodésico estándar sobre el elipsoide GRS80 / WGS84 con precisión milimétrica.
 */
export function utmToLatLon(easting, northing, zone = 30, northern = true) {
  const a = 6378137.0; // semieje mayor
  const f = 1 / 298.257223563; // aplanamiento
  const b = a * (1 - f);
  const e = Math.sqrt(1 - (b / a) ** 2);
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const k0 = 0.9996;

  const x = Number(easting) - 500000.0;
  const y = northern ? Number(northing) : Number(northing) - 10000000.0;
  const m = y / k0;
  const mu = m / (a * (1 - (e ** 2) / 4 - (3 * (e ** 4)) / 64 - (5 * (e ** 6)) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * (e1 ** 3)) / 32) * Math.sin(2 * mu) +
    ((21 * (e1 ** 2)) / 16 - (55 * (e1 ** 4)) / 32) * Math.sin(4 * mu) +
    ((151 * (e1 ** 3)) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const n1 = a / Math.sqrt(1 - (e ** 2) * (sinPhi1 ** 2));
  const t1 = tanPhi1 ** 2;
  const c1 = ((e ** 2) / (1 - e ** 2)) * (cosPhi1 ** 2);
  const r1 = (a * (1 - e ** 2)) / Math.pow(1 - (e ** 2) * (sinPhi1 ** 2), 1.5);
  const d = x / (n1 * k0);

  const latRad =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      ((d ** 2) / 2 -
        (5 + 3 * t1 + 10 * c1 - 4 * (c1 ** 2) - 9 * ((e ** 2) / (1 - e ** 2))) * ((d ** 4) / 24) +
        (61 + 90 * t1 + 298 * c1 + 45 * (t1 ** 2) - 252 * ((e ** 2) / (1 - e ** 2)) - 3 * (c1 ** 2)) *
          ((d ** 6) / 720));

  const lonRad =
    (d -
      (1 + 2 * t1 + c1) * ((d ** 3) / 6) +
      (5 - 2 * c1 + 28 * t1 - 3 * (c1 ** 2) + 8 * ((e ** 2) / (1 - e ** 2)) + 24 * (t1 ** 2)) *
        ((d ** 5) / 120)) /
    cosPhi1;

  const latDeg = (latRad * 180) / Math.PI;
  const centralMeridian = (Number(zone) - 1) * 6 - 180 + 3;
  const lonDeg = centralMeridian + (lonRad * 180) / Math.PI;

  return { lat: Number(latDeg.toFixed(6)), lon: Number(lonDeg.toFixed(6)) };
}

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
    this.cadBackgroundEntities = []; // Líneas y aristas de contexto DXF
    this.referenceAxes = []; // Ejes viales de referencia (guía visual + snap magnético + adopción)
    this.hoveredReferenceAxisIndex = -1;
    this.onAdoptReferenceAxis = null;
    this.flashCircle = null;
    this._flashRafId = null;
    this.isComputing = false;

    this.layers = {
      grid: true,
      cadBackground: true,
      referenceAxes: true,
      envelope: true,
      margin: true,
      refTraces: true,
      wheelTraces: true,
      ghosts: true,
      obstacles: true,
      dimensions: true,
      axlesAndPoints: true,
      pnoa: false
    };

    // Capa de Ortofotografías Aéreas PNOA (Instituto Geográfico Nacional de España - IGN)
    this.pnoaConfig = {
      enabled: false,
      opacity: 0.8,
      centerLat: 40.3872, // Glorieta M-501 (Madrid) por defecto
      centerLon: -3.8785,
      utmZone: 30,
      anchorWorldX: 0.0,
      anchorWorldY: 0.0
    };
    this.pnoaTileCache = new Map();

    this.isDragging = false;
    this.draggedObstacle = null;
    this.lastMouse = { x: 0, y: 0 };
    this.hoverWorld = null;
    this.onObstacleMoved = null;

    // Modo interactivo de edición de trayectoria por waypoints (UX-04)
    this.waypointMode = false;
    this.trajectoryMode = "spline"; // 'spline' (Spline CAD continua) | 'fillet' (Polilínea con acuerdos)
    this.activeDrawDirection = 1; // +1 avance, -1 marcha atrás
    this.autoDetectCusps = true; // Detección automática de cúspides > 125° (Opción C)
    this.minVehicleTurnRadius = 6.8;
    this.waypoints = [];
    this.draggedWaypointIndex = -1;
    this.hoveredWaypointIndex = -1;
    this.onWaypointsChange = null;
    this.onWaypointDragEnd = null;
    this.onWaypointModeChange = null;
    this.onWaypointContextMenu = null;
    this.onActiveDrawDirectionChange = null;
    this.onAutoCuspDetected = null;

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
    this.canvas.style.touchAction = "none";

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.measurePoints.length > 0 || this.measureMode) {
          this.clearMeasurement();
          if (this.measureMode) this.toggleMeasureMode(false);
        }
        if (this.waypointMode) {
          this.toggleWaypointMode(false);
        }
      }
    });

    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const [wx, wy] = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const hitIdx = this._findWaypointAt(wx, wy);
      if (hitIdx >= 0 && typeof this.onWaypointContextMenu === "function") {
        this.onWaypointContextMenu({
          index: hitIdx,
          clientX: e.clientX,
          clientY: e.clientY,
          waypoint: this.waypoints[hitIdx]
        });
        return;
      }
      if (this.measureMode || this.measurePoints.length > 0) {
        this.clearMeasurement();
      }
    });

    this.canvas.addEventListener("dblclick", () => {
      if (this.waypointMode && this.hoverWorld) {
        const [wx, wy] = this.hoverWorld;
        const hitIdx = this._findWaypointAt(wx, wy);
        if (hitIdx >= 0) {
          this.waypoints.splice(hitIdx, 1);
          if (typeof this.onWaypointsChange === "function") {
            this.onWaypointsChange(this.waypoints);
          }
          this.render();
        }
      }
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const beforeWorld = this.screenToWorld(mx, my);

      const zoomFactor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      // Permite desde vista comarcal/provincial (0.005 px/m ~ 1:750.000) hasta detalle milimétrico (220 px/m)
      this.scale = Math.max(0.005, Math.min(220.0, this.scale * zoomFactor));

      const afterWorld = this.screenToWorld(mx, my);
      this.camX += beforeWorld[0] - afterWorld[0];
      this.camY += beforeWorld[1] - afterWorld[1];
      this.render();
    }, { passive: false });

    // Pointer Events unificados para ratón, lápiz óptico y pantalla táctil (UX-08)
    this.canvas.addEventListener("pointerdown", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.lastMouse = { x: mx, y: my };
      const [wx, wy] = this.screenToWorld(mx, my);

      if (e.button === 2) {
        return;
      }
      if (e.button !== 0) return;

      try {
        this.canvas.setPointerCapture(e.pointerId);
        this._capturedPointerId = e.pointerId;
      } catch (_) {}

      // 1. Modo edición gráfica de waypoints
      if (this.waypointMode) {
        // Shift+Clic sobre un eje vial de referencia: adoptar el eje completo como trayectoria
        if (e.shiftKey && this.layers.referenceAxes && this.referenceAxes.length > 0) {
          const axisIdx = this._findReferenceAxisAt(wx, wy, 14);
          if (axisIdx >= 0 && typeof this.onAdoptReferenceAxis === "function") {
            this.onAdoptReferenceAxis(this.referenceAxes[axisIdx], { clickWorld: [wx, wy] });
            return;
          }
        }

        const hitIdx = this._findWaypointAt(wx, wy);
        if (hitIdx >= 0) {
          this.draggedWaypointIndex = hitIdx;
          this.render();
          return;
        }

        const wpSnap = e.altKey ? null : this._findSnapPoint(wx, wy, 14);
        const targetX = wpSnap ? wpSnap.x : wx;
        const targetY = wpSnap ? wpSnap.y : wy;
        const segIdx = this._findWaypointSegmentAt(targetX, targetY);
        const xFixed = Number(targetX.toFixed(2));
        const yFixed = Number(targetY.toFixed(2));
        if (segIdx >= 0) {
          const prevDir = this._wpDir(this.waypoints[segIdx], this.activeDrawDirection);
          this.waypoints.splice(segIdx + 1, 0, { x: xFixed, y: yFixed, direction: prevDir, directionExplicit: false });
          this.draggedWaypointIndex = segIdx + 1;
        } else {
          // Detección automática de cúspides (Opción C): ángulo de quiebro >= 125° respecto al tramo previo
          if (this.autoDetectCusps && this.waypoints.length >= 2) {
            const pPrev = this.waypoints[this.waypoints.length - 2];
            const pCurr = this.waypoints[this.waypoints.length - 1];
            const v1x = this._wpX(pCurr) - this._wpX(pPrev);
            const v1y = this._wpY(pCurr) - this._wpY(pPrev);
            const v2x = xFixed - this._wpX(pCurr);
            const v2y = yFixed - this._wpY(pCurr);
            const len1 = Math.hypot(v1x, v1y);
            const len2 = Math.hypot(v2x, v2y);
            if (len1 > 0.5 && len2 > 0.5) {
              const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
              const turnAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
              const isExplicit = Boolean(pCurr && !Array.isArray(pCurr) && pCurr.directionExplicit);
              if (turnAngle >= (125 * Math.PI) / 180 && !isExplicit) {
                const currDir = this._wpDir(pCurr, this.activeDrawDirection);
                const flippedDir = currDir === 1 ? -1 : 1;
                this.waypoints[this.waypoints.length - 1] = {
                  x: this._wpX(pCurr),
                  y: this._wpY(pCurr),
                  direction: flippedDir,
                  directionExplicit: false
                };
                this.setActiveDrawDirection(flippedDir);
                if (typeof this.onAutoCuspDetected === "function") {
                  this.onAutoCuspDetected(this.waypoints.length - 1, flippedDir);
                }
              }
            }
          }
          this.waypoints.push({
            x: xFixed,
            y: yFixed,
            direction: this.activeDrawDirection,
            directionExplicit: false
          });
          this.draggedWaypointIndex = this.waypoints.length - 1;
        }
        if (typeof this.onWaypointsChange === "function") {
          this.onWaypointsChange(this.waypoints);
        }
        this.render();
        return;
      }

      // 2. Modo medición de distancias
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

      // 3. Arrastre de obstáculos con Shift
      if (e.shiftKey && this.obstacles && this.layers.obstacles) {
        for (const obs of this.obstacles) {
          if (obs.enabled === false || obs.shape === "polyline") continue;
          if (Math.hypot((obs.x || 0) - wx, (obs.y || 0) - wy) < 3.5) {
            this.draggedObstacle = obs;
            return;
          }
        }
      }

      // 4. Panning de cámara
      this.isDragging = true;
    });

    window.addEventListener("pointermove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.hoverWorld = this.screenToWorld(mx, my);
      const [wx, wy] = this.hoverWorld;

      if (this.draggedWaypointIndex >= 0 && this.waypoints[this.draggedWaypointIndex]) {
        const oldWp = this.waypoints[this.draggedWaypointIndex];
        const dragSnap = e.altKey ? null : this._findSnapPoint(wx, wy, 14);
        this.activeSnap = dragSnap;
        const xFixed = Number((dragSnap ? dragSnap.x : wx).toFixed(2));
        const yFixed = Number((dragSnap ? dragSnap.y : wy).toFixed(2));
        if (oldWp && !Array.isArray(oldWp)) {
          this.waypoints[this.draggedWaypointIndex] = { ...oldWp, x: xFixed, y: yFixed };
        } else {
          this.waypoints[this.draggedWaypointIndex] = { x: xFixed, y: yFixed, direction: this.activeDrawDirection, directionExplicit: false };
        }
        if (typeof this.onWaypointsChange === "function") {
          this.onWaypointsChange(this.waypoints, { isDragging: true });
        }
        this.render();
        return;
      }

      if (this.waypointMode) {
        const prevHover = this.hoveredWaypointIndex;
        const prevAxisHover = this.hoveredReferenceAxisIndex;
        const prevSnap = this.activeSnap;
        this.hoveredWaypointIndex = this._findWaypointAt(wx, wy);
        this.hoveredReferenceAxisIndex = (e.shiftKey && this.layers.referenceAxes && this.referenceAxes.length > 0)
          ? this._findReferenceAxisAt(wx, wy, 14)
          : -1;
        this.activeSnap = (this.hoveredWaypointIndex < 0 && !e.altKey)
          ? this._findSnapPoint(wx, wy, 14)
          : null;
        this.canvas.style.cursor = (this.hoveredWaypointIndex >= 0 || this.hoveredReferenceAxisIndex >= 0) ? "pointer" : "crosshair";
        const snapChanged = Boolean(prevSnap) !== Boolean(this.activeSnap) ||
          (prevSnap && this.activeSnap && (prevSnap.x !== this.activeSnap.x || prevSnap.y !== this.activeSnap.y));
        if (prevHover !== this.hoveredWaypointIndex || prevAxisHover !== this.hoveredReferenceAxisIndex || snapChanged) {
          this.render();
        }
      }

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

    const onPointerEnd = (e) => {
      if (this._capturedPointerId !== null && this._capturedPointerId !== undefined) {
        try {
          this.canvas.releasePointerCapture(this._capturedPointerId);
        } catch (_) {}
        this._capturedPointerId = null;
      }
      if (this.draggedWaypointIndex >= 0) {
        this.draggedWaypointIndex = -1;
        if (typeof this.onWaypointsChange === "function") {
          this.onWaypointsChange(this.waypoints, { isDragging: false });
        }
        if (typeof this.onWaypointDragEnd === "function") {
          this.onWaypointDragEnd(this.waypoints);
        }
      }
      if (this.draggedObstacle && typeof this.onObstacleDragEnd === "function") {
        this.onObstacleDragEnd(this.draggedObstacle);
      }
      this.isDragging = false;
      this.draggedObstacle = null;
    };

    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
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

  toggleWaypointMode(active) {
    this.waypointMode = typeof active === "boolean" ? active : !this.waypointMode;
    if (this.waypointMode && this.measureMode) {
      this.toggleMeasureMode(false);
    }
    this.canvas.style.cursor = this.waypointMode ? "crosshair" : "default";
    if (typeof this.onWaypointModeChange === "function") {
      this.onWaypointModeChange(this.waypointMode);
    }
    this.render();
    return this.waypointMode;
  }

  setTrajectoryMode(mode) {
    this.trajectoryMode = mode === "fillet" ? "fillet" : "spline";
    this.render();
  }

  setMinVehicleTurnRadius(r) {
    if (Number.isFinite(r) && r > 0) {
      this.minVehicleTurnRadius = r;
      this.render();
    }
  }

  _wpX(wp) {
    return Array.isArray(wp) ? wp[0] : (wp?.x !== undefined ? wp.x : wp?.[0] ?? 0);
  }

  _wpY(wp) {
    return Array.isArray(wp) ? wp[1] : (wp?.y !== undefined ? wp.y : wp?.[1] ?? 0);
  }

  _wpDir(wp, fallback = 1) {
    if (wp && !Array.isArray(wp) && (wp.direction === 1 || wp.direction === -1)) {
      return wp.direction;
    }
    return fallback;
  }

  setActiveDrawDirection(dir) {
    const nextDir = dir === -1 ? -1 : 1;
    this.activeDrawDirection = nextDir;
    if (typeof this.onActiveDrawDirectionChange === "function") {
      this.onActiveDrawDirectionChange(nextDir);
    }
    this.render();
  }

  setWaypoints(pts) {
    this.waypoints = Array.isArray(pts)
      ? pts
          .map((p) => {
            const px = Number(this._wpX(p));
            const py = Number(this._wpY(p));
            if (p && !Array.isArray(p) && (p.direction === 1 || p.direction === -1)) {
              return { x: px, y: py, direction: p.direction, directionExplicit: Boolean(p.directionExplicit) };
            }
            return { x: px, y: py, direction: 1, directionExplicit: false };
          })
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      : [];
    if (this.waypoints.length > 0) {
      const lastDir = this._wpDir(this.waypoints[this.waypoints.length - 1], 1);
      this.activeDrawDirection = lastDir;
    }
    this.render();
  }

  clearWaypoints(silent = false) {
    this.waypoints = [];
    this.draggedWaypointIndex = -1;
    this.hoveredWaypointIndex = -1;
    this.activeDrawDirection = 1;
    if (typeof this.onActiveDrawDirectionChange === "function") {
      this.onActiveDrawDirectionChange(1);
    }
    if (!silent && typeof this.onWaypointsChange === "function") {
      this.onWaypointsChange(this.waypoints);
    }
    this.render();
  }

  _findWaypointAt(wx, wy, tolPx = 14) {
    if (!this.waypoints || this.waypoints.length === 0) return -1;
    const tolM = tolPx / this.scale;
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      if (Math.hypot(this._wpX(wp) - wx, this._wpY(wp) - wy) <= tolM) {
        return i;
      }
    }
    return -1;
  }

  _findWaypointSegmentAt(wx, wy, tolPx = 12) {
    if (!this.waypoints || this.waypoints.length < 2) return -1;
    const tolM = tolPx / this.scale;
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const p1x = this._wpX(this.waypoints[i]);
      const p1y = this._wpY(this.waypoints[i]);
      const p2x = this._wpX(this.waypoints[i + 1]);
      const p2y = this._wpY(this.waypoints[i + 1]);
      const dx = p2x - p1x;
      const dy = p2y - p1y;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;
      let t = ((wx - p1x) * dx + (wy - p1y) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(wx - (p1x + t * dx), wy - (p1y + t * dy));
      if (dist <= tolM) {
        return i;
      }
    }
    return -1;
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

  _findReferenceAxisAt(wx, wy, tolPx = 14) {
    if (!this.referenceAxes || this.referenceAxes.length === 0) return -1;
    const [smx, smy] = this.worldToScreen(wx, wy);
    let bestIdx = -1;
    let bestDist = tolPx;

    for (let aIdx = 0; aIdx < this.referenceAxes.length; aIdx++) {
      const verts = this.referenceAxes[aIdx]?.vertices;
      if (!verts || verts.length < 2) continue;
      for (let i = 0; i < verts.length - 1; i++) {
        const [ax, ay] = this.worldToScreen(verts[i][0], verts[i][1]);
        const [bx, by] = this.worldToScreen(verts[i + 1][0], verts[i + 1][1]);
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((smx - ax) * dx + (smy - ay) * dy) / lenSq)) : 0;
        const px = ax + t * dx;
        const py = ay + t * dy;
        const d = Math.hypot(smx - px, smy - py);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = aIdx;
        }
      }
    }
    return bestIdx;
  }

  _findSnapPoint(wx, wy, tolPx = 14) {
    const candidates = [];

    // 1. Ejes viales de referencia (vértices y punto más cercano sobre tramo)
    if (this.referenceAxes && this.referenceAxes.length > 0 && this.layers.referenceAxes) {
      for (const axis of this.referenceAxes) {
        const verts = axis.vertices;
        if (!verts || verts.length < 2) continue;
        const axisLabel = axis.name || axis.layer || "Eje vial";
        for (const v of verts) {
          candidates.push({ x: v[0], y: v[1], label: `${axisLabel} (vértice)`, snapType: "axis_vertex", bonusPx: 4 });
        }
        // Proyección ortogonal más cercana sobre cada segmento del eje
        let bestSegPt = null;
        let bestSegDistSq = Infinity;
        for (let i = 0; i < verts.length - 1; i++) {
          const ax = verts[i][0], ay = verts[i][1];
          const bx = verts[i + 1][0], by = verts[i + 1][1];
          const dx = bx - ax, dy = by - ay;
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-9) continue;
          const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / lenSq));
          const px = ax + t * dx;
          const py = ay + t * dy;
          const dSq = (wx - px) * (wx - px) + (wy - py) * (wy - py);
          if (dSq < bestSegDistSq) {
            bestSegDistSq = dSq;
            bestSegPt = [px, py];
          }
        }
        if (bestSegPt) {
          candidates.push({
            x: Number(bestSegPt[0].toFixed(3)),
            y: Number(bestSegPt[1].toFixed(3)),
            label: `${axisLabel} (sobre eje)`,
            snapType: "axis_edge",
            bonusPx: 1.5
          });
        }
      }
    }

    // 2. Obstáculos
    if (this.obstacles && this.layers.obstacles) {
      for (const obs of this.obstacles) {
        if (obs.enabled === false) continue;
        const verts = getObstacleVertices(obs);
        for (const v of verts) {
          candidates.push({ x: v[0], y: v[1], label: obs.name, snapType: "obstacle", bonusPx: 0 });
        }
        if (Number.isFinite(obs.x) && Number.isFinite(obs.y)) {
          candidates.push({ x: obs.x, y: obs.y, label: `${obs.name} (centro)`, snapType: "obstacle", bonusPx: 0 });
        }
      }
    }

    // 3. Vehículo activo en el fotograma actual
    if (this.simResult && this.simResult.states) {
      const s = this.simResult.states[this.currentStateIndex] || this.simResult.states[0];
      if (s) {
        candidates.push({ x: s.x, y: s.y, label: "Eje motriz tractora (P_ref)", bonusPx: 0 });
        if (s.hitch) candidates.push({ x: s.hitch[0], y: s.hitch[1], label: "Quinta rueda (Kingpin)", bonusPx: 0 });
        if (s.tractorFrontAxle && s.tractorFrontAxle.center) {
          candidates.push({ x: s.tractorFrontAxle.center[0], y: s.tractorFrontAxle.center[1], label: "Eje delantero directriz", bonusPx: 0 });
        }
        if (Number.isFinite(s.tx) && Number.isFinite(s.ty)) {
          candidates.push({ x: s.tx, y: s.ty, label: "Centro trídem semirremolque", bonusPx: 0 });
        }
        for (const pt of s.tractorPolygon || []) {
          candidates.push({ x: pt[0], y: pt[1], label: "Esquina tractora", bonusPx: 0 });
        }
        for (const pt of s.trailerPolygon || []) {
          candidates.push({ x: pt[0], y: pt[1], label: "Esquina semirremolque", bonusPx: 0 });
        }
      }
    }

    const [smx, smy] = this.worldToScreen(wx, wy);
    let best = null;
    let bestScore = tolPx;

    for (const c of candidates) {
      const [scx, scy] = this.worldToScreen(c.x, c.y);
      const d = Math.hypot(scx - smx, scy - smy);
      if (d > tolPx) continue;
      const score = d - (c.bonusPx || 0);
      if (score < bestScore) {
        bestScore = score;
        best = { ...c, screenX: scx, screenY: scy };
      }
    }
    return best;
  }

  fitToScene() {
    let minX = +Infinity;
    let minY = +Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const addPt = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };

    if (this.simResult && this.simResult.states && this.simResult.states.length > 0) {
      for (const s of this.simResult.states) {
        if (s.tractorPolygon) {
          for (const p of s.tractorPolygon) addPt(p[0], p[1]);
        }
        if (s.trailerPolygon) {
          for (const p of s.trailerPolygon) addPt(p[0], p[1]);
        }
      }
    }
    for (const obs of this.obstacles || []) {
      if (obs.enabled === false) continue;
      for (const p of getObstacleVertices(obs)) addPt(p[0], p[1]);
    }
    for (const ent of this.cadBackgroundEntities || []) {
      for (const p of ent.vertices || []) addPt(p[0], p[1]);
    }
    for (const ax of this.referenceAxes || []) {
      for (const p of ax.vertices || []) addPt(p[0], p[1]);
    }
    for (const wp of this.waypoints || []) {
      addPt(this._wpX(wp), this._wpY(wp));
    }

    if (!Number.isFinite(minX)) {
      this.camX = 0;
      this.camY = 0;
      this.scale = 20.0;
      this.render();
      return;
    }

    this.camX = 0.5 * (minX + maxX);
    this.camY = 0.5 * (minY + maxY);
    const spanX = Math.max(12, maxX - minX + 8);
    const spanY = Math.max(12, maxY - minY + 8);
    this.scale = Math.max(0.02, Math.min(80, Math.min((this.width || 800) / spanX, (this.height || 600) / spanY)));
    this.render();
  }

  setData({ vehicle, simResult, obstacles, interferenceReport, cadBackgroundEntities, referenceAxes }) {
    this.vehicle = vehicle;
    this.simResult = simResult;
    this.obstacles = obstacles || [];
    this.interferenceReport = interferenceReport || null;
    if (Array.isArray(cadBackgroundEntities)) {
      this.cadBackgroundEntities = cadBackgroundEntities;
    }
    if (Array.isArray(referenceAxes)) {
      this.referenceAxes = referenceAxes;
    }
    if (this.simResult && this.currentStateIndex >= this.simResult.states.length) {
      this.currentStateIndex = 0;
    }
    this.render();
  }

  setPnoaConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return;
    if (typeof cfg.enabled === "boolean") {
      this.pnoaConfig.enabled = cfg.enabled;
      this.layers.pnoa = cfg.enabled;
    }
    if (typeof cfg.opacity === "number" && !isNaN(cfg.opacity)) {
      this.pnoaConfig.opacity = Math.max(0.1, Math.min(1.0, cfg.opacity));
    }
    if (typeof cfg.centerLat === "number" && Number.isFinite(cfg.centerLat)) {
      this.pnoaConfig.centerLat = cfg.centerLat;
    }
    if (typeof cfg.centerLon === "number" && Number.isFinite(cfg.centerLon)) {
      this.pnoaConfig.centerLon = cfg.centerLon;
    }
    if (typeof cfg.utmZone === "number" && Number.isFinite(cfg.utmZone)) {
      this.pnoaConfig.utmZone = cfg.utmZone;
    }
    if (typeof cfg.anchorWorldX === "number" && Number.isFinite(cfg.anchorWorldX)) {
      this.pnoaConfig.anchorWorldX = cfg.anchorWorldX;
    }
    if (typeof cfg.anchorWorldY === "number" && Number.isFinite(cfg.anchorWorldY)) {
      this.pnoaConfig.anchorWorldY = cfg.anchorWorldY;
    }
    this.render();
  }

  setPnoaLocationFromUtm(easting, northing, zone = 30) {
    const geo = utmToLatLon(easting, northing, zone);
    this.setPnoaConfig({
      centerLat: geo.lat,
      centerLon: geo.lon,
      utmZone: zone,
      anchorWorldX: Number(easting),
      anchorWorldY: Number(northing)
    });
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

    // Ortofotografía aérea oficial PNOA (Instituto Geográfico Nacional - IGN)
    if (this.layers.pnoa && this.pnoaConfig && this.pnoaConfig.enabled) {
      this._drawPnoaLayer(ctx, w, h);
    }

    if (this.layers.grid) {
      this._drawGrid(ctx, w, h);
    }

    // Capa de dibujo de fondo CAD DXF (siempre visible si está habilitada)
    if (this.layers.cadBackground && this.cadBackgroundEntities && this.cadBackgroundEntities.length > 0) {
      this._drawCadBackground(ctx);
    }

    // Capa de ejes viales de referencia (guía de trazado y snap magnético)
    if (this.layers.referenceAxes && this.referenceAxes && this.referenceAxes.length > 0) {
      this._drawReferenceAxes(ctx);
    }

    // Obstáculos del entorno (edificios, bordillos, vallas, zonas restringidas)
    // Se dibujan SIEMPRE para que los obstáculos y el plano CAD sean visibles
    // antes y durante el trazado o simulación de una maniobra
    if (this.layers.obstacles && this.obstacles && this.obstacles.length > 0) {
      this._drawObstacles(ctx);
    }

    // Puntos de paso y trazado interactivo de ruta (UX-04)
    this._drawWaypoints(ctx);

    const hasSimulation = Boolean(this.simResult && this.simResult.states && this.simResult.states.length > 0);
    if (!hasSimulation) {
      if (this.measureMode || this.measurePoints.length > 0) {
        this._drawMeasurement(ctx);
      } else if (this.waypointMode && this.activeSnap) {
        this._drawSnapIndicator(ctx, this.activeSnap);
      }

      // Si el visor está completamente limpio (sin simulación, sin CAD y sin obstáculos)
      const hasContent = (this.cadBackgroundEntities && this.cadBackgroundEntities.length > 0) ||
                         (this.referenceAxes && this.referenceAxes.length > 0) ||
                         (this.obstacles && this.obstacles.length > 0) ||
                         (this.waypoints && this.waypoints.length > 0) ||
                         (this.layers.pnoa && this.pnoaConfig && this.pnoaConfig.enabled);
      if (!hasContent) {
        this._drawEmptyStateNotice(ctx, w, h);
      }

      this._drawFlashCircle(ctx);
      this._drawHUD(ctx, w, h);
      return;
    }

    // 1. Envolvente de margen de seguridad
    if (this.layers.margin) {
      if (this.simResult.marginEnvelope && this.simResult.marginEnvelope.length >= 3) {
        this._drawSweptEnvelope(
          ctx,
          this.simResult.marginEnvelope,
          this.simResult.marginEnvelopeHoles,
          "rgba(250, 204, 21, 0.09)",
          "#eab308",
          1.8,
          [6, 4]
        );
      } else if (this.simResult.marginLeftBoundary && this.simResult.marginRightBoundary) {
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
    }

    // 2. Envolvente física de barrido (Hüllkurve)
    if (this.layers.envelope) {
      if (this.simResult.envelope && this.simResult.envelope.length >= 3) {
        this._drawSweptEnvelope(
          ctx,
          this.simResult.envelope,
          this.simResult.envelopeHoles,
          "rgba(239, 68, 68, 0.18)",
          "#ef4444",
          2.0,
          []
        );
      } else {
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
    }

    // 3. Huellas de las ruedas
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

    // 7. Acotaciones de anchura barrida (solamente cotas de barrido)
    if (this.layers.dimensions) {
      this._drawDimensions(ctx);
    }

    // 8. Vehículo articulado en el fotograma actual
    const activeState = this.simResult.states[this.currentStateIndex] || this.simResult.states[0];
    if (activeState) {
      this._drawActiveVehicle(ctx, activeState);
    }

    // 9. Puntos de paso y trazado interactivo de ruta (UX-04)
    this._drawWaypoints(ctx);

    // 10. Medición interactiva de distancias
    this._drawMeasurement(ctx);

    // 10.5 Círculo flash de localización rápida (Ir al PK)
    this._drawFlashCircle(ctx);

    // 11. Escala gráfica, rosa de los vientos y coordenadas
    this._drawHUD(ctx, w, h);
  }

  /**
   * Activa un círculo pulsante temporal sobre (wx, wy) para localizar visualmente un punto PK.
   */
  triggerFlashCircle(wx, wy, color = "#ef4444", durationMs = 2400) {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return;
    if (this._flashRafId) {
      cancelAnimationFrame(this._flashRafId);
      this._flashRafId = null;
    }
    this.flashCircle = {
      x: wx,
      y: wy,
      color,
      startTime: performance.now(),
      durationMs
    };
    const tick = () => {
      if (!this.flashCircle) {
        this._flashRafId = null;
        return;
      }
      const elapsed = performance.now() - this.flashCircle.startTime;
      if (elapsed >= this.flashCircle.durationMs) {
        this.flashCircle = null;
        this._flashRafId = null;
        this.render();
        return;
      }
      this.render();
      this._flashRafId = requestAnimationFrame(tick);
    };
    this._flashRafId = requestAnimationFrame(tick);
  }

  _drawFlashCircle(ctx) {
    if (!this.flashCircle) return;
    const elapsed = performance.now() - this.flashCircle.startTime;
    if (elapsed >= this.flashCircle.durationMs) return;

    const [sx, sy] = this.worldToScreen(this.flashCircle.x, this.flashCircle.y);
    const totalProgress = elapsed / this.flashCircle.durationMs;
    const pulseCycles = 3;
    const cyclePhase = (totalProgress * pulseCycles) % 1; // 0..1 en cada pulso
    const fadeOut = 1 - Math.pow(totalProgress, 2);

    const rOuter = 12 + cyclePhase * 42;
    const rInner = 7 + cyclePhase * 18;
    const alphaOuter = Math.max(0, (1 - cyclePhase) * 0.92 * fadeOut);
    const alphaInner = Math.max(0, (1 - cyclePhase * 0.6) * 0.95 * fadeOut);
    const col = this.flashCircle.color || "#ef4444";

    ctx.save();
    // Halo exterior expansivo
    ctx.globalAlpha = alphaOuter;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(sx, sy, rOuter, 0, Math.PI * 2);
    ctx.stroke();

    // Segundo anillo interior
    ctx.globalAlpha = alphaInner * 0.45;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sx, sy, rInner, 0, Math.PI * 2);
    ctx.fill();

    // Retícula fija en el centro del punto PK
    ctx.globalAlpha = Math.max(0.25, fadeOut);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawPnoaLayer(ctx, width, height) {
    if (!this.layers.pnoa || !this.pnoaConfig || !this.pnoaConfig.enabled) return;

    const lat0 = this.pnoaConfig.centerLat || 40.3872;
    const lon0 = this.pnoaConfig.centerLon || -3.8785;
    const radLat0 = (lat0 * Math.PI) / 180;
    const cosLat0 = Math.cos(radLat0);

    const anchorWx = this.pnoaConfig.anchorWorldX || 0.0;
    const anchorWy = this.pnoaConfig.anchorWorldY || 0.0;

    // Rango visible en coordenadas del mundo TurnSim (m)
    const minWx = this.camX - (width / 2) / this.scale;
    const maxWx = this.camX + (width / 2) / this.scale;
    const minWy = this.camY - (height / 2) / this.scale;
    const maxWy = this.camY + (height / 2) / this.scale;

    // Constantes geodésicas Web Mercator EPSG:3857
    const C = 40075016.68557849;
    const halfC = C / 2;

    const anchorX3857 = (lon0 * C) / 360;
    const sinLat0 = Math.sin(radLat0);
    const clampedSin0 = Math.max(-0.9999, Math.min(0.9999, sinLat0));
    const anchorY3857 = (Math.log((1 + clampedSin0) / (1 - clampedSin0)) / 2) * (C / (2 * Math.PI));

    // Conversión métrica: 1 m en terreno = 1 / cos(lat0) m en EPSG:3857
    const to3857X = (wx) => anchorX3857 + ((wx - anchorWx) / cosLat0);
    const to3857Y = (wy) => anchorY3857 + ((wy - anchorWy) / cosLat0);

    const minX3857 = to3857X(minWx);
    const maxX3857 = to3857X(maxWx);
    const minY3857 = to3857Y(minWy);
    const maxY3857 = to3857Y(maxWy);

    // Nivel de zoom WMTS (PNOA IGN soporta niveles 4 a 20 en GoogleMapsCompatible)
    const targetZ = Math.round(Math.log2((C * cosLat0 * this.scale) / 256));
    const z = Math.max(4, Math.min(20, targetZ));

    const numTiles = 1 << z;
    const tileRes3857 = C / numTiles;

    let colMin = Math.max(0, Math.min(numTiles - 1, Math.floor((minX3857 + halfC) / tileRes3857)));
    let colMax = Math.max(0, Math.min(numTiles - 1, Math.floor((maxX3857 + halfC) / tileRes3857)));
    let rowMin = Math.max(0, Math.min(numTiles - 1, Math.floor((halfC - maxY3857) / tileRes3857)));
    let rowMax = Math.max(0, Math.min(numTiles - 1, Math.floor((halfC - minY3857) / tileRes3857)));

    // Salvaguarda adaptativa: si la vista es ultra-amplia, acotar al cuadrante central visible
    const totalCols = colMax - colMin + 1;
    const totalRows = rowMax - rowMin + 1;
    if (totalCols * totalRows > 120) {
      const midCol = Math.floor((colMin + colMax) / 2);
      const midRow = Math.floor((rowMin + rowMax) / 2);
      colMin = Math.max(0, midCol - 5);
      colMax = Math.min(numTiles - 1, midCol + 5);
      rowMin = Math.max(0, midRow - 4);
      rowMax = Math.min(numTiles - 1, midRow + 4);
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1.0, this.pnoaConfig.opacity ?? 0.8));

    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        if (col < 0 || col >= numTiles || row < 0 || row >= numTiles) continue;

        const tileMinX3857 = col * tileRes3857 - halfC;
        const tileMaxX3857 = (col + 1) * tileRes3857 - halfC;
        const tileMaxY3857 = halfC - row * tileRes3857;
        const tileMinY3857 = halfC - (row + 1) * tileRes3857;

        const tileMinWx = anchorWx + (tileMinX3857 - anchorX3857) * cosLat0;
        const tileMaxWx = anchorWx + (tileMaxX3857 - anchorX3857) * cosLat0;
        const tileMinWy = anchorWy + (tileMinY3857 - anchorY3857) * cosLat0;
        const tileMaxWy = anchorWy + (tileMaxY3857 - anchorY3857) * cosLat0;

        const [screenX1, screenY1] = this.worldToScreen(tileMinWx, tileMaxWy);
        const [screenX2, screenY2] = this.worldToScreen(tileMaxWx, tileMinWy);

        const sw = screenX2 - screenX1;
        const sh = screenY2 - screenY1;

        const tileKey = `${z}/${col}/${row}`;
        let img = this.pnoaTileCache.get(tileKey);

        if (!img) {
          if (this.pnoaTileCache.size > 512) {
            const firstKey = this.pnoaTileCache.keys().next().value;
            this.pnoaTileCache.delete(firstKey);
          }

          img = new Image();
          img.crossOrigin = "anonymous";
          img.loaded = false;
          img.onload = () => {
            img.loaded = true;
            this.render();
          };
          img.onerror = () => {
            img.failed = true;
          };
          img.src = `https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix=${z}&TileRow=${row}&TileCol=${col}`;
          this.pnoaTileCache.set(tileKey, img);
        }

        if (img.loaded) {
          ctx.drawImage(img, screenX1, screenY1, sw, sh);
        } else {
          ctx.fillStyle = "rgba(30, 41, 59, 0.4)";
          ctx.fillRect(screenX1, screenY1, sw, sh);
        }
      }
    }

    ctx.restore();

    // Diligencia de atribución oficial requerida por IGN / CNIG
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.fillRect(8, height - 26, 224, 20);
    ctx.strokeStyle = "rgba(51, 65, 85, 0.8)";
    ctx.strokeRect(8, height - 26, 224, 20);
    ctx.font = "10.5px sans-serif";
    ctx.fillStyle = "#38bdf8";
    ctx.textAlign = "left";
    ctx.fillText("🛰️ IGN España — Ortofoto PNOA", 14, height - 12);
    ctx.restore();
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

    // Cuadrícula principal adaptativa según nivel de zoom
    let gridStep = 5;
    if (this.scale < 0.02) gridStep = 5000;
    else if (this.scale < 0.1) gridStep = 1000;
    else if (this.scale < 0.5) gridStep = 200;
    else if (this.scale < 1.5) gridStep = 50;
    else if (this.scale < 4.0) gridStep = 20;
    else gridStep = 5;

    ctx.strokeStyle = "rgba(51, 65, 85, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const startXGrid = Math.floor(minWX / gridStep) * gridStep;
    const startYGrid = Math.floor(minWY / gridStep) * gridStep;
    for (let x = startXGrid; x <= maxWX; x += gridStep) {
      const [sx] = this.worldToScreen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = startYGrid; y <= maxWY; y += gridStep) {
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

  _drawSweptEnvelope(ctx, envelopePolygon, envelopeHoles, fillColor, strokeColor, lineWidth = 2.0, dash = []) {
    if (!envelopePolygon || envelopePolygon.length < 3) return;
    ctx.save();
    ctx.beginPath();
    const [sx0, sy0] = this.worldToScreen(envelopePolygon[0][0], envelopePolygon[0][1]);
    ctx.moveTo(sx0, sy0);
    for (let i = 1; i < envelopePolygon.length; i++) {
      const [sx, sy] = this.worldToScreen(envelopePolygon[i][0], envelopePolygon[i][1]);
      ctx.lineTo(sx, sy);
    }
    ctx.closePath();

    if (envelopeHoles && envelopeHoles.length > 0) {
      for (const hole of envelopeHoles) {
        if (!hole || hole.length < 3) continue;
        const [hx0, hy0] = this.worldToScreen(hole[0][0], hole[0][1]);
        ctx.moveTo(hx0, hy0);
        for (let j = 1; j < hole.length; j++) {
          const [hx, hy] = this.worldToScreen(hole[j][0], hole[j][1]);
          ctx.lineTo(hx, hy);
        }
        ctx.closePath();
      }
    }

    ctx.fillStyle = fillColor;
    ctx.fill("evenodd");

    if (dash && dash.length) {
      ctx.setLineDash(dash);
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  _drawSweptCorridor(ctx, states, useMargin, leftPts, rightPts, fillColor, strokeColor, dash) {
    ctx.save();
    const corridorFill = useMargin ? "rgba(234, 179, 8, 0.12)" : "rgba(239, 68, 68, 0.18)";
    if (leftPts && rightPts && leftPts.length >= 2 && rightPts.length >= 2) {
      ctx.beginPath();
      const [sx0, sy0] = this.worldToScreen(leftPts[0][0], leftPts[0][1]);
      ctx.moveTo(sx0, sy0);
      for (let i = 1; i < leftPts.length; i++) {
        const [sx, sy] = this.worldToScreen(leftPts[i][0], leftPts[i][1]);
        ctx.lineTo(sx, sy);
      }
      for (let i = rightPts.length - 1; i >= 0; i--) {
        const [sx, sy] = this.worldToScreen(rightPts[i][0], rightPts[i][1]);
        ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fillStyle = corridorFill;
      ctx.fill();
    }

    const first = states[0];
    const last = states[states.length - 1];
    this._drawPolygon(
      ctx,
      useMargin ? first.tractorMarginPolygon : first.tractorPolygon,
      corridorFill,
      strokeColor,
      1.3,
      dash
    );
    if (first.trailerPolygon) {
      this._drawPolygon(
        ctx,
        useMargin ? first.trailerMarginPolygon : first.trailerPolygon,
        corridorFill,
        strokeColor,
        1.3,
        dash
      );
    }
    this._drawPolygon(
      ctx,
      useMargin ? last.tractorMarginPolygon : last.tractorPolygon,
      corridorFill,
      strokeColor,
      1.3,
      dash
    );
    if (last.trailerPolygon) {
      this._drawPolygon(
        ctx,
        useMargin ? last.trailerMarginPolygon : last.trailerPolygon,
        corridorFill,
        strokeColor,
        1.3,
        dash
      );
    }

    this._drawPolyline(ctx, leftPts, strokeColor, 2.2, dash);
    this._drawPolyline(ctx, rightPts, strokeColor, 2.2, dash);
    ctx.restore();
  }

  _drawEmptyStateNotice(ctx, w, h) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = w / 2;
    const cy = h / 2;

    if (this.isComputing) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 1.5;
      const boxW = Math.min(460, w - 40);
      const boxH = 96;
      ctx.beginPath();
      ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = "bold 13.5px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText("⏳ Calculando trayectoria y envolventes de barrido...", cx, cy - 14);

      ctx.font = "400 11.5px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Integrando cinemática RK4 y discretización geométrica...", cx, cy + 14);
      ctx.restore();
      return;
    }

    // Caja técnica de indicación inicial en visor vacío
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.40)";
    ctx.lineWidth = 1.2;
    const boxW = Math.min(500, w - 40);
    const boxH = 120;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 13.5px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("Simulador de trayectorias de barrido TurnSim", cx, cy - 32);

    ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText("Para comenzar una simulación:", cx, cy - 8);

    ctx.font = "400 11.5px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("✏️ Pulse «Trazar/Editar ruta» para dibujar una trayectoria sobre el plano", cx, cy + 14);
    ctx.fillText("📂 O cargue un plano CAD (.DXF) o cartografía geoespacial (.GeoJSON)", cx, cy + 34);

    ctx.restore();
  }

  _drawCadBackground(ctx) {
    if (!this.cadBackgroundEntities || this.cadBackgroundEntities.length === 0) return;
    ctx.save();
    for (const ent of this.cadBackgroundEntities) {
      if (!ent.vertices || ent.vertices.length < 2) continue;
      if (ent.closed) {
        this._drawPolygon(ctx, ent.vertices, "rgba(30, 41, 59, 0.35)", "rgba(148, 163, 184, 0.75)", 1.2, []);
      } else {
        this._drawPolyline(ctx, ent.vertices, "rgba(148, 163, 184, 0.70)", 1.2, []);
      }
    }
    ctx.restore();
  }

  _drawReferenceAxes(ctx) {
    if (!this.referenceAxes || this.referenceAxes.length === 0) return;
    ctx.save();
    for (let i = 0; i < this.referenceAxes.length; i++) {
      const ax = this.referenceAxes[i];
      if (!ax.vertices || ax.vertices.length < 2) continue;
      const isHovered = i === this.hoveredReferenceAxisIndex;
      if (isHovered) {
        this._drawPolyline(ctx, ax.vertices, "rgba(34, 211, 238, 0.38)", 7.5, []);
        this._drawPolyline(ctx, ax.vertices, "#67e8f9", 2.8, [14, 5, 3, 5]);
      } else {
        this._drawPolyline(ctx, ax.vertices, "rgba(6, 182, 212, 0.90)", 2.1, [14, 5, 3, 5]);
      }
    }
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

  _drawWaypoints(ctx) {
    if (!this.waypoints || this.waypoints.length === 0) return;

    ctx.save();
    let hasSharpCurvature = false;
    let minObservedR = Infinity;

    // 1. Línea directriz entre waypoints dividida por sub-tramos de sentido (Avance vs Retroceso)
    const chains = splitWaypointsByDirection(this.waypoints, this._wpDir(this.waypoints[0], 1), {
      autoDetectCusps: false
    });
    const cuspDirs = new Map();
    for (let c = 1; c < chains.length; c++) {
      const firstPt = chains[c].points[0];
      const idx = this.waypoints.findIndex(
        (w) => Math.hypot(this._wpX(w) - firstPt.x, this._wpY(w) - firstPt.y) < 1e-4
      );
      if (idx >= 0) cuspDirs.set(idx, chains[c].direction);
    }

    if (this.waypoints.length >= 2) {
      if (this.trajectoryMode === "spline") {
        // Polígono de control CAD (líneas tenues discontinuas)
        if (this.waypoints.length >= 3) {
          ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
          ctx.lineWidth = 1.0;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          for (let i = 0; i < this.waypoints.length; i++) {
            const [sx, sy] = this.worldToScreen(this._wpX(this.waypoints[i]), this._wpY(this.waypoints[i]));
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const minTurnR = this.minVehicleTurnRadius || 6.8;
        let prevEndHeading = null;
        for (let c = 0; c < chains.length; c++) {
          const ch = chains[c];
          const sOpts = { stepM: 0.20 };
          if (c > 0 && Number.isFinite(prevEndHeading)) {
            sOpts.initialTangentRad = ch.direction >= 0 ? prevEndHeading : prevEndHeading + Math.PI;
          }
          const splineSamples = sampleCatmullRomSpline(ch.points, sOpts);
          const isReverse = ch.direction === -1;

          if (isReverse) ctx.setLineDash([7, 5]);
          else ctx.setLineDash([]);

          for (let i = 0; i < splineSamples.length - 1; i++) {
            const s0 = splineSamples[i];
            const s1 = splineSamples[i + 1];
            if (s0.radius < minObservedR) minObservedR = s0.radius;
            const isSharp = s0.radius < minTurnR || s1.radius < minTurnR;
            if (isSharp) hasSharpCurvature = true;

            const [sx0, sy0] = this.worldToScreen(s0.x, s0.y);
            const [sx1, sy1] = this.worldToScreen(s1.x, s1.y);

            if (isSharp) {
              ctx.strokeStyle = "#f87171";
            } else if (isReverse) {
              ctx.strokeStyle = this.waypointMode ? "#f59e0b" : "rgba(245, 158, 11, 0.80)";
            } else {
              ctx.strokeStyle = this.waypointMode ? "#38bdf8" : "rgba(56, 189, 248, 0.70)";
            }
            ctx.lineWidth = isSharp ? 2.8 : (this.waypointMode ? 2.4 : 1.8);
            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(sx1, sy1);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          if (splineSamples.length >= 2) {
            const lastSp = splineSamples[splineSamples.length - 1];
            prevEndHeading = ch.direction >= 0 ? lastSp.headingRad : lastSp.headingRad + Math.PI;
          }
        }
      } else {
        // Modo tradicional polilínea con acuerdos diferenciando tramos en avance y retroceso
        for (const ch of chains) {
          const isReverse = ch.direction === -1;
          ctx.strokeStyle = isReverse
            ? (this.waypointMode ? "#f59e0b" : "rgba(245, 158, 11, 0.65)")
            : (this.waypointMode ? "#38bdf8" : "rgba(56, 189, 248, 0.45)");
          ctx.lineWidth = this.waypointMode ? 2.2 : 1.5;
          ctx.setLineDash(isReverse ? [7, 4] : [6, 4]);
          ctx.beginPath();
          for (let i = 0; i < ch.points.length; i++) {
            const [sx, sy] = this.worldToScreen(ch.points[i].x, ch.points[i].y);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }

    // 2. Nodos circulares
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const wx = this._wpX(wp);
      const wy = this._wpY(wp);
      const [sx, sy] = this.worldToScreen(wx, wy);
      const isDragged = this.draggedWaypointIndex === i;
      const isHovered = this.hoveredWaypointIndex === i;
      const cuspDir = cuspDirs.get(i);
      const isCusp = cuspDir !== undefined;
      const wpDir = this._wpDir(wp, 1);
      const r = isDragged ? 11 : isHovered ? 10 : 8.5;

      // Halo resaltado si está interactivo o si es vértice de inversión de marcha
      if (isDragged || isHovered || isCusp) {
        ctx.fillStyle = isCusp
          ? (cuspDir === -1 ? "rgba(245, 158, 11, 0.35)" : "rgba(56, 189, 248, 0.35)")
          : (isDragged ? "rgba(245, 158, 11, 0.35)" : "rgba(56, 189, 248, 0.35)");
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Círculo del nodo
      ctx.fillStyle = isDragged
        ? "#f59e0b"
        : isCusp
          ? (cuspDir === -1 ? "#d97706" : "#0284c7")
          : (wpDir === -1 ? "#b45309" : (isHovered ? "#0284c7" : "#0369a1"));
      ctx.strokeStyle = isCusp ? "#fde68a" : "#f8fafc";
      ctx.lineWidth = isCusp ? 2.5 : 2.0;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Número de waypoint
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), sx, sy);

      // Insignia visual en vértice de cambio de marcha
      if (isCusp) {
        const badgeText = cuspDir === -1 ? "⇄ R" : "⇄ D";
        ctx.font = "bold 9.5px 'Segoe UI', system-ui, sans-serif";
        const bw = ctx.measureText(badgeText).width + 8;
        const bx = sx + r + 4;
        const by = sy - 8;
        ctx.fillStyle = cuspDir === -1 ? "rgba(180, 83, 9, 0.95)" : "rgba(2, 132, 199, 0.95)";
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, 15, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, bx + bw / 2, by + 7.5);
      }

      // Etiqueta métrica flotante únicamente durante arrastre interactivo (modo limpio)
      if (this.waypointMode && isDragged) {
        const coordText = `P${i + 1} (${wx.toFixed(2)}, ${wy.toFixed(2)})`;
        ctx.font = "10px monospace";
        const tw = ctx.measureText(coordText).width + 8;
        ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1;
        ctx.fillRect(sx - tw / 2, sy - r - 18, tw, 14);
        ctx.strokeRect(sx - tw / 2, sy - r - 18, tw, 14);
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(coordText, sx, sy - r - 11);
      }
    }

    // 3. Banner informativo en modo edición (situado en la parte inferior para despejar por completo la botonera superior)
    if (this.waypointMode) {
      if (this.activeSnap) {
        this._drawSnapIndicator(ctx, this.activeSnap);
      }
      const modeLabel = this.trajectoryMode === "spline" ? "SPLINE CAD" : "POLILÍNEA CAD";
      const dirLabel = this.activeDrawDirection === -1 ? "◀ RETROCESO (R)" : "▶ AVANCE (D)";
      const sharpWarning = hasSharpCurvature ? ` · ⚠️ Radio cerrado (${minObservedR.toFixed(1)} m)` : "";
      const axisHint = (this.referenceAxes && this.referenceAxes.length > 0 && this.layers.referenceAxes)
        ? " · Shift+Clic eje: adoptar · Alt: sin snap"
        : "";
      const bannerText = `✏️ [${modeLabel} · ${dirLabel}]: Clic añadir · Tecla R: invertir${axisHint}${sharpWarning}`;
      ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
      const bw = ctx.measureText(bannerText).width + 24;
      const bx = (this.width - bw) / 2;
      const by = Math.max(16, this.height - 42);
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = hasSharpCurvature ? "#f87171" : (this.activeDrawDirection === -1 ? "#f59e0b" : "#0284c7");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 28, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = hasSharpCurvature ? "#fca5a5" : (this.activeDrawDirection === -1 ? "#fcd34d" : "#38bdf8");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bannerText, this.width / 2, by + 14);
    }

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

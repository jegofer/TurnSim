/**
 * Motor de visualización tridimensional sincronizado (Three.js / WebGL)
 * Cumple los apartados 7.2, 9.2 y Fase 5 de PROMT_ORIGINAL.md.
 *
 * Correspondencia geométrica exacta con la planta 2D (sistema dextrógiro):
 *   X_3D = +x_2D  (Este / Derecha)
 *   Y_3D = +z_2D  (Cota / Elevación vertical)
 *   Z_3D = -y_2D  (Sur; de modo que +y_2D Norte apunta hacia -Z_3D y un giro a la izquierda +theta
 *                  gira a la izquierda del conductor tanto en 2D como en 3D).
 */

import { getObstacleVertices } from "../engine/collisions.js";
import earcut from "../vendor/earcut.js";

export class Viewer3D {
  constructor(container) {
    this.container = container;
    this.available =
      typeof window !== "undefined" &&
      Boolean(window.THREE) &&
      typeof window.THREE.OrbitControls === "function";

    this.layers = {
      grid: true,
      envelope: true,
      margin: true,
      refTraces: true,
      wheelTraces: true,
      obstacles: true,
      cadBackground: true,
      dimensions: true
    };

    this.currentStateIndex = 0;
    this.simResult = null;
    this.vehicle = null;
    this.obstacles = [];
    this.cadBackgroundEntities = [];
    this.interferenceReport = null;

    if (!this.available) {
      this._renderFallbackNotice();
      // Si THREE está pero OrbitControls se carga asíncronamente, reintentar cuando esté disponible
      if (typeof window !== "undefined" && window.THREE && !window.THREE.OrbitControls) {
        const pollTimer = setInterval(() => {
          if (window.THREE && typeof window.THREE.OrbitControls === "function") {
            clearInterval(pollTimer);
            this.initIfAvailable();
          }
        }, 80);
        setTimeout(() => clearInterval(pollTimer), 4000);
      }
      return;
    }

    try {
      this._initScene();
      window.addEventListener("resize", () => this.resize());
    } catch (err) {
      console.warn("Viewer3D: error durante inicialización Three.js / WebGL:", err);
      this.available = false;
      this._renderFallbackNotice();
    }
  }

  initIfAvailable() {
    if (this.available) return true;
    if (
      typeof window !== "undefined" &&
      Boolean(window.THREE) &&
      typeof window.THREE.OrbitControls === "function"
    ) {
      try {
        this.available = true;
        this.container.innerHTML = "";
        this._initScene();
        window.addEventListener("resize", () => this.resize());
        if (this.simResult) {
          this.setData({
            vehicle: this.vehicle,
            simResult: this.simResult,
            obstacles: this.obstacles,
            interferenceReport: this.interferenceReport,
            cadBackgroundEntities: this.cadBackgroundEntities
          });
        }
        return true;
      } catch (err) {
        console.warn("Viewer3D: error al inicializar escena Three.js:", err);
        this.available = false;
        this._renderFallbackNotice();
        return false;
      }
    }
    return false;
  }

  _renderFallbackNotice() {
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;padding:24px;text-align:center;">
        <div>
          <h3 style="color:#38bdf8;margin-bottom:8px;">Visor 3D (Three.js) no disponible sin conexión</h3>
          <p>El motor de cálculo y el visor técnico 2D en planta están 100 % operativos localmente.</p>
        </div>
      </div>`;
  }

  _initScene() {
    const THREE = window.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.FogExp2(0x0b1120, 0.006);

    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(14, 34, 32);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(14, 0, -12);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this.needsRender = true;
    this._dampingFrames = 10;
    this.controls.addEventListener("change", () => this.markDirty(20));
    this.renderer.domElement.addEventListener("pointerdown", () => this.markDirty(30), { passive: true });
    this.renderer.domElement.addEventListener("wheel", () => this.markDirty(30), { passive: true });

    // Iluminación
    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(35, 55, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    this.scene.add(sun);

    // Rejilla de pavimento (120 x 120 m)
    this.gridHelper = new THREE.GridHelper(120, 120, 0x334155, 0x1e293b);
    this.gridHelper.position.y = 0;
    this.scene.add(this.gridHelper);

    // Grupos dinámicos por capa
    this.cadBackgroundGroup = new THREE.Group();
    this.envelopeGroup = new THREE.Group();
    this.marginGroup = new THREE.Group();
    this.refTracesGroup = new THREE.Group();
    this.wheelTracesGroup = new THREE.Group();
    this.obstaclesGroup = new THREE.Group();
    this.dimsGroup = new THREE.Group();
    this.vehicleGroup = new THREE.Group();

    this.scene.add(this.cadBackgroundGroup);
    this.scene.add(this.marginGroup);
    this.scene.add(this.envelopeGroup);
    this.scene.add(this.wheelTracesGroup);
    this.scene.add(this.refTracesGroup);
    this.scene.add(this.obstaclesGroup);
    this.scene.add(this.dimsGroup);
    this.scene.add(this.vehicleGroup);

    const animateLoop = () => {
      requestAnimationFrame(animateLoop);
      if (!this.container || this.container.classList.contains("hidden") || this.container.clientWidth === 0) {
        return;
      }
      if (this.needsRender || this._dampingFrames > 0) {
        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
        this.needsRender = false;
        if (this._dampingFrames > 0) {
          this._dampingFrames--;
        }
      }
    };
    animateLoop();
  }

  markDirty(dampingFrames = 2) {
    this.needsRender = true;
    if (dampingFrames > this._dampingFrames) {
      this._dampingFrames = dampingFrames;
    }
  }

  to3D(x2d, y2d, elevation = 0.02) {
    return new window.THREE.Vector3(x2d, elevation, -y2d);
  }

  resize() {
    if (!this.available || !this.renderer) return;
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.markDirty(4);
  }

  fitToScene() {
    if (!this.available || !this.controls) return;
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

    if (this.simResult && this.simResult.states && this.simResult.states.length) {
      for (const s of this.simResult.states) {
        addPt(s.x, s.y);
        if (s.tractorPolygon) {
          for (const p of s.tractorPolygon) addPt(p[0], p[1]);
        }
        if (s.trailerPolygon) {
          for (const p of s.trailerPolygon) addPt(p[0], p[1]);
        }
      }
    }
    if (this.simResult && Array.isArray(this.simResult.envelope)) {
      for (const p of this.simResult.envelope) {
        if (Array.isArray(p)) addPt(p[0], p[1]);
      }
    }
    for (const obs of this.obstacles || []) {
      if (obs.enabled === false) continue;
      for (const [x, y] of getObstacleVertices(obs)) {
        addPt(x, y);
      }
    }
    for (const ent of this.cadBackgroundEntities || []) {
      for (const [x, y] of ent.vertices || []) {
        addPt(x, y);
      }
    }
    for (const wp of this.waypoints || []) {
      const px = Array.isArray(wp) ? wp[0] : (wp?.x ?? NaN);
      const py = Array.isArray(wp) ? wp[1] : (wp?.y ?? NaN);
      addPt(px, py);
    }

    if (!Number.isFinite(minX)) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(15, 30, 30);
      this.controls.update();
      this.markDirty(5);
      return;
    }

    const cx = 0.5 * (minX + maxX);
    const cy = 0.5 * (minY + maxY);
    const spanX = Math.max(12, maxX - minX + 6);
    const spanY = Math.max(12, maxY - minY + 6);
    const span = Math.max(18, Math.max(spanX, spanY));
    this.controls.target.set(cx, 0, -cy);
    this.camera.position.set(cx + span * 0.45, span * 0.75, -cy + span * 0.75);
    this.controls.update();
    this.markDirty(15);
  }

  _clearGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj === group) return;
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          if (!mat) continue;
          if (mat.map) mat.map.dispose();
          if (mat.alphaMap) mat.alphaMap.dispose();
          mat.dispose();
        }
      }
    });
    while (group.children.length > 0) {
      group.remove(group.children[group.children.length - 1]);
    }
  }

  setData({ vehicle, simResult, obstacles, interferenceReport, cadBackgroundEntities, waypoints }) {
    this.vehicle = vehicle;
    this.simResult = simResult;
    this.obstacles = obstacles || [];
    this.cadBackgroundEntities = cadBackgroundEntities || this.cadBackgroundEntities || [];
    this.interferenceReport = interferenceReport || null;
    if (Array.isArray(waypoints)) {
      this.waypoints = waypoints;
    }

    if (!this.available) return;

    this._rebuildCadBackground();
    this._rebuildObstacles();

    if (!this.simResult || !this.simResult.states || !this.simResult.states.length) {
      this._clearGroup(this.envelopeGroup);
      this._clearGroup(this.marginGroup);
      this._clearGroup(this.refTracesGroup);
      this._clearGroup(this.wheelTracesGroup);
      this._clearGroup(this.dimsGroup);
      this._clearGroup(this.vehicleGroup);
      this.updateLayerVisibility();
      this.markDirty(4);
      return;
    }

    this._rebuildEnvelopeAndTraces();
    this._rebuildDimensions();
    this._rebuildVehicleMeshes();
    this.updateLayerVisibility();
    this.setFrameIndex(this.currentStateIndex);
    this.markDirty(6);
  }

  _rebuildCadBackground() {
    this._clearGroup(this.cadBackgroundGroup);
    if (!this.cadBackgroundEntities || this.cadBackgroundEntities.length === 0) return;
    const THREE = window.THREE;
    for (const ent of this.cadBackgroundEntities) {
      if (!ent.vertices || ent.vertices.length < 2) continue;
      const layerName = String(ent.layer || "").toUpperCase();
      const isBuilding =
        layerName.includes("EDIFIC") ||
        layerName.includes("MURO") ||
        layerName.includes("NAVE") ||
        layerName.includes("OBSTAC") ||
        layerName.includes("BUILDING") ||
        layerName.includes("COLUM");
      if (ent.closed && isBuilding && ent.vertices.length >= 3) {
        // Extrusión volumétrica estándar de construcciones del plano CAD
        this._addExtrudedPolygon3D(this.cadBackgroundGroup, ent.vertices, 4.5, new THREE.Color(0x64748b), 0.75);
      } else if (ent.closed) {
        this._addPolyline3D(this.cadBackgroundGroup, [...ent.vertices, ent.vertices[0]], 0x64748b, 0.015, false);
      } else {
        this._addPolyline3D(this.cadBackgroundGroup, ent.vertices, 0x475569, 0.015, false);
      }
    }
  }

  updateObstaclesAndInterferences(obstacles, interferenceReport) {
    this.obstacles = obstacles || [];
    this.interferenceReport = interferenceReport || null;
    if (!this.available || !this.simResult) return;
    this._rebuildObstacles();
    this._rebuildDimensions();
    this.markDirty(2);
  }

  updateLayerVisibility() {
    if (!this.available) return;
    this.gridHelper.visible = Boolean(this.layers.grid);
    if (this.cadBackgroundGroup) {
      this.cadBackgroundGroup.visible = Boolean(this.layers.cadBackground);
    }
    this.envelopeGroup.visible = Boolean(this.layers.envelope);
    this.marginGroup.visible = Boolean(this.layers.margin);
    this.refTracesGroup.visible = Boolean(this.layers.refTraces);
    this.wheelTracesGroup.visible = Boolean(this.layers.wheelTraces);
    this.obstaclesGroup.visible = Boolean(this.layers.obstacles);
    this.dimsGroup.visible = Boolean(this.layers.dimensions);
    this.markDirty(2);
  }

  setFrameIndex(stateIdx) {
    if (!this.available || !this.simResult || !this.simResult.states.length) return;
    this.currentStateIndex = Math.max(0, Math.min(this.simResult.states.length - 1, Math.floor(stateIdx)));
    const s = this.simResult.states[this.currentStateIndex];
    if (!s || !this.tractorMeshGroup) return;

    this.tractorMeshGroup.position.set(s.x, 0, -s.y);
    this.tractorMeshGroup.rotation.y = s.heading;

    if (this.frontWheelLeft && this.frontWheelRight) {
      this.frontWheelLeft.rotation.y = s.steerAngleRad || 0;
      this.frontWheelRight.rotation.y = s.steerAngleRad || 0;
    }

    if (this.trailerMeshGroup && s.tx !== null) {
      this.trailerMeshGroup.position.set(s.tx, 0, -s.ty);
      this.trailerMeshGroup.rotation.y = s.theading;
    }
    this.markDirty(2);
  }

  _addPolyline3D(group, pts2D, colorHex, elevation = 0.03, dashed = false) {
    if (!pts2D || pts2D.length < 2) return;
    const THREE = window.THREE;
    const pts = pts2D.map(([x, y]) => this.to3D(x, y, elevation));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: colorHex, dashSize: 0.7, gapSize: 0.35 })
      : new THREE.LineBasicMaterial({ color: colorHex });
    const line = new THREE.Line(geom, mat);
    if (dashed) line.computeLineDistances();
    group.add(line);
  }

  _buildPolygonMesh3D(group, outerPts, holes, colorHex, opacity, elevation) {
    const THREE = window.THREE;
    const earcutFn = typeof earcut !== "undefined" ? earcut : (window.earcut || (typeof globalThis !== "undefined" ? globalThis.earcut : null));
    if (!THREE || !earcutFn || !outerPts || outerPts.length < 3) return;

    const cleanOuter = (outerPts.length > 1 &&
      Math.hypot(outerPts[0][0] - outerPts[outerPts.length - 1][0], outerPts[0][1] - outerPts[outerPts.length - 1][1]) < 1e-4)
      ? outerPts.slice(0, -1)
      : outerPts;

    const flatCoords = [];
    for (let i = 0; i < cleanOuter.length; i++) {
      flatCoords.push(cleanOuter[i][0], cleanOuter[i][1]);
    }

    const holeIndices = [];
    if (holes && holes.length > 0) {
      for (const hole of holes) {
        if (!hole || hole.length < 3) continue;
        const cleanHole = (hole.length > 1 &&
          Math.hypot(hole[0][0] - hole[hole.length - 1][0], hole[0][1] - hole[hole.length - 1][1]) < 1e-4)
          ? hole.slice(0, -1)
          : hole;
        holeIndices.push(flatCoords.length / 2);
        for (let j = 0; j < cleanHole.length; j++) {
          flatCoords.push(cleanHole[j][0], cleanHole[j][1]);
        }
      }
    }

    const indices = earcutFn(flatCoords, holeIndices.length > 0 ? holeIndices : null, 2);
    if (!indices || indices.length === 0) return;

    const positions = [];
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const wx = flatCoords[idx * 2];
      const wy = flatCoords[idx * 2 + 1];
      positions.push(wx, elevation, -wy);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    group.add(new THREE.Mesh(geom, mat));
  }

  _addExtrudedPolygon3D(group, verts, height = 3.5, color = 0x64748b, opacity = 0.82) {
    const THREE = window.THREE;
    const earcutFn = typeof earcut !== "undefined" ? earcut : (window.earcut || (typeof globalThis !== "undefined" ? globalThis.earcut : null));
    if (!THREE || !verts || verts.length < 3) return;

    const clean = (verts.length > 1 && Math.hypot(verts[0][0] - verts[verts.length - 1][0], verts[0][1] - verts[verts.length - 1][1]) < 1e-4)
      ? verts.slice(0, -1)
      : verts;
    const n = clean.length;
    if (n < 3) return;

    const positions = [];
    const H = Math.max(0.1, Number(height || 3.5));

    // 1. Paredes verticales laterales (quads con dos triángulos cada uno)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = clean[i][0];
      const z1 = -clean[i][1];
      const x2 = clean[j][0];
      const z2 = -clean[j][1];

      // Triángulo 1
      positions.push(x1, 0, z1);
      positions.push(x2, 0, z2);
      positions.push(x2, H, z2);

      // Triángulo 2
      positions.push(x1, 0, z1);
      positions.push(x2, H, z2);
      positions.push(x1, H, z1);
    }

    // 2. Cubierta / Techo superior triangulado con earcut
    if (earcutFn) {
      const flatCoords = [];
      for (let i = 0; i < n; i++) {
        flatCoords.push(clean[i][0], clean[i][1]);
      }
      const indices = earcutFn(flatCoords, null, 2);
      if (indices && indices.length > 0) {
        for (let i = 0; i < indices.length; i += 3) {
          const i1 = indices[i];
          const i2 = indices[i + 1];
          const i3 = indices[i + 2];
          // Normal orientada hacia +Y
          positions.push(clean[i1][0], H, -clean[i1][1]);
          positions.push(clean[i3][0], H, -clean[i3][1]);
          positions.push(clean[i2][0], H, -clean[i2][1]);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    const threeColor = color instanceof THREE.Color ? color : new THREE.Color(color);
    const mat = new THREE.MeshStandardMaterial({
      color: threeColor,
      roughness: 0.65,
      metalness: 0.1,
      transparent: opacity < 1.0,
      opacity: opacity,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Delineación superior para acabado arquitectónico CAD limpio
    this._addPolyline3D(group, [...clean, clean[0]], threeColor.clone().offsetHSL(0, 0, -0.2).getHex(), H, false);
  }

  _buildCorridorMesh(group, leftPts, rightPts, colorHex, opacity, elevation) {
    const THREE = window.THREE;
    const n = Math.min(leftPts.length, rightPts.length);
    if (n < 2) return;

    const vertices = [];
    for (let i = 0; i < n - 1; i++) {
      const l0 = leftPts[i];
      const r0 = rightPts[i];
      const l1 = leftPts[i + 1];
      const r1 = rightPts[i + 1];

      // Dos triángulos entre [l0, r0] y [l1, r1]
      vertices.push(
        l0[0], elevation, -l0[1],
        r0[0], elevation, -r0[1],
        l1[0], elevation, -l1[1],
        r0[0], elevation, -r0[1],
        r1[0], elevation, -r1[1],
        l1[0], elevation, -l1[1]
      );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    group.add(new THREE.Mesh(geom, mat));
  }

  _rebuildEnvelopeAndTraces() {
    this._clearGroup(this.envelopeGroup);
    this._clearGroup(this.marginGroup);
    this._clearGroup(this.refTracesGroup);
    this._clearGroup(this.wheelTracesGroup);

    // Envolvente principal completa 3D (GEOM-02)
    if (this.simResult.envelope && this.simResult.envelope.length >= 3) {
      this._buildPolygonMesh3D(
        this.envelopeGroup,
        this.simResult.envelope,
        this.simResult.envelopeHoles,
        0xef4444,
        0.26,
        0.015
      );
      this._addPolyline3D(this.envelopeGroup, this.simResult.envelope, 0xdc2626, 0.025, false);
      if (this.simResult.envelopeHoles && this.simResult.envelopeHoles.length > 0) {
        for (const hole of this.simResult.envelopeHoles) {
          this._addPolyline3D(this.envelopeGroup, hole, 0xdc2626, 0.02, false);
        }
      }
    } else if (this.simResult.leftBoundary && this.simResult.rightBoundary) {
      this._buildCorridorMesh(
        this.envelopeGroup,
        this.simResult.leftBoundary,
        this.simResult.rightBoundary,
        0xef4444,
        0.26,
        0.015
      );
      this._addPolyline3D(this.envelopeGroup, this.simResult.leftBoundary, 0xdc2626, 0.025, false);
      this._addPolyline3D(this.envelopeGroup, this.simResult.rightBoundary, 0xdc2626, 0.025, false);
    }

    // Envolvente de margen de seguridad 3D (GEOM-02)
    if (this.simResult.marginEnvelope && this.simResult.marginEnvelope.length >= 3) {
      this._buildPolygonMesh3D(
        this.marginGroup,
        this.simResult.marginEnvelope,
        this.simResult.marginEnvelopeHoles,
        0xeab308,
        0.12,
        0.01
      );
      this._addPolyline3D(this.marginGroup, this.simResult.marginEnvelope, 0xeab308, 0.02, true);
      if (this.simResult.marginEnvelopeHoles && this.simResult.marginEnvelopeHoles.length > 0) {
        for (const hole of this.simResult.marginEnvelopeHoles) {
          this._addPolyline3D(this.marginGroup, hole, 0xeab308, 0.018, true);
        }
      }
    } else if (this.simResult.marginLeftBoundary && this.simResult.marginRightBoundary) {
      this._buildCorridorMesh(
        this.marginGroup,
        this.simResult.marginLeftBoundary,
        this.simResult.marginRightBoundary,
        0xeab308,
        0.12,
        0.01
      );
      this._addPolyline3D(this.marginGroup, this.simResult.marginLeftBoundary, 0xeab308, 0.02, true);
      this._addPolyline3D(this.marginGroup, this.simResult.marginRightBoundary, 0xeab308, 0.02, true);
    }

    // Trazas de referencia
    const t = this.simResult.traces;
    if (t) {
      this._addPolyline3D(this.refTracesGroup, t.tractor_front, 0x38bdf8, 0.03, false);
      this._addPolyline3D(this.refTracesGroup, t.tractor_rear, 0x22c55e, 0.035, true);
      this._addPolyline3D(this.refTracesGroup, t.hitch, 0xeab308, 0.04, false);
      this._addPolyline3D(this.refTracesGroup, t.trailer_rear, 0xa855f7, 0.045, false);

      if (t.wheels) {
        this._addPolyline3D(this.wheelTracesGroup, t.wheels.tractor_front_left, 0x94a3b8, 0.022, true);
        this._addPolyline3D(this.wheelTracesGroup, t.wheels.tractor_front_right, 0x94a3b8, 0.022, true);
        this._addPolyline3D(this.wheelTracesGroup, t.wheels.trailer_tridem_left, 0xc084fc, 0.024, true);
        this._addPolyline3D(this.wheelTracesGroup, t.wheels.trailer_tridem_right, 0xc084fc, 0.024, true);
      }
    }
  }

  _rebuildObstacles() {
    this._clearGroup(this.obstaclesGroup);
    const THREE = window.THREE;

    for (const obs of this.obstacles || []) {
      if (obs.enabled === false) continue;
      const verts = getObstacleVertices(obs);
      const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge";
      const height = Number(obs.heightM || (obs.type === "building" ? 6.0 : 0.25));
      const color = new THREE.Color(obs.color || "#ef4444");

      if (isOpen) {
        this._addPolyline3D(this.obstaclesGroup, verts, color.getHex(), 0.12, false);
      } else if (obs.shape === "circle") {
        const geom = new THREE.CylinderGeometry(obs.radius, obs.radius, height, 32);
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.7,
          transparent: true,
          opacity: 0.75
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(obs.x, height / 2, -obs.y);
        this.obstaclesGroup.add(mesh);
      } else if (obs.shape === "rect" || !obs.vertices) {
        const geom = new THREE.BoxGeometry(obs.length || 4, height, obs.width || 2);
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.65,
          transparent: true,
          opacity: obs.type === "restricted_zone" ? 0.38 : 0.78
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(obs.x || 0, height / 2, -(obs.y || 0));
        mesh.rotation.y = ((obs.headingDeg || 0) * Math.PI) / 180;
        this.obstaclesGroup.add(mesh);
      } else {
        // Polígono cerrado (construcción / edificio / nave / obstáculo): extrusión volumétrica estándar
        const polyHeight = Number(
          obs.heightM ||
          (obs.type === "building" ||
           String(obs.name || "").toLowerCase().includes("edific") ||
           String(obs.name || "").toLowerCase().includes("nave") ||
           String(obs.name || "").toLowerCase().includes("muro") ||
           String(obs.name || "").toLowerCase().includes("almacen")
            ? 4.5
            : (obs.type === "restricted_zone" ? 0.15 : 3.5))
        );
        const opacity = obs.type === "restricted_zone" ? 0.38 : 0.82;
        this._addExtrudedPolygon3D(this.obstaclesGroup, verts, polyHeight, color, opacity);
      }
    }
  }

  _makeTextSprite(message, color = "#fbbf24", bgColor = "rgba(15, 23, 42, 0.88)") {
    const THREE = window.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(10, 15, 492, 98, 20);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.font = "bold 40px sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.6, 1.15, 1);
    return sprite;
  }

  _rebuildDimensions() {
    this._clearGroup(this.dimsGroup);
    const THREE = window.THREE;

    for (const dim of this.simResult.dimensions || []) {
      const p1 = this.to3D(dim.p1[0], dim.p1[1], 0.07);
      const p2 = this.to3D(dim.p2[0], dim.p2[1], 0.07);

      const lineGeom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
      this.dimsGroup.add(new THREE.Line(lineGeom, lineMat));

      const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      midPoint.y = 1.65;
      const sprite = this._makeTextSprite(`${dim.title}: ${dim.val}`);
      sprite.position.copy(midPoint);
      this.dimsGroup.add(sprite);
    }
  }

  _rebuildVehicleMeshes() {
    this._clearGroup(this.vehicleGroup);
    const THREE = window.THREE;
    const tv = this.vehicle.tractor;
    const tr = this.vehicle.trailer;

    const cabColor = this.vehicle.colorCab || 0x0284c7;
    const stripeColor = this.vehicle.colorStripe || 0x0284c7;

    // 1. Cabeza tractora
    this.tractorMeshGroup = new THREE.Group();

    const chassisLen = tv.wheelbase + tv.frontOverhang + tv.rearOverhang;
    const chassisCenterRelX = (tv.wheelbase + tv.frontOverhang - tv.rearOverhang) / 2;
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(chassisLen, 0.35, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    );
    chassis.position.set(chassisCenterRelX, 0.55, 0);
    chassis.castShadow = true;
    this.tractorMeshGroup.add(chassis);

    const cabLen = Math.min(2.35, tv.frontOverhang + 1.0);
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(cabLen, 2.7, tv.width - 0.08),
      new THREE.MeshStandardMaterial({ color: cabColor, roughness: 0.3, metalness: 0.2 })
    );
    cab.position.set(tv.wheelbase + tv.frontOverhang - cabLen / 2 - 0.05, 2.1, 0);
    cab.castShadow = true;
    this.tractorMeshGroup.add(cab);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 1.1, tv.width - 0.25),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 })
    );
    windshield.position.set(tv.wheelbase + tv.frontOverhang - 0.06, 2.6, 0);
    this.tractorMeshGroup.add(windshield);

    const fifthWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.12, 18),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })
    );
    fifthWheel.position.set(tv.hitchOffset, 0.86, 0);
    this.tractorMeshGroup.add(fifthWheel);

    const wheelGeom = new THREE.CylinderGeometry(0.52, 0.52, 0.34, 16);
    wheelGeom.rotateX(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });

    // Ruedas delanteras con pivote de dirección
    const halfTrackF = (tv.trackWidthFront || tv.width - 0.35) / 2;
    this.frontWheelLeft = new THREE.Mesh(wheelGeom, tireMat);
    this.frontWheelLeft.position.set(tv.wheelbase, 0.52, -halfTrackF);
    this.frontWheelRight = new THREE.Mesh(wheelGeom, tireMat);
    this.frontWheelRight.position.set(tv.wheelbase, 0.52, +halfTrackF);
    this.tractorMeshGroup.add(this.frontWheelLeft);
    this.tractorMeshGroup.add(this.frontWheelRight);

    // Ruedas traseras motrices
    [-1.12, -0.92, 0.92, 1.12].forEach((zPos) => {
      const w = new THREE.Mesh(wheelGeom, tireMat);
      w.position.set(0, 0.52, zPos);
      this.tractorMeshGroup.add(w);
    });

    this.vehicleGroup.add(this.tractorMeshGroup);

    // 2. Semirremolque
    if (tr) {
      this.trailerMeshGroup = new THREE.Group();
      const trailerTotalLen = tr.wheelbase + tr.frontOverhang + tr.rearOverhang;
      const trailerCenterRelX = (tr.wheelbase + tr.frontOverhang - tr.rearOverhang) / 2;

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(trailerTotalLen, 2.75, tr.width),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35 })
      );
      box.position.set(trailerCenterRelX, 2.45, 0);
      box.castShadow = true;
      this.trailerMeshGroup.add(box);

      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(trailerTotalLen - 0.15, 0.42, tr.width + 0.02),
        new THREE.MeshStandardMaterial({ color: stripeColor })
      );
      stripe.position.set(trailerCenterRelX, 2.25, 0);
      this.trailerMeshGroup.add(stripe);

      if (tr.isReefer) {
        const reefer = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 1.35, 1.75),
          new THREE.MeshStandardMaterial({ color: 0x334155 })
        );
        reefer.position.set(tr.wheelbase + tr.frontOverhang + 0.22, 2.8, 0);
        this.trailerMeshGroup.add(reefer);
      }

      const spacing = tr.axleSpacing || 1.31;
      const axleOffsets = tr.axleCount === 3 ? [-spacing, 0, spacing] : [0];
      axleOffsets.forEach((dx) => {
        [-1.12, 1.12].forEach((zPos) => {
          const tw = new THREE.Mesh(wheelGeom, tireMat);
          tw.position.set(dx, 0.52, zPos);
          this.trailerMeshGroup.add(tw);
        });
      });

      this.vehicleGroup.add(this.trailerMeshGroup);
    }
  }
}

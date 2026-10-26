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

export class Viewer3D {
  constructor(container) {
    this.container = container;
    this.available = typeof window !== "undefined" && Boolean(window.THREE);

    this.layers = {
      grid: true,
      envelope: true,
      margin: true,
      refTraces: true,
      wheelTraces: true,
      obstacles: true,
      dimensions: true
    };

    this.currentStateIndex = 0;
    this.simResult = null;
    this.vehicle = null;
    this.obstacles = [];
    this.interferenceReport = null;

    if (!this.available) {
      this._renderFallbackNotice();
      return;
    }

    this._initScene();
    window.addEventListener("resize", () => this.resize());
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
    this.envelopeGroup = new THREE.Group();
    this.marginGroup = new THREE.Group();
    this.refTracesGroup = new THREE.Group();
    this.wheelTracesGroup = new THREE.Group();
    this.obstaclesGroup = new THREE.Group();
    this.dimsGroup = new THREE.Group();
    this.vehicleGroup = new THREE.Group();

    this.scene.add(this.marginGroup);
    this.scene.add(this.envelopeGroup);
    this.scene.add(this.wheelTracesGroup);
    this.scene.add(this.refTracesGroup);
    this.scene.add(this.obstaclesGroup);
    this.scene.add(this.dimsGroup);
    this.scene.add(this.vehicleGroup);

    const animateLoop = () => {
      requestAnimationFrame(animateLoop);
      if (this.controls) this.controls.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    animateLoop();
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
  }

  fitToScene() {
    if (!this.available || !this.controls || !this.simResult || !this.simResult.states.length) return;
    let minX = +Infinity;
    let minY = +Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of this.simResult.states) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }
    const cx = 0.5 * (minX + maxX);
    const cy = 0.5 * (minY + maxY);
    this.controls.target.set(cx, 0, -cy);
    this.camera.position.set(cx + 8, 36, -cy + 36);
    this.controls.update();
  }

  _clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const child = group.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
  }

  setData({ vehicle, simResult, obstacles, interferenceReport }) {
    this.vehicle = vehicle;
    this.simResult = simResult;
    this.obstacles = obstacles || [];
    this.interferenceReport = interferenceReport || null;

    if (!this.available || !this.simResult) return;

    this._rebuildEnvelopeAndTraces();
    this._rebuildObstacles();
    this._rebuildDimensions();
    this._rebuildVehicleMeshes();
    this.updateLayerVisibility();
    this.setFrameIndex(this.currentStateIndex);
  }

  updateLayerVisibility() {
    if (!this.available) return;
    this.gridHelper.visible = Boolean(this.layers.grid);
    this.envelopeGroup.visible = Boolean(this.layers.envelope);
    this.marginGroup.visible = Boolean(this.layers.margin);
    this.refTracesGroup.visible = Boolean(this.layers.refTraces);
    this.wheelTracesGroup.visible = Boolean(this.layers.wheelTraces);
    this.obstaclesGroup.visible = Boolean(this.layers.obstacles);
    this.dimsGroup.visible = Boolean(this.layers.dimensions);
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

    // Envolvente principal
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

    // Envolvente de margen de seguridad
    if (this.simResult.marginLeftBoundary && this.simResult.marginRightBoundary) {
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
        this._addPolyline3D(this.obstaclesGroup, [...verts, verts[0]], color.getHex(), 0.15, false);
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

    // Marcadores 3D de colisión o distancia mínima
    if (this.interferenceReport && this.interferenceReport.obstacleReports) {
      for (const rep of this.interferenceReport.obstacleReports) {
        if (!rep.pointOnVehicle || !rep.pointOnObstacle) continue;
        const pV = this.to3D(rep.pointOnVehicle[0], rep.pointOnVehicle[1], 0.5);
        const pO = this.to3D(rep.pointOnObstacle[0], rep.pointOnObstacle[1], 0.5);

        if (rep.status === "COLLISION" || rep.status === "RESTRICTED_INVASION") {
          const sphereGeom = new THREE.SphereGeometry(0.55, 16, 16);
          const sphereMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 });
          const m = new THREE.Mesh(sphereGeom, sphereMat);
          m.position.copy(pV);
          this.dimsGroup.add(m);
        } else {
          const lineGeom = new THREE.BufferGeometry().setFromPoints([pV, pO]);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
          this.dimsGroup.add(new THREE.Line(lineGeom, lineMat));
        }
      }
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

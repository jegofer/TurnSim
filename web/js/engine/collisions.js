/**
 * Sistema de definición de entornos/obstáculos y comprobación geométrica de interferencias
 * Cumple los apartados 8, 11.1, 12 y Fase 6 de PROMT_ORIGINAL.md.
 *
 * Distingue estrictamente los 4 estados de interferencia prescritos en el apartado 8:
 * 1. COLLISION: Colisión geométrica directa entre el contorno del vehículo y un obstáculo físico.
 * 2. RESTRICTED_INVASION: Invasión de una zona prohibida o restringida para la circulación.
 * 3. MARGIN_VIOLATION: Incumplimiento del margen de seguridad configurado (0 < d_min < safetyMargin).
 * 4. NOT_EVALUABLE: Situación no evaluable de forma concluyente por superar límites cinemáticos
 *    (dirección o tijera/jackknifing) o por requerir comprobación tridimensional de gálibo no disponible.
 * 5. CLEAR: Holgura geométrica verificada (d_min >= safetyMargin).
 */

/**
 * Distancia mínima entre dos segmentos 2D AB y CD, devolviendo también los puntos más cercanos.
 */
export function segmentToSegmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  // Comprobar primero si se cortan
  const ccw = (p1x, p1y, p2x, p2y, p3x, p3y) =>
    (p2x - p1x) * (p3y - p1y) - (p2y - p1y) * (p3x - p1x);

  const d1 = ccw(ax, ay, bx, by, cx, cy);
  const d2 = ccw(ax, ay, bx, by, dx, dy);
  const d3 = ccw(cx, cy, dx, dy, ax, ay);
  const d4 = ccw(cx, cy, dx, dy, bx, by);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    const t = Math.abs(denom) > 1e-12
      ? ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom
      : 0.5;
    const ix = ax + t * (bx - ax);
    const iy = ay + t * (by - ay);
    return {
      distance: 0.0,
      intersects: true,
      pointA: [ix, iy],
      pointB: [ix, iy]
    };
  }

  // Proyección de un punto P sobre un segmento UV
  const pointToSeg = (px, py, ux, uy, vx, vy) => {
    const l2 = (vx - ux) ** 2 + (vy - uy) ** 2;
    if (l2 < 1e-12) {
      return { dist: Math.hypot(px - ux, py - uy), proj: [ux, uy] };
    }
    const t = Math.max(0, Math.min(1, ((px - ux) * (vx - ux) + (py - uy) * (vy - uy)) / l2));
    const qx = ux + t * (vx - ux);
    const qy = uy + t * (vy - uy);
    return { dist: Math.hypot(px - qx, py - qy), proj: [qx, qy] };
  };

  const c1 = pointToSeg(ax, ay, cx, cy, dx, dy);
  let best = { distance: c1.dist, intersects: false, pointA: [ax, ay], pointB: c1.proj };

  const c2 = pointToSeg(bx, by, cx, cy, dx, dy);
  if (c2.dist < best.distance) {
    best = { distance: c2.dist, intersects: false, pointA: [bx, by], pointB: c2.proj };
  }

  const c3 = pointToSeg(cx, cy, ax, ay, bx, by);
  if (c3.dist < best.distance) {
    best = { distance: c3.dist, intersects: false, pointA: c3.proj, pointB: [cx, cy] };
  }

  const c4 = pointToSeg(dx, dy, ax, ay, bx, by);
  if (c4.dist < best.distance) {
    best = { distance: c4.dist, intersects: false, pointA: c4.proj, pointB: [dx, dy] };
  }

  return best;
}

/**
 * Comprueba si un punto (px, py) está dentro de un polígono cerrado (algoritmo ray-casting).
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calcula la distancia mínima o intersección entre dos polígonos cerrados polyA y polyB.
 * Si `isOpenPolylineB` es true, trata polyB como una polilínea abierta (ej. borde de calzada/bordillo).
 */
export function polygonToGeometryDistance(polyA, polyB, isOpenPolylineB = false) {
  if (!polyA || polyA.length < 3 || !polyB || polyB.length < 2) {
    return { distance: Infinity, intersects: false, pointA: [0, 0], pointB: [0, 0] };
  }

  // Comprobar inclusión de vértices si B es un polígono cerrado
  if (!isOpenPolylineB && polyB.length >= 3) {
    for (const [vx, vy] of polyA) {
      if (pointInPolygon(vx, vy, polyB)) {
        return { distance: 0.0, intersects: true, pointA: [vx, vy], pointB: [vx, vy] };
      }
    }
    for (const [vx, vy] of polyB) {
      if (pointInPolygon(vx, vy, polyA)) {
        return { distance: 0.0, intersects: true, pointA: [vx, vy], pointB: [vx, vy] };
      }
    }
  }

  let best = { distance: Infinity, intersects: false, pointA: polyA[0], pointB: polyB[0] };
  const nA = polyA.length;
  const nB = isOpenPolylineB ? polyB.length - 1 : polyB.length;

  for (let i = 0; i < nA; i++) {
    const [a1x, a1y] = polyA[i];
    const [a2x, a2y] = polyA[(i + 1) % nA];

    for (let j = 0; j < nB; j++) {
      const [b1x, b1y] = polyB[j];
      const [b2x, b2y] = polyB[(j + 1) % polyB.length];

      const res = segmentToSegmentDistance(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y);
      if (res.intersects) {
        return res;
      }
      if (res.distance < best.distance) {
        best = res;
      }
    }
  }

  return best;
}

/**
 * Convierte cualquier definición de obstáculo (rectángulo, círculo/isleta, polígono o polilínea)
 * en una lista de vértices 2D para su evaluación geométrica y representación gráfica.
 */
export function getObstacleVertices(obstacle) {
  if (obstacle.vertices && Array.isArray(obstacle.vertices) && obstacle.vertices.length >= 2) {
    return obstacle.vertices;
  }

  if (obstacle.shape === "circle") {
    const cx = Number(obstacle.x || 0);
    const cy = Number(obstacle.y || 0);
    const r = Math.max(0.2, Number(obstacle.radius || 3.0));
    const segments = 36;
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const ang = (2 * Math.PI * i) / segments;
      pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    return pts;
  }

  if (obstacle.shape === "arc_curb") {
    const cx = Number(obstacle.x || 0);
    const cy = Number(obstacle.y || 0);
    const r = Math.max(0.5, Number(obstacle.radius || 10.0));
    const startRad = ((Number(obstacle.startAngleDeg || 0)) * Math.PI) / 180;
    const endRad = ((Number(obstacle.endAngleDeg || 360)) * Math.PI) / 180;
    const segments = 48;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const ang = startRad + ((endRad - startRad) * i) / segments;
      pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    return pts;
  }

  // Por defecto: rectángulo parametrizado por centro (x, y), dimensiones (length, width) y rotación (headingDeg)
  const cx = Number(obstacle.x || 0);
  const cy = Number(obstacle.y || 0);
  const halfL = Math.max(0.1, Number(obstacle.length || 4.0)) / 2;
  const halfW = Math.max(0.1, Number(obstacle.width || 2.0)) / 2;
  const headingRad = ((Number(obstacle.headingDeg || 0)) * Math.PI) / 180;
  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);

  return [
    [-halfL, -halfW],
    [-halfL, +halfW],
    [+halfL, +halfW],
    [+halfL, -halfW]
  ].map(([lx, ly]) => [cx + lx * cosH - ly * sinH, cy + lx * sinH + ly * cosH]);
}

/**
 * Evalúa las interferencias entre todos los estados de la simulación y la lista de obstáculos del entorno.
 *
 * @param {Array} states Lista de estados generados por simulateManeuver
 * @param {Array} obstacles Lista de obstáculos y zonas definidas
 * @param {object} options { safetyMargin: 0.30, simulationSummary: {} }
 */
export function evaluateObstacleInterferences(statesOrSimResult, obstacles, optionsOrMargin = {}) {
  const states = Array.isArray(statesOrSimResult)
    ? statesOrSimResult
    : statesOrSimResult?.states || [];
  const options =
    typeof optionsOrMargin === "number"
      ? { safetyMargin: optionsOrMargin }
      : optionsOrMargin || {};
  const safetyMargin = Math.max(
    0,
    Number(options.safetyMargin ?? options.safetyMarginM ?? 0.30)
  );
  const simSummary =
    options.simulationSummary ||
    (!Array.isArray(statesOrSimResult) && statesOrSimResult?.summary) ||
    {};

  const kinematicInvalid =
    Boolean(simSummary.anySteerExceeded) || Boolean(simSummary.anyArticulationExceeded);

  const obstacleReports = [];
  let globalStatus = kinematicInvalid ? "NOT_EVALUABLE" : "CLEAR";
  let globalMinClearanceM = Infinity;
  let criticalInteraction = null;

  const statusPriority = {
    COLLISION: 5,
    RESTRICTED_INVASION: 4,
    NOT_EVALUABLE: 3,
    MARGIN_VIOLATION: 2,
    CLEAR: 1
  };

  for (const obs of obstacles || []) {
    if (obs.enabled === false) continue;

    const verts = getObstacleVertices(obs);
    const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge";

    // Si el obstáculo exige comprobar gálibo vertical aéreo y no se ha definido la altura del vehículo
    if (obs.requiresVerticalClearanceCheck && !obs.vehicleHeightVerified) {
      const report = {
        obstacleId: obs.id,
        name: obs.name,
        type: obs.type,
        status: "NOT_EVALUABLE",
        statusLabel: "No evaluable (Requiere verificar gálibo vertical 3D)",
        minDistanceM: null,
        stepIndex: 0,
        distAlongPathM: 0,
        pointOnVehicle: null,
        pointOnObstacle: null
      };
      obstacleReports.push(report);
      if (statusPriority.NOT_EVALUABLE > statusPriority[globalStatus]) {
        globalStatus = "NOT_EVALUABLE";
      }
      continue;
    }

    let minDistance = Infinity;
    let bestStepIndex = 0;
    let bestDistAlongPath = 0;
    let bestPointVehicle = null;
    let bestPointObstacle = null;
    let bestPart = "tractor";
    let intersected = false;

    for (let i = 0; i < states.length; i++) {
      const s = states[i];

      // Evaluar tractora
      const resTractor = polygonToGeometryDistance(s.tractorPolygon, verts, isOpen);
      if (resTractor.distance < minDistance) {
        minDistance = resTractor.distance;
        intersected = resTractor.intersects;
        bestStepIndex = i;
        bestDistAlongPath = s.dist;
        bestPointVehicle = resTractor.pointA;
        bestPointObstacle = resTractor.pointB;
        bestPart = "Cabeza tractora";
      }

      // Evaluar semirremolque
      if (s.trailerPolygon) {
        const resTrailer = polygonToGeometryDistance(s.trailerPolygon, verts, isOpen);
        if (resTrailer.distance < minDistance) {
          minDistance = resTrailer.distance;
          intersected = resTrailer.intersects;
          bestStepIndex = i;
          bestDistAlongPath = s.dist;
          bestPointVehicle = resTrailer.pointA;
          bestPointObstacle = resTrailer.pointB;
          bestPart = "Semirremolque";
        }
      }

      if (intersected && minDistance === 0) {
        break;
      }
    }

    let status = "CLEAR";
    let statusLabel = "Holgura verificada";

    if (intersected || minDistance <= 1e-4) {
      if (obs.type === "restricted_zone") {
        status = "RESTRICTED_INVASION";
        statusLabel = "Invasión de zona prohibida / restringida";
      } else {
        status = "COLLISION";
        statusLabel = `Colisión geométrica (${bestPart})`;
      }
    } else if (minDistance < safetyMargin) {
      status = "MARGIN_VIOLATION";
      statusLabel = `Incumple margen de seguridad (${minDistance.toFixed(2)} m < ${safetyMargin.toFixed(2)} m)`;
    } else if (kinematicInvalid) {
      status = "NOT_EVALUABLE";
      statusLabel = "No concluyente (maniobra excede límite de dirección o articulación)";
    }

    const report = {
      obstacleId: obs.id,
      name: obs.name,
      type: obs.type,
      status,
      statusLabel,
      part: bestPart,
      minDistanceM: Number(minDistance.toFixed(3)),
      stepIndex: bestStepIndex,
      distAlongPathM: Number(bestDistAlongPath.toFixed(2)),
      pointOnVehicle: bestPointVehicle,
      pointOnObstacle: bestPointObstacle,
      vertices: verts,
      isOpen
    };

    obstacleReports.push(report);

    if (statusPriority[status] > statusPriority[globalStatus]) {
      globalStatus = status;
    }
    if (minDistance < globalMinClearanceM) {
      globalMinClearanceM = minDistance;
      criticalInteraction = report;
    }
  }

  const globalStatusLabels = {
    COLLISION: "COLISIÓN GEOMÉTRICA DETECTADA — Maniobra inviable",
    RESTRICTED_INVASION: "INVASIÓN DE ZONA PROHIBIDA / RESTRINGIDA",
    NOT_EVALUABLE: "MANIOBRA NO EVALUABLE / LÍMITE CINEMÁTICO EXCEDIDO",
    MARGIN_VIOLATION: `MARGEN DE SEGURIDAD INSUFICIENTE (< ${safetyMargin.toFixed(2)} m)`,
    CLEAR: "VIABLE GEOMÉTRICAMENTE (Con margen de seguridad cumplido)"
  };

  return {
    globalStatus,
    globalStatusLabel: globalStatusLabels[globalStatus] || globalStatus,
    safetyMarginM: safetyMargin,
    kinematicInvalid,
    minClearanceM: Number.isFinite(globalMinClearanceM) ? Number(globalMinClearanceM.toFixed(3)) : null,
    criticalInteraction,
    obstacleReports
  };
}

/**
 * Catálogo de escenarios preconfigurados de ingeniería viaria y logística
 * (intersección industrial, rotonda, muelle de carga marcha atrás y corona normativa Directiva 96/53/CE).
 */
export const PRESET_SCENARIOS = {
  industrial_turn_90: {
    id: "industrial_turn_90",
    name: "Giro 90° en acceso industrial y esquina de nave",
    description: "Vial industrial de entrada con giro de 90° a izquierda bordeando esquina de nave de producción, paso peatonal protegido y bordillo exterior.",
    safetyMarginM: 0.30,
    maneuver: {
      startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [
        { type: "straight", length: 15.0, direction: 1 },
        { type: "arc", radius: 12.5, angle: 90.0, direction: 1 },
        { type: "straight", length: 15.0, direction: 1 }
      ]
    },
    obstacles: [
      {
        id: "obs_building_corner",
        name: "Esquina Nave Envasado / Interior curva",
        type: "building",
        shape: "rect",
        x: 8.5,
        y: 12.2,
        length: 8.0,
        width: 8.0,
        headingDeg: 0,
        heightM: 6.5,
        color: "#ef4444"
      },
      {
        id: "obs_outer_curb",
        name: "Bordillo exterior de calzada",
        type: "road_edge",
        shape: "polyline",
        vertices: [
          [-2.0, -3.5],
          [20.5, -3.5],
          [29.5, 2.5],
          [31.5, 11.5],
          [31.5, 31.0]
        ],
        heightM: 0.18,
        color: "#f59e0b"
      },
      {
        id: "obs_pedestrian_zone",
        name: "Pasillo peatonal segregado (Zona prohibida)",
        type: "restricted_zone",
        shape: "rect",
        x: 6.5,
        y: 3.4,
        length: 11.0,
        width: 1.2,
        headingDeg: 0,
        heightM: 0.05,
        color: "#eab308"
      }
    ]
  },

  roundabout_maneuver: {
    id: "roundabout_maneuver",
    name: "Giro en glorieta / rotonda industrial (R_ext = 18 m)",
    description: "Entrada, circulación anular y salida en glorieta industrial con isleta central e isleta deflectora.",
    safetyMarginM: 0.30,
    maneuver: {
      startPose: { x: 0, y: -11.5, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [
        { type: "straight", length: 6.0, direction: 1 },
        { type: "arc", radius: 14.0, angle: -25.0, direction: 1 },
        { type: "arc", radius: 11.5, angle: 140.0, direction: 1 },
        { type: "arc", radius: 14.0, angle: -25.0, direction: 1 },
        { type: "straight", length: 10.0, direction: 1 }
      ]
    },
    obstacles: [
      {
        id: "obs_roundabout_center",
        name: "Isleta central de glorieta (R = 6,00 m)",
        type: "roundabout_central",
        shape: "circle",
        x: 16.5,
        y: 0.5,
        radius: 6.0,
        heightM: 0.25,
        color: "#10b981"
      },
      {
        id: "obs_splitter_island",
        name: "Isleta deflectora de acceso",
        type: "island",
        shape: "rect",
        x: 3.5,
        y: -6.5,
        length: 5.0,
        width: 1.8,
        headingDeg: 0,
        heightM: 0.20,
        color: "#f59e0b"
      },
      {
        id: "obs_roundabout_outer",
        name: "Bordillo exterior de glorieta (R = 18,50 m)",
        type: "roundabout_outer",
        shape: "arc_curb",
        x: 16.5,
        y: 0.5,
        radius: 18.5,
        startAngleDeg: -65,
        endAngleDeg: 65,
        heightM: 0.18,
        color: "#38bdf8"
      }
    ]
  },

  loading_dock_reverse: {
    id: "loading_dock_reverse",
    name: "Maniobra marcha atrás y atraque en muelle de carga",
    description: "Posicionamiento en retroceso hacia muelle de carga frigorífico entre dos camiones estacionados en muelles contiguos.",
    safetyMarginM: 0.20,
    maneuver: {
      startPose: { x: 24.0, y: 6.8, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [
        { type: "straight", length: 2.5, direction: -1 },
        { type: "arc", radius: 26.0, angle: 20.0, direction: -1 },
        { type: "arc", radius: 26.0, angle: -20.0, direction: -1 },
        { type: "straight", length: 5.0, direction: -1 }
      ]
    },
    obstacles: [
      {
        id: "obs_dock_wall",
        name: "Muro de muelles de carga (Almacén Frío)",
        type: "loading_dock",
        shape: "rect",
        x: -11.5,
        y: 3.5,
        length: 2.0,
        width: 18.0,
        headingDeg: 0,
        heightM: 4.5,
        color: "#0284c7"
      },
      {
        id: "obs_parked_truck_left",
        name: "Camión estacionado en Muelle 1 (Límite superior)",
        type: "parking_limit",
        shape: "rect",
        x: -2.0,
        y: 10.2,
        length: 13.6,
        width: 2.6,
        headingDeg: 0,
        heightM: 4.0,
        color: "#64748b"
      },
      {
        id: "obs_parked_truck_right",
        name: "Camión estacionado en Muelle 3 (Límite inferior)",
        type: "parking_limit",
        shape: "rect",
        x: -2.0,
        y: -2.2,
        length: 13.6,
        width: 2.6,
        headingDeg: 0,
        heightM: 4.0,
        color: "#64748b"
      }
    ]
  },

  eu_directive_96_53_ring: {
    id: "eu_directive_96_53_ring",
    name: "Corona circular normativa UE (Directiva 96/53/CE y RSCIEI)",
    description: "Comprobación reglamentaria de inscripción en corona circular de R_ext = 12,50 m y R_int = 5,30 m (RD 2822/1998 y RSCIEI RD 2267/2004).",
    safetyMarginM: 0.05,
    maneuver: {
      startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [
        { type: "straight", length: 10.0, direction: 1 },
        { type: "arc", radius: 9.85, angle: 90.0, direction: 1 },
        { type: "straight", length: 12.0, direction: 1 }
      ]
    },
    obstacles: [
      {
        id: "obs_eu_inner_circle",
        name: "Círculo interior prohibido Directiva 96/53/CE (R = 5,30 m)",
        type: "roundabout_central",
        shape: "circle",
        x: 10.0,
        y: 9.85,
        radius: 5.30,
        heightM: 0.25,
        color: "#ef4444"
      },
      {
        id: "obs_eu_outer_ring",
        name: "Corona exterior máxima Directiva 96/53/CE (R = 12,50 m)",
        type: "roundabout_outer",
        shape: "arc_curb",
        x: 10.0,
        y: 9.85,
        radius: 12.50,
        startAngleDeg: -62,
        endAngleDeg: 5,
        heightM: 0.25,
        color: "#22c55e"
      }
    ]
  }
};

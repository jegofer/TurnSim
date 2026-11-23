/**
 * Sistema de definición de entornos/obstáculos y comprobación geométrica de interferencias
 * Cumple los apartados 8, 11.1, 12 y Fase 6 de PROMT_ORIGINAL.md.
 *
 * Distingue estrictamente los 5 estados de interferencia prescritos:
 * 1. COLLISION: Colisión geométrica directa entre el contorno del vehículo y un obstáculo físico.
 * 2. RESTRICTED_INVASION: Invasión de una zona prohibida o restringida para la circulación.
 * 3. MARGIN_VIOLATION: Incumplimiento del margen de seguridad configurado (0 < d_min < safetyMargin).
 * 4. NOT_EVALUABLE: Situación no evaluable de forma concluyente por superar límites cinemáticos
 *    (dirección o tijera/jackknifing) o por requerir comprobación tridimensional de gálibo no disponible.
 * 5. CLEAR: Holgura geométrica verificada (d_min >= safetyMargin).
 */

import { simulateManeuver } from "./kinematics.js";
import { convexHull8 } from "./envelope.js";

/**
 * Predicado de orientación geométrica 2D exacto y robusto (LIB-02).
 * Evalúa el signo de la orientación de los puntos A, B, C con filtrado adaptativo de coma flotante
 * para eliminar errores de redondeo por cancelación catastrófica en casos casi colineales.
 *
 * @returns {number} +1 si C queda a la izquierda de la recta dirigida AB (giro antihorario),
 *                   -1 si C queda a la derecha (giro horario),
 *                    0 si A, B y C son estrictamente colineales.
 */
export function orient2d(ax, ay, bx, by, cx, cy) {
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  const detleft = acx * bcy;
  const detright = acy * bcx;
  const det = detleft - detright;

  const detsum = Math.abs(detleft) + Math.abs(detright);
  if (Math.abs(det) >= 1e-12 * detsum) {
    return det > 0 ? 1 : det < 0 ? -1 : 0;
  }
  if (Math.abs(det) <= 1e-15 * (detsum + 1.0)) {
    return 0;
  }
  return det > 0 ? 1 : -1;
}

/**
 * Proyección euclídea de un punto P sobre un segmento UV y cálculo de distancia mínima.
 */
export function pointToSeg(px, py, ux, uy, vx, vy) {
  const l2 = (vx - ux) ** 2 + (vy - uy) ** 2;
  if (l2 < 1e-12) {
    return { dist: Math.hypot(px - ux, py - uy), proj: [ux, uy] };
  }
  const t = Math.max(0, Math.min(1, ((px - ux) * (vx - ux) + (py - uy) * (vy - uy)) / l2));
  const qx = ux + t * (vx - ux);
  const qy = uy + t * (vy - uy);
  return { dist: Math.hypot(px - qx, py - qy), proj: [qx, qy] };
}

/**
 * Distancia mínima entre dos segmentos 2D AB y CD, devolviendo también los puntos más cercanos.
 */
export function segmentToSegmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = orient2d(ax, ay, bx, by, cx, cy);
  const d2 = orient2d(ax, ay, bx, by, dx, dy);
  const d3 = orient2d(cx, cy, dx, dy, ax, ay);
  const d4 = orient2d(cx, cy, dx, dy, bx, by);

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

  const c1 = pointToSeg(ax, ay, cx, cy, dx, dy);
  let best = { distance: c1.dist, intersects: c1.dist <= 1e-9, pointA: [ax, ay], pointB: c1.proj };

  const c2 = pointToSeg(bx, by, cx, cy, dx, dy);
  if (c2.dist < best.distance) {
    best = { distance: c2.dist, intersects: c2.dist <= 1e-9, pointA: [bx, by], pointB: c2.proj };
  }

  const c3 = pointToSeg(cx, cy, ax, ay, bx, by);
  if (c3.dist < best.distance) {
    best = { distance: c3.dist, intersects: c3.dist <= 1e-9, pointA: c3.proj, pointB: [cx, cy] };
  }

  const c4 = pointToSeg(dx, dy, ax, ay, bx, by);
  if (c4.dist < best.distance) {
    best = { distance: c4.dist, intersects: c4.dist <= 1e-9, pointA: c4.proj, pointB: [dx, dy] };
  }

  return best;
}

/**
 * Comprueba si un punto (px, py) está dentro de un polígono cerrado (algoritmo ray-casting sin sesgo numérico).
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
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

  const nA = polyA.length;
  const nB = isOpenPolylineB ? polyB.length - 1 : polyB.length;

  let aMinX = Infinity, aMinY = Infinity, aMaxX = -Infinity, aMaxY = -Infinity;
  for (let i = 0; i < nA; i++) {
    const x = polyA[i][0], y = polyA[i][1];
    if (x < aMinX) aMinX = x;
    if (y < aMinY) aMinY = y;
    if (x > aMaxX) aMaxX = x;
    if (y > aMaxY) aMaxY = y;
  }
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (let j = 0; j < polyB.length; j++) {
    const x = polyB[j][0], y = polyB[j][1];
    if (x < bMinX) bMinX = x;
    if (y < bMinY) bMinY = y;
    if (x > bMaxX) bMaxX = x;
    if (y > bMaxY) bMaxY = y;
  }

  const aabbOverlap = aMaxX >= bMinX && bMaxX >= aMinX && aMaxY >= bMinY && bMaxY >= aMinY;

  // Comprobar inclusión de vértices solo si B es un polígono cerrado con interior físico y las cajas se solapan
  if (aabbOverlap && !isOpenPolylineB && polyB.length >= 3) {
    for (let i = 0; i < nA; i++) {
      const vx = polyA[i][0], vy = polyA[i][1];
      if (vx >= bMinX && vx <= bMaxX && vy >= bMinY && vy <= bMaxY && pointInPolygon(vx, vy, polyB)) {
        return { distance: 0.0, intersects: true, pointA: [vx, vy], pointB: [vx, vy] };
      }
    }
    for (let j = 0; j < polyB.length; j++) {
      const vx = polyB[j][0], vy = polyB[j][1];
      if (vx >= aMinX && vx <= aMaxX && vy >= aMinY && vy <= aMaxY && pointInPolygon(vx, vy, polyA)) {
        return { distance: 0.0, intersects: true, pointA: [vx, vy], pointB: [vx, vy] };
      }
    }
  }

  let best = { distance: Infinity, intersects: false, pointA: polyA[0], pointB: polyB[0] };
  let bestDistSq = Infinity;

  for (let i = 0; i < nA; i++) {
    const [a1x, a1y] = polyA[i];
    const [a2x, a2y] = polyA[(i + 1) % nA];
    const segAMinX = a1x < a2x ? a1x : a2x;
    const segAMaxX = a1x > a2x ? a1x : a2x;
    const segAMinY = a1y < a2y ? a1y : a2y;
    const segAMaxY = a1y > a2y ? a1y : a2y;

    for (let j = 0; j < nB; j++) {
      const [b1x, b1y] = polyB[j];
      const [b2x, b2y] = polyB[(j + 1) % polyB.length];

      if (bestDistSq < Infinity) {
        const segBMinX = b1x < b2x ? b1x : b2x;
        const segBMaxX = b1x > b2x ? b1x : b2x;
        const segBMinY = b1y < b2y ? b1y : b2y;
        const segBMaxY = b1y > b2y ? b1y : b2y;
        const dx = segAMaxX < segBMinX ? segBMinX - segAMaxX : segAMaxX < segAMinX ? segAMinX - segAMaxX : 0;
        const dy = segAMaxY < segBMinY ? segBMinY - segAMaxY : segAMaxY < segAMinY ? segAMinY - segAMaxY : 0;
        if (dx * dx + dy * dy >= bestDistSq) continue;
      }

      const res = segmentToSegmentDistance(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y);
      if (res.intersects) {
        return res;
      }
      if (res.distance < best.distance) {
        best = res;
        bestDistSq = res.distance * res.distance;
      }
    }
  }

  return best;
}

/**
 * Distancia analítica exacta entre un polígono y un obstáculo circular (COL-02).
 * Elimina completamente el error cordal de la discretización poligonal (hasta 38 mm a 36 lados).
 */
export function polygonToCircleDistance(poly, cx, cy, radius) {
  if (!poly || poly.length < 3) {
    return { distance: Infinity, intersects: false, pointA: [0, 0], pointB: [cx, cy] };
  }

  if (pointInPolygon(cx, cy, poly)) {
    return { distance: 0.0, intersects: true, pointA: [cx, cy], pointB: [cx, cy] };
  }

  let minDist = Infinity;
  let bestProj = poly[0];
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    const res = pointToSeg(cx, cy, p1[0], p1[1], p2[0], p2[1]);
    if (res.dist < minDist) {
      minDist = res.dist;
      bestProj = res.proj;
    }
  }

  if (minDist <= radius) {
    return { distance: 0.0, intersects: true, pointA: bestProj, pointB: bestProj };
  }

  const d = minDist - radius;
  const dx = bestProj[0] - cx;
  const dy = bestProj[1] - cy;
  const len = Math.hypot(dx, dy);
  const ptOnCircle = len > 1e-9 ? [cx + radius * (dx / len), cy + radius * (dy / len)] : [cx, cy];

  return {
    distance: d,
    intersects: false,
    pointA: bestProj,
    pointB: ptOnCircle
  };
}

/**
 * Distancia analítica exacta entre un polígono y un bordillo en arco circular (COL-02).
 */
export function polygonToArcDistance(poly, cx, cy, radius, startAngleRad, endAngleRad) {
  if (!poly || poly.length < 3) {
    return { distance: Infinity, intersects: false, pointA: [0, 0], pointB: [cx, cy] };
  }

  const pStart = [cx + radius * Math.cos(startAngleRad), cy + radius * Math.sin(startAngleRad)];
  const pEnd = [cx + radius * Math.cos(endAngleRad), cy + radius * Math.sin(endAngleRad)];

  let best = { distance: Infinity, intersects: false, pointA: poly[0], pointB: pStart };

  const checkPt = (candDist, pVeh, pObs) => {
    if (candDist < best.distance) {
      best = { distance: candDist, intersects: candDist <= 1e-9, pointA: pVeh, pointB: pObs };
    }
  };

  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];

    const resS = pointToSeg(pStart[0], pStart[1], p1[0], p1[1], p2[0], p2[1]);
    checkPt(resS.dist, resS.proj, pStart);

    const resE = pointToSeg(pEnd[0], pEnd[1], p1[0], p1[1], p2[0], p2[1]);
    checkPt(resE.dist, resE.proj, pEnd);

    const resC = pointToSeg(cx, cy, p1[0], p1[1], p2[0], p2[1]);
    let ang = Math.atan2(resC.proj[1] - cy, resC.proj[0] - cx);
    while (ang < 0) ang += 2 * Math.PI;

    let sRad = startAngleRad % (2 * Math.PI);
    while (sRad < 0) sRad += 2 * Math.PI;
    let eRad = endAngleRad % (2 * Math.PI);
    while (eRad < 0) eRad += 2 * Math.PI;

    let inRange = false;
    if (sRad <= eRad) {
      inRange = ang >= sRad && ang <= eRad;
    } else {
      inRange = ang >= sRad || ang <= eRad;
    }

    if (inRange) {
      const distToArc = Math.abs(resC.dist - radius);
      const dx = resC.proj[0] - cx;
      const dy = resC.proj[1] - cy;
      const len = Math.hypot(dx, dy);
      const ptArc = len > 1e-9 ? [cx + radius * (dx / len), cy + radius * (dy / len)] : pStart;
      checkPt(distToArc, resC.proj, ptArc);
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
 * Calcula la caja envolvente alineada a los ejes (AABB) de una lista de vértices 2D.
 */
function computePolygonAABB(pts) {
  if (!pts || pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0];
    const y = pts[i][1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Calcula el cuadrado de la distancia mínima euclídea entre dos AABB.
 */
function aabbMinDistanceSq(a, b) {
  const dx = a.maxX < b.minX ? b.minX - a.maxX : b.maxX < a.minX ? a.minX - b.maxX : 0;
  const dy = a.maxY < b.minY ? b.minY - a.maxY : b.maxY < a.minY ? a.minY - b.maxY : 0;
  return dx * dx + dy * dy;
}

/**
 * Evalúa las interferencias entre todos los estados de la simulación y la lista de obstáculos del entorno.
 * Soporta detección continua de colisiones (CCD), evaluación analítica de círculos/arcos (COL-02)
 * y conjuntos articulados multicuerpo de N unidades (KIN-04).
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
  const enableCCD = options.enableCCD !== false;
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

  const nStates = states.length;
  const tractorAABBs = new Array(nStates);
  const trailerAABBs = new Array(nStates);
  const tractorCapAABBs = enableCCD && nStates > 1 ? new Array(nStates - 1) : null;
  const trailerCapAABBs = enableCCD && nStates > 1 ? new Array(nStates - 1) : null;
  const tractorCapPolys = enableCCD && nStates > 1 ? new Array(nStates - 1) : null;
  const trailerCapPolys = enableCCD && nStates > 1 ? new Array(nStates - 1) : null;

  for (let i = 0; i < nStates; i++) {
    const s = states[i];
    tractorAABBs[i] = computePolygonAABB(s.tractorPolygon);
    trailerAABBs[i] = s.trailerPolygon ? computePolygonAABB(s.trailerPolygon) : null;
  }

  if (enableCCD && nStates > 1) {
    for (let i = 0; i < nStates - 1; i++) {
      const tA = tractorAABBs[i];
      const tB = tractorAABBs[i + 1];
      if (tA && tB) {
        tractorCapAABBs[i] = {
          minX: tA.minX < tB.minX ? tA.minX : tB.minX,
          minY: tA.minY < tB.minY ? tA.minY : tB.minY,
          maxX: tA.maxX > tB.maxX ? tA.maxX : tB.maxX,
          maxY: tA.maxY > tB.maxY ? tA.maxY : tB.maxY
        };
      }
      const trA = trailerAABBs[i];
      const trB = trailerAABBs[i + 1];
      if (trA && trB) {
        trailerCapAABBs[i] = {
          minX: trA.minX < trB.minX ? trA.minX : trB.minX,
          minY: trA.minY < trB.minY ? trA.minY : trB.minY,
          maxX: trA.maxX > trB.maxX ? trA.maxX : trB.maxX,
          maxY: trA.maxY > trB.maxY ? trA.maxY : trB.maxY
        };
      }
    }
  }

  for (const obs of obstacles || []) {
    if (obs.enabled === false) continue;

    const verts = getObstacleVertices(obs);
    // Borde de calzada, cerramiento o polilínea abierta no tienen "interior" que atrape al vehículo
    const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge" || obs.type === "boundary" || Boolean(obs.isOpen);

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

    const obsAABB = computePolygonAABB(verts);
    const obsCx = obsAABB ? 0.5 * (obsAABB.minX + obsAABB.maxX) : 0;
    const obsCy = obsAABB ? 0.5 * (obsAABB.minY + obsAABB.maxY) : 0;
    const obsRadius = obsAABB
      ? 0.5 * Math.hypot(obsAABB.maxX - obsAABB.minX, obsAABB.maxY - obsAABB.minY)
      : Infinity;

    const evalPolyToObs = (poly) => {
      if (obs.shape === "circle") {
        return polygonToCircleDistance(poly, Number(obs.x || 0), Number(obs.y || 0), Number(obs.radius || 1.0));
      }
      if (obs.shape === "arc_curb") {
        const sRad = ((Number(obs.startAngleDeg || 0)) * Math.PI) / 180;
        const eRad = ((Number(obs.endAngleDeg || 360)) * Math.PI) / 180;
        return polygonToArcDistance(poly, Number(obs.x || 0), Number(obs.y || 0), Number(obs.radius || 1.0), sRad, eRad);
      }
      return polygonToGeometryDistance(poly, verts, isOpen);
    };

    let minDistance = Infinity;
    let minDistanceSq = Infinity;
    let bestStepIndex = 0;
    let bestDistAlongPath = 0;
    let bestPointVehicle = null;
    let bestPointObstacle = null;
    let bestPart = "tractor";
    let intersected = false;

    const evalStateAt = (i) => {
      const s = states[i];
      const tAabb = tractorAABBs[i];
      if (!obsAABB || !tAabb || aabbMinDistanceSq(tAabb, obsAABB) <= minDistanceSq) {
        const resTractor = evalPolyToObs(s.tractorPolygon);
        if (resTractor.distance < minDistance) {
          minDistance = resTractor.distance;
          const b = minDistance + 1e-6;
          if (b * b < minDistanceSq) minDistanceSq = b * b;
          intersected = resTractor.intersects;
          bestStepIndex = i;
          bestDistAlongPath = s.dist;
          bestPointVehicle = resTractor.pointA;
          bestPointObstacle = resTractor.pointB;
          bestPart = "Cabeza tractora";
        }
      }

      if (s.trailers && s.trailers.length > 0) {
        for (let j = 0; j < s.trailers.length; j++) {
          const trState = s.trailers[j];
          if (!trState.polygon) continue;
          const trAabb = j === 0 ? trailerAABBs[i] : computePolygonAABB(trState.polygon);
          if (obsAABB && trAabb && aabbMinDistanceSq(trAabb, obsAABB) > minDistanceSq) continue;
          const resTr = evalPolyToObs(trState.polygon);
          if (resTr.distance < minDistance) {
            minDistance = resTr.distance;
            const b = minDistance + 1e-6;
            if (b * b < minDistanceSq) minDistanceSq = b * b;
            intersected = resTr.intersects;
            bestStepIndex = i;
            bestDistAlongPath = s.dist;
            bestPointVehicle = resTr.pointA;
            bestPointObstacle = resTr.pointB;
            bestPart = trState.name || `Remolque ${j + 1}`;
          }
        }
      } else if (s.trailerPolygon) {
        const trAabb = trailerAABBs[i];
        if (!obsAABB || !trAabb || aabbMinDistanceSq(trAabb, obsAABB) <= minDistanceSq) {
          const resTrailer = evalPolyToObs(s.trailerPolygon);
          if (resTrailer.distance < minDistance) {
            minDistance = resTrailer.distance;
            const b = minDistance + 1e-6;
            if (b * b < minDistanceSq) minDistanceSq = b * b;
            intersected = resTrailer.intersects;
            bestStepIndex = i;
            bestDistAlongPath = s.dist;
            bestPointVehicle = resTrailer.pointA;
            bestPointObstacle = resTrailer.pointB;
            bestPart = "Semirremolque";
          }
        }
      }

      if (enableCCD && i < nStates - 1 && !(intersected && minDistance === 0)) {
        const sNext = states[i + 1];
        const capAabbT = tractorCapAABBs[i];
        if (capAabbT && (!obsAABB || aabbMinDistanceSq(capAabbT, obsAABB) <= minDistanceSq)) {
          let capPoly = tractorCapPolys[i];
          if (!capPoly) {
            capPoly = convexHull8([...s.tractorPolygon, ...sNext.tractorPolygon]);
            tractorCapPolys[i] = capPoly;
          }
          const resCap = evalPolyToObs(capPoly);
          if (resCap.distance < minDistance) {
            minDistance = resCap.distance;
            const b = minDistance + 1e-6;
            if (b * b < minDistanceSq) minDistanceSq = b * b;
            intersected = resCap.intersects;
            bestStepIndex = i;
            bestDistAlongPath = (s.dist + sNext.dist) / 2;
            bestPointVehicle = resCap.pointA;
            bestPointObstacle = resCap.pointB;
            bestPart = "Cabeza tractora";
          }
        }

        if (s.trailers && sNext.trailers && s.trailers.length > 0) {
          for (let j = 0; j < s.trailers.length; j++) {
            const trA = s.trailers[j];
            const trB = sNext.trailers[j];
            if (!trA || !trB || !trA.polygon || !trB.polygon) continue;
            let capAabbTr = j === 0 ? trailerCapAABBs[i] : null;
            if (!capAabbTr) {
              const aA = computePolygonAABB(trA.polygon);
              const aB = computePolygonAABB(trB.polygon);
              if (aA && aB) {
                capAabbTr = {
                  minX: aA.minX < aB.minX ? aA.minX : aB.minX,
                  minY: aA.minY < aB.minY ? aA.minY : aB.minY,
                  maxX: aA.maxX > aB.maxX ? aA.maxX : aB.maxX,
                  maxY: aA.maxY > aB.maxY ? aA.maxY : aB.maxY
                };
              }
            }
            if (obsAABB && capAabbTr && aabbMinDistanceSq(capAabbTr, obsAABB) > minDistanceSq) continue;
            let capPoly = j === 0 ? trailerCapPolys[i] : null;
            if (!capPoly) {
              capPoly = convexHull8([...trA.polygon, ...trB.polygon]);
              if (j === 0) trailerCapPolys[i] = capPoly;
            }
            const resCap = evalPolyToObs(capPoly);
            if (resCap.distance < minDistance) {
              minDistance = resCap.distance;
              const b = minDistance + 1e-6;
              if (b * b < minDistanceSq) minDistanceSq = b * b;
              intersected = resCap.intersects;
              bestStepIndex = i;
              bestDistAlongPath = (s.dist + sNext.dist) / 2;
              bestPointVehicle = resCap.pointA;
              bestPointObstacle = resCap.pointB;
              bestPart = trA.name || `Remolque ${j + 1}`;
            }
          }
        } else if (s.trailerPolygon && sNext.trailerPolygon) {
          const capAabbTr = trailerCapAABBs[i];
          if (capAabbTr && (!obsAABB || aabbMinDistanceSq(capAabbTr, obsAABB) <= minDistanceSq)) {
            let capPoly = trailerCapPolys[i];
            if (!capPoly) {
              capPoly = convexHull8([...s.trailerPolygon, ...sNext.trailerPolygon]);
              trailerCapPolys[i] = capPoly;
            }
            const resCap = evalPolyToObs(capPoly);
            if (resCap.distance < minDistance) {
              minDistance = resCap.distance;
              const b = minDistance + 1e-6;
              if (b * b < minDistanceSq) minDistanceSq = b * b;
              intersected = resCap.intersects;
              bestStepIndex = i;
              bestDistAlongPath = (s.dist + sNext.dist) / 2;
              bestPointVehicle = resCap.pointA;
              bestPointObstacle = resCap.pointB;
              bestPart = "Semirremolque";
            }
          }
        }
      }
    };

    // Semilla inicial: localizar en O(N) aritmético el estado cuya AABB está más cerca del obstáculo
    // y el estado más cercano al centro, para acotar minDistanceSq de inmediato
    if (obsAABB && nStates > 0) {
      let seedIdx = 0;
      let seedDistSq = Infinity;
      let centerSeedIdx = 0;
      let centerDistSq = Infinity;
      for (let i = 0; i < nStates; i++) {
        const tAabb = tractorAABBs[i];
        if (tAabb) {
          const dT = aabbMinDistanceSq(tAabb, obsAABB);
          if (dT < seedDistSq) {
            seedDistSq = dT;
            seedIdx = i;
          }
          const dxC = 0.5 * (tAabb.minX + tAabb.maxX) - obsCx;
          const dyC = 0.5 * (tAabb.minY + tAabb.maxY) - obsCy;
          const dC = dxC * dxC + dyC * dyC;
          if (dC < centerDistSq) {
            centerDistSq = dC;
            centerSeedIdx = i;
          }
        }
        const trAabb = trailerAABBs[i];
        if (trAabb) {
          const dTr = aabbMinDistanceSq(trAabb, obsAABB);
          if (dTr < seedDistSq) {
            seedDistSq = dTr;
            seedIdx = i;
          }
        }
      }
      evalStateAt(seedIdx);
      if (centerSeedIdx !== seedIdx && !(intersected && minDistance === 0)) evalStateAt(centerSeedIdx);
      if (seedIdx > 0 && !(intersected && minDistance === 0)) evalStateAt(seedIdx - 1);
      if (seedIdx + 1 < nStates && !(intersected && minDistance === 0)) evalStateAt(seedIdx + 1);
    }

    for (let i = 0; i < nStates; i++) {
      if (intersected && minDistance === 0) {
        break;
      }
      evalStateAt(i);
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
    COLLISION: "COLISIÓN GEOMÉTRICA DETECTADA (Maniobra inviable)",
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
 * Catálogo de escenarios preconfigurados de ingeniería viaria y logística.
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
        x: 10.5,
        y: 20.0,
        length: 12.0,
        width: 14.0,
        headingDeg: 0,
        heightM: 7.5,
        color: "#dc2626"
      },
      {
        id: "obs_curb_outer",
        name: "Bordillo exterior vial acceso (R = 15,00 m)",
        type: "road_edge",
        shape: "arc_curb",
        x: 0.0,
        y: 12.5,
        radius: 15.0,
        startAngleDeg: -90,
        endAngleDeg: 0,
        heightM: 0.15,
        color: "#f59e0b"
      },
      {
        id: "obs_pedestrian_path",
        name: "Pasillo peatonal protegido junto a muelle",
        type: "restricted_zone",
        shape: "rect",
        x: 14.0,
        y: 29.5,
        length: 2.0,
        width: 12.0,
        headingDeg: 90,
        heightM: 0.0,
        color: "#eab308"
      }
    ]
  },

  roundabout_exit: {
    id: "roundabout_exit",
    name: "Glorieta de acceso a polígono industrial (R = 15,00 m)",
    description: "Circulación en glorieta industrial con radio de isleta central R = 11,00 m, calzada anular de 7,50 m y salida hacia vial de distribución.",
    safetyMarginM: 0.25,
    maneuver: {
      startPose: { x: -20.0, y: -4.0, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [
        { type: "straight", length: 12.0, direction: 1 },
        { type: "arc", radius: 15.0, angle: 75.0, direction: 1 },
        { type: "arc", radius: 13.5, angle: -50.0, direction: 1 },
        { type: "straight", length: 14.0, direction: 1 }
      ]
    },
    obstacles: [
      {
        id: "obs_roundabout_island",
        name: "Isleta central no remontable de glorieta (R = 11,00 m)",
        type: "roundabout_central",
        shape: "circle",
        x: 0.0,
        y: 11.0,
        radius: 11.0,
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

/**
 * Evaluación de maniobrabilidad según el Reglamento (UE) 1230/2012 y el Reglamento (UE) 2021/535 Anexo XIII
 * (sucesor normativo del ensayo de la Directiva 96/53/CE).
 */
export function evaluateEURegulation1230Maneuverability(vehicle, options = {}) {
  const Lwb = vehicle?.tractor?.wheelbase || 3.80;
  const Lfo = vehicle?.tractor?.frontOverhang || 1.44;
  const Wtr = vehicle?.tractor?.width || 2.55;
  const xf = Lwb + Lfo;

  const rOuterLimitM = 12.50;
  const rInnerLimitM = 5.30;
  const isBus = vehicle?.category === "bus" || vehicle?.type === "bus" || Boolean(vehicle?.id && vehicle.id.includes("bus"));
  const tailSwingLimitM = isBus ? 1.20 : 0.80;

  if (xf >= rOuterLimitM) {
    return {
      compliant: false,
      reason: "La batalla sumada al voladizo delantero excede el radio exterior de 12,50 m",
      rOuterLimitM,
      rInnerLimitM,
      tailSwingLimitM
    };
  }

  const Rref = Math.sqrt(rOuterLimitM * rOuterLimitM - xf * xf) - Wtr / 2;
  const cirCenter = [-xf, Wtr / 2 + Rref];

  const startPose = {
    x: -xf,
    y: Wtr / 2,
    headingDeg: 0,
    initialArticulationDeg: 0
  };

  const maneuver = {
    startPose,
    segments: [
      { type: "arc", radius: Rref, angle: 540, direction: 1 }
    ]
  };

  const stepSizeM = Math.max(0.01, Number(options.stepSizeM || 0.05));
  const sim = simulateManeuver(vehicle, maneuver, { stepSizeM });

  let maxTailSwing = 0;
  let maxR = 0;
  let minR = Infinity;
  const tailSwingMaxDist = 0.5 * Math.PI * Rref;
  const steadyDistThreshold = 2 * Math.PI * Rref;

  for (const s of sim.states) {
    const allPts = [...s.tractorPolygon, ...(s.trailerPolygon || [])];
    if (s.dist <= tailSwingMaxDist) {
      for (const [, py] of allPts) {
        const swing = -py;
        if (swing > maxTailSwing) maxTailSwing = swing;
      }
    }
    if (s.dist >= steadyDistThreshold) {
      for (const [px, py] of allPts) {
        const d = Math.hypot(px - cirCenter[0], py - cirCenter[1]);
        if (d > maxR) maxR = d;
        if (d < minR) minR = d;
      }
    }
  }

  const rOuterPass = maxR <= rOuterLimitM + 0.005;
  const rInnerPass = minR >= rInnerLimitM - 0.005;
  const tailSwingPass = maxTailSwing <= tailSwingLimitM + 0.005;
  const compliant = rOuterPass && rInnerPass && tailSwingPass;

  return {
    compliant,
    regulation: "Reglamento (UE) 1230/2012 / Reglamento (UE) 2021/535 Anexo XIII",
    vehicleId: vehicle?.id || "custom",
    vehicleName: vehicle?.name || "Vehículo personalizado",
    isBus,
    rOuterLimitM,
    rOuterMeasuredM: Number(maxR.toFixed(4)),
    rOuterPass,
    rInnerLimitM,
    rInnerMeasuredM: Number(minR.toFixed(4)),
    rInnerPass,
    tailSwingLimitM,
    tailSwingMeasuredM: Number(maxTailSwing.toFixed(4)),
    tailSwingPass,
    RrefM: Number(Rref.toFixed(4)),
    steerAngleEquivDeg: Number((Math.atan(Lwb / Rref) * 180 / Math.PI).toFixed(2)),
    statesCount: sim.states.length
  };
}

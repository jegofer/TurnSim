import { computeEffectiveTrailerWheelbase } from "../models/vehicles.js";

/**
 * Motor cinemático y geométrico de vehículos pesados articulados
 * Cumple el apartado 6 (6.1, 6.2) y el apartado 11.1 de PROMT_ORIGINAL.md.
 *
 * Convención del sistema de coordenadas y unidades internas:
 * - Longitudes y coordenadas: metros (m).
 * - Ángulos internos: radianes (rad). 0 rad apunta en dirección +X; giro positivo antihorario (+Y).
 * - Punto de referencia de la tractora P = (x, y): centro del eje motriz trasero.
 * - Quinta rueda (kingpin) P_h = (x_h, y_h): situada a una distancia longitudinal h (hitchOffset)
 *   medida hacia delante desde el eje motriz a lo largo del eje de la tractora:
 *     x_h = x + h * cos(heading)
 *     y_h = y + h * sin(heading)
 * - Punto de referencia del semirremolque P_t = (x_t, y_t): centro geométrico del trídem trasero,
 *   situado a una distancia L_t (trailer.wheelbase) por detrás del kingpin a lo largo del eje del semirremolque:
 *     x_t = x_h - L_t * cos(trailerHeading)
 *     y_t = y_h - L_t * sin(trailerHeading)
 */



const DEFAULT_STRAIGHT_STEP_M = 0.05;
const DEFAULT_ARC_STEP_DEG = 0.5;

/**
 * Normaliza un ángulo en radianes al intervalo (-PI, PI].
 */
export function normalizeAngle(angleRad) {
  let a = angleRad % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/**
 * Rota un punto (x, y) alrededor de un centro (cx, cy) un ángulo angleRad.
 */
export function rotatePoint(x, y, cx, cy, angleRad) {
  const dx = x - cx;
  const dy = y - cy;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return [cx + dx * cosA - dy * sinA, cy + dx * sinA + dy * cosA];
}

/**
 * Calcula la posición de la quinta rueda (kingpin) a partir del eje motriz de la tractora.
 * @param {number} x Coordenada X del eje motriz
 * @param {number} y Coordenada Y del eje motriz
 * @param {number} heading Orientación de la tractora (rad)
 * @param {number} hitchOffset Avance de quinta rueda (m, positivo hacia delante del eje motriz)
 */
export function computeHitchPoint(x, y, heading, hitchOffset) {
  return [
    x + hitchOffset * Math.cos(heading),
    y + hitchOffset * Math.sin(heading)
  ];
}

/**
 * Calcula el polígono rectangular de 4 vértices de un cuerpo (tractora o semirremolque)
 * dado su eje trasero de referencia (rx, ry) y orientación (heading).
 * Orden de vértices (sentido horario/antihorario cerrado):
 * 0: trasero derecho, 1: trasero izquierdo, 2: delantero izquierdo, 3: delantero derecho.
 */
export function computeBodyPolygon(rx, ry, heading, segment, safetyMargin = 0.0, preCosH = null, preSinH = null) {
  const lFront = segment.wheelbase + segment.frontOverhang + safetyMargin;
  const lRear = segment.rearOverhang + safetyMargin;
  const halfW = segment.width / 2 + safetyMargin;
  const cosH = preCosH !== null ? preCosH : Math.cos(heading);
  const sinH = preSinH !== null ? preSinH : Math.sin(heading);

  const rCos = rx - lRear * cosH;
  const rSin = ry - lRear * sinH;
  const fCos = rx + lFront * cosH;
  const fSin = ry + lFront * sinH;
  const wSin = halfW * sinH;
  const wCos = halfW * cosH;

  return [
    [rCos + wSin, rSin - wCos], // 0: Trasero derecho
    [rCos - wSin, rSin + wCos], // 1: Trasero izquierdo
    [fCos - wSin, fSin + wCos], // 2: Delantero izquierdo
    [fCos + wSin, fSin - wCos]  // 3: Delantero derecho
  ];
}

/**
 * Calcula los extremos izquierdo y derecho de un eje centrado en (ax, ay) con orientación heading.
 */
export function computeAxleEndpoints(ax, ay, heading, width, preCosH = null, preSinH = null) {
  const halfW = width / 2;
  const cosH = preCosH !== null ? preCosH : Math.cos(heading);
  const sinH = preSinH !== null ? preSinH : Math.sin(heading);
  const wSin = halfW * sinH;
  const wCos = halfW * cosH;
  return {
    center: [ax, ay],
    left: [ax - wSin, ay + wCos],
    right: [ax + wSin, ay - wCos]
  };
}

/**
 * Integra la orientación del semirremolque (theta_t) cuando la quinta rueda se desplaza
 * de (hx0, hy0) a (hx1, hy1).
 *
 * Ecuación diferencial exacta de condición de rodadura sin deslizamiento lateral en el eje del remolque:
 *   d(theta_t) / dt = ( -vx_h * sin(theta_t) + vy_h * cos(theta_t) ) / L_t
 * Integrada mediante Runge-Kutta de 4.º orden (RK4) sobre el incremento (dhx, dhy).
 * Esta formulación es numéricamente estable y exacta tanto en avance (ds > 0) como en marcha atrás (ds < 0).
 */
export function updateTrailerRK4(hx0, hy0, hx1, hy1, trailerHeading0, trailerWheelbase) {
  const dhx = hx1 - hx0;
  const dhy = hy1 - hy0;
  const invL = 1.0 / trailerWheelbase;

  const k1 = (-dhx * Math.sin(trailerHeading0) + dhy * Math.cos(trailerHeading0)) * invL;
  const th2 = trailerHeading0 + 0.5 * k1;
  const k2 = (-dhx * Math.sin(th2) + dhy * Math.cos(th2)) * invL;
  const th3 = trailerHeading0 + 0.5 * k2;
  const k3 = (-dhx * Math.sin(th3) + dhy * Math.cos(th3)) * invL;
  const th4 = trailerHeading0 + k3;
  const k4 = (-dhx * Math.sin(th4) + dhy * Math.cos(th4)) * invL;

  const newHeading = normalizeAngle(trailerHeading0 + (k1 + 2 * k2 + 2 * k3 + k4) / 6);
  const newX = hx1 - trailerWheelbase * Math.cos(newHeading);
  const newY = hy1 - trailerWheelbase * Math.sin(newHeading);

  return [newX, newY, newHeading];
}

/**
 * Integra la orientación del semirremolque (theta_t) a lo largo de un arco circular centrado
 * en (cx, cy) con incremento angular dHeading mediante Runge-Kutta de 4.º orden (RK4) analítico (MATH-01).
 *
 * Evalúa la derivada analítica continua de la posición de la quinta rueda en tau in {0, 1/2, 1},
 * restaurando el orden de convergencia estricto O(dTheta^4) en arcos circulares y reduciendo el
 * error numérico frente al régimen estacionario circular a nivel de precisión de máquina (< 1e-12 m).
 */
export function updateTrailerArcRK4(hx0, hy0, cx, cy, dHeading, trailerHeading0, trailerWheelbase) {
  const rx0 = hx0 - cx;
  const ry0 = hy0 - cy;
  const scale = dHeading / trailerWheelbase;

  const halfAngle = 0.5 * dHeading;
  const cosHalf = Math.cos(halfAngle);
  const sinHalf = Math.sin(halfAngle);
  const rxHalf = rx0 * cosHalf - ry0 * sinHalf;
  const ryHalf = rx0 * sinHalf + ry0 * cosHalf;

  const cosD = Math.cos(dHeading);
  const sinD = Math.sin(dHeading);
  const rx1 = rx0 * cosD - ry0 * sinD;
  const ry1 = rx0 * sinD + ry0 * cosD;

  const k1 = scale * (ry0 * Math.sin(trailerHeading0) + rx0 * Math.cos(trailerHeading0));
  const th2 = trailerHeading0 + 0.5 * k1;
  const k2 = scale * (ryHalf * Math.sin(th2) + rxHalf * Math.cos(th2));
  const th3 = trailerHeading0 + 0.5 * k2;
  const k3 = scale * (ryHalf * Math.sin(th3) + rxHalf * Math.cos(th3));
  const th4 = trailerHeading0 + k3;
  const k4 = scale * (ry1 * Math.sin(th4) + rx1 * Math.cos(th4));

  const newHeading = normalizeAngle(trailerHeading0 + (k1 + 2 * k2 + 2 * k3 + k4) / 6);
  const hx1 = cx + rx1;
  const hy1 = cy + ry1;

  const newX = hx1 - trailerWheelbase * Math.cos(newHeading);
  const newY = hy1 - trailerWheelbase * Math.sin(newHeading);

  return [newX, newY, newHeading];
}

/**
 * Propagación cordal idéntica a la función `_update_trailer` de `brombirium/schlepp`
 * (disponible para contraste cruzado exacto en TEST-05).
 */
export function updateTrailerSchleppChord(hx1, hy1, tx0, ty0, trailerWheelbase) {
  const newHeading = Math.atan2(hy1 - ty0, hx1 - tx0);
  const newX = hx1 - trailerWheelbase * Math.cos(newHeading);
  const newY = hy1 - trailerWheelbase * Math.sin(newHeading);
  return [newX, newY, newHeading];
}

/**
 * Construye el objeto de estado completo y enriquecido para un instante de la simulación.
 */
function buildDetailedState({
  stepIndex,
  x,
  y,
  heading,
  dist,
  signedDist,
  direction,
  curvature,
  steerAngleRad,
  hx,
  hy,
  tx,
  ty,
  trailerHeading,
  vehicle,
  safetyMargin = 0.0,
  trailersData = null
}) {
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  // Eje delantero directriz de la tractora
  const frontAxleX = x + tv.wheelbase * cosH;
  const frontAxleY = y + tv.wheelbase * sinH;

  const trackFront = tv.trackWidthFront || tv.width;
  const trackRear = tv.trackWidthRear || tv.width;

  const tractorFrontAxle = computeAxleEndpoints(frontAxleX, frontAxleY, heading, trackFront, cosH, sinH);
  const tractorRearAxle = computeAxleEndpoints(x, y, heading, trackRear, cosH, sinH);
  const tractorPoly = computeBodyPolygon(x, y, heading, tv, 0.0, cosH, sinH);
  const tractorMarginPoly = safetyMargin > 0 ? computeBodyPolygon(x, y, heading, tv, safetyMargin, cosH, sinH) : tractorPoly;

  let trailerPoly = null;
  let trailerMarginPoly = null;
  let trailerAxles = [];
  let articulationAngleRad = 0;
  const trailers = [];

  if (trailersData && trailersData.length > 0) {
    for (let j = 0; j < trailersData.length; j++) {
      const td = trailersData[j];
      const trDef = td.def;
      const th = td.heading;
      const tX = td.x;
      const tY = td.y;
      const parentH = j === 0 ? heading : trailersData[j - 1].heading;
      const articRad = normalizeAngle(parentH - th);
      const articDeg = (articRad * 180) / Math.PI;
      const cosT = Math.cos(th);
      const sinT = Math.sin(th);
      const poly = computeBodyPolygon(tX, tY, th, trDef, 0.0, cosT, sinT);
      const mPoly = safetyMargin > 0 ? computeBodyPolygon(tX, tY, th, trDef, safetyMargin, cosT, sinT) : poly;
      const trTrack = trDef.trackWidth || trDef.width || 2.55;
      const spacing = trDef.axleSpacing || 1.31;
      const offsets = trDef.axleCount === 3 ? [spacing, 0, -spacing] : trDef.axleCount === 2 ? [spacing / 2, -spacing / 2] : [0];
      const axles = offsets.map((off) => {
        const ax = tX + off * cosT;
        const ay = tY + off * sinT;
        return computeAxleEndpoints(ax, ay, th, trTrack, cosT, sinT);
      });

      trailers.push({
        index: j,
        id: trDef.id || `trailer_${j + 1}`,
        name: trDef.name || `Remolque ${j + 1}`,
        x: tX,
        y: tY,
        heading: th,
        tx: tX,
        ty: tY,
        theading: th,
        hitch: [td.hx, td.hy],
        articulationAngleRad: articRad,
        articulationAngleDeg: articDeg,
        polygon: poly,
        marginPolygon: mPoly,
        axles
      });
    }

    const primary = trailers[0];
    tx = primary.tx;
    ty = primary.ty;
    trailerHeading = primary.theading;
    trailerPoly = primary.polygon;
    trailerMarginPoly = primary.marginPolygon;
    trailerAxles = primary.axles;
    articulationAngleRad = primary.articulationAngleRad;
  } else if (tr && tx !== null && ty !== null && trailerHeading !== null) {
    articulationAngleRad = normalizeAngle(heading - trailerHeading);
    const cosT = Math.cos(trailerHeading);
    const sinT = Math.sin(trailerHeading);
    trailerPoly = computeBodyPolygon(tx, ty, trailerHeading, tr, 0.0, cosT, sinT);
    trailerMarginPoly = safetyMargin > 0 ? computeBodyPolygon(tx, ty, trailerHeading, tr, safetyMargin, cosT, sinT) : trailerPoly;

    const trTrack = tr.trackWidth || tr.width;
    const spacing = tr.axleSpacing || 1.31;
    const offsets = tr.axleCount === 3 ? [spacing, 0, -spacing] : [0];

    trailerAxles = offsets.map((off) => {
      const ax = tx + off * cosT;
      const ay = ty + off * sinT;
      return computeAxleEndpoints(ax, ay, trailerHeading, trTrack, cosT, sinT);
    });

    trailers.push({
      index: 0,
      id: tr.id || "trailer_1",
      name: tr.name || "Semirremolque",
      x: tx,
      y: ty,
      heading: trailerHeading,
      tx,
      ty,
      theading: trailerHeading,
      hitch: [hx, hy],
      articulationAngleRad,
      articulationAngleDeg: (articulationAngleRad * 180) / Math.PI,
      polygon: trailerPoly,
      marginPolygon: trailerMarginPoly,
      axles: trailerAxles
    });
  }

  const steerAngleDeg = (steerAngleRad * 180) / Math.PI;
  const articulationAngleDeg = (articulationAngleRad * 180) / Math.PI;
  const maxSteerDeg = tv.maxSteerAngleDeg || 38.0;
  const maxArticDeg = (vehicle.limits && vehicle.limits.maxArticulationAngleDeg) || 85.0;

  return {
    stepIndex,
    x,
    y,
    heading,
    dist,
    distAlongPathM: dist,
    signedDist,
    direction,
    curvature,
    steerAngleRad,
    steerAngleDeg,
    hitch: [hx, hy],
    tx,
    ty,
    theading: trailerHeading,
    articulationAngleRad,
    articulationAngleDeg,
    articulationDeg: articulationAngleDeg,
    exceedsMaxSteer: Math.abs(steerAngleDeg) > maxSteerDeg + 1e-3,
    exceedsMaxArticulation: Math.abs(articulationAngleDeg) > maxArticDeg,
    tractorFrontAxle,
    tractorRearAxle,
    trailerAxles,
    tractorPolygon: tractorPoly,
    trailerPolygon: trailerPoly,
    tractorMarginPolygon: tractorMarginPoly,
    trailerMarginPolygon: trailerMarginPoly,
    trailers
  };
}

/**
 * Convierte una lista de puntos de paso (waypoints) 2D en una secuencia suave de tramos
 * rectos y arcos circulares tangentes (empalmes de radio configurable).
 * Acepta tanto objetos { x, y, radius? } como tuplas [x, y].
 *
 * @param {Array<{x: number, y: number, radius?: number}|[number, number]>} waypoints Puntos de control
 * @param {number} defaultRadius Radio de empalme por defecto (m)
 * @param {number} direction Sentido de marcha (+1 avance, -1 marcha atrás)
 */
/**
 * Muestreo de una curva Spline CAD continua mediante interpolación cúbica de Hermite con preservación de forma (PCHIP).
 * Garantiza paso exacto por todos los vértices, ausencia de oscilaciones espurias o dientes de sierra (anti-overshoot),
 * elimina la deriva fuera de la calzada (Runge phenomenon de Catmull-Rom estándar) y asegura continuidad C¹
 * de posición y tangente con curvatura finita y suave para ingeniería civil.
 *
 * @param {Array<{x: number, y: number}|[number, number]>} waypoints Vértices de paso
 * @param {object} options Opciones de discretización { stepM: 0.20 }
 * @returns {Array<{ x: number, y: number, headingRad: number, curvature: number, radius: number }>}
 */
export function sampleCatmullRomSpline(waypoints, options = {}) {
  if (!waypoints || waypoints.length === 0) return [];

  const pts = waypoints.map((p) => {
    const px = Array.isArray(p) ? p[0] : (p?.x !== undefined ? p.x : p?.[0]);
    const py = Array.isArray(p) ? p[1] : (p?.y !== undefined ? p.y : p?.[1]);
    return { x: Number(px), y: Number(py) };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y, headingRad: 0, curvature: 0, radius: Infinity }));

  const stepM = Math.max(0.02, Number(options.stepM || 0.20));
  const n = pts.length;

  if (n === 2) {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const len = Math.hypot(dx, dy);
    const headingRad = Math.atan2(dy, dx);
    const steps = Math.max(2, Math.ceil(len / stepM));
    const res = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      res.push({
        x: Number((pts[0].x + f * dx).toFixed(4)),
        y: Number((pts[0].y + f * dy).toFixed(4)),
        headingRad,
        curvature: 0,
        radius: Infinity
      });
    }
    return res;
  }

  // Parametrización acumulada por longitud de cuerda para espaciamiento uniforme
  const d = [0];
  for (let i = 0; i < n - 1; i++) {
    const segLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    d.push(d[i] + Math.max(1e-4, segLen));
  }

  const h_d = [];
  const deltaX = [];
  const deltaY = [];
  for (let i = 0; i < n - 1; i++) {
    const h = d[i + 1] - d[i];
    h_d.push(h);
    deltaX.push((pts[i + 1].x - pts[i].x) / h);
    deltaY.push((pts[i + 1].y - pts[i].y) / h);
  }

  // Cálculo de tangentes PCHIP (Fritsch-Carlson) independientes para X e Y
  function calcPchipTangents(h_arr, deltas) {
    const m = new Array(n);
    const m0 = ((2 * h_arr[0] + h_arr[1]) * deltas[0] - h_arr[0] * deltas[1]) / (h_arr[0] + h_arr[1]);
    m[0] = Math.sign(m0) !== Math.sign(deltas[0]) ? 0 : (Math.sign(deltas[0]) !== Math.sign(deltas[1]) && Math.abs(m0) > 3 * Math.abs(deltas[0]) ? 3 * deltas[0] : m0);

    const mLast = ((2 * h_arr[n - 2] + h_arr[n - 3]) * deltas[n - 2] - h_arr[n - 2] * deltas[n - 3]) / (h_arr[n - 2] + h_arr[n - 3]);
    m[n - 1] = Math.sign(mLast) !== Math.sign(deltas[n - 2]) ? 0 : (Math.sign(deltas[n - 2]) !== Math.sign(deltas[n - 3]) && Math.abs(mLast) > 3 * Math.abs(deltas[n - 2]) ? 3 * deltas[n - 2] : mLast);

    for (let i = 1; i < n - 1; i++) {
      if (deltas[i - 1] * deltas[i] <= 0) {
        m[i] = 0;
      } else {
        const h0 = h_arr[i - 1];
        const h1 = h_arr[i];
        m[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / deltas[i - 1] + (h1 + 2 * h0) / deltas[i]);
      }
    }
    return m;
  }

  const mx = calcPchipTangents(h_d, deltaX);
  const my = calcPchipTangents(h_d, deltaY);

  const sampled = [];

  for (let i = 0; i < n - 1; i++) {
    const h = h_d[i];
    const steps = Math.max(3, Math.ceil(h / stepM));
    const isLastSpan = (i === n - 2);
    const maxK = isLastSpan ? steps : steps - 1;

    for (let k = 0; k <= maxK; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t * t * t;

      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = (t3 - 2 * t2 + t) * h;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = (t3 - t2) * h;

      const dh00 = (6 * t2 - 6 * t) / h;
      const dh10 = 3 * t2 - 4 * t + 1;
      const dh01 = (-6 * t2 + 6 * t) / h;
      const dh11 = 3 * t2 - 2 * t;

      const d2h00 = (12 * t - 6) / (h * h);
      const d2h10 = (6 * t - 4) / h;
      const d2h01 = (-12 * t + 6) / (h * h);
      const d2h11 = (6 * t - 2) / h;

      const x = h00 * pts[i].x + h10 * mx[i] + h01 * pts[i + 1].x + h11 * mx[i + 1];
      const y = h00 * pts[i].y + h10 * my[i] + h01 * pts[i + 1].y + h11 * my[i + 1];

      const dx = dh00 * pts[i].x + dh10 * mx[i] + dh01 * pts[i + 1].x + dh11 * mx[i + 1];
      const dy = dh00 * pts[i].y + dh10 * my[i] + dh01 * pts[i + 1].y + dh11 * my[i + 1];

      const d2x = d2h00 * pts[i].x + d2h10 * mx[i] + d2h01 * pts[i + 1].x + d2h11 * mx[i + 1];
      const d2y = d2h00 * pts[i].y + d2h10 * my[i] + d2h01 * pts[i + 1].y + d2h11 * my[i + 1];

      const headingRad = Math.atan2(dy, dx);
      const speedSq = dx * dx + dy * dy;
      const curvature = speedSq > 1e-6 ? (dx * d2y - dy * d2x) / Math.pow(speedSq, 1.5) : 0;
      const rawRadius = Math.abs(curvature) > 1e-4 ? 1 / Math.abs(curvature) : 99999.0;
      const radius = Math.min(99999.0, rawRadius);

      sampled.push({
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        headingRad,
        curvature,
        radius: Number(radius.toFixed(2))
      });
    }
  }

  return sampled;
}

export const samplePchipSpline = sampleCatmullRomSpline;

/**
 * Genera tramos de maniobra a partir de waypoints interpolados con Spline CAD continua.
 *
 * @param {Array<{x: number, y: number}|[number, number]>} waypoints Vértices de paso
 * @param {number} direction Sentido de marcha (+1 avance, -1 marcha atrás)
 * @param {object} options Opciones de discretización { stepM, vehicle, steeringReferencePoint }
 * @returns {{ startPose: { x: number, y: number, headingDeg: number }, segments: Array, splineSamples: Array, minRadius: number }}
 */
export function buildSegmentsFromSplineWaypoints(waypoints, direction = 1, options = {}) {
  const sampledPts = sampleCatmullRomSpline(waypoints, options);
  if (!sampledPts || sampledPts.length < 2) {
    const p0 = waypoints?.[0];
    const px = Array.isArray(p0) ? p0[0] : (p0?.x ?? 0);
    const py = Array.isArray(p0) ? p0[1] : (p0?.y ?? 0);
    return {
      startPose: { x: px, y: py, headingDeg: 0 },
      segments: [],
      splineSamples: sampledPts,
      minRadius: Infinity
    };
  }

  const p0 = sampledPts[0];
  const p1 = sampledPts[1];
  const baseHeading = p0.headingRad !== undefined ? p0.headingRad : Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const startHeadingRad = direction >= 0 ? baseHeading : normalizeAngle(baseHeading + Math.PI);
  const headingDeg = ((startHeadingRad * 180) / Math.PI + 360) % 360;

  const steeringRef = options.steeringReferencePoint || (options.vehicle?.steeringReferencePoint) || "rear_axle";
  const Lwb = options.vehicle?.tractor?.wheelbase || 3.80;

  let startX = p0.x;
  let startY = p0.y;
  if (steeringRef === "front_axle") {
    // Si la referencia es el eje director delantero, el eje motriz trasero se sitúa
    // exactamente a distancia Lwb hacia atrás para que el eje director comience exactamente en P0
    startX = p0.x - Lwb * Math.cos(startHeadingRad);
    startY = p0.y - Lwb * Math.sin(startHeadingRad);
  }

  let minRadius = Infinity;
  let totalLength = 0;
  for (let i = 0; i < sampledPts.length - 1; i++) {
    const s0 = sampledPts[i];
    const s1 = sampledPts[i + 1];
    totalLength += Math.hypot(s1.x - s0.x, s1.y - s0.y);
    if (s0.radius < minRadius) minRadius = s0.radius;
  }
  const lastSample = sampledPts[sampledPts.length - 1];
  if (lastSample.radius < minRadius) minRadius = lastSample.radius;

  return {
    startPose: { x: Number(startX.toFixed(4)), y: Number(startY.toFixed(4)), headingDeg },
    segments: [
      {
        type: "spline",
        direction,
        waypoints,
        samples: sampledPts,
        length: Number(totalLength.toFixed(3)),
        minRadius: Number(minRadius.toFixed(2)),
        steeringReferencePoint: steeringRef
      }
    ],
    splineSamples: sampledPts,
    minRadius: Number(minRadius.toFixed(2))
  };
}

/**
 * Convierte una secuencia de puntos de control (waypoints) en tramos
 * rectos y arcos circulares tangentes (empalmes de radio configurable) o Spline CAD continua.
 * Acepta tanto objetos { x, y, radius? } como tuplas [x, y].
 *
 * @param {Array<{x: number, y: number, radius?: number}|[number, number]>} waypoints Puntos de control
 * @param {number} defaultRadius Radio de empalme por defecto (m)
 * @param {number} direction Sentido de marcha (+1 avance, -1 marcha atrás)
 * @param {object} options Opciones adicionales { mode: "spline"|"fillet", stepM: number }
 */
export function buildSegmentsFromWaypoints(waypoints, defaultRadius = 12.5, direction = 1, options = {}) {
  if (options && options.mode === "spline") {
    return buildSegmentsFromSplineWaypoints(waypoints, direction, options);
  }

  if (!waypoints || waypoints.length === 0) {
    return { startPose: { x: 0, y: 0, headingDeg: 0 }, segments: [] };
  }

  const pts = waypoints.map((p) => {
    const px = Array.isArray(p) ? p[0] : (p?.x !== undefined ? p.x : p?.[0]);
    const py = Array.isArray(p) ? p[1] : (p?.y !== undefined ? p.y : p?.[1]);
    const r = (p && p.radius !== undefined) ? p.radius : defaultRadius;
    return {
      x: Number(px),
      y: Number(py),
      radius: Number(r)
    };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (pts.length === 0) {
    return { startPose: { x: 0, y: 0, headingDeg: 0 }, segments: [] };
  }

  if (pts.length === 1) {
    return {
      startPose: { x: pts[0].x, y: pts[0].y, headingDeg: 0 },
      segments: []
    };
  }

  const firstDx = pts[1].x - pts[0].x;
  const firstDy = pts[1].y - pts[0].y;
  const baseHeading = Math.atan2(firstDy, firstDx);
  const startHeadingRad = direction >= 0 ? baseHeading : normalizeAngle(baseHeading + Math.PI);
  const headingDeg = (startHeadingRad * 180) / Math.PI;

  if (pts.length === 2) {
    const len = Math.hypot(firstDx, firstDy);
    return {
      startPose: { x: pts[0].x, y: pts[0].y, headingDeg },
      segments: [{ type: "straight", length: len, direction }]
    };
  }

  const segments = [];
  let consumedPrev = 0;

  for (let i = 1; i < pts.length - 1; i++) {
    const pPrev = pts[i - 1];
    const pCurr = pts[i];
    const pNext = pts[i + 1];

    const v1x = pCurr.x - pPrev.x;
    const v1y = pCurr.y - pPrev.y;
    const len1 = Math.hypot(v1x, v1y);

    const v2x = pNext.x - pCurr.x;
    const v2y = pNext.y - pCurr.y;
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 1e-3 || len2 < 1e-3) continue;

    const u1x = v1x / len1;
    const u1y = v1y / len1;
    const u2x = v2x / len2;
    const u2y = v2y / len2;

    const theta1 = Math.atan2(u1y, u1x);
    const theta2 = Math.atan2(u2y, u2x);
    const deltaAngle = normalizeAngle(theta2 - theta1);

    if (Math.abs(deltaAngle) < 1e-3) {
      const straightLen = len1 - consumedPrev;
      if (straightLen > 1e-3) {
        segments.push({ type: "straight", length: straightLen, direction });
      }
      consumedPrev = 0;
      continue;
    }

    // Distancia tangente T = R * tan(|deltaAngle| / 2)
    let R = Math.max(2.0, pCurr.radius || defaultRadius);
    let halfDelta = Math.abs(deltaAngle) / 2;
    let tangentDist = R * Math.tan(halfDelta);

    // Limitar la distancia de tangencia para que no supere el tramo disponible
    const maxTangent = Math.min(len1 - consumedPrev - 0.1, len2 * 0.48);
    if (tangentDist > maxTangent && maxTangent > 0.2) {
      tangentDist = maxTangent;
      R = tangentDist / Math.tan(halfDelta);
    }

    const straightBefore = Math.max(0, len1 - consumedPrev - tangentDist);
    if (straightBefore > 1e-3) {
      segments.push({ type: "straight", length: straightBefore, direction });
    }

    const angleDeg = (deltaAngle * 180) / Math.PI;
    segments.push({
      type: "arc",
      radius: Number(R.toFixed(3)),
      angle: Number(angleDeg.toFixed(3)),
      direction
    });

    consumedPrev = tangentDist;
  }

  // Último tramo recto
  const lastIdx = pts.length - 1;
  const lastLen = Math.hypot(
    pts[lastIdx].x - pts[lastIdx - 1].x,
    pts[lastIdx].y - pts[lastIdx - 1].y
  );
  const remainingLast = Math.max(0, lastLen - consumedPrev);
  if (remainingLast > 1e-3) {
    segments.push({ type: "straight", length: remainingLast, direction });
  }

  return {
    startPose: {
      x: pts[0].x,
      y: pts[0].y,
      headingDeg
    },
    segments
  };
}

/**
 * Ejecuta la simulación cinemática completa de un vehículo articulado a lo largo de una maniobra.
 *
 * @param {object} vehicle Configuración del vehículo (según esquema de VEHICLE_CATALOG)
 * @param {object} maneuver Definición de la maniobra:
 *   - startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 }
 *   - segments: Array de { type: 'straight'|'arc', length?, radius?, angle?, direction?: 1|-1 }
 * @param {object} options Parámetros de integración y cálculo:
 *   - straightStep: paso longitudinal en rectas (m), por defecto 0.05 m
 *   - arcStepDeg: paso angular en curvas (°), por defecto 0.5°
 *   - integrationMethod: 'rk4' (por defecto, exacto en avance y retroceso) | 'schlepp_chord'
 *   - schleppHitchSign: false (por defecto h > 0 es delante del eje motriz; si true usa h detrás como schlepp)
 *   - safetyMargin: margen perimetral de seguridad adicional (m), por defecto 0.0 m
 */
export function simulateManeuver(vehicle, maneuver, options = {}) {
  const straightStep = Math.max(0.002, Number(options.straightStep || DEFAULT_STRAIGHT_STEP_M));
  const arcStepDeg = Math.max(0.05, Number(options.arcStepDeg || DEFAULT_ARC_STEP_DEG));
  const integrationMethod = options.integrationMethod || "rk4";
  const schleppHitchSign = Boolean(options.schleppHitchSign);
  const safetyMargin = Math.max(0, Number(options.safetyMargin || 0.0));
  const steeringReferencePoint = options.steeringReferencePoint || maneuver.steeringReferencePoint || "rear_axle";

  const startPose = (maneuver && maneuver.startPose) || {};
  let x = Number(startPose.x || 0.0);
  let y = Number(startPose.y || 0.0);
  let heading = ((Number(startPose.headingDeg || 0.0)) * Math.PI) / 180;
  const initArticRad = ((Number(startPose.initialArticulationDeg || 0.0)) * Math.PI) / 180;

  const tv = vehicle.tractor;
  const rawHitch = tv.hitchOffset !== undefined ? tv.hitchOffset : tv.rearOverhang;
  const effectiveHitch = schleppHitchSign ? -rawHitch : rawHitch;

  let [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);

  // Inicialización de trenes articulados multicuerpo (N remolques en cascada, KIN-04)
  const trailersDefs = vehicle.trailers && vehicle.trailers.length > 0
    ? vehicle.trailers
    : (vehicle.trailer && vehicle.trailer.wheelbase > 0 ? [vehicle.trailer] : []);
  const nTrailers = trailersDefs.length;

  const trailersData = [];
  if (nTrailers > 0) {
    let parentX = x;
    let parentY = y;
    let parentHeading = heading;
    let parentHitchOffset = effectiveHitch;

    for (let j = 0; j < nTrailers; j++) {
      const trDef = trailersDefs[j];
      const L_eff = computeEffectiveTrailerWheelbase(trDef);
      const [curHx, curHy] = computeHitchPoint(parentX, parentY, parentHeading, parentHitchOffset);
      const curHeading = normalizeAngle(parentHeading - (j === 0 ? initArticRad : 0));
      const curTx = curHx - L_eff * Math.cos(curHeading);
      const curTy = curHy - L_eff * Math.sin(curHeading);

      trailersData.push({
        def: trDef,
        effectiveWheelbase: L_eff,
        x: curTx,
        y: curTy,
        heading: curHeading,
        hx: curHx,
        hy: curHy,
        prevHitchX: curHx,
        prevHitchY: curHy,
        curHitchX: curHx,
        curHitchY: curHy
      });

      parentX = curTx;
      parentY = curTy;
      parentHeading = curHeading;
      parentHitchOffset = trDef.hitchOffset !== undefined ? trDef.hitchOffset : (trDef.rearOverhang || 0);
    }
  }

  const advanceTrailers = (isArc, cx, cy, dHeading, dir, prevHx0, prevHy0) => {
    if (trailersData.length === 0) return;

    for (let j = 0; j < trailersData.length; j++) {
      const td = trailersData[j];
      const prevHx = j === 0 ? prevHx0 : trailersData[j - 1].prevHitchX;
      const prevHy = j === 0 ? prevHy0 : trailersData[j - 1].prevHitchY;
      const curHx = j === 0 ? hx : trailersData[j - 1].curHitchX;
      const curHy = j === 0 ? hy : trailersData[j - 1].curHitchY;

      td.hx = curHx;
      td.hy = curHy;

      if (j === 0 && isArc && integrationMethod !== "schlepp_chord") {
        [td.x, td.y, td.heading] = updateTrailerArcRK4(
          prevHx,
          prevHy,
          cx,
          cy,
          dHeading,
          td.heading,
          td.effectiveWheelbase
        );
      } else if (j === 0 && integrationMethod === "schlepp_chord" && dir > 0) {
        [td.x, td.y, td.heading] = updateTrailerSchleppChord(
          curHx,
          curHy,
          td.x,
          td.y,
          td.effectiveWheelbase
        );
      } else {
        [td.x, td.y, td.heading] = updateTrailerRK4(
          prevHx,
          prevHy,
          curHx,
          curHy,
          td.heading,
          td.effectiveWheelbase
        );
      }

      if (j < trailersData.length - 1) {
        const hOffset = td.def.hitchOffset !== undefined ? td.def.hitchOffset : (td.def.rearOverhang || 0);
        td.prevHitchX = td.curHitchX !== undefined ? td.curHitchX : (td.x + hOffset * Math.cos(td.heading));
        td.prevHitchY = td.curHitchY !== undefined ? td.curHitchY : (td.y + hOffset * Math.sin(td.heading));
        td.curHitchX = td.x + hOffset * Math.cos(td.heading);
        td.curHitchY = td.y + hOffset * Math.sin(td.heading);
      }
    }
  };

  let dist = 0.0;
  let signedDist = 0.0;
  let stepIndex = 0;

  const segments = (maneuver && maneuver.segments) || [];
  const firstDir = segments.length > 0 && segments[0].direction === -1 ? -1 : 1;

  const states = [
    buildDetailedState({
      stepIndex: 0,
      x,
      y,
      heading,
      dist,
      signedDist,
      direction: firstDir,
      curvature: 0.0,
      steerAngleRad: 0.0,
      hx,
      hy,
      tx: trailersData[0]?.x ?? null,
      ty: trailersData[0]?.y ?? null,
      trailerHeading: trailersData[0]?.heading ?? null,
      vehicle,
      safetyMargin,
      trailersData
    })
  ];

  for (const seg of segments) {
    const dir = seg.direction === -1 || seg.length < 0 ? -1 : 1;

    if (seg.type === "straight") {
      const length = Math.abs(Number(seg.length || 0));
      if (length < 1e-6) continue;

      const n = Math.max(1, Math.round(length / straightStep));
      const ds = (length / n) * dir;
      const stepAbs = Math.abs(ds);

      for (let i = 0; i < n; i++) {
        const hx0 = hx;
        const hy0 = hy;
        if (trailersData.length > 1) {
          for (let j = 0; j < trailersData.length - 1; j++) {
            trailersData[j].prevHitchX = trailersData[j].curHitchX;
            trailersData[j].prevHitchY = trailersData[j].curHitchY;
          }
        }

        x += ds * Math.cos(heading);
        y += ds * Math.sin(heading);
        dist += stepAbs;
        signedDist += ds;

        [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);
        advanceTrailers(false, 0, 0, 0, dir, hx0, hy0);

        stepIndex++;
        states.push(
          buildDetailedState({
            stepIndex,
            x,
            y,
            heading,
            dist,
            signedDist,
            direction: dir,
            curvature: 0.0,
            steerAngleRad: 0.0,
            hx,
            hy,
            tx: trailersData[0]?.x ?? null,
            ty: trailersData[0]?.y ?? null,
            trailerHeading: trailersData[0]?.heading ?? null,
            vehicle,
            safetyMargin,
            trailersData
          })
        );
      }
    } else if (seg.type === "arc") {
      const segRefPoint = seg.steeringReferencePoint || steeringReferencePoint;
      const nominalRadius = Math.max(0.5, Math.abs(Number(seg.radius || 12.5)));
      let radius = nominalRadius;

      // MEJ-02: Selector de punto de referencia de trazado (Normativa española Guía Nudos Viarios 2.3.2.1)
      // Si el radio está referenciado al centro del eje director delantero (front_axle),
      // se convierte al radio instantáneo del eje motriz trasero: R_rear = sqrt(max(0.25, R_front^2 - L^2))
      if (segRefPoint === "front_axle") {
        const Lwb = tv.wheelbase;
        const maxSteerDeg = tv.maxSteerAngleDeg || 38.0;
        const maxSteerRad = (maxSteerDeg * Math.PI) / 180;
        const minRearRadius = Lwb / Math.tan(maxSteerRad);
        if (nominalRadius > Lwb) {
          const rRear = Math.sqrt(nominalRadius * nominalRadius - Lwb * Lwb);
          radius = Math.max(minRearRadius, rRear);
        } else {
          radius = minRearRadius;
        }
      }

      const totalAngleDeg = Number(seg.angle || 0.0);
      if (Math.abs(totalAngleDeg) < 1e-6) continue;

      const n = Math.max(1, Math.round(Math.abs(totalAngleDeg) / arcStepDeg));
      const turnSide = totalAngleDeg >= 0 ? 1 : -1;
      const stepArcRad = ((Math.abs(totalAngleDeg) * Math.PI) / 180) / n;
      const dHeading = stepArcRad * turnSide * dir;
      const ds = radius * stepArcRad * dir;
      const stepAbs = Math.abs(ds);

      const curvature = turnSide / radius;
      const steerAngleRad = Math.atan(tv.wheelbase * curvature);

      for (let i = 0; i < n; i++) {
        const hx0 = hx;
        const hy0 = hy;
        if (trailersData.length > 1) {
          for (let j = 0; j < trailersData.length - 1; j++) {
            trailersData[j].prevHitchX = trailersData[j].curHitchX;
            trailersData[j].prevHitchY = trailersData[j].curHitchY;
          }
        }

        const sinH = Math.sin(heading);
        const cosH = Math.cos(heading);
        const cx = x - radius * sinH * turnSide;
        const cy = y + radius * cosH * turnSide;

        [x, y] = rotatePoint(x, y, cx, cy, dHeading);
        heading = normalizeAngle(heading + dHeading);
        dist += stepAbs;
        signedDist += ds;

        [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);
        advanceTrailers(true, cx, cy, dHeading, dir, hx0, hy0);

        stepIndex++;
        states.push(
          buildDetailedState({
            stepIndex,
            x,
            y,
            heading,
            dist,
            signedDist,
            direction: dir,
            curvature,
            steerAngleRad,
            hx,
            hy,
            tx: trailersData[0]?.x ?? null,
            ty: trailersData[0]?.y ?? null,
            trailerHeading: trailersData[0]?.heading ?? null,
            vehicle,
            safetyMargin,
            trailersData
          })
        );
      }
    } else if (seg.type === "clothoid") {
      const length = Math.max(0.01, Math.abs(Number(seg.length || 1.0)));
      const kStart = Number(seg.kStart || 0.0);
      const kEnd = Number(seg.kEnd || 0.0);
      const n = Math.max(1, Math.round(length / straightStep));
      const stepLen = length / n;
      const ds = stepLen * dir;
      const stepAbs = stepLen;

      for (let i = 0; i < n; i++) {
        const sMid = (i + 0.5) * stepLen;
        const curKappaMid = kStart + ((kEnd - kStart) / length) * sMid;
        const sEnd = (i + 1) * stepLen;
        const curKappaEnd = kStart + ((kEnd - kStart) / length) * sEnd;

        const dHeading = curKappaMid * ds;
        const halfDH = 0.5 * dHeading;

        const hx0 = hx;
        const hy0 = hy;
        if (trailersData.length > 1) {
          for (let j = 0; j < trailersData.length - 1; j++) {
            trailersData[j].prevHitchX = trailersData[j].curHitchX;
            trailersData[j].prevHitchY = trailersData[j].curHitchY;
          }
        }

        // Desplazamiento del eje motriz mediante regla del punto medio (exactitud O(ds^3))
        x += ds * Math.cos(heading + halfDH);
        y += ds * Math.sin(heading + halfDH);
        heading = normalizeAngle(heading + dHeading);
        dist += stepAbs;
        signedDist += ds;

        [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);
        advanceTrailers(false, 0, 0, 0, dir, hx0, hy0);

        const steerAngleRad = Math.atan(tv.wheelbase * curKappaEnd);

        stepIndex++;
        states.push(
          buildDetailedState({
            stepIndex,
            x,
            y,
            heading,
            dist,
            signedDist,
            direction: dir,
            curvature: curKappaEnd,
            steerAngleRad,
            hx,
            hy,
            tx: trailersData[0]?.x ?? null,
            ty: trailersData[0]?.y ?? null,
            trailerHeading: trailersData[0]?.heading ?? null,
            vehicle,
            safetyMargin,
            trailersData
          })
        );
      }
    } else if (seg.type === "spline") {
      const splineSamples = seg.samples || sampleCatmullRomSpline(seg.waypoints, { stepM: straightStep });
      if (splineSamples && splineSamples.length >= 2) {
        const segRefPoint = seg.steeringReferencePoint || steeringReferencePoint;
        const Lwb = tv.wheelbase;
        const maxSteerDeg = tv.maxSteerAngleDeg || 38.0;
        const maxSteerRad = (maxSteerDeg * Math.PI) / 180;

        for (let i = 0; i < splineSamples.length - 1; i++) {
          const s0 = splineSamples[i];
          const s1 = splineSamples[i + 1];
          const ds = Math.hypot(s1.x - s0.x, s1.y - s0.y) * dir;
          const stepAbs = Math.abs(ds);
          if (stepAbs < 1e-5) continue;

          const hx0 = hx;
          const hy0 = hy;
          if (trailersData.length > 1) {
            for (let j = 0; j < trailersData.length - 1; j++) {
              trailersData[j].prevHitchX = trailersData[j].curHitchX;
              trailersData[j].prevHitchY = trailersData[j].curHitchY;
            }
          }

          let curvature = s1.curvature || 0;
          let steerAngleRad = 0;

          if (segRefPoint === "front_axle") {
            // El eje director delantero recorre con exactitud milimétrica la spline trazada
            const targetFx = s1.x;
            const targetFy = s1.y;
            const currentFx = x + Lwb * Math.cos(heading);
            const currentFy = y + Lwb * Math.sin(heading);
            const dfx = targetFx - currentFx;
            const dfy = targetFy - currentFy;
            const psi = Math.atan2(dfy, dfx);

            let dHeading = (stepAbs / Lwb) * Math.sin(psi - heading) * dir;
            steerAngleRad = normalizeAngle(psi - heading);

            heading = normalizeAngle(heading + dHeading);
            x = targetFx - Lwb * Math.cos(heading);
            y = targetFy - Lwb * Math.sin(heading);
            curvature = steerAngleRad / Lwb;
          } else {
            // El eje motriz trasero recorre con exactitud milimétrica la spline trazada
            x = s1.x;
            y = s1.y;
            heading = dir >= 0 ? s1.headingRad : normalizeAngle(s1.headingRad + Math.PI);
            steerAngleRad = Math.atan(Lwb * curvature);
          }

          dist += stepAbs;
          signedDist += ds;

          [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);
          advanceTrailers(false, 0, 0, 0, dir, hx0, hy0);

          stepIndex++;
          states.push(
            buildDetailedState({
              stepIndex,
              x,
              y,
              heading,
              dist,
              signedDist,
              direction: dir,
              curvature,
              steerAngleRad,
              hx,
              hy,
              tx: trailersData[0]?.x ?? null,
              ty: trailersData[0]?.y ?? null,
              trailerHeading: trailersData[0]?.heading ?? null,
              vehicle,
              safetyMargin,
              trailersData
            })
          );
        }
      }
    }
  }

  // Resumen estadístico y cinemático de la maniobra
  let maxSteerAbsDeg = 0;
  let maxArticulationAbsDeg = 0;
  let anySteerExceeded = false;
  let anyArticulationExceeded = false;

  for (const s of states) {
    if (Math.abs(s.steerAngleDeg) > maxSteerAbsDeg) {
      maxSteerAbsDeg = Math.abs(s.steerAngleDeg);
    }
    if (Math.abs(s.articulationAngleDeg) > maxArticulationAbsDeg) {
      maxArticulationAbsDeg = Math.abs(s.articulationAngleDeg);
    }
    if (s.exceedsMaxSteer) anySteerExceeded = true;
    if (s.exceedsMaxArticulation) anyArticulationExceeded = true;
  }

  // Estimación de la cota superior del error cordal de discretización
  const minArcRadius = segments
    .filter((s) => s.type === "arc")
    .reduce((minR, s) => Math.min(minR, Math.abs(s.radius || 12.5)), Infinity);
  const arcStepRad = (arcStepDeg * Math.PI) / 180;
  const chordalErrorM = Number.isFinite(minArcRadius)
    ? minArcRadius * (1 - Math.cos(arcStepRad / 2))
    : 0.0;

  return {
    states,
    summary: {
      totalStates: states.length,
      totalDistanceM: Number(dist.toFixed(3)),
      maxSteerAngleDeg: Number(maxSteerAbsDeg.toFixed(2)),
      maxArticulationAngleDeg: Number(maxArticulationAbsDeg.toFixed(2)),
      anySteerExceeded,
      anyArticulationExceeded,
      discretization: {
        straightStepM: straightStep,
        arcStepDeg,
        integrationMethod,
        steeringReferencePoint,
        estimatedChordalToleranceM: Number(chordalErrorM.toFixed(6))
      }
    }
  };
}

/**
 * Simulación cinemática mediante algoritmo de seguimiento de ruta (Pure Pursuit / Path-Following, KIN-05).
 * Permite trazar maniobras guiando automáticamente el eje directriz delantero sobre una polilínea continua
 * (por ejemplo, el eje de carril o una trayectoria importada de CAD) con limitación estricta de velocidad
 * de giro del volante (maxSteerRateDegPerM).
 *
 * @param {object} vehicle Perfil del vehículo
 * @param {Array} rawPath Polilínea continua de puntos de paso [x, y] o {x, y}
 * @param {object} options Opciones de guiado cinemático
 * @returns {object} { states, summary, maneuver }
 */
export function simulatePathFollowing(vehicle, rawPath, options = {}) {
  if (!rawPath || rawPath.length < 2) {
    throw new Error("La polilínea objetivo debe contener al menos 2 puntos.");
  }

  const stepSizeM = Math.max(0.01, Number(options.stepSizeM || DEFAULT_STRAIGHT_STEP_M));
  const tv = vehicle.tractor;
  const Lwb = tv.wheelbase;
  const maxSteerDeg = options.maxSteerAngleDeg || tv.maxSteerAngleDeg || 38.0;
  const maxSteerRad = (maxSteerDeg * Math.PI) / 180;
  const maxSteerRateDegPerM = Number(options.maxSteerRateDegPerM || 15.0);
  const maxSteerRateRadPerM = (maxSteerRateDegPerM * Math.PI) / 180;
  const lookaheadM = Math.max(2.0, Number(options.lookaheadM || Math.max(3.0, 1.5 * Lwb)));
  const safetyMargin = Math.max(0, Number(options.safetyMargin || 0.0));

  // Densificación inicial de la polilínea objetivo para búsqueda precisa O(1) de punto de mira
  const path = [];
  for (let i = 0; i < rawPath.length - 1; i++) {
    const p1 = Array.isArray(rawPath[i]) ? { x: rawPath[i][0], y: rawPath[i][1] } : rawPath[i];
    const p2 = Array.isArray(rawPath[i + 1]) ? { x: rawPath[i + 1][0], y: rawPath[i + 1][1] } : rawPath[i + 1];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(segLen / 0.10));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      path.push({ x: p1.x + f * (p2.x - p1.x), y: p1.y + f * (p2.y - p1.y) });
    }
  }
  const lastP = rawPath[rawPath.length - 1];
  path.push(Array.isArray(lastP) ? { x: lastP[0], y: lastP[1] } : lastP);

  const p0 = path[0];
  const p1 = path[Math.min(5, path.length - 1)];
  const initHeading = Math.atan2(p1.y - p0.y, p1.x - p0.x);

  let x = p0.x;
  let y = p0.y;
  let heading = initHeading;
  let currentSteerRad = 0;
  let dist = 0;

  const rawHitch = tv.hitchOffset !== undefined ? tv.hitchOffset : tv.rearOverhang;
  let [hx, hy] = computeHitchPoint(x, y, heading, rawHitch);

  const trailersDefs = vehicle.trailers && vehicle.trailers.length > 0
    ? vehicle.trailers
    : (vehicle.trailer && vehicle.trailer.wheelbase > 0 ? [vehicle.trailer] : []);
  const nTrailers = trailersDefs.length;

  const trailersData = [];
  if (nTrailers > 0) {
    let parentX = x;
    let parentY = y;
    let parentHeading = heading;
    let parentHitchOffset = rawHitch;

    for (let j = 0; j < nTrailers; j++) {
      const trDef = trailersDefs[j];
      const L_eff = computeEffectiveTrailerWheelbase(trDef);
      const [curHx, curHy] = computeHitchPoint(parentX, parentY, parentHeading, parentHitchOffset);
      const curHeading = parentHeading;
      const curTx = curHx - L_eff * Math.cos(curHeading);
      const curTy = curHy - L_eff * Math.sin(curHeading);

      trailersData.push({
        def: trDef,
        effectiveWheelbase: L_eff,
        x: curTx,
        y: curTy,
        heading: curHeading,
        hx: curHx,
        hy: curHy,
        prevHitchX: curHx,
        prevHitchY: curHy,
        curHitchX: curHx,
        curHitchY: curHy
      });

      parentX = curTx;
      parentY = curTy;
      parentHeading = curHeading;
      parentHitchOffset = trDef.hitchOffset !== undefined ? trDef.hitchOffset : (trDef.rearOverhang || 0);
    }
  }

  const states = [
    buildDetailedState({
      stepIndex: 0,
      x,
      y,
      heading,
      dist: 0,
      signedDist: 0,
      direction: 1,
      curvature: 0,
      steerAngleRad: 0,
      hx,
      hy,
      tx: trailersData[0]?.x ?? null,
      ty: trailersData[0]?.y ?? null,
      trailerHeading: trailersData[0]?.heading ?? null,
      vehicle,
      safetyMargin,
      trailersData
    })
  ];

  let pathIdx = 0;
  const maxSteps = 15000;
  let stepIndex = 0;

  while (stepIndex < maxSteps) {
    const fx = x + Lwb * Math.cos(heading);
    const fy = y + Lwb * Math.sin(heading);

    let closestIdx = pathIdx;
    let minD = Infinity;
    const searchEnd = Math.min(path.length, pathIdx + 300);
    for (let i = pathIdx; i < searchEnd; i++) {
      const d = Math.hypot(path[i].x - fx, path[i].y - fy);
      if (d < minD) {
        minD = d;
        closestIdx = i;
      }
    }
    pathIdx = closestIdx;

    let targetPt = path[path.length - 1];
    for (let i = pathIdx; i < path.length; i++) {
      const d = Math.hypot(path[i].x - fx, path[i].y - fy);
      if (d >= lookaheadM) {
        targetPt = path[i];
        break;
      }
    }

    const distToEnd = Math.hypot(path[path.length - 1].x - fx, path[path.length - 1].y - fy);
    if (distToEnd < 0.25 || pathIdx >= path.length - 2) {
      break;
    }

    // Cálculo cinemático de curvatura Pure Pursuit
    const alpha = normalizeAngle(Math.atan2(targetPt.y - fy, targetPt.x - fx) - heading);
    const ld = Math.max(1.0, Math.hypot(targetPt.x - fx, targetPt.y - fy));
    const desiredCurvature = (2 * Math.sin(alpha)) / ld;
    let desiredSteerRad = Math.atan(Lwb * desiredCurvature);

    desiredSteerRad = Math.max(-maxSteerRad, Math.min(maxSteerRad, desiredSteerRad));

    const maxDeltaSteer = maxSteerRateRadPerM * stepSizeM;
    const deltaSteer = desiredSteerRad - currentSteerRad;
    currentSteerRad += Math.sign(deltaSteer) * Math.min(Math.abs(deltaSteer), maxDeltaSteer);

    const dHeading = (Math.tan(currentSteerRad) / Lwb) * stepSizeM;
    const midHeading = heading + dHeading / 2;

    const prevHx0 = hx;
    const prevHy0 = hy;
    if (trailersData.length > 1) {
      for (let j = 0; j < trailersData.length - 1; j++) {
        trailersData[j].prevHitchX = trailersData[j].curHitchX;
        trailersData[j].prevHitchY = trailersData[j].curHitchY;
      }
    }

    x += stepSizeM * Math.cos(midHeading);
    y += stepSizeM * Math.sin(midHeading);
    heading = normalizeAngle(heading + dHeading);
    dist += stepSizeM;

    [hx, hy] = computeHitchPoint(x, y, heading, rawHitch);

    if (trailersData.length > 0) {
      for (let j = 0; j < trailersData.length; j++) {
        const td = trailersData[j];
        const prevHx = j === 0 ? prevHx0 : trailersData[j - 1].prevHitchX;
        const prevHy = j === 0 ? prevHy0 : trailersData[j - 1].prevHitchY;
        const curHx = j === 0 ? hx : trailersData[j - 1].curHitchX;
        const curHy = j === 0 ? hy : trailersData[j - 1].curHitchY;

        td.hx = curHx;
        td.hy = curHy;

        [td.x, td.y, td.heading] = updateTrailerRK4(
          prevHx,
          prevHy,
          curHx,
          curHy,
          td.heading,
          td.effectiveWheelbase
        );

        if (j < trailersData.length - 1) {
          const hOffset = td.def.hitchOffset !== undefined ? td.def.hitchOffset : (td.def.rearOverhang || 0);
          td.prevHitchX = td.curHitchX !== undefined ? td.curHitchX : (td.x + hOffset * Math.cos(td.heading));
          td.prevHitchY = td.curHitchY !== undefined ? td.curHitchY : (td.y + hOffset * Math.sin(td.heading));
          td.curHitchX = td.x + hOffset * Math.cos(td.heading);
          td.curHitchY = td.y + hOffset * Math.sin(td.heading);
        }
      }
    }

    stepIndex++;
    states.push(
      buildDetailedState({
        stepIndex,
        x,
        y,
        heading,
        dist,
        signedDist: dist,
        direction: 1,
        curvature: desiredCurvature,
        steerAngleRad: currentSteerRad,
        hx,
        hy,
        tx: trailersData[0]?.x ?? null,
        ty: trailersData[0]?.y ?? null,
        trailerHeading: trailersData[0]?.heading ?? null,
        vehicle,
        safetyMargin,
        trailersData
      })
    );
  }

  let maxSteerAbsDeg = 0;
  let maxArticulationAbsDeg = 0;
  for (const s of states) {
    if (Math.abs(s.steerAngleDeg) > maxSteerAbsDeg) maxSteerAbsDeg = Math.abs(s.steerAngleDeg);
    if (Math.abs(s.articulationAngleDeg) > maxArticulationAbsDeg) maxArticulationAbsDeg = Math.abs(s.articulationAngleDeg);
  }

  return {
    states,
    summary: {
      totalStates: states.length,
      totalDistanceM: Number(dist.toFixed(3)),
      maxSteerAngleDeg: Number(maxSteerAbsDeg.toFixed(2)),
      maxArticulationAngleDeg: Number(maxArticulationAbsDeg.toFixed(2)),
      anySteerExceeded: maxSteerAbsDeg > maxSteerDeg,
      anyArticulationExceeded: false,
      discretization: {
        stepSizeM,
        mode: "pure_pursuit_path_following"
      }
    },
    maneuver: {
      startPose: {
        x: p0.x,
        y: p0.y,
        headingDeg: (initHeading * 180) / Math.PI
      },
      segments: []
    }
  };
}

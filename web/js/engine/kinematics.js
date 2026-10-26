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
export function computeBodyPolygon(rx, ry, heading, segment, safetyMargin = 0.0) {
  const lFront = segment.wheelbase + segment.frontOverhang + safetyMargin;
  const lRear = segment.rearOverhang + safetyMargin;
  const halfW = segment.width / 2 + safetyMargin;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  const localCorners = [
    [-lRear, -halfW], // Trasero derecho
    [-lRear, +halfW], // Trasero izquierdo
    [+lFront, +halfW], // Delantero izquierdo
    [+lFront, -halfW]  // Delantero derecho
  ];

  return localCorners.map(([lx, ly]) => [
    rx + lx * cosH - ly * sinH,
    ry + lx * sinH + ly * cosH
  ]);
}

/**
 * Calcula los extremos izquierdo y derecho de un eje centrado en (ax, ay) con orientación heading.
 */
export function computeAxleEndpoints(ax, ay, heading, width) {
  const halfW = width / 2;
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  return {
    center: [ax, ay],
    left: [ax - halfW * sinH, ay + halfW * cosH],
    right: [ax + halfW * sinH, ay - halfW * cosH]
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

  const deriv = (th) => (-dhx * Math.sin(th) + dhy * Math.cos(th)) / trailerWheelbase;

  const k1 = deriv(trailerHeading0);
  const k2 = deriv(trailerHeading0 + 0.5 * k1);
  const k3 = deriv(trailerHeading0 + 0.5 * k2);
  const k4 = deriv(trailerHeading0 + k3);

  const newHeading = normalizeAngle(trailerHeading0 + (k1 + 2 * k2 + 2 * k3 + k4) / 6);
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
  safetyMargin = 0.0
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

  const tractorFrontAxle = computeAxleEndpoints(frontAxleX, frontAxleY, heading, trackFront);
  const tractorRearAxle = computeAxleEndpoints(x, y, heading, trackRear);
  const tractorPoly = computeBodyPolygon(x, y, heading, tv, 0.0);
  const tractorMarginPoly = safetyMargin > 0 ? computeBodyPolygon(x, y, heading, tv, safetyMargin) : tractorPoly;

  let trailerPoly = null;
  let trailerMarginPoly = null;
  let trailerAxles = [];
  let articulationAngleRad = 0;

  if (tr && tx !== null && ty !== null && trailerHeading !== null) {
    articulationAngleRad = normalizeAngle(heading - trailerHeading);
    trailerPoly = computeBodyPolygon(tx, ty, trailerHeading, tr, 0.0);
    trailerMarginPoly = safetyMargin > 0 ? computeBodyPolygon(tx, ty, trailerHeading, tr, safetyMargin) : trailerPoly;

    const cosT = Math.cos(trailerHeading);
    const sinT = Math.sin(trailerHeading);
    const trTrack = tr.trackWidth || tr.width;
    const spacing = tr.axleSpacing || 1.31;
    const offsets = tr.axleCount === 3 ? [spacing, 0, -spacing] : [0];

    trailerAxles = offsets.map((off) => {
      const ax = tx + off * cosT;
      const ay = ty + off * sinT;
      return computeAxleEndpoints(ax, ay, trailerHeading, trTrack);
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
    trailerMarginPolygon: trailerMarginPoly
  };
}

/**
 * Convierte una lista de puntos de paso (waypoints) 2D en una secuencia suave de tramos
 * rectos y arcos circulares tangentes (empalmes de radio configurable).
 * @param {Array<{x: number, y: number, radius?: number}>} waypoints Puntos de control
 * @param {number} defaultRadius Radio de empalme por defecto (m)
 * @param {number} direction Sentido de marcha (+1 avance, -1 marcha atrás)
 */
export function buildSegmentsFromWaypoints(waypoints, defaultRadius = 12.5, direction = 1) {
  if (!waypoints || waypoints.length < 2) {
    return { startPose: { x: 0, y: 0, headingDeg: 0 }, segments: [] };
  }

  const pts = waypoints.map((p) => ({
    x: Number(p.x),
    y: Number(p.y),
    radius: Number(p.radius || defaultRadius)
  }));

  const firstDx = pts[1].x - pts[0].x;
  const firstDy = pts[1].y - pts[0].y;
  const baseHeading = Math.atan2(firstDy, firstDx);
  const startHeadingRad = direction >= 0 ? baseHeading : normalizeAngle(baseHeading + Math.PI);

  if (pts.length === 2) {
    const len = Math.hypot(firstDx, firstDy);
    return {
      startPose: { x: pts[0].x, y: pts[0].y, headingDeg: (startHeadingRad * 180) / Math.PI },
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
      headingDeg: (startHeadingRad * 180) / Math.PI
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

  const startPose = (maneuver && maneuver.startPose) || {};
  let x = Number(startPose.x || 0.0);
  let y = Number(startPose.y || 0.0);
  let heading = ((Number(startPose.headingDeg || 0.0)) * Math.PI) / 180;
  const initArticRad = ((Number(startPose.initialArticulationDeg || 0.0)) * Math.PI) / 180;

  const tv = vehicle.tractor;
  const tr = vehicle.trailer;
  const hasTrailer = Boolean(tr && tr.wheelbase > 0);
  const rawHitch = tv.hitchOffset !== undefined ? tv.hitchOffset : tv.rearOverhang;
  const effectiveHitch = schleppHitchSign ? -rawHitch : rawHitch;

  let [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);
  let trailerHeading = hasTrailer ? normalizeAngle(heading - initArticRad) : null;
  let tx = hasTrailer ? hx - tr.wheelbase * Math.cos(trailerHeading) : null;
  let ty = hasTrailer ? hy - tr.wheelbase * Math.sin(trailerHeading) : null;

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
      tx,
      ty,
      trailerHeading,
      vehicle,
      safetyMargin
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

        x += ds * Math.cos(heading);
        y += ds * Math.sin(heading);
        dist += stepAbs;
        signedDist += ds;

        [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);

        if (hasTrailer) {
          if (integrationMethod === "schlepp_chord" && dir > 0) {
            [tx, ty, trailerHeading] = updateTrailerSchleppChord(hx, hy, tx, ty, tr.wheelbase);
          } else {
            [tx, ty, trailerHeading] = updateTrailerRK4(hx0, hy0, hx, hy, trailerHeading, tr.wheelbase);
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
            signedDist,
            direction: dir,
            curvature: 0.0,
            steerAngleRad: 0.0,
            hx,
            hy,
            tx,
            ty,
            trailerHeading,
            vehicle,
            safetyMargin
          })
        );
      }
    } else if (seg.type === "arc") {
      const radius = Math.max(0.5, Math.abs(Number(seg.radius || 12.5)));
      const totalAngleDeg = Number(seg.angle || 0.0);
      if (Math.abs(totalAngleDeg) < 1e-6) continue;

      const n = Math.max(1, Math.round(Math.abs(totalAngleDeg) / arcStepDeg));
      // En avance (dir = +1), angle > 0 gira a la izquierda (dHeading > 0).
      // En retroceso (dir = -1), un volante girado a la izquierda (curvatura +1/R) hace que al retroceder
      // el vehículo describa el arco en sentido horario (dHeading = -ds * kappa), o bien el usuario especifica
      // el ángulo barrido deseado. Mantenemos sign(angle) como el lado del centro de curvatura respecto a la tractora
      // (+1 centro a la izquierda de la cabina, -1 centro a la derecha de la cabina) y dir como el sentido longitudinal.
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

        const sinH = Math.sin(heading);
        const cosH = Math.cos(heading);
        const cx = x - radius * sinH * turnSide;
        const cy = y + radius * cosH * turnSide;

        [x, y] = rotatePoint(x, y, cx, cy, dHeading);
        heading = normalizeAngle(heading + dHeading);
        dist += stepAbs;
        signedDist += ds;

        [hx, hy] = computeHitchPoint(x, y, heading, effectiveHitch);

        if (hasTrailer) {
          if (integrationMethod === "schlepp_chord" && dir > 0) {
            [tx, ty, trailerHeading] = updateTrailerSchleppChord(hx, hy, tx, ty, tr.wheelbase);
          } else {
            [tx, ty, trailerHeading] = updateTrailerRK4(hx0, hy0, hx, hy, trailerHeading, tr.wheelbase);
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
            signedDist,
            direction: dir,
            curvature,
            steerAngleRad,
            hx,
            hy,
            tx,
            ty,
            trailerHeading,
            vehicle,
            safetyMargin
          })
        );
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
        estimatedChordalToleranceM: Number(chordalErrorM.toFixed(6))
      }
    }
  };
}

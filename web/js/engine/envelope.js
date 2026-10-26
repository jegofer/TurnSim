/**
 * Cálculo de envolventes de barrido (Swept Path Envelope), huellas de ruedas y acotaciones
 * Cumple los apartados 6.3, 9.1 y 11.1 de PROMT_ORIGINAL.md.
 */

import { simulateManeuver } from "./kinematics.js";

/**
 * Representa una caja orientada 2D (OBB) correspondiente a la tractora o al semirremolque en un instante k.
 */
function createOBB(rx, ry, heading, segment, margin = 0.0) {
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const lFront = segment.wheelbase + segment.frontOverhang + margin;
  const lRear = segment.rearOverhang + margin;
  const halfW = segment.width / 2 + margin;

  // Centro geométrico de la caja en coordenadas globales
  const midLocalX = (lFront - lRear) / 2;
  const halfLen = (lFront + lRear) / 2;
  const cx = rx + midLocalX * cosH;
  const cy = ry + midLocalX * sinH;
  const radius = Math.hypot(halfLen, halfW);

  const corners = [
    [-lRear, -halfW], // 0: trasero derecho
    [-lRear, +halfW], // 1: trasero izquierdo
    [+lFront, +halfW], // 2: delantero izquierdo
    [+lFront, -halfW]  // 3: delantero derecho
  ].map(([lx, ly]) => [
    rx + lx * cosH - ly * sinH,
    ry + lx * sinH + ly * cosH
  ]);

  return {
    rx,
    ry,
    cosH,
    sinH,
    lFront,
    lRear,
    halfW,
    cx,
    cy,
    radius,
    corners
  };
}

/**
 * Calcula el intervalo paramétrico [tMin, tMax] donde una recta P(t) = P0 + t * D
 * interseca una caja orientada (OBB). Devuelve null si no hay intersección.
 */
export function intersectLineWithOBB(p0x, p0y, dx, dy, obb) {
  const relX = p0x - obb.rx;
  const relY = p0y - obb.ry;

  // Coordenadas locales del origen y dirección de la recta respecto al OBB
  const ox = relX * obb.cosH + relY * obb.sinH;
  const oy = -relX * obb.sinH + relY * obb.cosH;
  const vx = dx * obb.cosH + dy * obb.sinH;
  const vy = -dx * obb.sinH + dy * obb.cosH;

  let tMin = -Infinity;
  let tMax = +Infinity;

  // Eje X local: [-lRear, +lFront]
  if (Math.abs(vx) < 1e-12) {
    if (ox < -obb.lRear || ox > obb.lFront) return null;
  } else {
    const tx1 = (-obb.lRear - ox) / vx;
    const tx2 = (obb.lFront - ox) / vx;
    tMin = Math.max(tMin, Math.min(tx1, tx2));
    tMax = Math.min(tMax, Math.max(tx1, tx2));
  }

  // Eje Y local: [-halfW, +halfW]
  if (Math.abs(vy) < 1e-12) {
    if (oy < -obb.halfW || oy > obb.halfW) return null;
  } else {
    const ty1 = (-obb.halfW - oy) / vy;
    const ty2 = (obb.halfW - oy) / vy;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
  }

  if (tMax < tMin) return null;
  return [tMin, tMax];
}

/**
 * Resta una lista de intervalos [a, b] del intervalo unidad [0, 1].
 * Devuelve los subintervalos supervivientes ordenados.
 */
function subtractIntervalsFromUnit(intervals, eps = 1e-7) {
  if (intervals.length === 0) return [[0, 1]];
  intervals.sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of intervals) {
    const cStart = Math.max(0, s);
    const cEnd = Math.min(1, e);
    if (cEnd <= cStart + eps) continue;
    if (merged.length === 0 || cStart > merged[merged.length - 1][1] + eps) {
      merged.push([cStart, cEnd]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], cEnd);
    }
  }

  const remaining = [];
  let cursor = 0.0;
  for (const [s, e] of merged) {
    if (s > cursor + eps) {
      remaining.push([cursor, s]);
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < 1.0 - eps) {
    remaining.push([cursor, 1.0]);
  }
  return remaining;
}

/**
 * Construye la lista completa de cajas orientadas (OBB) de tractora y semirremolque
 * para todos los estados de la maniobra.
 */
export function buildAllOBBs(states, vehicle, margin = 0.0) {
  const obbs = [];
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    obbs.push(createOBB(s.x, s.y, s.heading, tv, margin));
    if (tr && s.tx !== null && s.ty !== null && s.theading !== null) {
      obbs.push(createOBB(s.tx, s.ty, s.theading, tr, margin));
    }
  }
  return obbs;
}

/**
 * Calcula la sección transversal de barrido en un punto (px, py) con dirección normal (nx, ny)
 * intersectando la recta normal con todas las siluetas cercanas de la maniobra.
 * Devuelve { width, p1, p2, tMin, tMax } o null.
 */
export function computeCrossSectionWidth(px, py, nx, ny, obbs, maxSearchDist = 18.0) {
  let minT = +Infinity;
  let maxT = -Infinity;
  // Vector tangente unitario perpendicular a la normal (nx, ny)
  const tx = ny;
  const ty = -nx;

  for (let i = 0; i < obbs.length; i++) {
    const obb = obbs[i];
    const dcx = obb.cx - px;
    const dcy = obb.cy - py;
    // Distancia del centro del OBB a la recta normal: |dc . t|
    const distToLine = Math.abs(dcx * tx + dcy * ty);
    if (distToLine > obb.radius) continue;

    // Proyección a lo largo de la recta normal: dc . n
    const projAlongNormal = dcx * nx + dcy * ny;
    if (Math.abs(projAlongNormal) > maxSearchDist + obb.radius) continue;

    const hit = intersectLineWithOBB(px, py, nx, ny, obb);
    if (hit) {
      const [t0, t1] = hit;
      if (Math.abs(t0) <= maxSearchDist && Math.abs(t1) <= maxSearchDist) {
        if (t0 < minT) minT = t0;
        if (t1 > maxT) maxT = t1;
      }
    }
  }

  if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT <= minT) {
    return null;
  }

  const p1 = [px + minT * nx, py + minT * ny];
  const p2 = [px + maxT * nx, py + maxT * ny];
  const width = maxT - minT;

  return {
    width,
    tMin: minT,
    tMax: maxT,
    p1,
    p2
  };
}

/**
 * Calcula la envolvente exacta de barrido (Swept Envelope) y los bordes izquierdo y derecho
 * mediante recorte analítico de aristas (Liang-Barsky sobre OBBs) y encadenamiento topológico.
 *
 * Además devuelve los perfiles laterales continuo izquierdo (`leftBoundary`) y derecho (`rightBoundary`)
 * y el polígono cerrado completo (`envelopePolygon`).
 */
export function computeSweptEnvelope(states, vehicle, margin = 0.0) {
  if (!states || states.length === 0) {
    return {
      envelopePolygon: [],
      leftBoundary: [],
      rightBoundary: [],
      maxSweptWidthM: 0,
      maxSweptWidthSection: null
    };
  }

  const obbs = buildAllOBBs(states, vehicle, margin);
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;
  const hasTrailer = Boolean(tr && states[0].tx !== null);

  // 1. Extraer los segmentos candidatos del contorno (usando el 100 % de los estados hasta 1.200 pasos,
  // y submuestreando por estado completo si se emplea malla ultrafina de convergencia)
  const obbsPerState = hasTrailer ? 2 : 1;
  const maxStatesForClipping = 1200;
  const stateStride = Math.max(1, Math.floor(states.length / maxStatesForClipping));
  const clipObbs = [];
  for (let sIdx = 0; sIdx < states.length; sIdx += stateStride) {
    const baseIdx = sIdx * obbsPerState;
    clipObbs.push(obbs[baseIdx]);
    if (hasTrailer && obbs[baseIdx + 1]) {
      clipObbs.push(obbs[baseIdx + 1]);
    }
  }
  if ((states.length - 1) % stateStride !== 0) {
    const lastBase = (states.length - 1) * obbsPerState;
    clipObbs.push(obbs[lastBase]);
    if (hasTrailer && obbs[lastBase + 1]) {
      clipObbs.push(obbs[lastBase + 1]);
    }
  }

  const shrinkEps = 1e-5;
  const interiorOBBs = clipObbs.map((o) => ({
    ...o,
    lFront: o.lFront - shrinkEps,
    lRear: o.lRear - shrinkEps,
    halfW: o.halfW - shrinkEps
  }));

  const boundarySegments = [];

  for (let i = 0; i < clipObbs.length; i++) {
    const obb = clipObbs[i];
    const c = obb.corners;
    // 4 aristas orientadas en sentido antihorario: 0->3 (derecha), 3->2 (frente), 2->1 (izquierda), 1->0 (trasera)
    const edges = [
      [c[0], c[3]],
      [c[3], c[2]],
      [c[2], c[1]],
      [c[1], c[0]]
    ];

    for (const [pA, pB] of edges) {
      const dx = pB[0] - pA[0];
      const dy = pB[1] - pA[1];
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-6) continue;

      const midX = 0.5 * (pA[0] + pB[0]);
      const midY = 0.5 * (pA[1] + pB[1]);
      const clippedIntervals = [];

      for (let j = 0; j < interiorOBBs.length; j++) {
        if (i === j) continue;
        const other = interiorOBBs[j];
        const distCenters = Math.hypot(other.cx - midX, other.cy - midY);
        if (distCenters > other.radius + 0.5 * segLen + 0.05) continue;

        const hit = intersectLineWithOBB(pA[0], pA[1], dx, dy, other);
        if (hit) {
          const [t0, t1] = hit;
          if (t1 > 0 && t0 < 1) {
            clippedIntervals.push([Math.max(0, t0), Math.min(1, t1)]);
          }
        }
      }

      const surviving = subtractIntervalsFromUnit(clippedIntervals, 1e-5);
      for (const [t0, t1] of surviving) {
        if ((t1 - t0) * segLen < 1e-4) continue;
        boundarySegments.push([
          [pA[0] + t0 * dx, pA[1] + t0 * dy],
          [pA[0] + t1 * dx, pA[1] + t1 * dy]
        ]);
      }
    }
  }

  // 2. Encadenar los segmentos supervivientes del borde exterior en un anillo cerrado continuo
  const envelopePolygon = chainBoundarySegments(boundarySegments, states, obbs);

  // 3. Calcular las secciones transversales y los bordes izquierdo y derecho a lo largo de la maniobra
  const leftBoundary = [];
  const rightBoundary = [];
  let maxSweptWidthM = 0;
  let maxSweptWidthSection = null;

  const sectionStep = Math.max(1, Math.floor(states.length / 800));
  for (let i = 0; i < states.length; i += sectionStep) {
    const s = states[i];
    const nx = -Math.sin(s.heading);
    const ny = Math.cos(s.heading);
    const section = computeCrossSectionWidth(s.x, s.y, nx, ny, obbs, 16.0);
    if (section) {
      rightBoundary.push(section.p1);
      leftBoundary.push(section.p2);
      if (section.width > maxSweptWidthM) {
        maxSweptWidthM = section.width;
        maxSweptWidthSection = {
          stepIndex: i,
          dist: s.dist,
          width: Number(section.width.toFixed(3)),
          p1: section.p1,
          p2: section.p2
        };
      }
    }
  }

  return {
    envelopePolygon,
    leftBoundary,
    rightBoundary,
    maxSweptWidthM: Number(maxSweptWidthM.toFixed(3)),
    maxSweptWidthSection,
    obbs: clipObbs
  };
}

/**
 * Encadena los segmentos dirigidos del contorno exterior en un polígono cerrado limpio.
 */
function chainBoundarySegments(segments, states, obbs) {
  if (!segments || segments.length === 0) return [];

  // Agrupar por proximidad espacial de extremo final -> extremo inicial
  const n = segments.length;
  const used = new Uint8Array(n);

  // Elegir como primer segmento aquel que contenga el punto con menor coordenada X (o mayor distancia exterior)
  let startIdx = 0;
  let minX = +Infinity;
  for (let i = 0; i < n; i++) {
    const x0 = segments[i][0][0];
    if (x0 < minX) {
      minX = x0;
      startIdx = i;
    }
  }

  const ring = [segments[startIdx][0], segments[startIdx][1]];
  used[startIdx] = 1;
  let currentEnd = segments[startIdx][1];
  const startPoint = segments[startIdx][0];

  const maxTolerance = 0.35; // m (salto máximo entre pasos discretos de 0,05 m)

  for (let step = 0; step < n; step++) {
    // Si ya cerramos el bucle cerca del punto de inicio y hemos recorrido suficientes puntos
    if (ring.length > 20 && Math.hypot(currentEnd[0] - startPoint[0], currentEnd[1] - startPoint[1]) < 0.04) {
      break;
    }

    let bestIdx = -1;
    let bestDist = maxTolerance;

    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d = Math.hypot(segments[j][0][0] - currentEnd[0], segments[j][0][1] - currentEnd[1]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }

    if (bestIdx === -1) break;

    used[bestIdx] = 1;
    const seg = segments[bestIdx];
    if (bestDist > 1e-4) {
      ring.push(seg[0]);
    }
    ring.push(seg[1]);
    currentEnd = seg[1];
  }

  // Asegurar cierre del polígono
  if (ring.length > 2) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-4) {
      ring.push([first[0], first[1]]);
    }
  }

  return ring;
}

/**
 * Genera las acotaciones automáticas de anchura de barrido (inicio, puntos de curva y salida)
 * homologadas con la estructura de `dimensions` del visor 2D y 3D.
 */
export function computeKeyDimensions(states, obbs) {
  if (!states || states.length < 4) return [];

  const dims = [];
  const totalLen = states.length;

  // Seleccionar índices representativos: tramo inicial (~12%), tercio de maniobra (~38%),
  // punto de máxima anchura barrida, y tramo de salida (~86%)
  const idxInitial = Math.min(totalLen - 1, Math.max(1, Math.floor(totalLen * 0.12)));
  const idxEarlyTurn = Math.min(totalLen - 1, Math.floor(totalLen * 0.38));
  const idxExit = Math.min(totalLen - 2, Math.floor(totalLen * 0.86));

  let maxIdx = Math.floor(totalLen * 0.55);
  let maxW = 0;
  let maxSection = null;

  for (let i = 0; i < totalLen; i++) {
    const s = states[i];
    const nx = -Math.sin(s.heading);
    const ny = Math.cos(s.heading);
    const sec = computeCrossSectionWidth(s.x, s.y, nx, ny, obbs, 16.0);
    if (sec && sec.width > maxW) {
      maxW = sec.width;
      maxIdx = i;
      maxSection = sec;
    }
  }

  const candidateIndices = [
    { idx: idxInitial, title: "Tramo inicial" },
    { idx: idxEarlyTurn, title: "Entrada en curva" },
    { idx: maxIdx, title: "Máx. barrido" },
    { idx: idxExit, title: "Tramo salida" }
  ];

  // Evitar índices demasiado próximos entre sí
  const usedIndices = [];
  for (const item of candidateIndices) {
    if (usedIndices.some((u) => Math.abs(u - item.idx) < Math.max(3, totalLen * 0.08))) {
      continue;
    }
    const s = states[item.idx];
    const nx = -Math.sin(s.heading);
    const ny = Math.cos(s.heading);
    const sec = item.idx === maxIdx && maxSection
      ? maxSection
      : computeCrossSectionWidth(s.x, s.y, nx, ny, obbs, 16.0);

    if (sec) {
      usedIndices.push(item.idx);
      dims.push({
        stepIndex: item.idx,
        dist: Number(s.dist.toFixed(2)),
        title: item.title,
        widthM: Number(sec.width.toFixed(2)),
        val: `${sec.width.toFixed(2)} m`,
        p1: [Number(sec.p1[0].toFixed(4)), Number(sec.p1[1].toFixed(4))],
        p2: [Number(sec.p2[0].toFixed(4)), Number(sec.p2[1].toFixed(4))]
      });
    }
  }

  return dims;
}

/**
 * Extrae todas las trazas de referencia y huellas de neumáticos, así como las siluetas muestreadas (ghosts),
 * listas para los motores de visualización 2D y 3D y los exportadores CAD/PDF.
 */
export function buildCompleteSimulationResult(vehicle, maneuver, options = {}) {
  const sim =
    options.precomputedSimulation ||
    simulateManeuver(vehicle, maneuver, {
      straightStep: options.straightStepM ?? options.straightStep ?? 0.1,
      arcStepDeg: options.arcStepDeg ?? 1.0,
      integrationMethod: options.integrationMethod ?? "rk4",
      schleppHitchSign: options.schleppHitchSign ?? false
    });
  const { states, summary } = sim;

  const safetyMargin = Math.max(
    0,
    Number(options.safetyMarginM ?? options.safetyMargin ?? 0.0)
  );
  const ghostIntervalM = Math.max(1.0, Number(options.ghostIntervalM || 2.5));

  const envMain = computeSweptEnvelope(states, vehicle, 0.0);
  const envMargin = safetyMargin > 0
    ? computeSweptEnvelope(states, vehicle, safetyMargin)
    : null;

  const dimensions = computeKeyDimensions(states, envMain.obbs);

  // Trazas de puntos de referencia y ruedas
  const traces = {
    tractor_front: [],
    tractor_rear: [],
    hitch: [],
    trailer_rear: [],
    wheels: {
      tractor_front_left: [],
      tractor_front_right: [],
      tractor_rear_left: [],
      tractor_rear_right: [],
      trailer_tridem_left: [],
      trailer_tridem_right: [],
      trailer_axle1_center: [],
      trailer_axle2_center: [],
      trailer_axle3_center: []
    }
  };

  const frames = [];
  const ghosts = [];
  let nextGhostDist = 0.0;

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    traces.tractor_front.push(s.tractorFrontAxle.center);
    traces.tractor_rear.push([s.x, s.y]);
    traces.hitch.push(s.hitch);

    traces.wheels.tractor_front_left.push(s.tractorFrontAxle.left);
    traces.wheels.tractor_front_right.push(s.tractorFrontAxle.right);
    traces.wheels.tractor_rear_left.push(s.tractorRearAxle.left);
    traces.wheels.tractor_rear_right.push(s.tractorRearAxle.right);

    if (s.tx !== null) {
      traces.trailer_rear.push([s.tx, s.ty]);
      if (s.trailerAxles.length >= 3) {
        traces.wheels.trailer_axle1_center.push(s.trailerAxles[0].center);
        traces.wheels.trailer_axle2_center.push(s.trailerAxles[1].center);
        traces.wheels.trailer_axle3_center.push(s.trailerAxles[2].center);
        traces.wheels.trailer_tridem_left.push(s.trailerAxles[1].left);
        traces.wheels.trailer_tridem_right.push(s.trailerAxles[1].right);
      } else if (s.trailerAxles.length === 1) {
        traces.wheels.trailer_tridem_left.push(s.trailerAxles[0].left);
        traces.wheels.trailer_tridem_right.push(s.trailerAxles[0].right);
      }
    }

    // Muestreo de fotogramas para animación fluida
    if (i === 0 || i === states.length - 1 || i % 3 === 0) {
      frames.push({
        stepIndex: i,
        dist: s.dist,
        direction: s.direction,
        x: s.x,
        y: s.y,
        heading: s.heading,
        hx: s.hitch[0],
        hy: s.hitch[1],
        tx: s.tx,
        ty: s.ty,
        theading: s.theading,
        steerAngleDeg: s.steerAngleDeg,
        articulationAngleDeg: s.articulationAngleDeg,
        exceedsMaxSteer: s.exceedsMaxSteer,
        exceedsMaxArticulation: s.exceedsMaxArticulation
      });
    }

    // Siluetas intermedias (ghosts)
    if (i === 0 || i === states.length - 1 || s.dist >= nextGhostDist) {
      ghosts.push(s);
      if (s.dist >= nextGhostDist) {
        nextGhostDist = s.dist + ghostIntervalM;
      }
    }
  }

  return {
    vehicle: {
      id: vehicle.id,
      name: vehicle.name,
      verified: vehicle.verified,
      tractor: {
        wb: vehicle.tractor.wheelbase,
        fo: vehicle.tractor.frontOverhang,
        ro: vehicle.tractor.rearOverhang,
        w: vehicle.tractor.width,
        hitchOffset: vehicle.tractor.hitchOffset
      },
      trailer: vehicle.trailer
        ? {
            wb: vehicle.trailer.wheelbase,
            fo: vehicle.trailer.frontOverhang,
            ro: vehicle.trailer.rearOverhang,
            w: vehicle.trailer.width,
            axleSpacing: vehicle.trailer.axleSpacing || 1.31
          }
        : null
    },
    summary: {
      ...summary,
      maxSweptWidthM: envMain.maxSweptWidthM,
      minSweptWidthM: Number(Math.max(vehicle.tractor.width, vehicle.trailer ? vehicle.trailer.width : 0).toFixed(3))
    },
    envelope: envMain.envelopePolygon,
    leftBoundary: envMain.leftBoundary,
    rightBoundary: envMain.rightBoundary,
    marginEnvelope: envMargin ? envMargin.envelopePolygon : null,
    marginLeftBoundary: envMargin ? envMargin.leftBoundary : null,
    marginRightBoundary: envMargin ? envMargin.rightBoundary : null,
    traces,
    frames,
    ghosts,
    states,
    dimensions,
    obbs: envMain.obbs,
    marginObbs: envMargin ? envMargin.obbs : null
  };
}

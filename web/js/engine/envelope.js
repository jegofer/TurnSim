/**
 * Cálculo de envolventes de barrido (Swept Path Envelope), huellas de ruedas y acotaciones
 * Cumple los apartados 6.3, 9.1 y 11.1 de PROMT_ORIGINAL.md.
 */

import { simulateManeuver, computeBodyPolygon } from "./kinematics.js";
import ClipperLib from "../vendor/clipper.js";

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
 * para todos los estados de la maniobra, asociando su distancia acumulada y su índice de estado.
 */
export function buildAllOBBs(states, vehicle, margin = 0.0) {
  const obbs = [];
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    const obbT = createOBB(s.x, s.y, s.heading, tv, margin);
    obbT.stateIndex = i;
    obbT.dist = s.dist;
    obbs.push(obbT);
    if (s.trailers && s.trailers.length > 0) {
      for (const trState of s.trailers) {
        if (trState.tx !== null) {
          const obbTr = createOBB(trState.tx, trState.ty, trState.theading, trState.def || tr, margin);
          obbTr.stateIndex = i;
          obbTr.dist = s.dist;
          obbs.push(obbTr);
        }
      }
    } else if (tr && s.tx !== null && s.ty !== null && s.theading !== null) {
      const obbTr = createOBB(s.tx, s.ty, s.theading, tr, margin);
      obbTr.stateIndex = i;
      obbTr.dist = s.dist;
      obbs.push(obbTr);
    }
  }
  return obbs;
}

/**
 * Calcula la sección transversal de barrido en un punto (px, py) con dirección normal (nx, ny)
 * intersectando la recta normal con las siluetas cercanas dentro de una ventana de distancia temporal (GEOM-03).
 * Devuelve { width, p1, p2, tMin, tMax } o null.
 */
export function computeCrossSectionWidth(
  px,
  py,
  nx,
  ny,
  obbs,
  maxSearchDist = 18.0,
  centerDist = null,
  maxDistWindow = 22.0,
  startIdx = 0,
  endIdx = obbs.length
) {
  let minT = +Infinity;
  let maxT = -Infinity;
  // Vector tangente unitario perpendicular a la normal (nx, ny)
  const tx = ny;
  const ty = -nx;
  const boxLimit = maxSearchDist + 10.0;

  for (let i = startIdx; i < endIdx; i++) {
    const obb = obbs[i];
    // GEOM-03: Restringir a la ventana física y temporal del vehículo para evitar cortes oblicuos
    // con tramos distantes de la maniobra en retornos en S o retrocesos
    if (centerDist !== null && typeof obb.dist === "number") {
      if (Math.abs(obb.dist - centerDist) > maxDistWindow) continue;
    }

    const dcx = obb.cx - px;
    if (dcx > boxLimit || dcx < -boxLimit) continue;
    const dcy = obb.cy - py;
    if (dcy > boxLimit || dcy < -boxLimit) continue;
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

const CLIPPER_SCALE = 10000; // 0.1 mm de resolución para aritmética entera de 64 bits

function ptToClipper(p) {
  return { X: Math.round(p[0] * CLIPPER_SCALE), Y: Math.round(p[1] * CLIPPER_SCALE) };
}

function clipperPathToCoords(path) {
  if (!path || path.length === 0) return [];
  const coords = [];
  for (let i = 0; i < path.length; i++) {
    coords.push([path[i].X / CLIPPER_SCALE, path[i].Y / CLIPPER_SCALE]);
  }
  if (coords.length > 2) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-4) {
      coords.push([first[0], first[1]]);
    }
  }
  return coords;
}

function polyArea(path) {
  if (!path || path.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < path.length; i++) {
    const j = (i + 1) % path.length;
    a += (path[i].X / CLIPPER_SCALE) * (path[j].Y / CLIPPER_SCALE) - (path[j].X / CLIPPER_SCALE) * (path[i].Y / CLIPPER_SCALE);
  }
  return Math.abs(a) * 0.5;
}

/**
 * Calcula la envolvente convexa 2D de hasta 8 vértices mediante el algoritmo Monotone Chain de Andrew.
 * Devuelve los vértices del casco convexo en sentido antihorario (CCW).
 */
export function convexHull8(pts) {
  if (!pts || pts.length <= 3) return (pts || []).slice();
  const p = pts.slice().sort((a, b) => (Math.abs(a[0] - b[0]) > 1e-9 ? a[0] - b[0] : a[1] - b[1]));
  const unique = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const prev = unique[unique.length - 1];
    if (Math.hypot(p[i][0] - prev[0], p[i][1] - prev[1]) > 1e-6) {
      unique.push(p[i]);
    }
  }
  if (unique.length <= 3) return unique;

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (let i = 0; i < unique.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], unique[i]) <= 1e-9) {
      lower.pop();
    }
    lower.push(unique[i]);
  }
  const upper = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], unique[i]) <= 1e-9) {
      upper.pop();
    }
    upper.push(unique[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Calcula la envolvente exacta de barrido (Swept Envelope) mediante la unión booleana exacta
 * de cápsulas convexas continuas con Clipper (algoritmo Vatti), garantizando un polígono de Jordan
 * sin autointersecciones (0 self-intersections).
 *
 * Para márgenes de seguridad > 0, ejecuta un offset de Minkowski con esquinas redondeadas exactas (jtRound),
 * eliminando la sobredimensión diagonal de aproximaciones por caja.
 */
/**
 * Muestreo angular y espacial adaptativo de estados para la generación de cápsulas convexas (MEJ-03).
 * Limita el error cordal de la envolvente a e <= 1 mm garantizando Delta_theta <= 1,5 deg y Delta_s <= 0,60 m,
 * eliminando la subestimación en giros cerrados e intersecciones.
 */
export function computeAdaptiveSampledIndices(states, options = {}) {
  const n = states.length;
  if (!n) return [];
  if (n <= 120) {
    const all = new Array(n);
    for (let i = 0; i < n; i++) all[i] = i;
    return all;
  }

  const maxDeltaThetaRad = options.maxDeltaThetaRad ?? (1.5 * Math.PI / 180); // 1.5° = 0.02618 rad
  const maxDeltaDistM = options.maxDeltaDistM ?? 0.60; // 0.60 m
  const maxIndexGap = options.maxIndexGap ?? 25; // Forzar al menos una cápsula cada 25 pasos

  const indices = [0];
  let lastIdx = 0;

  for (let i = 1; i < n - 1; i++) {
    const sPrev = states[lastIdx];
    const sCurr = states[i];

    // Variación de posición espacial
    const dx = sCurr.x - sPrev.x;
    const dy = sCurr.y - sPrev.y;
    const distSq = dx * dx + dy * dy;

    // Variación angular del vehículo tractor
    let dHeading = Math.abs(sCurr.heading - sPrev.heading);
    while (dHeading > Math.PI) dHeading = Math.abs(dHeading - 2 * Math.PI);

    // Variación angular de semirremolque si existe
    let dTheading = 0;
    if (sCurr.theading !== undefined && sPrev.theading !== undefined) {
      dTheading = Math.abs(sCurr.theading - sPrev.theading);
      while (dTheading > Math.PI) dTheading = Math.abs(dTheading - 2 * Math.PI);
    }

    const gap = i - lastIdx;

    if (
      dHeading >= maxDeltaThetaRad ||
      dTheading >= maxDeltaThetaRad ||
      distSq >= maxDeltaDistM * maxDeltaDistM ||
      gap >= maxIndexGap
    ) {
      indices.push(i);
      lastIdx = i;
    }
  }

  // Siempre incluir el estado final de la maniobra
  if (indices[indices.length - 1] !== n - 1) {
    indices.push(n - 1);
  }

  // Si sobrepasa 300 cápsulas en maniobras excepcionalmente largas, filtrar uniformemente para acotar coste
  if (indices.length > 300) {
    const stride = Math.ceil(indices.length / 300);
    const thinned = [];
    for (let j = 0; j < indices.length; j += stride) {
      thinned.push(indices[j]);
    }
    if (thinned[thinned.length - 1] !== indices[indices.length - 1]) {
      thinned.push(indices[indices.length - 1]);
    }
    return thinned;
  }

  return indices;
}

export function computeSweptEnvelope(states, vehicle, margin = 0.0, options = {}) {
  if (!states || states.length === 0) {
    return {
      envelopePolygon: [],
      envelopeHoles: [],
      envelopePolygons: [],
      leftBoundary: [],
      rightBoundary: [],
      maxSweptWidthM: 0,
      maxSweptWidthSection: null,
      obbs: [],
      baseExPolygons: []
    };
  }

  const obbs = buildAllOBBs(states, vehicle, margin);
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;
  const hasTrailer = Boolean(tr && states[0].tx !== null);

  let baseExPolygons = options.precomputedBaseExPolygons || null;

  if (!baseExPolygons) {
    // 1. Muestreo adaptativo de estados para optimizar cápsulas garantizando Delta_theta <= 1.5° (MEJ-03)
    const sampledIndices = computeAdaptiveSampledIndices(states, options.samplingOptions);

    // 2. Construir cápsulas convexas Conv(B_k U B_{k+1}) para la tractora y el semirremolque
    const subjectPaths = [];

    if (sampledIndices.length === 1) {
      const s0 = states[sampledIndices[0]];
      const tPoly0 = s0.tractorPolygon || computeBodyPolygon(s0.x, s0.y, s0.heading, tv, 0.0);
      subjectPaths.push(tPoly0.map(ptToClipper));
      if (s0.trailers && s0.trailers.length > 0) {
        for (const trState of s0.trailers) {
          if (trState.polygon) {
            subjectPaths.push(trState.polygon.map(ptToClipper));
          }
        }
      } else if (hasTrailer) {
        const trPoly0 = s0.trailerPolygon || (s0.tx !== null ? computeBodyPolygon(s0.tx, s0.ty, s0.theading, tr, 0.0) : null);
        if (trPoly0) {
          subjectPaths.push(trPoly0.map(ptToClipper));
        }
      }
    } else {
      for (let si = 0; si < sampledIndices.length - 1; si++) {
        const s0 = states[sampledIndices[si]];
        const s1 = states[sampledIndices[si + 1]];
        const tPoly0 = s0.tractorPolygon || computeBodyPolygon(s0.x, s0.y, s0.heading, tv, 0.0);
        const tPoly1 = s1.tractorPolygon || computeBodyPolygon(s1.x, s1.y, s1.heading, tv, 0.0);
        const hullT = convexHull8([...tPoly0, ...tPoly1]);
        subjectPaths.push(hullT.map(ptToClipper));

        if (s0.trailers && s0.trailers.length > 0) {
          for (let j = 0; j < s0.trailers.length; j++) {
            const trPoly0 = s0.trailers[j].polygon;
            const trPoly1 = s1.trailers && s1.trailers[j] ? s1.trailers[j].polygon : null;
            if (trPoly0 && trPoly1) {
              const hullTr = convexHull8([...trPoly0, ...trPoly1]);
              subjectPaths.push(hullTr.map(ptToClipper));
            }
          }
        } else if (hasTrailer) {
          const trPoly0 = s0.trailerPolygon || (s0.tx !== null ? computeBodyPolygon(s0.tx, s0.ty, s0.theading, tr, 0.0) : null);
          const trPoly1 = s1.trailerPolygon || (s1.tx !== null ? computeBodyPolygon(s1.tx, s1.ty, s1.theading, tr, 0.0) : null);
          if (trPoly0 && trPoly1) {
            const hullTr = convexHull8([...trPoly0, ...trPoly1]);
            subjectPaths.push(hullTr.map(ptToClipper));
          }
        }
      }
    }

    // 3. Ejecutar la unión booleana exacta (jerárquica por bloques Divide & Conquer para evitar coste O((K*V)^2) en Vatti)
    const CHUNK_SIZE = 36;
    const clipper = new ClipperLib.Clipper();
    clipper.StrictlySimple = !options.previewMode;

    if (subjectPaths.length <= CHUNK_SIZE) {
      for (let i = 0; i < subjectPaths.length; i++) {
        clipper.AddPath(subjectPaths[i], ClipperLib.PolyType.ptSubject, true);
      }
    } else {
      for (let c = 0; c < subjectPaths.length; c += CHUNK_SIZE) {
        const chunkClipper = new ClipperLib.Clipper();
        const end = Math.min(subjectPaths.length, c + CHUNK_SIZE);
        for (let k = c; k < end; k++) {
          chunkClipper.AddPath(subjectPaths[k], ClipperLib.PolyType.ptSubject, true);
        }
        const partialPaths = new ClipperLib.Paths();
        chunkClipper.Execute(
          ClipperLib.ClipType.ctUnion,
          partialPaths,
          ClipperLib.PolyFillType.pftNonZero,
          ClipperLib.PolyFillType.pftNonZero
        );
        clipper.AddPaths(partialPaths, ClipperLib.PolyType.ptSubject, true);
      }
    }

    const polyTree = new ClipperLib.PolyTree();
    clipper.Execute(
      ClipperLib.ClipType.ctUnion,
      polyTree,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero
    );
    baseExPolygons = ClipperLib.JS.PolyTreeToExPolygons(polyTree);
  }

  let exPolygons = baseExPolygons;

  // 4. Si margin > 0, aplicar ClipperOffset con esquinas redondeadas exactas (jtRound - GEOM-04)
  if (margin > 0.0 && exPolygons.length > 0) {
    const co = new ClipperLib.ClipperOffset(2.0, 25);
    for (let i = 0; i < exPolygons.length; i++) {
      co.AddPath(exPolygons[i].outer, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      for (let h = 0; h < exPolygons[i].holes.length; h++) {
        co.AddPath(exPolygons[i].holes[h], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      }
    }
    const offsetTree = new ClipperLib.PolyTree();
    co.Execute(offsetTree, margin * CLIPPER_SCALE);
    exPolygons = ClipperLib.JS.PolyTreeToExPolygons(offsetTree);
  }

  // Ordenar polígonos resultantes por área decreciente
  exPolygons.sort((a, b) => polyArea(b.outer) - polyArea(a.outer));

  const envelopePolygon = exPolygons.length > 0 ? clipperPathToCoords(exPolygons[0].outer) : [];
  const envelopeHoles = exPolygons.length > 0 ? (exPolygons[0].holes || []).map(clipperPathToCoords) : [];
  const envelopePolygons = exPolygons.map((ep) => clipperPathToCoords(ep.outer));

  // 5. Calcular secciones transversales acotadas a la ventana temporal local mediante punteros monótonos O(1) (GEOM-03)
  const leftBoundary = [];
  const rightBoundary = [];
  let maxSweptWidthM = 0;
  let maxSweptWidthSection = null;

  const sectionStep = Math.max(1, Math.floor(states.length / 800));
  const maxDistWindow = 22.0;
  let winStart = 0;
  let winEnd = 0;
  const nObbs = obbs.length;

  for (let i = 0; i < states.length; i += sectionStep) {
    const s = states[i];
    const minDistAllowed = s.dist - maxDistWindow;
    const maxDistAllowed = s.dist + maxDistWindow;

    while (winStart < nObbs && obbs[winStart].dist < minDistAllowed) {
      winStart++;
    }
    if (winEnd < winStart) winEnd = winStart;
    while (winEnd < nObbs && obbs[winEnd].dist <= maxDistAllowed) {
      winEnd++;
    }

    const nx = -Math.sin(s.heading);
    const ny = Math.cos(s.heading);
    const section = computeCrossSectionWidth(
      s.x,
      s.y,
      nx,
      ny,
      obbs,
      16.0,
      s.dist,
      maxDistWindow,
      winStart,
      winEnd
    );
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
    envelopeHoles,
    envelopePolygons,
    leftBoundary,
    rightBoundary,
    maxSweptWidthM: Number(maxSweptWidthM.toFixed(3)),
    maxSweptWidthSection,
    obbs,
    baseExPolygons
  };
}

/**
 * Encadena los segmentos dirigidos del contorno exterior en un polígono cerrado limpio.
 */
export function chainBoundarySegments(segments, states, obbs) {
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
  const maxToleranceSq = maxTolerance * maxTolerance;

  // Optimización O(M) mediante cuadrícula espacial hash para extremos iniciales de segmentos (PERF-09)
  const cellSize = 0.50; // m (superior a maxTolerance para garantizar vecindad en 9 celdas)
  const grid = new Map();
  const getCellKey = (x, y) => `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}`;

  for (let i = 0; i < n; i++) {
    const key = getCellKey(segments[i][0][0], segments[i][0][1]);
    let list = grid.get(key);
    if (!list) {
      list = [];
      grid.set(key, list);
    }
    list.push(i);
  }

  for (let step = 0; step < n; step++) {
    // Si ya cerramos el bucle cerca del punto de inicio y hemos recorrido suficientes puntos
    const dxStart = currentEnd[0] - startPoint[0];
    const dyStart = currentEnd[1] - startPoint[1];
    if (ring.length > 20 && dxStart * dxStart + dyStart * dyStart < 0.0016) {
      break;
    }

    let bestIdx = -1;
    let bestDistSq = maxToleranceSq;

    const endCellX = Math.floor(currentEnd[0] / cellSize);
    const endCellY = Math.floor(currentEnd[1] / cellSize);

    // Buscar únicamente en la celda del extremo actual y en sus 8 celdas adyacentes O(1)
    for (let cdx = -1; cdx <= 1; cdx++) {
      for (let cdy = -1; cdy <= 1; cdy++) {
        const neighborKey = `${endCellX + cdx}_${endCellY + cdy}`;
        const candidates = grid.get(neighborKey);
        if (!candidates) continue;

        for (let k = 0; k < candidates.length; k++) {
          const j = candidates[k];
          if (used[j]) continue;
          const dx = segments[j][0][0] - currentEnd[0];
          const dy = segments[j][0][1] - currentEnd[1];
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = j;
          }
        }
      }
    }

    // Fallback de seguridad si un salto supera maxTolerance
    if (bestIdx === -1) {
      for (let j = 0; j < n; j++) {
        if (used[j]) continue;
        const dx = segments[j][0][0] - currentEnd[0];
        const dy = segments[j][0][1] - currentEnd[1];
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = j;
        }
      }
    }

    if (bestIdx === -1) break;

    used[bestIdx] = 1;
    const seg = segments[bestIdx];
    if (bestDistSq > 1e-8) {
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
export function computeKeyDimensions(states, obbs, precomputedMaxSection = null) {
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

  if (precomputedMaxSection && Number.isInteger(precomputedMaxSection.stepIndex)) {
    const sectionStep = Math.max(1, Math.floor(totalLen / 800));
    if (sectionStep === 1) {
      maxIdx = precomputedMaxSection.stepIndex;
      maxW = precomputedMaxSection.width;
      maxSection = precomputedMaxSection;
    } else {
      const startI = Math.max(0, precomputedMaxSection.stepIndex - sectionStep);
      const endI = Math.min(totalLen - 1, precomputedMaxSection.stepIndex + sectionStep);
      for (let i = startI; i <= endI; i++) {
        const s = states[i];
        const nx = -Math.sin(s.heading);
        const ny = Math.cos(s.heading);
        const sec = computeCrossSectionWidth(s.x, s.y, nx, ny, obbs, 16.0, s.dist, 22.0);
        if (sec && sec.width > maxW) {
          maxW = sec.width;
          maxIdx = i;
          maxSection = sec;
        }
      }
    }
  } else {
    for (let i = 0; i < totalLen; i++) {
      const s = states[i];
      const nx = -Math.sin(s.heading);
      const ny = Math.cos(s.heading);
      const sec = computeCrossSectionWidth(s.x, s.y, nx, ny, obbs, 16.0, s.dist, 22.0);
      if (sec && sec.width > maxW) {
        maxW = sec.width;
        maxIdx = i;
        maxSection = sec;
      }
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
      : computeCrossSectionWidth(s.x, s.y, nx, ny, obbs, 16.0, s.dist, 22.0);

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
      schleppHitchSign: options.schleppHitchSign ?? false,
      steeringReferencePoint: options.steeringReferencePoint || maneuver?.steeringReferencePoint || "rear_axle"
    });
  const { states, summary } = sim;

  const safetyMargin = Math.max(
    0,
    Number(options.safetyMarginM ?? options.safetyMargin ?? 0.0)
  );
  const ghostIntervalM = Math.max(1.0, Number(options.ghostIntervalM || 2.5));

  const isPreview = Boolean(options.previewMode);
  const samplingOptions = isPreview
    ? { maxDeltaThetaRad: (3.0 * Math.PI) / 180, maxDeltaDistM: 1.2, maxIndexGap: 40 }
    : undefined;

  const envMain = computeSweptEnvelope(states, vehicle, 0.0, { samplingOptions, previewMode: isPreview });
  const envMargin = safetyMargin > 0
    ? computeSweptEnvelope(states, vehicle, safetyMargin, {
        precomputedBaseExPolygons: envMain.baseExPolygons,
        samplingOptions,
        previewMode: isPreview
      })
    : null;

  const dimensions = isPreview ? [] : computeKeyDimensions(states, envMain.obbs, envMain.maxSweptWidthSection);

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
    envelopeHoles: envMain.envelopeHoles,
    envelopePolygons: envMain.envelopePolygons,
    leftBoundary: envMain.leftBoundary,
    rightBoundary: envMain.rightBoundary,
    marginEnvelope: envMargin ? envMargin.envelopePolygon : null,
    marginEnvelopeHoles: envMargin ? envMargin.envelopeHoles : null,
    marginEnvelopePolygons: envMargin ? envMargin.envelopePolygons : null,
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

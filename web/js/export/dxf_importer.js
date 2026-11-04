/**
 * Parser e importador DXF técnico en cliente para TurnSim
 * Soporta DXF ASCII estándar (versiones R12 a R2018 / AC1009 a AC1032).
 * Extrae entidades geométricas agrupadas por capa (LAYER):
 * - LWPOLYLINE / POLYLINE (con aristas rectas y arcos mediante 'bulge')
 * - LINE
 * - ARC / CIRCLE
 */

/**
 * Normaliza nombres de capas para comparaciones insensibles a mayúsculas, espacios y guiones.
 */
function normalizeLayerName(name) {
  return String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_\-]+/g, "_");
}

/**
 * Capas sugeridas / convencionales en TurnSim
 */
export const SUGGESTED_LAYERS = {
  TRAJECTORY: [
    "TURNSIM_TRAYECTORIA",
    "TURNSIM_EJE",
    "TRAYECTORIA",
    "EJE_CAMION",
    "EJE_TRAYECTORIA",
    "EJE",
    "TRAJECTORY",
    "SWEPT_AXIS",
    "CAMINO",
    "RUTA"
  ],
  OBSTACLES: [
    "TURNSIM_OBSTACULOS",
    "TURNSIM_OBSTACULO",
    "OBSTACULOS",
    "OBSTACULO",
    "EDIFICIOS",
    "EDIFICIO",
    "MUROS",
    "MURO",
    "PILARES",
    "OBSTACLES",
    "BUILDINGS",
    "CONSTRUCCIONES"
  ],
  BOUNDARIES: [
    "TURNSIM_BORDES",
    "TURNSIM_BORDILLOS",
    "BORDILLOS",
    "BORDILLO",
    "ACERAS",
    "ACERA",
    "ISLETAS",
    "ISLETA",
    "DELIMITACION",
    "CURBS",
    "BOUNDARIES",
    "ROAD_EDGES"
  ],
  RESTRICTED: [
    "TURNSIM_ZONAS_RESTRINGIDAS",
    "TURNSIM_RESTRINGIDO",
    "ZONAS_RESTRINGIDAS",
    "ZONA_PROHIBIDA",
    "RESTRINGIDO",
    "NO_PASAR",
    "RESTRICTED",
    "RESTRICTED_ZONES"
  ]
};

/**
 * Parsea un archivo DXF ASCII y devuelve una estructura de entidades por capa y metadatos.
 * @param {string} dxfText Contenido del archivo DXF
 * @returns {object} { layers: string[], entities: Array, layerStats: object }
 */
export function parseDXF(dxfText) {
  if (typeof dxfText !== "string") {
    throw new Error("El contenido del DXF debe ser una cadena de texto.");
  }

  const lines = dxfText.split(/\r?\n/);
  const nLines = lines.length;
  let idx = 0;

  // Lector de pares código de grupo y valor
  function nextPair() {
    if (idx + 1 >= nLines) return null;
    const code = parseInt(lines[idx].trim(), 10);
    const value = lines[idx + 1].trim();
    idx += 2;
    return { code, value };
  }

  const entities = [];
  const layerStats = {};

  function registerLayer(layerName, entityType) {
    const l = layerName || "0";
    if (!layerStats[l]) {
      layerStats[l] = { name: l, count: 0, types: {} };
    }
    layerStats[l].count++;
    layerStats[l].types[entityType] = (layerStats[l].types[entityType] || 0) + 1;
  }

  // Avanzar hasta la sección ENTITIES
  let inEntitiesSection = false;
  while (idx < nLines) {
    const pair = nextPair();
    if (!pair) break;
    if (pair.code === 0 && pair.value === "SECTION") {
      const nextP = nextPair();
      if (nextP && nextP.code === 2 && nextP.value === "ENTITIES") {
        inEntitiesSection = true;
        break;
      }
    }
  }

  if (!inEntitiesSection) {
    // Si no tiene sección formal de ENTITIES, intentar leer entidades desde el inicio
    idx = 0;
  }

  while (idx < nLines) {
    const pair = nextPair();
    if (!pair) break;

    if (pair.code === 0) {
      if (pair.value === "ENDSEC" || pair.value === "EOF") {
        if (inEntitiesSection) break;
        continue;
      }

      const entityType = pair.value;

      if (entityType === "LINE") {
        let layer = "0";
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        while (idx < nLines) {
          if (lines[idx].trim() === "0") break;
          const p = nextPair();
          if (!p) break;
          if (p.code === 8) layer = p.value;
          else if (p.code === 10) x1 = parseFloat(p.value);
          else if (p.code === 20) y1 = parseFloat(p.value);
          else if (p.code === 11) x2 = parseFloat(p.value);
          else if (p.code === 21) y2 = parseFloat(p.value);
        }
        if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
          registerLayer(layer, "LINE");
          entities.push({
            type: "LINE",
            layer,
            vertices: [[x1, y1], [x2, y2]],
            closed: false
          });
        }
      } else if (entityType === "LWPOLYLINE") {
        let layer = "0";
        let isClosed = false;
        const vertices = [];
        let currX = null;
        let currY = null;
        let currBulge = 0;

        while (idx < nLines) {
          if (lines[idx].trim() === "0") break;
          const p = nextPair();
          if (!p) break;
          if (p.code === 8) {
            layer = p.value;
          } else if (p.code === 70) {
            const flag = parseInt(p.value, 10);
            if ((flag & 1) === 1) isClosed = true;
          } else if (p.code === 10) {
            if (currX !== null && currY !== null) {
              vertices.push({ x: currX, y: currY, bulge: currBulge });
            }
            currX = parseFloat(p.value);
            currBulge = 0;
          } else if (p.code === 20) {
            currY = parseFloat(p.value);
          } else if (p.code === 42) {
            currBulge = parseFloat(p.value) || 0;
          }
        }
        if (currX !== null && currY !== null) {
          vertices.push({ x: currX, y: currY, bulge: currBulge });
        }

        if (vertices.length >= 2) {
          registerLayer(layer, "LWPOLYLINE");
          const discretized = discretizeBulgePolyline(vertices, isClosed);
          entities.push({
            type: "LWPOLYLINE",
            layer,
            rawVertices: vertices,
            vertices: discretized,
            closed: isClosed
          });
        }
      } else if (entityType === "POLYLINE") {
        let layer = "0";
        let isClosed = false;
        while (idx < nLines) {
          if (lines[idx].trim() === "0") break;
          const p = nextPair();
          if (!p) break;
          if (p.code === 8) layer = p.value;
          else if (p.code === 70) {
            if ((parseInt(p.value, 10) & 1) === 1) isClosed = true;
          }
        }

        const vertices = [];
        // Leer subsecuencia de VERTEX hasta SEQEND
        while (idx < nLines) {
          const p0 = nextPair();
          if (!p0) break;
          if (p0.code === 0) {
            if (p0.value === "SEQEND") break;
            if (p0.value === "VERTEX") {
              let vx = 0, vy = 0, bulge = 0;
              while (idx < nLines) {
                if (lines[idx].trim() === "0") break;
                const vp = nextPair();
                if (!vp) break;
                if (vp.code === 10) vx = parseFloat(vp.value);
                else if (vp.code === 20) vy = parseFloat(vp.value);
                else if (vp.code === 42) bulge = parseFloat(vp.value) || 0;
              }
              vertices.push({ x: vx, y: vy, bulge });
            }
          }
        }

        if (vertices.length >= 2) {
          registerLayer(layer, "POLYLINE");
          const discretized = discretizeBulgePolyline(vertices, isClosed);
          entities.push({
            type: "POLYLINE",
            layer,
            rawVertices: vertices,
            vertices: discretized,
            closed: isClosed
          });
        }
      } else if (entityType === "CIRCLE") {
        let layer = "0";
        let cx = 0, cy = 0, r = 1;
        while (idx < nLines) {
          if (lines[idx].trim() === "0") break;
          const p = nextPair();
          if (!p) break;
          if (p.code === 8) layer = p.value;
          else if (p.code === 10) cx = parseFloat(p.value);
          else if (p.code === 20) cy = parseFloat(p.value);
          else if (p.code === 40) r = parseFloat(p.value);
        }
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && r > 0) {
          registerLayer(layer, "CIRCLE");
          const pts = [];
          const segs = 36;
          for (let s = 0; s < segs; s++) {
            const ang = (2 * Math.PI * s) / segs;
            pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
          }
          entities.push({
            type: "CIRCLE",
            layer,
            cx,
            cy,
            r,
            vertices: pts,
            closed: true
          });
        }
      } else if (entityType === "ARC") {
        let layer = "0";
        let cx = 0, cy = 0, r = 1, startAngDeg = 0, endAngDeg = 360;
        while (idx < nLines) {
          if (lines[idx].trim() === "0") break;
          const p = nextPair();
          if (!p) break;
          if (p.code === 8) layer = p.value;
          else if (p.code === 10) cx = parseFloat(p.value);
          else if (p.code === 20) cy = parseFloat(p.value);
          else if (p.code === 40) r = parseFloat(p.value);
          else if (p.code === 50) startAngDeg = parseFloat(p.value);
          else if (p.code === 51) endAngDeg = parseFloat(p.value);
        }
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r) && r > 0) {
          registerLayer(layer, "ARC");
          let sRad = (startAngDeg * Math.PI) / 180;
          let eRad = (endAngDeg * Math.PI) / 180;
          if (eRad <= sRad) eRad += 2 * Math.PI;
          const span = eRad - sRad;
          const nSegs = Math.max(6, Math.ceil(span / (Math.PI / 18)));
          const pts = [];
          for (let k = 0; k <= nSegs; k++) {
            const a = sRad + (span * k) / nSegs;
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
          }
          entities.push({
            type: "ARC",
            layer,
            cx,
            cy,
            r,
            vertices: pts,
            closed: false
          });
        }
      }
    }
  }

  const layerNames = Object.keys(layerStats).sort();

  return {
    layers: layerNames,
    layerStats,
    entities
  };
}

/**
 * Discretiza aristas con curvatura (código 42 bulge en polilíneas DXF).
 * Bulge = tan(ángulo_barrido / 4)
 */
function discretizeBulgePolyline(rawVerts, isClosed) {
  const result = [];
  const count = rawVerts.length;
  const maxIdx = isClosed ? count : count - 1;

  for (let i = 0; i < maxIdx; i++) {
    const p1 = rawVerts[i];
    const p2 = rawVerts[(i + 1) % count];

    result.push([p1.x, p1.y]);

    const bulge = p1.bulge || 0;
    if (Math.abs(bulge) > 1e-5) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const chordLen = Math.hypot(dx, dy);
      if (chordLen > 1e-4) {
        const theta = 4 * Math.atan(bulge);
        const radius = chordLen / (2 * Math.abs(Math.sin(theta / 2)));
        const sagitta = (bulge * chordLen) / 2;

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const normX = -dy / chordLen;
        const normY = dx / chordLen;

        const sign = bulge > 0 ? 1 : -1;
        const h = radius - Math.abs(sagitta);
        const centerDist = bulge > 0 ? (theta > Math.PI ? -h : h) : (theta < -Math.PI ? -h : h);
        const cx = mx + normX * centerDist * (bulge > 0 ? 1 : -1);
        const cy = my + normY * centerDist * (bulge > 0 ? 1 : -1);

        const a1 = Math.atan2(p1.y - cy, p1.x - cx);
        let a2 = Math.atan2(p2.y - cy, p2.x - cx);

        if (bulge > 0 && a2 < a1) a2 += 2 * Math.PI;
        if (bulge < 0 && a2 > a1) a2 -= 2 * Math.PI;

        const steps = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
        for (let s = 1; s < steps; s++) {
          const frac = s / steps;
          const a = a1 + (a2 - a1) * frac;
          result.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
        }
      }
    }
  }

  if (!isClosed && rawVerts.length > 0) {
    const last = rawVerts[rawVerts.length - 1];
    result.push([last.x, last.y]);
  }

  return result;
}

/**
 * Autodetecta las capas correspondientes a cada función según patrones estándar.
 * @param {string[]} availableLayers Lista de nombres de capas en el DXF
 * @returns {object} { trajectoryLayer, obstacleLayers: [], boundaryLayers: [], restrictedLayers: [] }
 */
export function detectSuggestedLayerMapping(availableLayers) {
  const normMap = new Map();
  for (const lyr of availableLayers) {
    normMap.set(normalizeLayerName(lyr), lyr);
  }

  // 1. Capa de trayectoria
  let trajectoryLayer = null;
  for (const candidate of SUGGESTED_LAYERS.TRAJECTORY) {
    const candNorm = normalizeLayerName(candidate);
    for (const [nKey, orig] of normMap.entries()) {
      if (nKey === candNorm || nKey.includes(candNorm)) {
        trajectoryLayer = orig;
        break;
      }
    }
    if (trajectoryLayer) break;
  }

  // 2. Capas de obstáculos
  const obstacleLayers = [];
  for (const candidate of SUGGESTED_LAYERS.OBSTACLES) {
    const candNorm = normalizeLayerName(candidate);
    for (const [nKey, orig] of normMap.entries()) {
      if ((nKey === candNorm || nKey.includes(candNorm)) && !obstacleLayers.includes(orig)) {
        obstacleLayers.push(orig);
      }
    }
  }

  // 3. Capas de bordes/bordillos
  const boundaryLayers = [];
  for (const candidate of SUGGESTED_LAYERS.BOUNDARIES) {
    const candNorm = normalizeLayerName(candidate);
    for (const [nKey, orig] of normMap.entries()) {
      if ((nKey === candNorm || nKey.includes(candNorm)) && !boundaryLayers.includes(orig) && !obstacleLayers.includes(orig)) {
        boundaryLayers.push(orig);
      }
    }
  }

  // 4. Capas de zonas restringidas
  const restrictedLayers = [];
  for (const candidate of SUGGESTED_LAYERS.RESTRICTED) {
    const candNorm = normalizeLayerName(candidate);
    for (const [nKey, orig] of normMap.entries()) {
      if ((nKey === candNorm || nKey.includes(candNorm)) && !restrictedLayers.includes(orig)) {
        restrictedLayers.push(orig);
      }
    }
  }

  return {
    trajectoryLayer,
    obstacleLayers,
    boundaryLayers,
    restrictedLayers
  };
}

/**
 * Convierte una polilínea continua de vértices 2D en una serie de tramos (straight/arc)
 * o waypoints compatibles con el motor cinemático de TurnSim.
 */
export function convertPolylineToManeuver(vertices, options = {}) {
  if (!vertices || vertices.length < 2) {
    throw new Error("La polilínea de trayectoria debe contener al menos 2 vértices.");
  }

  const direction = options.direction || 1; // 1: avance, -1: marcha atrás
  const agreementRadius = Math.max(5.0, Number(options.agreementRadius || 12.5));

  // Limpiar vértices idénticos o consecutivos extremadamente próximos (< 2 mm)
  const cleanPts = [];
  for (let i = 0; i < vertices.length; i++) {
    const pt = { x: vertices[i][0], y: vertices[i][1] };
    if (cleanPts.length === 0) {
      cleanPts.push(pt);
    } else {
      const prev = cleanPts[cleanPts.length - 1];
      if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.002) {
        cleanPts.push(pt);
      }
    }
  }

  if (cleanPts.length < 2) {
    throw new Error("La trayectoria no posee longitud métrica suficiente.");
  }

  // Si tiene 2 vértices, es un tramo recto directo
  if (cleanPts.length === 2) {
    const dx = cleanPts[1].x - cleanPts[0].x;
    const dy = cleanPts[1].y - cleanPts[0].y;
    const len = Math.hypot(dx, dy);
    let headingDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (direction === -1) {
      headingDeg = (headingDeg + 180) % 360;
    }
    return {
      startPose: {
        x: Number(cleanPts[0].x.toFixed(3)),
        y: Number(cleanPts[0].y.toFixed(3)),
        headingDeg: Number(headingDeg.toFixed(2)),
        initialArticulationDeg: 0
      },
      segments: [
        { type: "straight", length: Number(len.toFixed(3)), direction }
      ]
    };
  }

  // Si tiene 3 o más vértices: descomponer en tramos rectos y curvas tangentes sucesivas
  const segments = [];
  const n = cleanPts.length;
  let consumedPrev = 0;

  const dx0 = cleanPts[1].x - cleanPts[0].x;
  const dy0 = cleanPts[1].y - cleanPts[0].y;
  let startHeadingRad = Math.atan2(dy0, dx0);
  if (direction === -1) {
    startHeadingRad += Math.PI;
  }

  for (let i = 1; i < n - 1; i++) {
    const pPrev = cleanPts[i - 1];
    const pCurr = cleanPts[i];
    const pNext = cleanPts[i + 1];

    const v1x = pCurr.x - pPrev.x;
    const v1y = pCurr.y - pPrev.y;
    const v2x = pNext.x - pCurr.x;
    const v2y = pNext.y - pCurr.y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-4 || len2 < 1e-4) continue;

    const heading1 = Math.atan2(v1y, v1x);
    const heading2 = Math.atan2(v2y, v2x);

    let deltaAngle = heading2 - heading1;
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle <= -Math.PI) deltaAngle += 2 * Math.PI;

    if (Math.abs(deltaAngle) < 1e-4) {
      // Vértice colineal
      continue;
    }

    let R = agreementRadius;
    const halfDelta = Math.abs(deltaAngle) / 2;
    let tangentDist = R * Math.tan(halfDelta);

    const maxTangent = Math.min(len1 - consumedPrev - 0.1, len2 * 0.48);
    if (tangentDist > maxTangent && maxTangent > 0.2) {
      tangentDist = maxTangent;
      R = tangentDist / Math.tan(halfDelta);
    }

    const straightBefore = Math.max(0, len1 - consumedPrev - tangentDist);
    if (straightBefore > 1e-3) {
      segments.push({ type: "straight", length: Number(straightBefore.toFixed(3)), direction });
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

  const lastIdx = cleanPts.length - 1;
  const lastLen = Math.hypot(
    cleanPts[lastIdx].x - cleanPts[lastIdx - 1].x,
    cleanPts[lastIdx].y - cleanPts[lastIdx - 1].y
  );
  const remainingLast = Math.max(0, lastLen - consumedPrev);
  if (remainingLast > 1e-3) {
    segments.push({ type: "straight", length: Number(remainingLast.toFixed(3)), direction });
  }

  return {
    startPose: {
      x: Number(cleanPts[0].x.toFixed(3)),
      y: Number(cleanPts[0].y.toFixed(3)),
      headingDeg: Number(((startHeadingRad * 180) / Math.PI).toFixed(2)),
      initialArticulationDeg: 0
    },
    segments
  };
}

/**
 * Procesa las entidades del DXF según la asignación de capas elegida y genera:
 * - maneuver: { startPose, segments }
 * - obstacles: Array de obstáculos compatibles con TurnSim
 * - backgroundEntities: Dibujo de fondo contextual
 * - bounds: Bounding box métrico global [minX, minY, maxX, maxY]
 */
export function buildScenarioFromDXF(parsedDxf, mapping, options = {}) {
  const { trajectoryLayer, obstacleLayers = [], boundaryLayers = [], restrictedLayers = [] } = mapping;
  const entities = parsedDxf.entities || [];

  let trajectoryEntity = null;
  const obstacles = [];
  const backgroundEntities = [];

  let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
  function updateBounds(pts) {
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  let obsCounter = 1;

  for (const ent of entities) {
    if (!ent.vertices || ent.vertices.length < 2) continue;
    updateBounds(ent.vertices);

    if (trajectoryLayer && ent.layer === trajectoryLayer && !trajectoryEntity) {
      trajectoryEntity = ent;
      continue;
    }

    if (obstacleLayers.includes(ent.layer)) {
      obstacles.push({
        id: `dxf_obs_${obsCounter++}`,
        name: `Obstáculo CAD (${ent.layer} #${obsCounter})`,
        type: "building",
        shape: ent.closed ? "polygon" : "polyline",
        vertices: ent.vertices,
        color: "#ef4444",
        enabled: true
      });
    } else if (boundaryLayers.includes(ent.layer)) {
      obstacles.push({
        id: `dxf_curb_${obsCounter++}`,
        name: `Borde/Bordillo (${ent.layer} #${obsCounter})`,
        type: "road_edge",
        shape: "polyline",
        vertices: ent.vertices,
        color: "#f59e0b",
        enabled: true
      });
    } else if (restrictedLayers.includes(ent.layer)) {
      obstacles.push({
        id: `dxf_restr_${obsCounter++}`,
        name: `Zona Restringida (${ent.layer} #${obsCounter})`,
        type: "restricted_zone",
        shape: ent.closed ? "polygon" : "polyline",
        vertices: ent.vertices,
        color: "#eab308",
        enabled: true
      });
    } else {
      // Elemento de contexto visual
      backgroundEntities.push({
        layer: ent.layer,
        vertices: ent.vertices,
        closed: Boolean(ent.closed)
      });
    }
  }

  let maneuver = null;
  if (trajectoryEntity) {
    maneuver = convertPolylineToManeuver(trajectoryEntity.vertices, options);
  }

  const bounds = Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;

  return {
    maneuver,
    obstacles,
    backgroundEntities,
    bounds,
    trajectoryEntity
  };
}

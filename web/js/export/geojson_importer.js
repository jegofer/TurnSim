/**
 * Parser e importador de archivos geoespaciales GeoJSON en cliente para TurnSim
 * Soporta GeoJSON estándar (IETF RFC 7946) con coordenadas geodésicas WGS84 / ETRS89
 * y coordenadas proyectadas métricas UTM (ETRS89 / ED50).
 *
 * Integra referenciación espacial recíproca con la capa de ortofotografías del PNOA
 * (Plan Nacional de Ortofotografía Aérea - Instituto Geográfico Nacional de España).
 */

import { convertPolylineToManeuver } from "./dxf_importer.js";

/**
 * Constantes geodésicas del elipsoide GRS80 / WGS84 y Web Mercator EPSG:3857
 */
export const WGS84_A = 6378137.0; // Semieje mayor ecuatorial (m)
export const WGS84_E2 = 0.00669437999014; // Primera excentricidad al cuadrado
export const WEB_MERCATOR_C = 40075016.68557849; // Circunferencia ecuatorial (m)

/**
 * Normaliza nombres de capas o propiedades para comparaciones insensibles a mayúsculas y acentos.
 */
function normalizeName(str) {
  return String(str || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-]+/g, "_");
}

/**
 * Patrones de clasificación para capas y propiedades de entidades viales en GeoJSON
 */
export const GEOJSON_LAYER_PATTERNS = {
  TRAJECTORY: [
    "EJE", "EJE_VIAL", "EJE_TRAYECTORIA", "EJE_CAMION", "TRAYECTORIA",
    "TRAJECTORY", "CENTERLINE", "AXIS", "SWEPT_AXIS", "RUTA", "ROUTE", "PATH"
  ],
  CURBS_AND_EDGES: [
    "BORDILLO", "BORDILLOS", "BORDE", "BORDES", "BORDE_CALZADA", "CURB",
    "CURBS", "ROAD_EDGE", "EDGE", "CARRETERA_BORDE", "ACERA", "ACERAS", "SIDEWALK"
  ],
  ISLANDS: [
    "ISLETA", "ISLETAS", "ISLETA_DEFLECTORA", "ISLOTE", "ISLOTE_CENTRAL",
    "GLORIETA", "ROTONDA", "ROUNDABOUT", "ISLAND", "TRAFFIC_ISLAND", "MEDIANA"
  ],
  BUILDINGS_AND_BARRIERS: [
    "EDIFICIO", "EDIFICIOS", "BUILDING", "BUILDINGS", "MURO", "MUROS", "WALL",
    "VALLA", "VALLAS", "FENCE", "OBSTACULO", "OBSTACULOS", "OBSTACLE", "BARRIER"
  ],
  RESTRICTED_ZONING: [
    "ZONA_RESTRINGIDA", "RESTRICTED", "NO_ENTRADA", "PROHIBIDO", "ZONA_EXCLUIDA"
  ],
  ROADWAY_BACKGROUND: [
    "CALZADA", "CALZADAS", "CARRIL", "CARRILES", "LANE", "ROADWAY", "PAVIMENTO",
    "LINEA", "MARCA_VIAL", "MARCAS_VIALES", "FONDO", "BACKGROUND", "CAD_BACKGROUND"
  ]
};

/**
 * Transforma coordenadas geodésicas WGS84 (longitud, latitud) a coordenadas métricas
 * locales (wx, wy) con centro en (centerLon, centerLat).
 *
 * Utiliza la proyección conforme Web Mercator EPSG:3857 escalada por cos(lat0),
 * coincidiendo con exactitud nanométrica con la capa de ortofotos PNOA de TurnSim.
 *
 * @param {number} lon Longitud en grados decimales WGS84
 * @param {number} lat Latitud en grados decimales WGS84
 * @param {number} centerLon Longitud del origen local
 * @param {number} centerLat Latitud del origen local
 * @returns {[number, number]} [wx, wy] en metros
 */
export function projectWgs84ToLocalMeters(lon, lat, centerLon, centerLat) {
  const radLat0 = (centerLat * Math.PI) / 180;
  const cosLat0 = Math.cos(radLat0);
  const C = WEB_MERCATOR_C;

  const anchorX3857 = (centerLon * C) / 360;
  const sinLat0 = Math.max(-0.9999, Math.min(0.9999, Math.sin(radLat0)));
  const anchorY3857 = (Math.log((1 + sinLat0) / (1 - sinLat0)) / 2) * (C / (2 * Math.PI));

  const ptX3857 = (lon * C) / 360;
  const radLat = (lat * Math.PI) / 180;
  const sinLat = Math.max(-0.9999, Math.min(0.9999, Math.sin(radLat)));
  const ptY3857 = (Math.log((1 + sinLat) / (1 - sinLat)) / 2) * (C / (2 * Math.PI));

  const wx = (ptX3857 - anchorX3857) * cosLat0;
  const wy = (ptY3857 - anchorY3857) * cosLat0;

  return [Number(wx.toFixed(4)), Number(wy.toFixed(4))];
}

/**
 * Transforma coordenadas métricas locales (wx, wy) de vuelta a longitud y latitud WGS84.
 */
export function projectLocalMetersToWgs84(wx, wy, centerLon, centerLat) {
  const radLat0 = (centerLat * Math.PI) / 180;
  const cosLat0 = Math.cos(radLat0);
  const C = WEB_MERCATOR_C;

  const anchorX3857 = (centerLon * C) / 360;
  const sinLat0 = Math.max(-0.9999, Math.min(0.9999, Math.sin(radLat0)));
  const anchorY3857 = (Math.log((1 + sinLat0) / (1 - sinLat0)) / 2) * (C / (2 * Math.PI));

  const ptX3857 = anchorX3857 + wx / cosLat0;
  const ptY3857 = anchorY3857 + wy / cosLat0;

  const lon = (ptX3857 * 360) / C;
  const radLat = 2 * Math.atan(Math.exp((ptY3857 * 2 * Math.PI) / C)) - Math.PI / 2;
  const lat = (radLat * 180) / Math.PI;

  return {
    lon: Number(lon.toFixed(7)),
    lat: Number(lat.toFixed(7))
  };
}

/**
 * Conversión de coordenadas UTM (Huso España 28-31 ETRS89) a Latitud/Longitud WGS84.
 */
export function utmToWgs84(easting, northing, zone = 30, northernHemisphere = true) {
  const a = WGS84_A;
  const e2 = WGS84_E2;
  const ePrime2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const x = easting - 500000.0;
  const y = northernHemisphere ? northing : northing - 10000000.0;

  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * Math.pow(e2, 2) / 64 - 5 * Math.pow(e2, 3) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const j1 = (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32);
  const j2 = (21 * Math.pow(e1, 2) / 16 - 55 * Math.pow(e1, 4) / 32);
  const j3 = (151 * Math.pow(e1, 3) / 96);
  const j4 = (1097 * Math.pow(e1, 4) / 512);

  const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu) + j4 * Math.sin(8 * mu);

  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);

  const c1 = ePrime2 * Math.pow(cosFp, 2);
  const t1 = Math.pow(tanFp, 2);
  const n1 = a / Math.sqrt(1 - e2 * Math.pow(sinFp, 2));
  const r1 = a * (1 - e2) / Math.pow(1 - e2 * Math.pow(sinFp, 2), 1.5);
  const d = x / (n1 * k0);

  const latRad = fp - (n1 * tanFp / r1) * (
    Math.pow(d, 2) / 2 -
    (5 + 3 * t1 + 10 * c1 - 4 * Math.pow(c1, 2) - 9 * ePrime2) * Math.pow(d, 4) / 24 +
    (61 + 90 * t1 + 298 * c1 + 45 * Math.pow(t1, 2) - 252 * ePrime2 - 3 * Math.pow(c1, 2)) * Math.pow(d, 6) / 720
  );

  const lonRad = ((zone * 6 - 183) * Math.PI / 180) + (
    d -
    (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6 +
    (5 - 2 * c1 + 28 * t1 - 3 * Math.pow(c1, 2) + 8 * ePrime2 + 24 * Math.pow(t1, 2)) * Math.pow(d, 5) / 120
  ) / cosFp;

  return {
    lat: Number(((latRad * 180) / Math.PI).toFixed(7)),
    lon: Number(((lonRad * 180) / Math.PI).toFixed(7))
  };
}

/**
 * Analiza un objeto o cadena GeoJSON y extrae una lista estructurada de geometrías.
 *
 * @param {string|object} geojsonInput Contenido GeoJSON
 * @returns {Array<object>} Entidades vectoriales con propiedades y geometrías normalizadas
 */
export function parseGeoJSON(geojsonInput) {
  let geojson = geojsonInput;
  if (typeof geojson === "string") {
    try {
      geojson = JSON.parse(geojson);
    } catch (err) {
      throw new Error(`Error de sintaxis JSON en el archivo GeoJSON: ${err.message}`);
    }
  }

  if (!geojson || typeof geojson !== "object") {
    throw new Error("El archivo proporcionado no es un objeto GeoJSON válido.");
  }

  const rawFeatures = [];

  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    for (const f of geojson.features) {
      if (f && f.geometry) rawFeatures.push(f);
    }
  } else if (geojson.type === "Feature" && geojson.geometry) {
    rawFeatures.push(geojson);
  } else if (geojson.type && Array.isArray(geojson.coordinates)) {
    // Geometría pura (Polygon, LineString, etc.)
    rawFeatures.push({ type: "Feature", properties: {}, geometry: geojson });
  } else if (geojson.type === "GeometryCollection" && Array.isArray(geojson.geometries)) {
    for (const g of geojson.geometries) {
      if (g) rawFeatures.push({ type: "Feature", properties: {}, geometry: g });
    }
  } else {
    throw new Error("Estructura GeoJSON no reconocida. Se esperaba un FeatureCollection o Feature válido.");
  }

  return rawFeatures;
}

/**
 * Determina si las coordenadas de una muestra son geodésicas (grados) o métricas proyectadas (UTM).
 */
export function isGeographicCoordinates(x, y) {
  return Math.abs(x) <= 180.0 && Math.abs(y) <= 90.0;
}

/**
 * Construye una configuración de ortofoto PNOA (IGN) alineada exactamente con el
 * origen local UTM (`originOffset`) de un plano DXF en coordenadas ETRS89 UTM (España).
 */
export function buildPnoaConfigFromUtmOrigin(originOffset, utmZone = 30) {
  if (!originOffset || !Number.isFinite(originOffset.x) || !Number.isFinite(originOffset.y)) {
    return null;
  }
  const geo = utmToWgs84(originOffset.x, originOffset.y, utmZone, true);
  return {
    enabled: true,
    centerLat: geo.lat,
    centerLon: geo.lon,
    utmZone,
    anchorWorldX: 0.0,
    anchorWorldY: 0.0,
    opacity: 0.8
  };
}

/**
 * Inspecciona un archivo GeoJSON para mostrar resumen de geometrías, sistema de coordenadas
 * y rol sugerido (ejes de referencia, obstáculos, bordes, fondo o detección automática).
 */
export function inspectGeoJSONFile(geojsonInput, fileName = "archivo.geojson") {
  const features = parseGeoJSON(geojsonInput);
  const geomCounts = {};
  let isUtm = false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  function registerCoord(c) {
    if (!Array.isArray(c) || c.length < 2) return;
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!isGeographicCoordinates(x, y)) isUtm = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function scanGeom(geom) {
    if (!geom || !geom.coordinates) return;
    const t = geom.type;
    geomCounts[t] = (geomCounts[t] || 0) + 1;
    const c = geom.coordinates;
    if (t === "Point") registerCoord(c);
    else if (t === "LineString" || t === "MultiPoint") {
      for (const pt of c) registerCoord(pt);
    } else if (t === "Polygon" || t === "MultiLineString") {
      for (const ring of c) {
        if (Array.isArray(ring)) for (const pt of ring) registerCoord(pt);
      }
    } else if (t === "MultiPolygon") {
      for (const poly of c) {
        if (Array.isArray(poly)) {
          for (const ring of poly) {
            if (Array.isArray(ring)) for (const pt of ring) registerCoord(pt);
          }
        }
      }
    }
  }

  for (const f of features) {
    scanGeom(f.geometry);
  }

  // Sugerir rol por nombre de archivo y tipos geométricos predominantes
  const normFile = normalizeName(fileName.replace(/\.[^.]+$/, ""));
  const hasLines = (geomCounts.LineString || 0) + (geomCounts.MultiLineString || 0) > 0;
  const hasPolys = (geomCounts.Polygon || 0) + (geomCounts.MultiPolygon || 0) > 0;
  const hasPoints = (geomCounts.Point || 0) + (geomCounts.MultiPoint || 0) > 0;

  let suggestedRole = "auto";
  if (/OBSTAC|ENVOLV|EDIFIC|MURO|VALLA|BARRER|BUILD|OBST/.test(normFile)) {
    suggestedRole = "obstacles";
  } else if (/EJE|VIAL|AXIS|CENTERLINE|EJE_VIAL|CARRETERA|ROAD_AX/.test(normFile) && hasLines && !hasPolys) {
    suggestedRole = "reference_axes";
  } else if (/BORDILL|BORDE|ACERA|CURB|EDGE/.test(normFile)) {
    suggestedRole = "boundaries";
  } else if (/RESTRING|PROHIB|EXCLUID|PEATON/.test(normFile)) {
    suggestedRole = "restricted";
  } else if (/FONDO|CONTEXT|PARCELA|BASE|BACKGR/.test(normFile)) {
    suggestedRole = "background";
  } else {
    // Si tiene propiedades explícitas conocidas, usar 'auto'; si no, inferir por geometría
    const hasLayerHints = features.some((f) => {
      const p = f.properties || {};
      return Boolean(p.layer || p.capa || p.tipo || p.type || p.role || p.isTrajectory);
    });
    if (!hasLayerHints) {
      if (hasLines && !hasPolys && !hasPoints) suggestedRole = "reference_axes";
      else if (hasPolys) suggestedRole = "obstacles";
    }
  }

  return {
    fileName,
    features,
    featureCount: features.length,
    geomCounts,
    isUtm,
    rawBounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
    suggestedRole
  };
}

/**
 * Construye un escenario unificado a partir de uno o varios archivos GeoJSON,
 * proyectando todas las entidades bajo un único origen común (o reutilizando
 * `options.sharedOrigin` al añadir capas a una escena georreferenciada activa).
 *
 * @param {Array<{ fileName?: string, features?: Array, geojson?: string|object, role?: string }>} fileEntries
 * @param {object} options { utmZone, sharedOrigin, direction, agreementRadius }
 */
export function buildScenarioFromGeoJSONFiles(fileEntries, options = {}) {
  if (!Array.isArray(fileEntries) || fileEntries.length === 0) {
    throw new Error("Debe proporcionar al menos un archivo GeoJSON válido.");
  }

  const normalizedEntries = fileEntries.map((entry, idx) => {
    const feats = Array.isArray(entry.features)
      ? entry.features
      : parseGeoJSON(entry.geojson);
    return {
      fileName: entry.fileName || `capa_${idx + 1}.geojson`,
      features: feats,
      role: entry.role || "auto"
    };
  });

  // 1. Detección global de CRS y bounding box conjunto (si no hay sharedOrigin previo)
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let detectedUtm = false;

  function registerCoord(c) {
    if (!Array.isArray(c) || c.length < 2) return;
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!isGeographicCoordinates(x, y)) detectedUtm = true;
    if (x < minLon) minLon = x;
    if (x > maxLon) maxLon = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }

  function scanCoords(geom) {
    if (!geom || !geom.coordinates) return;
    const c = geom.coordinates;
    const type = geom.type;
    if (type === "Point") {
      registerCoord(c);
    } else if (type === "LineString" || type === "MultiPoint") {
      for (const pt of c) registerCoord(pt);
    } else if (type === "Polygon" || type === "MultiLineString") {
      for (const ring of c) {
        if (Array.isArray(ring)) for (const pt of ring) registerCoord(pt);
      }
    } else if (type === "MultiPolygon") {
      for (const poly of c) {
        if (Array.isArray(poly)) {
          for (const ring of poly) {
            if (Array.isArray(ring)) for (const pt of ring) registerCoord(pt);
          }
        }
      }
    }
  }

  let totalFeatures = 0;
  for (const entry of normalizedEntries) {
    for (const feat of entry.features) {
      totalFeatures++;
      scanCoords(feat.geometry);
    }
  }

  if (totalFeatures === 0 || !Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
    throw new Error("No se encontraron coordenadas válidas en las geometrías GeoJSON.");
  }

  const utmZone = Number(options.utmZone || options.sharedOrigin?.utmZone || 30);
  let sharedOrigin = options.sharedOrigin ? { ...options.sharedOrigin } : null;

  if (!sharedOrigin) {
    if (detectedUtm) {
      const utmCenterX = 0.5 * (minLon + maxLon);
      const utmCenterY = 0.5 * (minLat + maxLat);
      const geoCenter = utmToWgs84(utmCenterX, utmCenterY, utmZone, true);
      sharedOrigin = {
        isUtm: true,
        utmZone,
        utmCenterX,
        utmCenterY,
        centerLon: geoCenter.lon,
        centerLat: geoCenter.lat
      };
    } else {
      sharedOrigin = {
        isUtm: false,
        utmZone,
        utmCenterX: null,
        utmCenterY: null,
        centerLon: Number((0.5 * (minLon + maxLon)).toFixed(7)),
        centerLat: Number((0.5 * (minLat + maxLat)).toFixed(7))
      };
    }
  }

  const centerLon = sharedOrigin.centerLon;
  const centerLat = sharedOrigin.centerLat;

  // 2. Proyección métrica local unificada (admite mezcla WGS84 y UTM contra el mismo origen)
  const toLocalMeters = (coord) => {
    const rawX = Number(coord[0]);
    const rawY = Number(coord[1]);
    const coordIsUtm = !isGeographicCoordinates(rawX, rawY);

    if (coordIsUtm) {
      if (sharedOrigin.isUtm && Number.isFinite(sharedOrigin.utmCenterX) && Number.isFinite(sharedOrigin.utmCenterY)) {
        return [
          Number((rawX - sharedOrigin.utmCenterX).toFixed(4)),
          Number((rawY - sharedOrigin.utmCenterY).toFixed(4))
        ];
      }
      // Si el origen es WGS84 pero esta entidad viene en UTM, convertir primero a WGS84
      const wgs = utmToWgs84(rawX, rawY, utmZone, true);
      return projectWgs84ToLocalMeters(wgs.lon, wgs.lat, centerLon, centerLat);
    }

    return projectWgs84ToLocalMeters(rawX, rawY, centerLon, centerLat);
  };

  // 3. Extracción de geometrías clasificadas
  const obstacles = [];
  const referenceAxes = [];
  const backgroundEntities = [];
  let trajectoryEntity = null;
  let obsCounter = 1;
  let axisCounter = 1;

  let localMinX = Infinity, localMaxX = -Infinity, localMinY = Infinity, localMaxY = -Infinity;
  function updateLocalBounds(pts) {
    for (const [x, y] of pts) {
      if (x < localMinX) localMinX = x;
      if (x > localMaxX) localMaxX = x;
      if (y < localMinY) localMinY = y;
      if (y > localMaxY) localMaxY = y;
    }
  }

  function matchesPattern(text, patterns) {
    const norm = normalizeName(text);
    if (!norm) return false;
    return patterns.some((p) => norm.includes(p) || p.includes(norm));
  }

  for (const entry of normalizedEntries) {
    const forcedRole = entry.role || "auto";
    const baseLayerName = entry.fileName.replace(/\.[^.]+$/, "");

    for (const feat of entry.features) {
      const props = feat.properties || {};
      const geom = feat.geometry;
      if (!geom) continue;

      const layerTag = props.layer || props.capa || props.tipo || props.type || props.name || props.highway || baseLayerName;
      const nameTag = props.name || props.nombre || props.id || `Elemento #${obsCounter}`;
      const geomType = geom.type;

      // Modo de rol forzado por archivo (ideal para flujos con 2 archivos: ejes + obstáculos)
      if (forcedRole !== "auto") {
        if (forcedRole === "reference_axes") {
          const lines = geomType === "LineString"
            ? [geom.coordinates]
            : (geomType === "MultiLineString" ? geom.coordinates : []);
          for (const line of lines) {
            const vertices = line.map(toLocalMeters);
            if (vertices.length < 2) continue;
            updateLocalBounds(vertices);
            referenceAxes.push({
              id: `geo_axis_${axisCounter}`,
              name: props.name || props.nombre || `Eje vial (${baseLayerName} #${axisCounter})`,
              layer: baseLayerName,
              vertices,
              closed: false
            });
            axisCounter++;
          }
          continue;
        }

        if (forcedRole === "obstacles" || forcedRole === "boundaries" || forcedRole === "restricted") {
          const obsType = forcedRole === "boundaries"
            ? "road_edge"
            : (forcedRole === "restricted" ? "restricted_zone" : "building");
          const obsColor = forcedRole === "boundaries"
            ? "#f59e0b"
            : (forcedRole === "restricted" ? "#eab308" : "#ef4444");

          if (geomType === "LineString" || geomType === "MultiLineString") {
            const lines = geomType === "LineString" ? [geom.coordinates] : geom.coordinates;
            for (const line of lines) {
              const vertices = line.map(toLocalMeters);
              if (vertices.length < 2) continue;
              updateLocalBounds(vertices);
              obstacles.push({
                id: `geo_obs_${obsCounter}`,
                name: props.name || props.nombre || `Obstáculo GIS (${baseLayerName} #${obsCounter})`,
                type: obsType,
                shape: "polyline",
                vertices,
                color: props.color || obsColor,
                enabled: true
              });
              obsCounter++;
            }
          } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
            const polys = geomType === "Polygon" ? [geom.coordinates] : geom.coordinates;
            for (const poly of polys) {
              const exterior = poly[0]?.map(toLocalMeters) || [];
              if (exterior.length < 3) continue;
              updateLocalBounds(exterior);
              obstacles.push({
                id: `geo_obs_${obsCounter}`,
                name: props.name || props.nombre || `Obstáculo GIS (${baseLayerName} #${obsCounter})`,
                type: obsType,
                shape: "polygon",
                vertices: exterior,
                color: props.color || obsColor,
                heightM: props.heightM || (forcedRole === "obstacles" ? 3.5 : 0.25),
                enabled: true
              });
              obsCounter++;
            }
          } else if (geomType === "Point") {
            const [px, py] = toLocalMeters(geom.coordinates);
            updateLocalBounds([[px, py]]);
            obstacles.push({
              id: `geo_pt_${obsCounter}`,
              name: props.name || props.nombre || `Pilar / Punto (${baseLayerName} #${obsCounter})`,
              type: "column",
              shape: "circle",
              x: px,
              y: py,
              radius: Number(props.radius || 0.35),
              heightM: Number(props.heightM || 3.0),
              color: props.color || "#f97316",
              enabled: true
            });
            obsCounter++;
          }
          continue;
        }

        if (forcedRole === "background") {
          if (geomType === "LineString" || geomType === "MultiLineString") {
            const lines = geomType === "LineString" ? [geom.coordinates] : geom.coordinates;
            for (const line of lines) {
              const vertices = line.map(toLocalMeters);
              if (vertices.length < 2) continue;
              updateLocalBounds(vertices);
              backgroundEntities.push({ layer: baseLayerName, vertices, closed: false, color: props.color || "#64748b" });
            }
          } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
            const polys = geomType === "Polygon" ? [geom.coordinates] : geom.coordinates;
            for (const poly of polys) {
              const exterior = poly[0]?.map(toLocalMeters) || [];
              if (exterior.length < 3) continue;
              updateLocalBounds(exterior);
              backgroundEntities.push({ layer: baseLayerName, vertices: exterior, closed: true, color: props.color || "#64748b" });
            }
          }
          continue;
        }
      }

      // Modo automático por propiedades internas (retrocompatible con buildScenarioFromGeoJSON)
      const isExplicitTrajectory =
        matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.TRAJECTORY) ||
        matchesPattern(props.role || "", GEOJSON_LAYER_PATTERNS.TRAJECTORY) ||
        props.isTrajectory === true;

      const isCurbOrEdge = matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.CURBS_AND_EDGES);
      const isIsland = matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.ISLANDS);
      const isBuildingOrBarrier = matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.BUILDINGS_AND_BARRIERS);
      const isRestricted = matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.RESTRICTED_ZONING);

      if (geomType === "LineString") {
        const vertices = geom.coordinates.map(toLocalMeters);
        updateLocalBounds(vertices);

        if (isExplicitTrajectory && !trajectoryEntity && vertices.length >= 2) {
          trajectoryEntity = {
            layer: layerTag || "EJE_TRAYECTORIA",
            vertices,
            properties: props
          };
        } else if (isCurbOrEdge) {
          obstacles.push({
            id: `geo_curb_${obsCounter++}`,
            name: nameTag.startsWith("Elemento") ? `Borde de calzada / Bordillo (${nameTag})` : nameTag,
            type: "road_edge",
            shape: "polyline",
            vertices,
            color: props.color || "#f59e0b",
            enabled: true
          });
        } else if (isIsland) {
          obstacles.push({
            id: `geo_island_${obsCounter++}`,
            name: nameTag,
            type: "roundabout_island",
            shape: "polyline",
            vertices,
            color: props.color || "#10b981",
            enabled: true
          });
        } else if (isBuildingOrBarrier) {
          obstacles.push({
            id: `geo_bar_${obsCounter++}`,
            name: nameTag,
            type: "building",
            shape: "polyline",
            vertices,
            color: props.color || "#ef4444",
            enabled: true
          });
        } else {
          backgroundEntities.push({
            layer: layerTag || "VIAL_LINEA",
            vertices,
            closed: false,
            color: props.color || "#38bdf8"
          });
        }
      } else if (geomType === "MultiLineString") {
        for (const line of geom.coordinates) {
          const vertices = line.map(toLocalMeters);
          updateLocalBounds(vertices);

          if (isCurbOrEdge) {
            obstacles.push({
              id: `geo_curb_${obsCounter++}`,
              name: `${nameTag} (Tramo)`,
              type: "road_edge",
              shape: "polyline",
              vertices,
              color: props.color || "#f59e0b",
              enabled: true
            });
          } else if (isBuildingOrBarrier) {
            obstacles.push({
              id: `geo_bar_${obsCounter++}`,
              name: `${nameTag} (Tramo)`,
              type: "building",
              shape: "polyline",
              vertices,
              color: props.color || "#ef4444",
              enabled: true
            });
          } else {
            backgroundEntities.push({
              layer: layerTag || "VIAL_MULTILINEA",
              vertices,
              closed: false,
              color: props.color || "#38bdf8"
            });
          }
        }
      } else if (geomType === "Polygon") {
        const exterior = geom.coordinates[0]?.map(toLocalMeters) || [];
        if (exterior.length >= 3) {
          updateLocalBounds(exterior);

          if (isIsland) {
            obstacles.push({
              id: `geo_island_${obsCounter++}`,
              name: nameTag.startsWith("Elemento") ? `Isleta / Rotonda (${nameTag})` : nameTag,
              type: "roundabout_central",
              shape: "polygon",
              vertices: exterior,
              color: props.color || "#10b981",
              heightM: props.heightM || 0.25,
              enabled: true
            });
          } else if (isBuildingOrBarrier) {
            obstacles.push({
              id: `geo_bld_${obsCounter++}`,
              name: nameTag.startsWith("Elemento") ? `Edificación / Obstáculo (${nameTag})` : nameTag,
              type: "building",
              shape: "polygon",
              vertices: exterior,
              color: props.color || "#ef4444",
              heightM: props.heightM || 4.0,
              enabled: true
            });
          } else if (isRestricted) {
            obstacles.push({
              id: `geo_restr_${obsCounter++}`,
              name: nameTag,
              type: "restricted_zone",
              shape: "polygon",
              vertices: exterior,
              color: props.color || "#eab308",
              enabled: true
            });
          } else if (isCurbOrEdge) {
            obstacles.push({
              id: `geo_curb_${obsCounter++}`,
              name: nameTag,
              type: "road_edge",
              shape: "polygon",
              vertices: exterior,
              color: props.color || "#f59e0b",
              enabled: true
            });
          } else {
            backgroundEntities.push({
              layer: layerTag || "SUPERFICIE_CALZADA",
              vertices: exterior,
              closed: true,
              color: props.color || "#64748b"
            });
          }
        }
      } else if (geomType === "MultiPolygon") {
        for (const poly of geom.coordinates) {
          const exterior = poly[0]?.map(toLocalMeters) || [];
          if (exterior.length >= 3) {
            updateLocalBounds(exterior);
            obstacles.push({
              id: `geo_poly_${obsCounter++}`,
              name: `${nameTag} (Parte)`,
              type: isIsland ? "roundabout_island" : "building",
              shape: "polygon",
              vertices: exterior,
              color: isIsland ? "#10b981" : "#ef4444",
              enabled: true
            });
          }
        }
      } else if (geomType === "Point") {
        const [px, py] = toLocalMeters(geom.coordinates);
        updateLocalBounds([[px, py]]);
        obstacles.push({
          id: `geo_point_${obsCounter++}`,
          name: nameTag.startsWith("Elemento") ? `Pilar / Farola (${nameTag})` : nameTag,
          type: "column",
          shape: "circle",
          x: px,
          y: py,
          radius: Number(props.radius || 0.35),
          heightM: Number(props.heightM || 3.0),
          color: props.color || "#f97316",
          enabled: true
        });
      }
    }
  }

  let maneuver = null;
  if (trajectoryEntity && trajectoryEntity.vertices && trajectoryEntity.vertices.length >= 2) {
    try {
      maneuver = convertPolylineToManeuver(trajectoryEntity.vertices, options);
    } catch (err) {
      console.warn("No se pudo inferir la maniobra automática del eje GeoJSON:", err);
    }
  }

  const bounds = Number.isFinite(localMinX)
    ? { minX: localMinX, minY: localMinY, maxX: localMaxX, maxY: localMaxY }
    : null;

  return {
    maneuver,
    referenceAxes,
    obstacles,
    backgroundEntities,
    bounds,
    trajectoryEntity,
    sharedOrigin,
    geoCenter: {
      lat: Number(centerLat.toFixed(7)),
      lon: Number(centerLon.toFixed(7))
    },
    pnoaConfig: {
      enabled: true,
      centerLat: Number(centerLat.toFixed(7)),
      centerLon: Number(centerLon.toFixed(7)),
      utmZone,
      anchorWorldX: 0.0,
      anchorWorldY: 0.0,
      opacity: 0.8
    }
  };
}

/**
 * Convierte un FeatureCollection o Feature GeoJSON en un escenario completo de TurnSim,
 * proyectando las geometrías al sistema métrico local y georreferenciando automáticamente
 * la capa de ortofotos PNOA del IGN.
 */
export function buildScenarioFromGeoJSON(geojsonInput, options = {}) {
  const features = parseGeoJSON(geojsonInput);
  if (features.length === 0) {
    throw new Error("El archivo GeoJSON no contiene ninguna entidad geométrica procesable.");
  }
  return buildScenarioFromGeoJSONFiles(
    [{ fileName: options.fileName || "escenario.geojson", features, role: options.role || "auto" }],
    options
  );
}

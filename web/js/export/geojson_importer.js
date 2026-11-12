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
 * Convierte un FeatureCollection o Feature GeoJSON en un escenario completo de TurnSim,
 * proyectando las geometrías al sistema métrico local y georreferenciando automáticamente
 * la capa de ortofotos PNOA del IGN.
 *
 * @param {string|object} geojsonInput
 * @param {object} options Opciones de configuración
 * @returns {object} Escenario con maneuver, obstacles, backgroundEntities, bounds, geoCenter y pnoaConfig
 */
export function buildScenarioFromGeoJSON(geojsonInput, options = {}) {
  const features = parseGeoJSON(geojsonInput);
  if (features.length === 0) {
    throw new Error("El archivo GeoJSON no contiene ninguna entidad geométrica procesable.");
  }

  // 1. Detección del sistema de coordenadas y cálculo del bounding box global
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let isUtm = false;

  function registerCoord(c) {
    if (!Array.isArray(c) || c.length < 2) return;
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    if (!isGeographicCoordinates(x, y)) {
      isUtm = true;
    }
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
        if (Array.isArray(ring)) {
          for (const pt of ring) registerCoord(pt);
        }
      }
    } else if (type === "MultiPolygon") {
      for (const poly of c) {
        if (Array.isArray(poly)) {
          for (const ring of poly) {
            if (Array.isArray(ring)) {
              for (const pt of ring) registerCoord(pt);
            }
          }
        }
      }
    }
  }

  for (const feat of features) {
    scanCoords(feat.geometry);
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
    throw new Error("No se encontraron coordenadas válidas en las geometrías del GeoJSON.");
  }

  let centerLon = 0.5 * (minLon + maxLon);
  let centerLat = 0.5 * (minLat + maxLat);
  let utmZone = options.utmZone || 30;

  // Si las coordenadas venían en UTM, calcular latitud y longitud WGS84 para el PNOA
  if (isUtm) {
    const geoCenter = utmToWgs84(centerLon, centerLat, utmZone, true);
    centerLon = geoCenter.lon;
    centerLat = geoCenter.lat;
  }

  // 2. Función de proyección métrica local normalizada
  const toLocalMeters = (coord) => {
    let rawX = Number(coord[0]);
    let rawY = Number(coord[1]);
    if (isUtm) {
      // Coordenadas métricas UTM directas centradas en el centroide
      const cx = 0.5 * (minLon + maxLon);
      const cy = 0.5 * (minLat + maxLat);
      return [Number((rawX - cx).toFixed(4)), Number((rawY - cy).toFixed(4))];
    }
    return projectWgs84ToLocalMeters(rawX, rawY, centerLon, centerLat);
  };

  // 3. Extracción de geometrías clasificadas
  const obstacles = [];
  const backgroundEntities = [];
  let trajectoryEntity = null;
  let obsCounter = 1;

  let localMinX = Infinity;
  let localMaxX = -Infinity;
  let localMinY = Infinity;
  let localMaxY = -Infinity;

  function updateLocalBounds(pts) {
    for (const [x, y] of pts) {
      if (x < localMinX) localMinX = x;
      if (x > localMaxX) localMaxX = x;
      if (y < localMinY) localMinY = y;
      if (y > localMaxY) localMaxY = y;
    }
  }

  // Evaluar coincidencia de capa o propiedades con patrones
  function matchesPattern(text, patterns) {
    const norm = normalizeName(text);
    return patterns.some((p) => norm.includes(p) || p.includes(norm));
  }

  for (const feat of features) {
    const props = feat.properties || {};
    const geom = feat.geometry;
    if (!geom) continue;

    const layerTag = props.layer || props.capa || props.tipo || props.type || props.name || props.highway || "";
    const nameTag = props.name || props.nombre || props.id || `Elemento #${obsCounter}`;

    const isExplicitTrajectory =
      matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.TRAJECTORY) ||
      matchesPattern(props.role || "", GEOJSON_LAYER_PATTERNS.TRAJECTORY) ||
      props.isTrajectory === true;

    const isCurbOrEdge =
      matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.CURBS_AND_EDGES);

    const isIsland =
      matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.ISLANDS);

    const isBuildingOrBarrier =
      matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.BUILDINGS_AND_BARRIERS);

    const isRestricted =
      matchesPattern(layerTag, GEOJSON_LAYER_PATTERNS.RESTRICTED_ZONING);

    const geomType = geom.type;

    // Procesar LineString
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
      } else {
        backgroundEntities.push({
          layer: layerTag || "VIAL_LINEA",
          vertices,
          closed: false,
          color: props.color || "#38bdf8"
        });
      }
    }

    // Procesar MultiLineString
    else if (geomType === "MultiLineString") {
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
        } else {
          backgroundEntities.push({
            layer: layerTag || "VIAL_MULTILINEA",
            vertices,
            closed: false,
            color: props.color || "#38bdf8"
          });
        }
      }
    }

    // Procesar Polygon
    else if (geomType === "Polygon") {
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
    }

    // Procesar MultiPolygon
    else if (geomType === "MultiPolygon") {
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
    }

    // Procesar Point
    else if (geomType === "Point") {
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

  // 4. Si hay una entidad de trayectoria detectada, construir la maniobra cinemática
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
    obstacles,
    backgroundEntities,
    bounds,
    trajectoryEntity,
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

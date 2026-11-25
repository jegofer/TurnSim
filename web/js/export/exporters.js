/**
 * Módulo de generación de informes técnicos PDF, exportación gráfica del visor y exportación CAD (DXF / SVG)
 * Cumple el apartado 10 y Fase 7 de PROMT_ORIGINAL.md.
 */

import { computeDerivedVehicleMetrics } from "../models/vehicles.js";
import { getObstacleVertices } from "../engine/collisions.js";

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Calcula la caja envolvente (bounding box) estricta de la trayectoria de barrido
 * (envolvente, contornos, poligonales de vehículos y trazas) con un margen en metros.
 */
function computeTrajectoryBbox(simResult, paddingM = 2.0) {
  let minX = +Infinity;
  let minY = +Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const pt of simResult?.envelope || []) includePt(pt[0], pt[1]);
  for (const pt of simResult?.leftBoundary || []) includePt(pt[0], pt[1]);
  for (const pt of simResult?.rightBoundary || []) includePt(pt[0], pt[1]);
  for (const s of simResult?.states || []) {
    for (const pt of s.tractorPolygon || []) includePt(pt[0], pt[1]);
    for (const pt of s.trailerPolygon || []) includePt(pt[0], pt[1]);
  }
  if (simResult?.traces) {
    for (const key of ["tractor_front", "tractor_rear", "hitch", "trailer_rear"]) {
      for (const pt of simResult.traces[key] || []) includePt(pt[0], pt[1]);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: -10, minY: -10, maxX: 35, maxY: 35 };
  }

  return {
    minX: minX - paddingM,
    minY: minY - paddingM,
    maxX: maxX + paddingM,
    maxY: maxY + paddingM
  };
}

/**
 * Construye un diagrama vectorial SVG en planta a escala métrica exacta para insertar en el informe técnico PDF
 * o descargar como archivo vectorial independiente.
 */
export function generateSVGDiagram(
  simResult,
  interferenceReport,
  obstacles = [],
  layerVisibility = {},
  cadBackgroundEntities = [],
  options = {}
) {
  const focusOnTrajectory = Boolean(options?.focusOnTrajectory);
  const overviewMode = Boolean(options?.overviewMode);
  const highlightBbox = options?.highlightBbox || null;

  const showCadBackground = layerVisibility.cadBackground !== false;
  const showReferenceAxes = layerVisibility.referenceAxes !== false;
  const referenceAxes = Array.isArray(options?.referenceAxes) ? options.referenceAxes : [];
  const showEnvelope = layerVisibility.envelope !== false;
  const showMargin = layerVisibility.margin !== false;
  const showWheelTraces = !overviewMode && layerVisibility.wheelTraces !== false;
  const showRefTraces = layerVisibility.refTraces !== false;
  const showGhosts = !overviewMode && layerVisibility.ghosts !== false;
  const showObstacles = layerVisibility.obstacles !== false;
  const showDimensions = !overviewMode && layerVisibility.dimensions !== false;

  // Calcular caja envolvente global (bounding box)
  let minX = +Infinity;
  let minY = +Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const pt of simResult.envelope || []) includePt(pt[0], pt[1]);
  for (const pt of simResult.leftBoundary || []) includePt(pt[0], pt[1]);
  for (const pt of simResult.rightBoundary || []) includePt(pt[0], pt[1]);
  for (const s of simResult.states || []) {
    for (const pt of s.tractorPolygon || []) includePt(pt[0], pt[1]);
    for (const pt of s.trailerPolygon || []) includePt(pt[0], pt[1]);
  }
  if (!focusOnTrajectory) {
    for (const obs of obstacles || []) {
      if (obs.enabled === false) continue;
      for (const pt of getObstacleVertices(obs)) includePt(pt[0], pt[1]);
    }
    if (showCadBackground && cadBackgroundEntities) {
      for (const ent of cadBackgroundEntities) {
        for (const pt of ent.vertices || []) includePt(pt[0], pt[1]);
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -10;
    minY = -10;
    maxX = 35;
    maxY = 35;
  }

  const pad = Number.isFinite(options?.paddingM) ? options.paddingM : (focusOnTrajectory ? 2.0 : 4.0);
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const minSpan = focusOnTrajectory ? 4 : 10;
  const widthM = Math.max(minSpan, maxX - minX);
  const heightM = Math.max(minSpan, maxY - minY);
  const maxDimM = Math.max(widthM, heightM);
  const ovStroke = (base) => (overviewMode ? Math.max(base, maxDimM * 0.0045).toFixed(3) : String(base));

  // En SVG la coordenada Y crece hacia abajo; invertimos Y para mantener +Y hacia arriba (Norte)
  const tx = (x) => (x - minX).toFixed(3);
  const ty = (y) => (maxY - y).toFixed(3);

  const polyToPointsAttr = (pts) => pts.map(([x, y]) => `${tx(x)},${ty(y)}`).join(" ");

  const pathToSvgD = (outer, holes) => {
    if (!outer || outer.length < 3) return "";
    let d = `M ${tx(outer[0][0])} ${ty(outer[0][1])}`;
    for (let i = 1; i < outer.length; i++) {
      d += ` L ${tx(outer[i][0])} ${ty(outer[i][1])}`;
    }
    d += " Z";
    if (holes && holes.length > 0) {
      for (const h of holes) {
        if (!h || h.length < 3) continue;
        d += ` M ${tx(h[0][0])} ${ty(h[0][1])}`;
        for (let j = 1; j < h.length; j++) {
          d += ` L ${tx(h[j][0])} ${ty(h[j][1])}`;
        }
        d += " Z";
      }
    }
    return d;
  };

  const lines = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthM.toFixed(3)} ${heightM.toFixed(3)}" width="100%" height="100%" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px;">`
  );

  // Cuadrícula métrica cada 5 m
  lines.push(`  <g id="grid" stroke="#e2e8f0" stroke-width="0.04">`);
  const startGridX = Math.ceil(minX / 5) * 5;
  const startGridY = Math.ceil(minY / 5) * 5;
  for (let gx = startGridX; gx <= maxX; gx += 5) {
    lines.push(`    <line x1="${tx(gx)}" y1="0" x2="${tx(gx)}" y2="${heightM.toFixed(3)}" />`);
  }
  for (let gy = startGridY; gy <= maxY; gy += 5) {
    lines.push(`    <line x1="0" y1="${ty(gy)}" x2="${widthM.toFixed(3)}" y2="${ty(gy)}" />`);
  }
  lines.push(`  </g>`);

  // Ejes de coordenadas origen (0,0)
  if (0 >= minX && 0 <= maxX && 0 >= minY && 0 <= maxY) {
    lines.push(
      `  <g id="origin-axes" stroke="#94a3b8" stroke-width="0.06" stroke-dasharray="0.3 0.2">`,
      `    <line x1="${tx(minX)}" y1="${ty(0)}" x2="${tx(maxX)}" y2="${ty(0)}" />`,
      `    <line x1="${tx(0)}" y1="${ty(minY)}" x2="${tx(0)}" y2="${ty(maxY)}" />`,
      `  </g>`
    );
  }

  // 0. Plano de fondo CAD (referencia territorial / vial)
  if (showCadBackground && cadBackgroundEntities && cadBackgroundEntities.length > 0) {
    lines.push(`  <g id="cad-background">`);
    const cadStrokeW = ovStroke(0.05);
    for (const ent of cadBackgroundEntities) {
      if (!ent.vertices || ent.vertices.length < 2) continue;
      if (ent.closed) {
        lines.push(
          `    <polygon points="${polyToPointsAttr(ent.vertices)}" fill="#e2e8f0" fill-opacity="0.35" stroke="#94a3b8" stroke-width="${cadStrokeW}" />`
        );
      } else {
        lines.push(
          `    <polyline points="${polyToPointsAttr(ent.vertices)}" fill="none" stroke="#94a3b8" stroke-width="${cadStrokeW}" stroke-dasharray="0.25 0.15" />`
        );
      }
    }
    lines.push(`  </g>`);
  }

  // 0.5 Ejes viales de referencia
  if (showReferenceAxes && referenceAxes && referenceAxes.length > 0) {
    lines.push(`  <g id="reference-axes">`);
    const axisStrokeW = ovStroke(0.06);
    for (const ax of referenceAxes) {
      if (!ax.vertices || ax.vertices.length < 2) continue;
      lines.push(
        `    <polyline points="${polyToPointsAttr(ax.vertices)}" fill="none" stroke="#0891b2" stroke-width="${axisStrokeW}" stroke-dasharray="0.60 0.20 0.12 0.20" />`
      );
    }
    lines.push(`  </g>`);
  }

  // 1. Envolvente de margen de seguridad
  if (showMargin) {
    if (simResult.marginEnvelope && simResult.marginEnvelope.length >= 3) {
      const marginD = pathToSvgD(simResult.marginEnvelope, simResult.marginEnvelopeHoles);
      lines.push(
        `  <path id="safety-margin-envelope" d="${marginD}" fill="#fef08a" fill-opacity="0.30" fill-rule="evenodd" stroke="#eab308" stroke-width="0.07" stroke-dasharray="0.35 0.20" />`
      );
    } else if (simResult.marginLeftBoundary && simResult.marginRightBoundary) {
      const marginLoop = [
        ...simResult.marginLeftBoundary,
        ...[...simResult.marginRightBoundary].reverse()
      ];
      if (marginLoop.length >= 3) {
        lines.push(
          `  <polygon points="${polyToPointsAttr(marginLoop)}" fill="#fef08a" fill-opacity="0.30" stroke="#eab308" stroke-width="0.07" stroke-dasharray="0.35 0.20" />`
        );
      }
    }
  }

  // 2. Envolvente física de barrido
  if (showEnvelope) {
    const envStrokeW = ovStroke(0.11);
    lines.push(`  <g id="swept-envelope">`);
    if (simResult.envelope && simResult.envelope.length >= 3) {
      const envD = pathToSvgD(simResult.envelope, simResult.envelopeHoles);
      lines.push(
        `    <path d="${envD}" fill="#fecaca" fill-opacity="0.35" fill-rule="evenodd" stroke="#dc2626" stroke-width="${envStrokeW}" />`
      );
    } else {
      for (let i = 0; i < simResult.states.length; i += 2) {
        const s = simResult.states[i];
        lines.push(
          `    <polygon points="${polyToPointsAttr(s.tractorPolygon)}" fill="#fecaca" fill-opacity="0.35" stroke="none" />`
        );
        if (s.trailerPolygon) {
          lines.push(
            `    <polygon points="${polyToPointsAttr(s.trailerPolygon)}" fill="#fecaca" fill-opacity="0.35" stroke="none" />`
          );
        }
      }
      if (simResult.leftBoundary && simResult.leftBoundary.length > 1) {
        lines.push(
          `    <polyline points="${polyToPointsAttr(simResult.leftBoundary)}" fill="none" stroke="#dc2626" stroke-width="${envStrokeW}" />`
        );
      }
      if (simResult.rightBoundary && simResult.rightBoundary.length > 1) {
        lines.push(
          `    <polyline points="${polyToPointsAttr(simResult.rightBoundary)}" fill="none" stroke="#dc2626" stroke-width="${envStrokeW}" />`
        );
      }
    }
    lines.push(`  </g>`);
  }

  // 3. Obstáculos del entorno
  if (showObstacles && obstacles && obstacles.length > 0) {
    const obsOpenW = ovStroke(0.16);
    const obsClosedW = ovStroke(0.12);
    lines.push(`  <g id="obstacles">`);
    for (const obs of obstacles) {
      if (obs.enabled === false) continue;
      const verts = getObstacleVertices(obs);
      const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge";
      const color = obs.color || "#dc2626";
      if (isOpen) {
        lines.push(
          `    <polyline points="${polyToPointsAttr(verts)}" fill="none" stroke="${color}" stroke-width="${obsOpenW}" />`
        );
      } else {
        lines.push(
          `    <polygon points="${polyToPointsAttr(verts)}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="${obsClosedW}" />`
        );
      }
    }
    lines.push(`  </g>`);
  }

  // 4. Huellas de ruedas (neumáticos)
  if (showWheelTraces && simResult.traces && simResult.traces.wheels) {
    const w = simResult.traces.wheels;
    lines.push(`  <g id="wheel-traces" fill="none" stroke="#64748b" stroke-width="0.04" stroke-dasharray="0.20 0.12">`);
    for (const key of [
      "tractor_front_left",
      "tractor_front_right",
      "tractor_rear_left",
      "tractor_rear_right",
      "trailer_tridem_left",
      "trailer_tridem_right"
    ]) {
      if (w[key] && w[key].length > 1) {
        lines.push(`    <polyline points="${polyToPointsAttr(w[key])}" />`);
      }
    }
    lines.push(`  </g>`);
  }

  // 5. Trayectorias de puntos de referencia
  if (showRefTraces && simResult.traces) {
    lines.push(`  <g id="reference-traces" fill="none" stroke-width="0.08">`);
    if (simResult.traces.tractor_front.length > 1) {
      lines.push(
        `    <polyline points="${polyToPointsAttr(simResult.traces.tractor_front)}" stroke="#0284c7" />`
      );
    }
    if (simResult.traces.tractor_rear.length > 1) {
      lines.push(
        `    <polyline points="${polyToPointsAttr(simResult.traces.tractor_rear)}" stroke="#16a34a" stroke-dasharray="0.3 0.15" />`
      );
    }
    if (simResult.traces.hitch.length > 1) {
      lines.push(
        `    <polyline points="${polyToPointsAttr(simResult.traces.hitch)}" stroke="#d97706" />`
      );
    }
    if (simResult.traces.trailer_rear.length > 1) {
      lines.push(
        `    <polyline points="${polyToPointsAttr(simResult.traces.trailer_rear)}" stroke="#9333ea" />`
      );
    }
    lines.push(`  </g>`);
  }

  // 6. Siluetas muestreadas (ghosts)
  if (showGhosts && simResult.ghosts) {
    lines.push(`  <g id="ghosts">`);
    for (let i = 0; i < simResult.ghosts.length; i++) {
      const g = simResult.ghosts[i];
      const isEndpoint = i === 0 || i === simResult.ghosts.length - 1;
      const strokeW = isEndpoint ? "0.09" : "0.045";
      const strokeCol = isEndpoint ? "#0f172a" : "#475569";
      lines.push(
        `    <polygon points="${polyToPointsAttr(g.tractorPolygon)}" fill="none" stroke="${strokeCol}" stroke-width="${strokeW}" />`
      );
      if (g.trailerPolygon) {
        lines.push(
          `    <polygon points="${polyToPointsAttr(g.trailerPolygon)}" fill="none" stroke="${strokeCol}" stroke-width="${strokeW}" stroke-dasharray="${isEndpoint ? "none" : "0.2 0.1"}" />`
        );
      }
    }
    lines.push(`  </g>`);
  }

  // 7. Acotaciones de anchura barrida y puntos de interferencia
  if (showDimensions && simResult.dimensions) {
    lines.push(`  <g id="dimensions">`);
    for (const d of simResult.dimensions) {
      const [x1, y1] = d.p1;
      const [x2, y2] = d.p2;
      const mx = 0.5 * (x1 + x2);
      const my = 0.5 * (y1 + y2);
      lines.push(
        `    <line x1="${tx(x1)}" y1="${ty(y1)}" x2="${tx(x2)}" y2="${ty(y2)}" stroke="#b45309" stroke-width="0.09" />`,
        `    <text x="${tx(mx)}" y="${ty(my)}" font-family="sans-serif" font-size="0.65" font-weight="bold" fill="#78350f" text-anchor="middle" dy="-0.2">${d.title}: ${d.val}</text>`
      );
    }
    lines.push(`  </g>`);
  }

  // 8. Barra de escala gráfica y encuadre de detalle en vista general
  if (!overviewMode) {
    const scaleBarLen = widthM >= 10 ? 5 : 2;
    const sbX = minX + Math.min(1.8, widthM * 0.08);
    const sbY = minY + Math.min(1.4, heightM * 0.08);
    lines.push(
      `  <g id="scale-bar">`,
      `    <line x1="${tx(sbX)}" y1="${ty(sbY)}" x2="${tx(sbX + scaleBarLen)}" y2="${ty(sbY)}" stroke="#0f172a" stroke-width="0.12" />`,
      `    <line x1="${tx(sbX)}" y1="${ty(sbY - 0.3)}" x2="${tx(sbX)}" y2="${ty(sbY + 0.3)}" stroke="#0f172a" stroke-width="0.10" />`,
      `    <line x1="${tx(sbX + scaleBarLen)}" y1="${ty(sbY - 0.3)}" x2="${tx(sbX + scaleBarLen)}" y2="${ty(sbY + 0.3)}" stroke="#0f172a" stroke-width="0.10" />`,
      `    <text x="${tx(sbX + scaleBarLen * 0.5)}" y="${ty(sbY + 0.45)}" font-family="sans-serif" font-size="0.65" font-weight="bold" fill="#0f172a" text-anchor="middle">Escala gráfica: ${scaleBarLen},00 m</text>`,
      `  </g>`
    );
  }

  if (highlightBbox && Number.isFinite(highlightBbox.minX) && Number.isFinite(highlightBbox.maxX)) {
    const hx = tx(highlightBbox.minX);
    const hy = ty(highlightBbox.maxY);
    const hw = Math.max(0.5, highlightBbox.maxX - highlightBbox.minX).toFixed(3);
    const hh = Math.max(0.5, highlightBbox.maxY - highlightBbox.minY).toFixed(3);
    const sw = Math.max(0.25, maxDimM * 0.012).toFixed(3);
    const dashA = Math.max(0.6, maxDimM * 0.025).toFixed(3);
    const dashB = Math.max(0.4, maxDimM * 0.015).toFixed(3);
    lines.push(
      `  <g id="detail-viewport-indicator">`,
      `    <rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" fill="#0284c7" fill-opacity="0.12" stroke="#0284c7" stroke-width="${sw}" stroke-dasharray="${dashA} ${dashB}" />`,
      `  </g>`
    );
  }

  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * Genera el contenido de un archivo CAD DXF (formato ASCII R12/R2000 universalmente compatible
 * con AutoCAD, Civil 3D, FreeCAD, OpenCAD Studio y QGIS) directamente en el navegador.
 */
export function generateDXFContent(simResult, obstacles = [], cadBackgroundEntities = [], options = {}) {
  const originOffset = options.originOffset || simResult?.originOffset || simResult?.maneuver?.originOffset || null;
  const ox = Number(originOffset?.x || 0);
  const oy = Number(originOffset?.y || 0);

  const lines = [];
  const pushEntityPolylines = (pts, layer, closed = false, color = 7) => {
    if (!pts || pts.length < 2) return;
    lines.push("0", "POLYLINE", "8", layer, "62", String(color), "66", "1", "70", closed ? "1" : "0");
    for (const [x, y] of pts) {
      lines.push("0", "VERTEX", "8", layer, "10", (x + ox).toFixed(4), "20", (y + oy).toFixed(4), "30", "0.0");
    }
    lines.push("0", "SEQEND");
  };

  lines.push("0", "SECTION", "2", "ENTITIES");

  // 0. Entidades de fondo CAD importadas (conservación para round-trip)
  if (cadBackgroundEntities && cadBackgroundEntities.length > 0) {
    for (const ent of cadBackgroundEntities) {
      if (!ent.vertices || ent.vertices.length < 2) continue;
      const targetLayer = ent.layer ? `CAD_REF_${ent.layer}` : "CAD_REF_FONDO";
      pushEntityPolylines(ent.vertices, targetLayer, Boolean(ent.closed), 8);
    }
  }

  // 1. Bordes de envolvente de barrido (GEOM-02: Polilínea cerrada exacta sin truncamientos)
  if (simResult.envelope && simResult.envelope.length >= 3) {
    pushEntityPolylines(simResult.envelope, "0_BARRIDO_ENVOLVENTE", true, 1);
    if (simResult.envelopeHoles && simResult.envelopeHoles.length > 0) {
      for (const hole of simResult.envelopeHoles) {
        pushEntityPolylines(hole, "0_BARRIDO_ENVOLVENTE", true, 1);
      }
    }
  } else {
    pushEntityPolylines(simResult.leftBoundary, "0_BARRIDO_ENVOLVENTE", false, 1);
    pushEntityPolylines(simResult.rightBoundary, "0_BARRIDO_ENVOLVENTE", false, 1);
  }

  // 2. Margen de seguridad (GEOM-02: Polilínea cerrada con redondeo exacto)
  if (simResult.marginEnvelope && simResult.marginEnvelope.length >= 3) {
    pushEntityPolylines(simResult.marginEnvelope, "0_MARGEN_SEGURIDAD", true, 2);
    if (simResult.marginEnvelopeHoles && simResult.marginEnvelopeHoles.length > 0) {
      for (const hole of simResult.marginEnvelopeHoles) {
        pushEntityPolylines(hole, "0_MARGEN_SEGURIDAD", true, 2);
      }
    }
  } else if (simResult.marginLeftBoundary && simResult.marginRightBoundary) {
    pushEntityPolylines(simResult.marginLeftBoundary, "0_MARGEN_SEGURIDAD", false, 2);
    pushEntityPolylines(simResult.marginRightBoundary, "0_MARGEN_SEGURIDAD", false, 2);
  }

  // 3. Trazas de ejes de referencia
  if (simResult.traces) {
    pushEntityPolylines(simResult.traces.tractor_front, "0_HUELLA_EJE_DIRECTRIZ", false, 5);
    pushEntityPolylines(simResult.traces.tractor_rear, "0_HUELLA_EJE_REFERENCIA", false, 3);
    pushEntityPolylines(simResult.traces.hitch, "0_HUELLA_QUINTA_RUEDA", false, 2);
    pushEntityPolylines(simResult.traces.trailer_rear, "0_HUELLA_EJE_REMOLQUE", false, 4);
  }

  // 4. Siluetas muestreadas (ghosts)
  for (const g of simResult.ghosts || []) {
    pushEntityPolylines(g.tractorPolygon, "0_SILUETAS_VEHICULO", true, 8);
    if (g.trailerPolygon) {
      pushEntityPolylines(g.trailerPolygon, "0_SILUETAS_VEHICULO", true, 8);
    }
  }

  // 5. Obstáculos
  for (const obs of obstacles || []) {
    if (obs.enabled === false) continue;
    const verts = getObstacleVertices(obs);
    const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge";
    pushEntityPolylines(verts, "0_OBSTACULOS", !isOpen, 1);
  }

  // 6. Acotaciones de anchura barrida
  for (const d of simResult.dimensions || []) {
    pushEntityPolylines([d.p1, d.p2], "0_ACOTACIONES_ANCHURA", false, 2);
    const mx = 0.5 * (d.p1[0] + d.p2[0]) + ox;
    const my = 0.5 * (d.p1[1] + d.p2[1]) + oy;
    lines.push(
      "0",
      "TEXT",
      "8",
      "0_ACOTACIONES_ANCHURA",
      "62",
      "2",
      "10",
      mx.toFixed(4),
      "20",
      my.toFixed(4),
      "30",
      "0.0",
      "40",
      "0.40",
      "1",
      `${d.title}: ${d.val}`
    );
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

/**
 * Evalúa y resume el cumplimiento de las normativas españolas y europeas para el informe técnico (MEJ-04).
 */
export function buildNormativeComplianceSummary({ vehicle, maneuver, simResult, interferenceReport }) {
  const isSpainF = vehicle?.id === "spain_furgon_f";
  const isSpainC = vehicle?.id === "spain_camion_ligero_c";
  const isSpainT = vehicle?.id === "spain_camion_articulado_t";
  const isSpainA = vehicle?.id === "spain_autobus_rigido_a";

  let patternCode = "Vehículo comercial / Ficha de fabricante";
  let minNormRf = 10.30; // Camión articulado como referencia más estricta
  let maxPermissibleLength = 16.50; // RD 2822/1998 Anexo IX
  let maxPermissibleWidth = 2.55;

  if (isSpainF) {
    patternCode = "Furgón patrón (F) — Norma 3.1-IC Tabla A3.1";
    minNormRf = 7.50;
    maxPermissibleLength = 12.00;
  } else if (isSpainC) {
    patternCode = "Camión rígido patrón (C) — Norma 3.1-IC Tabla A3.1";
    minNormRf = 9.10;
    maxPermissibleLength = 12.00;
  } else if (isSpainT) {
    patternCode = "Camión articulado patrón (T) — Norma 3.1-IC Tabla A3.1";
    minNormRf = 10.30;
    maxPermissibleLength = 16.50;
  } else if (isSpainA) {
    patternCode = "Autobús rígido 3 ejes patrón (A) — Norma 3.1-IC Tabla A3.1";
    minNormRf = 10.50;
    maxPermissibleLength = 15.00;
  } else if (vehicle?.isRigid) {
    minNormRf = 9.10;
    maxPermissibleLength = 12.00;
  }

  // Comprobar radio de dirección en la maniobra respecto al eje director delantero
  const Lwb = vehicle?.tractor?.wheelbase || 3.90;
  const isFrontRef = maneuver?.steeringReferencePoint === "front_axle";
  let minRfObserved = Infinity;

  for (const seg of (maneuver?.segments || [])) {
    if (seg.type === "arc") {
      const r = Number(seg.radius);
      const rf = isFrontRef ? r : Math.sqrt(r * r + Lwb * Lwb);
      if (rf < minRfObserved) minRfObserved = rf;
    } else if (seg.type === "spline" && Number.isFinite(seg.minRadius)) {
      const r = Number(seg.minRadius);
      const rf = isFrontRef ? r : Math.sqrt(r * r + Lwb * Lwb);
      if (rf < minRfObserved) minRfObserved = rf;
    }
  }

  const hasArcs = Number.isFinite(minRfObserved);
  const radiusCompliant = !hasArcs || minRfObserved >= minNormRf - 0.05;

  // Comprobar gálibos máximos (RD 2822/1998 Anexo IX)
  const metrics = computeDerivedVehicleMetrics(vehicle);
  const totalLength = metrics.totalCoupledLength;
  const maxWidth = Math.max(vehicle?.tractor?.width || 0, vehicle?.trailer?.width || 0);
  const lengthCompliant = totalLength <= maxPermissibleLength + 0.05;
  const widthCompliant = maxWidth <= maxPermissibleWidth + 0.05;

  // Comprobar holguras e interferencias
  const clearanceStatus = interferenceReport ? interferenceReport.globalStatus : "CLEAR";
  const clearanceCompliant = clearanceStatus === "CLEAR" || clearanceStatus === "MARGIN_VIOLATION";

  return {
    patternCode,
    isStandardSpain: isSpainF || isSpainC || isSpainT || isSpainA,
    minNormRf,
    minRfObserved: hasArcs ? minRfObserved : null,
    hasArcs,
    radiusCompliant,
    totalLength,
    maxPermissibleLength,
    lengthCompliant,
    maxWidth,
    maxPermissibleWidth,
    widthCompliant,
    clearanceStatus,
    clearanceCompliant,
    globalCompliant: radiusCompliant && lengthCompliant && widthCompliant && clearanceStatus === "CLEAR"
  };
}

/**
 * Genera y abre el Informe Técnico Estructurado Imprimible / PDF (Opción 2 del apartado 10).
 */
export function openStructuredTechnicalReport({
  projectName = "Estudio de viabilidad geométrica y barrido de vehículos pesados",
  scenarioName = "Escenario personalizado",
  vehicle,
  maneuver,
  simResult,
  interferenceReport,
  obstacles,
  layerVisibility,
  cadBackgroundEntities = [],
  referenceAxes = [],
  diligence = {}
}) {
  const nowStr = new Date().toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short"
  });
  const metrics = computeDerivedVehicleMetrics(vehicle);
  const compliance = buildNormativeComplianceSummary({ vehicle, maneuver, simResult, interferenceReport });
  const detailBbox = computeTrajectoryBbox(simResult, 2.0);
  const svgDiagram = generateSVGDiagram(
    simResult,
    interferenceReport,
    obstacles,
    layerVisibility,
    cadBackgroundEntities,
    { focusOnTrajectory: true, paddingM: 2.0, referenceAxes }
  );
  const overviewSvgDiagram = generateSVGDiagram(
    simResult,
    interferenceReport,
    obstacles,
    { ...layerVisibility, wheelTraces: false, ghosts: false, dimensions: false },
    cadBackgroundEntities,
    { focusOnTrajectory: false, overviewMode: true, highlightBbox: detailBbox, referenceAxes }
  );

  const segmentsRows = (maneuver.segments || [])
    .map((seg, idx) => {
      const dirLabel = seg.direction === -1 ? "Marcha atrás (Retroceso)" : "Avance (Directo)";
      if (seg.type === "straight") {
        return `<tr>
          <td>${idx + 1}</td>
          <td>Recta</td>
          <td>${dirLabel}</td>
          <td>Longitud L = ${Number(seg.length).toFixed(2)} m</td>
          <td>&kappa; = 0,000 m<sup>-1</sup> (&delta; = 0,0°)</td>
        </tr>`;
      } else if (seg.type === "spline") {
        const nPts = seg.waypoints ? seg.waypoints.length : (seg.samples ? seg.samples.length : 0);
        const rMinStr = Number.isFinite(seg.minRadius) ? `${seg.minRadius.toFixed(2)} m` : "—";
        return `<tr>
          <td>${idx + 1}</td>
          <td>Spline CAD continua (PCHIP)</td>
          <td>${dirLabel}</td>
          <td>Longitud L = ${Number(seg.totalLength || 0).toFixed(2)} m (${nPts} waypoints)</td>
          <td>R<sub>mín</sub> = ${rMinStr}</td>
        </tr>`;
      } else {
        const turnDir = seg.angle >= 0 ? "Izquierda (+)" : "Derecha (-)";
        return `<tr>
          <td>${idx + 1}</td>
          <td>Curva circular (${turnDir})</td>
          <td>${dirLabel}</td>
          <td>Radio R<sub>ref</sub> = ${Number(seg.radius).toFixed(2)} m &bull; Ángulo &Delta;&theta; = ${Number(seg.angle).toFixed(1)}°</td>
          <td>&kappa; = ${(1 / seg.radius).toFixed(4)} m<sup>-1</sup></td>
        </tr>`;
      }
    })
    .join("");

  const obstaclesRows =
    interferenceReport && interferenceReport.obstacleReports.length > 0
      ? interferenceReport.obstacleReports
          .map(
            (r) => `<tr>
              <td><strong>${escapeHTML(r.name)}</strong><br><small>${escapeHTML(r.type)}</small></td>
              <td><span class="status-pill status-${escapeHTML(r.status)}">${escapeHTML(r.statusLabel)}</span></td>
              <td>${r.minDistanceM !== null ? `${r.minDistanceM.toFixed(3)} m` : "N/E"}</td>
              <td>PK ${r.distAlongPathM.toFixed(2)} m (${escapeHTML(r.part || "—")})</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="4">No se han definido obstáculos activos en este escenario.</td></tr>`;

  const safeProjectName = escapeHTML(projectName);
  const safeScenarioName = escapeHTML(scenarioName);
  const dots = "...................................................";
  const safeAuthor = escapeHTML((diligence?.author || "").trim()) || dots;
  const safeCollegiate = escapeHTML((diligence?.collegiate || "").trim()) || dots;
  const safeOrganization = escapeHTML((diligence?.organization || "").trim()) || dots;
  const safeDiligenceDate = escapeHTML((diligence?.date || "").trim());

  const mdContent = generateMarkdownTechnicalReport({
    projectName,
    scenarioName,
    vehicle,
    maneuver,
    simResult,
    interferenceReport,
    obstacles,
    diligence
  });

  const reportHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe Técnico de Simulación de Barrido - ${safeProjectName}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 18px 26px;
      font-size: 12px;
      line-height: 1.45;
    }
    .no-print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 18px;
      border-radius: 8px;
      margin-bottom: 18px;
    }
    .no-print-bar button {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-left: 8px;
    }
    header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    h1 { font-size: 18px; margin: 0 0 4px 0; color: #0f172a; }
    h2 {
      font-size: 13.5px;
      margin: 14px 0 6px 0;
      padding-bottom: 3px;
      border-bottom: 1px solid #cbd5e1;
      color: #0369a1;
      page-break-after: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
      font-size: 11px;
    }
    th { background: #f1f5f9; font-weight: 600; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      page-break-inside: avoid;
    }
    .diagram-wrapper {
      position: relative;
      width: 100%;
      height: 360px;
      margin: 8px 0;
      page-break-inside: avoid;
    }
    .diagram-box {
      width: 100%;
      height: 100%;
    }
    .diagram-overview-inset {
      position: absolute;
      top: 8px;
      left: 8px;
      width: 165px;
      height: 120px;
      background: rgba(255, 255, 255, 0.95);
      border: 1.5px solid #334155;
      border-radius: 5px;
      padding: 3px;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
      z-index: 5;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .diagram-overview-inset .overview-label {
      font-size: 8.5px;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
      text-align: center;
      background: #e2e8f0;
      border-radius: 2px;
      padding: 1px 4px;
      flex-shrink: 0;
    }
    .diagram-overview-inset svg {
      flex: 1;
      width: 100%;
      height: 100%;
      border: none !important;
      border-radius: 2px !important;
      min-height: 0;
    }
    .badge-verified {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 10.5px;
      background: ${vehicle.verified ? "#dcfce7" : "#fef3c7"};
      color: ${vehicle.verified ? "#166534" : "#92400e"};
      border: 1px solid ${vehicle.verified ? "#86efac" : "#fcd34d"};
    }
    .status-pill {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 10.5px;
    }
    .status-CLEAR { background: #dcfce7; color: #166534; }
    .status-MARGIN_VIOLATION { background: #fef3c7; color: #92400e; }
    .status-RESTRICTED_INVASION { background: #ffedd5; color: #9a3412; }
    .status-COLLISION { background: #fee2e2; color: #991b1b; }
    .status-NOT_EVALUABLE { background: #e2e8f0; color: #334155; }
    .warning-box {
      background: #fffbeb;
      border: 1px solid #f59e0b;
      border-left: 4px solid #d97706;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 11px;
      page-break-inside: avoid;
      margin-top: 10px;
    }
    @media print {
      .no-print-bar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div><strong>Vista previa de Informe Técnico Estructurado (PDF)</strong> — Verifique el documento y pulse «Imprimir / Guardar como PDF».</div>
    <div>
      <button onclick="window.print()">Imprimir / Guardar PDF</button>
      <button onclick="downloadMdReport()" style="background:#059669;">Descargar Markdown (.md)</button>
      <button onclick="window.close()" style="background:#475569;">Cerrar ventana</button>
    </div>
  </div>

  <header>
    <div>
      <h1>INFORME TÉCNICO DE SIMULACIÓN DE TRAYECTORIA DE BARRIDO</h1>
      <div><strong>Proyecto:</strong> ${safeProjectName} &bull; <strong>Escenario:</strong> ${safeScenarioName}</div>
    </div>
    <div style="text-align:right; font-size:11px;">
      <div><strong>Fecha:</strong> ${nowStr}</div>
      <div><strong>Motor cinemático:</strong> Tractriz diferencial RK4</div>
    </div>
  </header>

  <h2>1. Vehículo de diseño y trazabilidad de parámetros</h2>
  <p style="margin:4px 0 8px 0;">
    <strong>Conjunto seleccionado:</strong> ${vehicle.name} (${vehicle.modelVariant || ""})
    &nbsp;<span class="badge-verified">${vehicle.verificationBadge}</span>
  </p>
  <div class="grid-2">
    <table>
      <thead><tr><th colspan="2">Cabeza tractora (${vehicle.manufacturer})</th></tr></thead>
      <tbody>
        <tr><td>Distancia entre ejes (Batalla L<sub>wb</sub>)</td><td>${vehicle.tractor.wheelbase.toFixed(3)} m</td></tr>
        <tr><td>Voladizo delantero (L<sub>fo</sub>) / trasero (L<sub>ro</sub>)</td><td>${vehicle.tractor.frontOverhang.toFixed(3)} m / ${vehicle.tractor.rearOverhang.toFixed(3)} m</td></tr>
        <tr><td>Longitud tractora sola / Anchura (W)</td><td>${metrics.tractorLength.toFixed(3)} m / ${vehicle.tractor.width.toFixed(3)} m</td></tr>
        <tr><td>Avance quinta rueda (h delante eje motriz)</td><td>${vehicle.tractor.hitchOffset >= 0 ? "+" : ""}${vehicle.tractor.hitchOffset.toFixed(3)} m</td></tr>
        <tr><td>Radio mín. eje ref. (R<sub>ref</sub>) / Rueda (R<sub>rueda,ext</sub>) / Pared (R<sub>barrido,ext</sub>)</td><td>${metrics.minRefRadius.toFixed(2)} m / ${metrics.minKerbTurningRadius.toFixed(2)} m / ${metrics.minWallTurningRadius.toFixed(2)} m</td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th colspan="2">Semirremolque y conjunto acoplado</th></tr></thead>
      <tbody>
        <tr><td>Distancia kingpin a centro trídem (L<sub>t</sub>)</td><td>${vehicle.trailer.wheelbase.toFixed(3)} m (${vehicle.trailer.axleCount || 3} ejes, sep. ${(vehicle.trailer.axleSpacing || 1.31).toFixed(2)} m)</td></tr>
        <tr><td>Voladizo delantero (L<sub>t,fo</sub>) / trasero (L<sub>t,ro</sub>)</td><td>${vehicle.trailer.frontOverhang.toFixed(3)} m / ${vehicle.trailer.rearOverhang.toFixed(3)} m</td></tr>
        <tr><td>Longitud semirremolque / Anchura (W<sub>t</sub>)</td><td>${metrics.trailerLength.toFixed(3)} m / ${vehicle.trailer.width.toFixed(3)} m</td></tr>
        <tr><td><strong>Longitud total del conjunto acoplado (L<sub>total</sub>)</strong></td><td><strong>${metrics.totalCoupledLength.toFixed(3)} m</strong></td></tr>
        <tr><td>Distancia kingpin a trasera / Radio barrido frontal</td><td>${metrics.kingpinToRear.toFixed(3)} m / ${metrics.frontSwingRadius.toFixed(3)} m</td></tr>
      </tbody>
    </table>
  </div>
  <div style="font-size:10.5px; color:#334155; margin-bottom:8px;">
    <strong>Fuentes técnicas y nivel de confianza:</strong> ${(vehicle.traceability && vehicle.traceability.sources ? vehicle.traceability.sources.join("; ") : "Catálogo interno")}.
    <em>${(vehicle.traceability && vehicle.traceability.confidence) || ""}</em>
  </div>

  <h2>2. Definición de la maniobra y parámetros numéricos de cálculo</h2>
  <table>
    <thead>
      <tr><th>Tramo</th><th>Tipo de alineación</th><th>Sentido de marcha</th><th>Geometría del tramo</th><th>Curvatura de referencia</th></tr>
    </thead>
    <tbody>${segmentsRows}</tbody>
  </table>
  <table>
    <thead>
      <tr>
        <th>Posición inicial (X<sub>0</sub>, Y<sub>0</sub>, &theta;<sub>0</sub>)</th>
        <th>Recorrido total eje ref.</th>
        <th>Discretización (&Delta;s / &Delta;&theta;)</th>
        <th>Error cordal estimado</th>
        <th>Ángulo dirección máx. (&delta;<sub>máx</sub>)</th>
        <th>Ángulo articulación máx. (&gamma;<sub>máx</sub>)</th>
        <th>Anchura máx. barrida</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>(${Number(maneuver.startPose?.x || 0).toFixed(2)} m, ${Number(maneuver.startPose?.y || 0).toFixed(2)} m, ${Number(maneuver.startPose?.headingDeg || 0).toFixed(1)}°)</td>
        <td>${simResult.summary.totalDistanceM.toFixed(2)} m (${simResult.summary.totalStates} estados)</td>
        <td>${simResult.summary.discretization.straightStepM} m / ${simResult.summary.discretization.arcStepDeg}° (${simResult.summary.discretization.integrationMethod.toUpperCase()})</td>
        <td>&le; ${(simResult.summary.discretization.estimatedChordalToleranceM * 1000).toFixed(2)} mm</td>
        <td>${simResult.summary.maxSteerAngleDeg.toFixed(1)}° (lím. ${vehicle.tractor.maxSteerAngleDeg}°)</td>
        <td>${simResult.summary.maxArticulationAngleDeg.toFixed(1)}° (lím. ${vehicle.limits?.maxArticulationAngleDeg || 85}°)</td>
        <td><strong>${simResult.summary.maxSweptWidthM.toFixed(2)} m</strong></td>
      </tr>
    </tbody>
  </table>

  <h2>3. Planta técnica de la trayectoria, huellas de ruedas y envolvente de barrido</h2>
  <div class="diagram-wrapper">
    <div class="diagram-overview-inset" title="Plano general de situación (referencia completa)">
      <div class="overview-label">Situación general</div>
      ${overviewSvgDiagram}
    </div>
    <div class="diagram-box">${svgDiagram}</div>
  </div>
  <div style="font-size:10px; color:#475569; display:flex; justify-content:space-between;">
    <span><strong>Leyenda:</strong> Contorno rojo = Envolvente física barrida &bull; Banda amarilla = Margen de seguridad (${(interferenceReport?.safetyMarginM ?? 0.30).toFixed(2)} m) &bull; Azul = Eje directriz &bull; Verde = Eje motriz ref. &bull; Naranja = Quinta rueda &bull; Morado = Centro trídem semirremolque &bull; Gris discontinuo = Huellas de ruedas.</span>
    <span>Unidades: metros (SI)</span>
  </div>

  <h2>4. Comprobación de obstáculos, distancias mínimas y dictamen de interferencias</h2>
  <p style="margin:4px 0 6px 0;">
    <strong>Resultado global de la comprobación:</strong>
    <span class="status-pill status-${interferenceReport ? interferenceReport.globalStatus : "CLEAR"}">
      ${interferenceReport ? interferenceReport.globalStatusLabel : "SIN OBSTÁCULOS DEFINIDOS"}
    </span>
    ${interferenceReport && interferenceReport.minClearanceM !== null ? `&nbsp;&bull;&nbsp; <strong>Holgura mínima registrada:</strong> ${interferenceReport.minClearanceM.toFixed(3)} m (Margen configurado: ${interferenceReport.safetyMarginM.toFixed(2)} m)` : ""}
  </p>
  <table>
    <thead>
      <tr><th>Obstáculo / Elemento viario</th><th>Estado de comprobación</th><th>Distancia mínima libre</th><th>Punto crítico de la maniobra</th></tr>
    </thead>
    <tbody>${obstaclesRows}</tbody>
  </table>

  <h2>5. Justificación y dictamen de conformidad normativa (Norma 3.1-IC, Guía de nudos viarios y reglamentación UE)</h2>
  <table>
    <thead>
      <tr>
        <th>Criterio de evaluación normativa</th>
        <th>Referencia oficial</th>
        <th>Valor prescrito o límite</th>
        <th>Valor obtenido en simulación</th>
        <th>Dictamen técnico</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Vehículo de diseño patrón</strong></td>
        <td>Norma 3.1-IC (Tabla A3.1)</td>
        <td>Preset reglamentario</td>
        <td>${escapeHTML(compliance.patternCode)}</td>
        <td><span class="status-pill status-${compliance.isStandardSpain ? "CLEAR" : "MARGIN_VIOLATION"}">${compliance.isStandardSpain ? "PATRÓN OFICIAL" : "EQUIVALENTE"}</span></td>
      </tr>
      <tr>
        <td><strong>Longitud total del conjunto</strong></td>
        <td>RD 2822/1998 Anexo IX</td>
        <td>L &le; ${compliance.maxPermissibleLength.toFixed(2)} m</td>
        <td>L = ${compliance.totalLength.toFixed(2)} m</td>
        <td><span class="status-pill status-${compliance.lengthCompliant ? "CLEAR" : "COLLISION"}">${compliance.lengthCompliant ? "CONFORME" : "EXCEDE LÍMITE"}</span></td>
      </tr>
      <tr>
        <td><strong>Anchura máxima de carrocería</strong></td>
        <td>RD 2822/1998 Anexo IX</td>
        <td>W &le; ${compliance.maxPermissibleWidth.toFixed(2)} m</td>
        <td>W = ${compliance.maxWidth.toFixed(2)} m</td>
        <td><span class="status-pill status-${compliance.widthCompliant ? "CLEAR" : "COLLISION"}">${compliance.widthCompliant ? "CONFORME" : "EXCEDE LÍMITE"}</span></td>
      </tr>
      <tr>
        <td><strong>Radio de giro mín. en eje director delantero</strong></td>
        <td>Guía Nudos Viarios (Tabla 2.3-D)</td>
        <td>R<sub>f,min</sub> &ge; ${compliance.minNormRf.toFixed(2)} m</td>
        <td>${compliance.hasArcs ? `R<sub>f,mín</sub> = ${compliance.minRfObserved.toFixed(2)} m` : "Alineación recta"}</td>
        <td><span class="status-pill status-${compliance.radiusCompliant ? "CLEAR" : "MARGIN_VIOLATION"}">${compliance.radiusCompliant ? "CONFORME" : "GIRO CERRADO"}</span></td>
      </tr>
      <tr>
        <td><strong>Resguardo y holgura mínima a obstáculos</strong></td>
        <td>Instrucción de Carreteras</td>
        <td>Margen libre &ge; ${(interferenceReport?.safetyMarginM ?? 0.30).toFixed(2)} m</td>
        <td>d<sub>min</sub> = ${interferenceReport && interferenceReport.minClearanceM !== null ? `${interferenceReport.minClearanceM.toFixed(3)} m` : "Sin obstáculos"}</td>
        <td><span class="status-pill status-${compliance.clearanceStatus}">${interferenceReport ? interferenceReport.globalStatusLabel : "CONFORME"}</span></td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top:12px; padding:10px 14px; border:1px solid #0284c7; background:#f0f9ff; border-radius:4px; page-break-inside:avoid;">
    <div style="font-weight:700; color:#0369a1; font-size:12px; margin-bottom:4px;">Dictamen global del ingeniero proyectista:</div>
    <div style="font-size:11px; color:#0f172a;">
      ${compliance.globalCompliant
        ? "Se certifica que la maniobra analizada RESULTA GEOMÉTRICAMENTE VIABLE Y CONFORME a las especificaciones de diseño geométrico de la Norma 3.1-IC de Trazado de Carreteras y de la Guía de Nudos Viarios (OC 32/2012) del Ministerio de Transportes, respetando los gálibos legales y las holguras de resguardo viario exigibles."
        : "La maniobra analizada presenta OBSERVACIONES O RESTRICCIONES en radios de curvatura o distancias de seguridad respecto a los márgenes normativos recomendados. Se aconseja revisar los sobreanchos y radios de acuerdo con el pliego técnico."
      }
    </div>
  </div>

  <div class="grid-2" style="margin-top:14px; page-break-inside:avoid;">
    <div style="border:1px solid #cbd5e1; padding:8px 12px; border-radius:4px; font-size:10.5px;">
      <strong>Diligencia técnica del proyecto:</strong><br>
      <strong>Autor del estudio:</strong> ${safeAuthor}<br>
      <strong>Colegiado n.º:</strong> ${safeCollegiate}<br>
      <strong>Organismo o consultora:</strong> ${safeOrganization}
    </div>
    <div style="border:1px solid #cbd5e1; padding:8px 12px; border-radius:4px; font-size:10.5px; text-align:center;">
      <strong>Firma y fecha de conformidad:</strong>${safeDiligenceDate ? `<br><span style="color:#334155;">Fecha: ${safeDiligenceDate}</span>` : "<br>"}<br><br>
      <span>Fdo.: ${safeAuthor !== dots ? safeAuthor : "....................................................................."}</span>
    </div>
  </div>

  <div class="warning-box">
    <strong>Advertencias técnicas, hipótesis y limitaciones del modelo (Apartado 12):</strong>
    <ul style="margin:4px 0 0 18px; padding:0;">
      <li>Este informe documenta una <strong>comprobación geométrica y cinemática a baja velocidad (v &le; 15 km/h)</strong> bajo hipótesis de rodadura sin deslizamiento lateral (modelo de bicicleta extendido + tractriz diferencial RK4).</li>
      <li>No se modelan efectos dinámicos, fuerzas centrífugas, peraltes, deformación de neumáticos, balanceo de suspensión, adherencia ni gálibos aéreos tridimensionales.</li>
      <li>${vehicle.verified ? "Los parámetros del chasis proceden de fichas técnicas de fabricante; la posición exacta de la quinta rueda y el ángulo límite de dirección deben verificarse con la flota específica." : "ATENCIÓN: Se ha utilizado un perfil de vehículo PROVISIONAL o personalizado; este resultado NO es válido para certificar una maniobra real."}</li>
      <li>Esta simulación es una herramienta de apoyo al diseño viario y no sustituye la supervisión facultativa ni las comprobaciones in situ.</li>
    </ul>
  </div>

  \x3Cscript>
    function downloadMdReport() {
      const mdText = ${JSON.stringify(mdContent)};
      const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "memoria_tecnica_barrido_${vehicle.id}.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  \x3C/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(reportHtml);
    win.document.close();
  } else {
    // Fallback si el navegador bloquea popups: descargar como archivo HTML imprimible
    downloadTextFile(
      `informe_tecnico_barrido_${vehicle.id}.html`,
      reportHtml,
      "text/html;charset=utf-8"
    );
  }
}

/**
 * Genera la Memoria Técnica Justificativa en formato Markdown (GFM) estructurado (MEJ-04).
 */
export function generateMarkdownTechnicalReport({
  projectName = "Estudio de viabilidad geométrica y barrido de vehículos pesados",
  scenarioName = "Escenario personalizado",
  vehicle,
  maneuver,
  simResult,
  interferenceReport,
  obstacles = [],
  diligence = {}
}) {
  const nowStr = new Date().toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short"
  });
  const metrics = computeDerivedVehicleMetrics(vehicle);
  const compliance = buildNormativeComplianceSummary({ vehicle, maneuver, simResult, interferenceReport });

  const segmentsMd = (maneuver?.segments || [])
    .map((seg, idx) => {
      const dirLabel = seg.direction === -1 ? "Marcha atrás (Retroceso)" : "Avance (Directo)";
      if (seg.type === "straight") {
        return `| ${idx + 1} | Recta | ${dirLabel} | Longitud $L = ${Number(seg.length).toFixed(2)}\\text{ m}$ | $\\kappa = 0,000\\text{ m}^{-1}$ ($\\delta = 0,0^\\circ$) |`;
      } else if (seg.type === "spline") {
        const nPts = seg.waypoints ? seg.waypoints.length : (seg.samples ? seg.samples.length : 0);
        const rMinStr = Number.isFinite(seg.minRadius) ? `${seg.minRadius.toFixed(2)}\\text{ m}` : "—";
        return `| ${idx + 1} | Spline CAD continua (PCHIP) | ${dirLabel} | Longitud $L = ${Number(seg.totalLength || 0).toFixed(2)}\\text{ m}$ (${nPts} waypoints) | $R_{mín} = ${rMinStr}$ |`;
      } else {
        const turnDir = seg.angle >= 0 ? "Izquierda (+)" : "Derecha (-)";
        return `| ${idx + 1} | Curva circular (${turnDir}) | ${dirLabel} | Radio $R_{ref} = ${Number(seg.radius).toFixed(2)}\\text{ m}$, Ángulo $\\Delta\\theta = ${Number(seg.angle).toFixed(1)}^\\circ$ | $\\kappa = ${(1 / seg.radius).toFixed(4)}\\text{ m}^{-1}$ |`;
      }
    })
    .join("\n");

  const obstaclesMd =
    interferenceReport && interferenceReport.obstacleReports && interferenceReport.obstacleReports.length > 0
      ? interferenceReport.obstacleReports
          .map(
            (r) =>
              `| **${r.name}** (${r.type}) | **${r.statusLabel}** | ${r.minDistanceM !== null ? `${r.minDistanceM.toFixed(3)} m` : "N/E"} | PK ${r.distAlongPathM.toFixed(2)} m (${r.part || "—"}) |`
          )
          .join("\n")
      : "| *Sin obstáculos activos* | CLEAR | — | — |";

  return `# Memoria técnica de justificación de trayectoria de barrido (Swept Path Analysis)

**Proyecto:** ${projectName}  
**Escenario:** ${scenarioName}  
**Fecha de cálculo:** ${nowStr}  
**Motor cinemático:** Tractriz diferencial Runge-Kutta 4º orden (RK4) con integración continua de envolvente (ClipperLib)  

---

## 1. Vehículo de diseño y trazabilidad geométrica

- **Denominación:** ${vehicle?.name || "Vehículo"} (${vehicle?.modelVariant || ""})
- **Acreditación técnica:** ${vehicle?.verificationBadge || "Configuración de usuario"}
- **Fuentes documentales:** ${(vehicle?.traceability && vehicle.traceability.sources ? vehicle.traceability.sources.join("; ") : "Catálogo oficial")}

### 1.1. Cabeza tractora o vehículo tractor
| Parámetro geométrico | Símbolo | Valor |
|---|:---:|---:|
| Distancia entre ejes (Batalla) | $L_{wb}$ | ${vehicle?.tractor?.wheelbase?.toFixed(3) || "—"} m |
| Voladizo delantero / trasero | $L_{fo}$ / $L_{ro}$ | ${vehicle?.tractor?.frontOverhang?.toFixed(3) || "—"} m / ${vehicle?.tractor?.rearOverhang?.toFixed(3) || "—"} m |
| Longitud de tractora sola | $L_{tractor}$ | ${metrics.tractorLength.toFixed(3)} m |
| Anchura de carrocería | $W$ | ${vehicle?.tractor?.width?.toFixed(3) || "—"} m |
| Avance de quinta rueda sobre eje motriz | $h$ | ${vehicle?.tractor?.hitchOffset !== undefined ? (vehicle.tractor.hitchOffset >= 0 ? "+" : "") + vehicle.tractor.hitchOffset.toFixed(3) : "—"} m |
| Radio mínimo eje director / bordillo / barrido | $R_{ref}$ / $R_{rueda}$ / $R_{pared}$ | ${metrics.minRefRadius.toFixed(2)} m / ${metrics.minKerbTurningRadius.toFixed(2)} m / ${metrics.minWallTurningRadius.toFixed(2)} m |

### 1.2. Semirremolque y conjunto articulado
${vehicle?.trailer ? `| Parámetro de acoplamiento | Símbolo | Valor |
|---|:---:|---:|
| Distancia kingpin a centro trídem | $L_t$ | ${vehicle.trailer.wheelbase.toFixed(3)} m (${vehicle.trailer.axleCount || 3} ejes) |
| Voladizo delantero / trasero | $L_{t,fo}$ / $L_{t,ro}$ | ${vehicle.trailer.frontOverhang.toFixed(3)} m / ${vehicle.trailer.rearOverhang.toFixed(3)} m |
| Longitud semirremolque / Anchura | $L_{trailer}$ / $W_t$ | ${metrics.trailerLength.toFixed(3)} m / ${vehicle.trailer.width.toFixed(3)} m |
| **Longitud total del conjunto acoplado** | **$L_{total}$** | **${metrics.totalCoupledLength.toFixed(3)} m** |
| Radio de barrido frontal de esquina | $R_{front,swing}$ | ${metrics.frontSwingRadius.toFixed(3)} m |` : "*Vehículo rígido sin remolque articulado.*"}

---

## 2. Definición geométrica de la maniobra

| Tramo | Tipo de alineación | Sentido | Geometría | Curvatura $\\kappa$ |
|:---:|---|---|---|---|
${segmentsMd}

### 2.1. Parámetros numéricos y cinemáticos
- **Posición inicial:** $(X_0 = ${Number(maneuver?.startPose?.x || 0).toFixed(2)}\\text{ m}, Y_0 = ${Number(maneuver?.startPose?.y || 0).toFixed(2)}\\text{ m}, \\theta_0 = ${Number(maneuver?.startPose?.headingDeg || 0).toFixed(1)}^\\circ)$
- **Longitud total recorrida:** ${simResult?.summary?.totalDistanceM?.toFixed(2) || "0.00"} m (${simResult?.summary?.totalStates || 0} estados integrados)
- **Discretización:** $\\Delta s = ${simResult?.summary?.discretization?.straightStepM ?? 0.05}\\text{ m}$, $\\Delta\\theta = ${simResult?.summary?.discretization?.arcStepDeg ?? 0.5}^\\circ$ (Método: ${(simResult?.summary?.discretization?.integrationMethod || "rk4").toUpperCase()})
- **Tolerancia cordal estimada:** $\\le ${((simResult?.summary?.discretization?.estimatedChordalToleranceM || 0.001) * 1000).toFixed(2)}\\text{ mm}$
- **Ángulo de dirección máximo alcanzado:** $\\delta_{máx} = ${simResult?.summary?.maxSteerAngleDeg?.toFixed(1) || "0.0"}^\\circ$ (límite mecánico: ${vehicle?.tractor?.maxSteerAngleDeg || 45}^\\circ)
- **Ángulo de articulación máximo alcanzado:** $\\gamma_{máx} = ${simResult?.summary?.maxArticulationAngleDeg?.toFixed(1) || "0.0"}^\\circ$ (límite admisible: ${vehicle?.limits?.maxArticulationAngleDeg || 85}^\\circ)
- **Anchura máxima de barrido dinámico:** **${simResult?.summary?.maxSweptWidthM?.toFixed(2) || "—"} m**

---

## 3. Comprobación de elementos viarios, márgenes y distancias libres

- **Dictamen global de holguras:** **${interferenceReport ? interferenceReport.globalStatusLabel : "SIN OBSTÁCULOS"}**
- **Margen de seguridad configurado:** ${(interferenceReport?.safetyMarginM ?? 0.30).toFixed(2)} m
- **Distancia mínima registrada a obstáculos:** ${interferenceReport && interferenceReport.minClearanceM !== null ? `${interferenceReport.minClearanceM.toFixed(3)} m` : "Sin obstáculos activos"}

| Elemento viario u obstáculo | Estado | Distancia mínima libre | PK crítico |
|---|:---:|:---:|:---:|
${obstaclesMd}

---

## 4. Cuadro de conformidad normativa española y europea

| Criterio de evaluación | Norma de referencia | Valor prescrito o límite | Valor simulado | Dictamen |
|---|---|---|---|:---:|
| **Vehículo patrón de diseño** | Norma 3.1-IC (Tabla A3.1) | F, C, T o A reglamentario | ${compliance.patternCode} | **${compliance.isStandardSpain ? "PATRÓN OFICIAL" : "EQUIVALENTE"}** |
| **Longitud total del conjunto** | RD 2822/1998 Anexo IX | $L \\le ${compliance.maxPermissibleLength.toFixed(2)}\\text{ m}$ | $L = ${compliance.totalLength.toFixed(2)}\\text{ m}$ | **${compliance.lengthCompliant ? "CONFORME" : "EXCEDE LÍMITE"}** |
| **Anchura máxima exterior** | RD 2822/1998 Anexo IX | $W \\le ${compliance.maxPermissibleWidth.toFixed(2)}\\text{ m}$ | $W = ${compliance.maxWidth.toFixed(2)}\\text{ m}$ | **${compliance.widthCompliant ? "CONFORME" : "EXCEDE LÍMITE"}** |
| **Radio mín. eje director delantero** | Guía Nudos Viarios (Tabla 2.3-D) | $R_{f,min} \\ge ${compliance.minNormRf.toFixed(2)}\\text{ m}$ | ${compliance.hasArcs ? `R_{f,min} = ${compliance.minRfObserved.toFixed(2)} m` : "Alineación recta"} | **${compliance.radiusCompliant ? "CONFORME" : "GIRO CERRADO"}** |
| **Resguardo a elementos viarios** | Instrucción de Carreteras | Holgura libre $\\ge ${(interferenceReport?.safetyMarginM ?? 0.30).toFixed(2)}\\text{ m}$ | $d_{min} = ${interferenceReport && interferenceReport.minClearanceM !== null ? `${interferenceReport.minClearanceM.toFixed(3)} m` : "N/A"}$ | **${compliance.clearanceCompliant ? "CONFORME" : "REVISAR MARGEN"}** |

### 4.1. Dictamen final de viabilidad geométrica
${compliance.globalCompliant
  ? "> **DICTAMEN FAVORABLE:** Se dictamina que la maniobra ensayada resulta **GEOMÉTRICAMENTE VIABLE Y CONFORME** con los parámetros y recomendaciones técnicas de la **Norma 3.1-IC de Trazado de Carreteras** y de la **Guía de Nudos Viarios (OC 32/2012)** del Ministerio de Transportes, respetando los gálibos legales y las holguras de resguardo viario exigibles."
  : "> **DICTAMEN CONDICIONADO / DESFAVORABLE:** La maniobra analizada presenta invasiones de márgenes de resguardo o radios de giro inferiores a las recomendaciones técnicas oficiales. Se recomienda el rediseño del radio de curvatura o la ampliación del sobreancho de calzada."
}

---

## 5. Diligencia de responsabilidad y visado facultativo

- **Autor del estudio:** ${(diligence?.author || "").trim() || "..................................................."}
- **N.º de colegiado:** ${(diligence?.collegiate || "").trim() || "..................................................."}
- **Organismo o consultora:** ${(diligence?.organization || "").trim() || "..................................................."}
- **Fecha y firma:** ${(diligence?.date || "").trim() || "..................................................."}

---
*Documento generado automáticamente por TurnSim / Open Swept Path Analyzer (OSPA).*  
*Hipótesis de cálculo: cinemática de arrastre a baja velocidad ($v \\le 15\\text{ km/h}$) sin deslizamiento lateral (Ackermann + tractriz diferencial RK4).*
`;
}

/**
 * Descarga directamente la Memoria Técnica en formato Markdown (MEJ-04).
 */
export function downloadMarkdownTechnicalReport(options) {
  const md = generateMarkdownTechnicalReport(options);
  const vehId = options.vehicle?.id || "vehiculo";
  downloadTextFile(`memoria_tecnica_barrido_${vehId}.md`, md, "text/markdown;charset=utf-8");
}

/**
 * Abre una hoja gráfica de impresión de la vista actual (Opción 1 del apartado 10: Exportación gráfica del visor).
 */
export function exportGraphicViewSnapshot({
  canvasElement,
  viewModeLabel,
  vehicle,
  scenarioName,
  simResult,
  interferenceReport
}) {
  if (!canvasElement) return;
  const dataUrl = canvasElement.toDataURL("image/png");
  const nowStr = new Date().toLocaleString("es-ES");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Exportación Gráfica del Visor (${viewModeLabel})</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 14px; color: #0f172a; }
    .toolbar { background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 6px; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center; }
    .toolbar button { background: #0284c7; color: #fff; border: none; padding: 7px 14px; border-radius: 5px; cursor: pointer; font-weight: 600; }
    .frame { border: 2px solid #0f172a; padding: 10px; border-radius: 4px; }
    .img-wrap { text-align: center; background: #0f172a; border-radius: 4px; overflow: hidden; }
    .img-wrap img { max-width: 100%; max-height: 145mm; object-fit: contain; display: block; margin: 0 auto; }
    .title-block { display: grid; grid-template-columns: 2fr 2fr 1.5fr; gap: 10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 11px; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><strong>Exportación gráfica del visor (${viewModeLabel})</strong></div>
    <div>
      <button onclick="window.print()">Imprimir / Guardar PDF gráfico</button>
      <a href="${dataUrl}" download="captura_visor_${viewModeLabel.toLowerCase()}.png" style="color:#38bdf8; margin-left:14px; text-decoration:none; font-weight:600;">Descargar PNG</a>
    </div>
  </div>
  <div class="frame">
    <div class="img-wrap"><img src="${dataUrl}" alt="Vista del simulador" /></div>
    <div class="title-block">
      <div><strong>Vehículo:</strong> ${vehicle.name}<br><strong>Escenario:</strong> ${scenarioName}</div>
      <div><strong>Anchura máx. barrida:</strong> ${simResult.summary.maxSweptWidthM.toFixed(2)} m &bull; <strong>Recorrido:</strong> ${simResult.summary.totalDistanceM.toFixed(2)} m<br><strong>Estado interferencias:</strong> ${interferenceReport ? interferenceReport.globalStatusLabel : "Verificado"}</div>
      <div style="text-align:right;"><strong>Vista:</strong> ${viewModeLabel}<br><strong>Fecha:</strong> ${nowStr}</div>
    </div>
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:10px;color:#334155;">
      <strong>Leyenda de líneas de barrido:</strong>
      <span style="color:#dc2626;font-weight:700;">■ Rojo continuo:</span> Envolvente física de barrido &bull;
      <span style="color:#ca8a04;font-weight:700;">▨ Amarillo discontinuo:</span> Margen de seguridad &bull;
      <span style="color:#0284c7;font-weight:700;">━ Azul cian:</span> Eje directriz delantero &bull;
      <span style="color:#16a34a;font-weight:700;">┅ Verde discontinuo:</span> Eje motriz ref. tractora &bull;
      <span style="color:#d97706;font-weight:700;">━ Ámbar:</span> Quinta rueda (kingpin) &bull;
      <span style="color:#9333ea;font-weight:700;">━ Morado:</span> Centro trídem semirremolque &bull;
      <span style="color:#64748b;font-weight:700;">┈ Gris/Violeta punteado:</span> Huellas de neumáticos.
    </div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } else {
    downloadTextFile(`captura_visor_${vehicle.id}.html`, html, "text/html;charset=utf-8");
  }
}

/**
 * Descarga un archivo de texto (DXF, SVG, JSON, HTML) en el navegador.
 */
export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

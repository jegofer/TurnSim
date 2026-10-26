/**
 * Módulo de generación de informes técnicos PDF, exportación gráfica del visor y exportación CAD (DXF / SVG)
 * Cumple el apartado 10 y Fase 7 de PROMT_ORIGINAL.md.
 */

import { computeDerivedVehicleMetrics } from "../models/vehicles.js";
import { getObstacleVertices } from "../engine/collisions.js";

/**
 * Construye un diagrama vectorial SVG en planta a escala métrica exacta para insertar en el informe técnico PDF
 * o descargar como archivo vectorial independiente.
 */
export function generateSVGDiagram(simResult, interferenceReport, obstacles = [], layerVisibility = {}) {
  const showEnvelope = layerVisibility.envelope !== false;
  const showMargin = layerVisibility.margin !== false;
  const showWheelTraces = layerVisibility.wheelTraces !== false;
  const showRefTraces = layerVisibility.refTraces !== false;
  const showGhosts = layerVisibility.ghosts !== false;
  const showObstacles = layerVisibility.obstacles !== false;
  const showDimensions = layerVisibility.dimensions !== false;

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
  for (const obs of obstacles || []) {
    if (obs.enabled === false) continue;
    for (const pt of getObstacleVertices(obs)) includePt(pt[0], pt[1]);
  }

  if (!Number.isFinite(minX)) {
    minX = -10;
    minY = -10;
    maxX = 35;
    maxY = 35;
  }

  const pad = 4.0;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const widthM = Math.max(10, maxX - minX);
  const heightM = Math.max(10, maxY - minY);

  // En SVG la coordenada Y crece hacia abajo; invertimos Y para mantener +Y hacia arriba (Norte)
  const tx = (x) => (x - minX).toFixed(3);
  const ty = (y) => (maxY - y).toFixed(3);

  const polyToPointsAttr = (pts) => pts.map(([x, y]) => `${tx(x)},${ty(y)}`).join(" ");

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

  // 1. Envolvente de margen de seguridad
  if (showMargin && simResult.marginLeftBoundary && simResult.marginRightBoundary) {
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

  // 2. Envolvente física de barrido
  if (showEnvelope) {
    // Relleno continuo mediante la unión de las siluetas y bordes laterales
    lines.push(`  <g id="swept-envelope">`);
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
    if (simResult.leftBoundary.length > 1) {
      lines.push(
        `    <polyline points="${polyToPointsAttr(simResult.leftBoundary)}" fill="none" stroke="#dc2626" stroke-width="0.11" />`
      );
    }
    if (simResult.rightBoundary.length > 1) {
      lines.push(
        `    <polyline points="${polyToPointsAttr(simResult.rightBoundary)}" fill="none" stroke="#dc2626" stroke-width="0.11" />`
      );
    }
    lines.push(`  </g>`);
  }

  // 3. Obstáculos del entorno
  if (showObstacles && obstacles && obstacles.length > 0) {
    lines.push(`  <g id="obstacles">`);
    for (const obs of obstacles) {
      if (obs.enabled === false) continue;
      const verts = getObstacleVertices(obs);
      const isOpen = obs.shape === "polyline" || obs.shape === "arc_curb" || obs.type === "road_edge";
      const color = obs.color || "#dc2626";
      if (isOpen) {
        lines.push(
          `    <polyline points="${polyToPointsAttr(verts)}" fill="none" stroke="${color}" stroke-width="0.16" />`
        );
      } else {
        lines.push(
          `    <polygon points="${polyToPointsAttr(verts)}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="0.12" />`
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

  // Puntos de distancia mínima o colisión con obstáculos
  if (interferenceReport && interferenceReport.obstacleReports) {
    lines.push(`  <g id="interferences">`);
    for (const rep of interferenceReport.obstacleReports) {
      if (!rep.pointOnVehicle || !rep.pointOnObstacle) continue;
      const [vx, vy] = rep.pointOnVehicle;
      const [ox, oy] = rep.pointOnObstacle;
      if (rep.status === "COLLISION" || rep.status === "RESTRICTED_INVASION") {
        lines.push(
          `    <circle cx="${tx(vx)}" cy="${ty(vy)}" r="0.45" fill="#dc2626" fill-opacity="0.35" stroke="#dc2626" stroke-width="0.12" />`
        );
      } else {
        lines.push(
          `    <line x1="${tx(vx)}" y1="${ty(vy)}" x2="${tx(ox)}" y2="${ty(oy)}" stroke="#0284c7" stroke-width="0.07" stroke-dasharray="0.15 0.10" />`
        );
      }
    }
    lines.push(`  </g>`);
  }

  // 8. Barra de escala gráfica (0 a 5 m) y flecha Norte
  const sbX = minX + 1.8;
  const sbY = minY + 1.4;
  lines.push(
    `  <g id="scale-bar">`,
    `    <line x1="${tx(sbX)}" y1="${ty(sbY)}" x2="${tx(sbX + 5)}" y2="${ty(sbY)}" stroke="#0f172a" stroke-width="0.12" />`,
    `    <line x1="${tx(sbX)}" y1="${ty(sbY - 0.3)}" x2="${tx(sbX)}" y2="${ty(sbY + 0.3)}" stroke="#0f172a" stroke-width="0.10" />`,
    `    <line x1="${tx(sbX + 5)}" y1="${ty(sbY - 0.3)}" x2="${tx(sbX + 5)}" y2="${ty(sbY + 0.3)}" stroke="#0f172a" stroke-width="0.10" />`,
    `    <text x="${tx(sbX + 2.5)}" y="${ty(sbY + 0.45)}" font-family="sans-serif" font-size="0.65" font-weight="bold" fill="#0f172a" text-anchor="middle">Escala gráfica: 5,00 m</text>`,
    `  </g>`
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

/**
 * Genera el contenido de un archivo CAD DXF (formato ASCII R12/R2000 universalmente compatible
 * con AutoCAD, Civil 3D, FreeCAD, OpenCAD Studio y QGIS) directamente en el navegador.
 */
export function generateDXFContent(simResult, obstacles = []) {
  const lines = [];
  const pushEntityPolylines = (pts, layer, closed = false, color = 7) => {
    if (!pts || pts.length < 2) return;
    lines.push("0", "POLYLINE", "8", layer, "62", String(color), "66", "1", "70", closed ? "1" : "0");
    for (const [x, y] of pts) {
      lines.push("0", "VERTEX", "8", layer, "10", x.toFixed(4), "20", y.toFixed(4), "30", "0.0");
    }
    lines.push("0", "SEQEND");
  };

  lines.push("0", "SECTION", "2", "ENTITIES");

  // 1. Bordes de envolvente de barrido
  pushEntityPolylines(simResult.leftBoundary, "0_BARRIDO_ENVOLVENTE", false, 1);
  pushEntityPolylines(simResult.rightBoundary, "0_BARRIDO_ENVOLVENTE", false, 1);

  // 2. Margen de seguridad
  if (simResult.marginLeftBoundary && simResult.marginRightBoundary) {
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
    const mx = 0.5 * (d.p1[0] + d.p2[0]);
    const my = 0.5 * (d.p1[1] + d.p2[1]);
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
  layerVisibility
}) {
  const nowStr = new Date().toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short"
  });
  const metrics = computeDerivedVehicleMetrics(vehicle);
  const svgDiagram = generateSVGDiagram(simResult, interferenceReport, obstacles, layerVisibility);

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
              <td><strong>${r.name}</strong><br><small>${r.type}</small></td>
              <td><span class="status-pill status-${r.status}">${r.statusLabel}</span></td>
              <td>${r.minDistanceM !== null ? `${r.minDistanceM.toFixed(3)} m` : "N/E"}</td>
              <td>PK ${r.distAlongPathM.toFixed(2)} m (${r.part || "—"})</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="4">No se han definido obstáculos activos en este escenario.</td></tr>`;

  const reportHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe Técnico de Simulación de Barrido - ${projectName}</title>
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
    .diagram-box {
      width: 100%;
      height: 360px;
      margin: 8px 0;
      page-break-inside: avoid;
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
      <button onclick="window.close()" style="background:#475569;">Cerrar ventana</button>
    </div>
  </div>

  <header>
    <div>
      <h1>INFORME TÉCNICO DE SIMULACIÓN DE TRAYECTORIA DE BARRIDO</h1>
      <div><strong>Proyecto:</strong> ${projectName} &bull; <strong>Escenario:</strong> ${scenarioName}</div>
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
  <div class="diagram-box">${svgDiagram}</div>
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

  <div class="warning-box">
    <strong>Advertencias técnicas, hipótesis y limitaciones del modelo (Apartado 12):</strong>
    <ul style="margin:4px 0 0 18px; padding:0;">
      <li>Este informe documenta una <strong>comprobación geométrica y cinemática a baja velocidad (v &le; 15 km/h)</strong> bajo hipótesis de rodadura sin deslizamiento lateral (modelo de bicicleta extendido + tractriz diferencial RK4).</li>
      <li>No se modelan efectos dinámicos, fuerzas centrífugas, peraltes, deformación de neumáticos, balanceo de suspensión, adherencia ni gálibos aéreos tridimensionales.</li>
      <li>${vehicle.verified ? "Los parámetros del chasis proceden de fichas técnicas de fabricante; la posición exacta de la quinta rueda y el ángulo límite de dirección deben verificarse con la flota específica." : "ATENCIÓN: Se ha utilizado un perfil de vehículo PROVISIONAL o personalizado; este resultado NO es válido para certificar una maniobra real."}</li>
      <li>Esta simulación es una herramienta de apoyo al diseño viario y no sustituye la supervisión facultativa ni las comprobaciones in situ.</li>
    </ul>
  </div>
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

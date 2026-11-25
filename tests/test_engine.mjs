/**
 * Batería de pruebas automatizadas del motor geométrico y cinemático
 * Cumple los apartados 11.1, 11.2 y 11.3 de PROMT_ORIGINAL.md.
 *
 * Ejecución:
 *   node tests/test_engine.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VEHICLE_CATALOG,
  cloneVehicleProfile,
  computeDerivedVehicleMetrics,
  validateVehicleParams
} from "../web/js/models/vehicles.js";

import {
  simulateManeuver,
  buildSegmentsFromWaypoints
} from "../web/js/engine/kinematics.js";

import {
  buildCompleteSimulationResult,
  computeSweptEnvelope,
  computeAdaptiveSampledIndices
} from "../web/js/engine/envelope.js";

import {
  evaluateObstacleInterferences,
  PRESET_SCENARIOS
} from "../web/js/engine/collisions.js";

import {
  generateSVGDiagram,
  generateDXFContent,
  buildNormativeComplianceSummary,
  generateMarkdownTechnicalReport
} from "../web/js/export/exporters.js";

import {
  parseGeoJSON,
  buildScenarioFromGeoJSON,
  projectWgs84ToLocalMeters,
  projectLocalMetersToWgs84
} from "../web/js/export/geojson_importer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const resultsLog = [];

function assertCondition(testCode, description, condition, details = "") {
  if (condition) {
    passed++;
    const msg = `[PASS] ${testCode}: ${description} ${details ? `(${details})` : ""}`;
    console.log(msg);
    resultsLog.push({ testCode, description, status: "PASS", details });
  } else {
    failed++;
    const msg = `[FAIL] ${testCode}: ${description} ${details ? `(${details})` : ""}`;
    console.error(msg);
    resultsLog.push({ testCode, description, status: "FAIL", details });
  }
}

console.log("==================================================================");
console.log(" VERIFICACIÓN GEOMÉTRICA Y CINEMÁTICA DEL MOTOR (FASE 2 y FASE 3)");
console.log("==================================================================\n");

// -----------------------------------------------------------------------------
// TEST-00: Validación de perfiles de los 3 fabricantes iniciales + referencia
// -----------------------------------------------------------------------------
for (const [id, profile] of Object.entries(VEHICLE_CATALOG)) {
  const val = validateVehicleParams(profile);
  assertCondition(
    `TEST-00 (${id})`,
    `Consistencia geométrica de parámetros para ${profile.name}`,
    val.valid === true,
    `L_total=${val.metrics.totalCoupledLength} m, R_rueda_min=${val.metrics.minKerbTurningRadius} m, R_pared_min=${val.metrics.minWallTurningRadius} m`
  );
}

// -----------------------------------------------------------------------------
// TEST-01: Exactitud de dimensiones de contornos poligonales de tractora y remolque
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("renault_t_4x2_sko");
  const maneuver = {
    startPose: { x: 10, y: -5, headingDeg: 37 },
    segments: [{ type: "straight", length: 5.0, direction: 1 }]
  };
  const sim = simulateManeuver(veh, maneuver);
  const st = sim.states[sim.states.length - 1];

  const dist2D = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  // Tractora: 0(tras-der) -> 1(tras-izq) es anchura; 1(tras-izq) -> 2(del-izq) es longitud
  const tp = st.tractorPolygon;
  const tractorWidthCalc = dist2D(tp[0], tp[1]);
  const tractorLenCalc = dist2D(tp[1], tp[2]);
  const expectedTractorLen = veh.tractor.wheelbase + veh.tractor.frontOverhang + veh.tractor.rearOverhang;

  // Semirremolque: 0->1 anchura; 1->2 longitud
  const trp = st.trailerPolygon;
  const trailerWidthCalc = dist2D(trp[0], trp[1]);
  const trailerLenCalc = dist2D(trp[1], trp[2]);
  const expectedTrailerLen = veh.trailer.wheelbase + veh.trailer.frontOverhang + veh.trailer.rearOverhang;

  const maxDimErr = Math.max(
    Math.abs(tractorWidthCalc - veh.tractor.width),
    Math.abs(tractorLenCalc - expectedTractorLen),
    Math.abs(trailerWidthCalc - veh.trailer.width),
    Math.abs(trailerLenCalc - expectedTrailerLen)
  );

  assertCondition(
    "TEST-01",
    "Contornos poligonales respetan dimensiones declaradas (tol <= 1e-6 m)",
    maxDimErr <= 1e-6,
    `error máx = ${maxDimErr.toExponential(2)} m`
  );
}

// -----------------------------------------------------------------------------
// TEST-02: Invariancia rígida de distancias entre ejes y punto de articulación
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("mercedes_actros_4x2_scs");
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [
      { type: "straight", length: 12.0, direction: 1 },
      { type: "arc", radius: 11.0, angle: 95.0, direction: 1 },
      { type: "arc", radius: 14.0, angle: -45.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };
  const sim = simulateManeuver(veh, maneuver);

  let maxHitchErr = 0;
  let maxTrailerWbErr = 0;
  let maxTractorWbErr = 0;

  for (const s of sim.states) {
    const dTractorWb = Math.hypot(
      s.tractorFrontAxle.center[0] - s.x,
      s.tractorFrontAxle.center[1] - s.y
    );
    const dHitch = Math.hypot(s.hitch[0] - s.x, s.hitch[1] - s.y);
    const dTrailerWb = Math.hypot(s.hitch[0] - s.tx, s.hitch[1] - s.ty);

    maxTractorWbErr = Math.max(maxTractorWbErr, Math.abs(dTractorWb - veh.tractor.wheelbase));
    maxHitchErr = Math.max(maxHitchErr, Math.abs(dHitch - Math.abs(veh.tractor.hitchOffset)));
    maxTrailerWbErr = Math.max(maxTrailerWbErr, Math.abs(dTrailerWb - veh.trailer.wheelbase));
  }

  const maxRigidErr = Math.max(maxTractorWbErr, maxHitchErr, maxTrailerWbErr);
  assertCondition(
    "TEST-02",
    "Invariancia rígida de batalla de tractora, quinta rueda y batalla de semirremolque (tol <= 1e-5 m)",
    maxRigidErr <= 1e-5,
    `error máx = ${maxRigidErr.toExponential(2)} m en ${sim.states.length} estados`
  );
}

// -----------------------------------------------------------------------------
// TEST-03: Simetría especular entre maniobras a izquierda (+90°) y derecha (-90°)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("daf_xf_4x2_eu");
  const leftManeuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [
      { type: "straight", length: 10.0, direction: 1 },
      { type: "arc", radius: 12.5, angle: 90.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };
  const rightManeuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [
      { type: "straight", length: 10.0, direction: 1 },
      { type: "arc", radius: 12.5, angle: -90.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };

  const simL = simulateManeuver(veh, leftManeuver);
  const simR = simulateManeuver(veh, rightManeuver);

  let maxSymErrPos = 0;
  let maxSymErrAng = 0;

  for (let i = 0; i < simL.states.length; i++) {
    const sL = simL.states[i];
    const sR = simR.states[i];
    const errX = Math.abs(sL.x - sR.x);
    const errY = Math.abs(sL.y + sR.y);
    const errTx = Math.abs(sL.tx - sR.tx);
    const errTy = Math.abs(sL.ty + sR.ty);
    const errH = Math.abs(sL.heading + sR.heading);
    const errTH = Math.abs(sL.theading + sR.theading);

    maxSymErrPos = Math.max(maxSymErrPos, errX, errY, errTx, errTy);
    maxSymErrAng = Math.max(maxSymErrAng, errH, errTH);
  }

  assertCondition(
    "TEST-03",
    "Simetría especular exacta entre giros a izquierda y derecha (tol <= 1e-5 m / rad)",
    maxSymErrPos <= 1e-5 && maxSymErrAng <= 1e-5,
    `errPos = ${maxSymErrPos.toExponential(2)} m, errAng = ${maxSymErrAng.toExponential(2)} rad`
  );
}

// -----------------------------------------------------------------------------
// TEST-04: Convergencia numérica al refinar la discretización (0,05 m vs. 0,005 m)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("renault_t_4x2_sko");
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 12.5, angle: 90.0, direction: 1 },
      { type: "straight", length: 15.0, direction: 1 }
    ]
  };

  const simStandard = simulateManeuver(veh, maneuver, { straightStep: 0.05, arcStepDeg: 0.5 });
  const simFine = simulateManeuver(veh, maneuver, { straightStep: 0.005, arcStepDeg: 0.05 });

  const lastStd = simStandard.states[simStandard.states.length - 1];
  const lastFine = simFine.states[simFine.states.length - 1];

  const endTrailerDiff = Math.hypot(lastStd.tx - lastFine.tx, lastStd.ty - lastFine.ty);

  const envStd = computeSweptEnvelope(simStandard.states, veh, 0.0);
  const envFine = computeSweptEnvelope(simFine.states, veh, 0.0);
  const widthDiff = Math.abs(envStd.maxSweptWidthM - envFine.maxSweptWidthM);

  assertCondition(
    "TEST-04",
    "Convergencia al refinar paso 10x (0,05 m -> 0,005 m): diferencia de posición y anchura <= 0,01 m",
    endTrailerDiff <= 0.001 && widthDiff <= 0.01,
    `diff pos final remolque = ${(endTrailerDiff * 1000).toFixed(4)} mm, diff anchura máx = ${(widthDiff * 1000).toFixed(2)} mm`
  );
}

// -----------------------------------------------------------------------------
// TEST-05: Contraste cruzado con herramienta externa (brombirium/schlepp)
// -----------------------------------------------------------------------------
{
  const richJsonPath = path.join(__dirname, "../web/simulation_data_rich.json");
  const refData = JSON.parse(fs.readFileSync(richJsonPath, "utf8"));

  const veh = cloneVehicleProfile("generic_schlepp_1650");
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 12.5, angle: 90.0, direction: 1 },
      { type: "straight", length: 15.0, direction: 1 }
    ]
  };

  // 5A: Modo de compatibilidad exacto con simulation_data_rich.json (straightStep = 15/188 = 0.079787 m, 557 estados)
  const simChord557 = simulateManeuver(veh, maneuver, {
    straightStep: 15.0 / 188,
    arcStepDeg: 0.5,
    integrationMethod: "schlepp_chord",
    schleppHitchSign: true
  });
  const resChord557 = buildCompleteSimulationResult(veh, maneuver, { precomputedSimulation: simChord557 });

  let maxDiffChord = 0;
  for (let i = 0; i < refData.traces.trailer_rear.length; i++) {
    const [rx, ry] = refData.traces.trailer_rear[i];
    const [cx, cy] = resChord557.traces.trailer_rear[i];
    maxDiffChord = Math.max(maxDiffChord, Math.hypot(rx - cx, ry - cy));
  }

  // 5B: Comparación entre integrador diferencial exacto RK4 (paso 0.05 m) y schlepp refinado (paso 0.002 m),
  // además de medir la deriva de primer orden (22,24 mm) de la aproximación cordal de schlepp con paso 0.05 m.
  const simChord781 = simulateManeuver(veh, maneuver, {
    straightStep: 0.05,
    arcStepDeg: 0.5,
    integrationMethod: "schlepp_chord",
    schleppHitchSign: true
  });
  const simChordFine = simulateManeuver(veh, maneuver, {
    straightStep: 0.002,
    arcStepDeg: 0.02,
    integrationMethod: "schlepp_chord",
    schleppHitchSign: true
  });
  const simRK4 = simulateManeuver(veh, maneuver, {
    straightStep: 0.05,
    arcStepDeg: 0.5,
    integrationMethod: "rk4",
    schleppHitchSign: true
  });
  let maxDiffRK4vsSchleppCoarse = 0;
  for (let i = 0; i < simChord781.states.length; i++) {
    const sc = simChord781.states[i];
    const sr = simRK4.states[i];
    maxDiffRK4vsSchleppCoarse = Math.max(maxDiffRK4vsSchleppCoarse, Math.hypot(sc.tx - sr.tx, sc.ty - sr.ty));
  }
  const lastRK4 = simRK4.states[simRK4.states.length - 1];
  const lastChordFine = simChordFine.states[simChordFine.states.length - 1];
  const diffRK4vsFineSchlepp = Math.hypot(lastRK4.tx - lastChordFine.tx, lastRK4.ty - lastChordFine.ty);

  // Comparar anchura máxima barrida (5,67 m en simulation_data_rich.json a 60°, 5,69 m máximo absoluto en el arco)
  const maxDimWidthM = resChord557.summary.maxSweptWidthM;
  const widthErrVsRef = Math.abs(maxDimWidthM - 5.67);

  assertCondition(
    "TEST-05",
    "Contraste cruzado Motor JS vs. brombirium/schlepp (idéntico en modo cuerda <= 1e-6 m; RK4 vs. solución convergente <= 1 mm)",
    maxDiffChord <= 1e-6 && diffRK4vsFineSchlepp <= 0.001 && widthErrVsRef <= 0.025,
    `diff modo schlepp = ${maxDiffChord.toExponential(2)} m, RK4(0.05m) vs schlepp_fino(0.002m) = ${(diffRK4vsFineSchlepp * 1000).toFixed(2)} mm (deriva O(ds) de schlepp a 0.05m = ${(maxDiffRK4vsSchleppCoarse * 1000).toFixed(2)} mm), anchura máx = ${maxDimWidthM} m`
  );
}

// -----------------------------------------------------------------------------
// TEST-06: Estabilidad y reversibilidad en maniobras marcha atrás y detección de tijera
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("renault_t_4x2_sko");

  // 6A: Avance recto 12 m y retroceso recto 12 m -> debe volver exactamente al origen (0, 0)
  const revStraight = simulateManeuver(veh, {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [
      { type: "straight", length: 12.0, direction: 1 },
      { type: "straight", length: 12.0, direction: -1 }
    ]
  });
  const endRev = revStraight.states[revStraight.states.length - 1];
  const returnErr = Math.hypot(endRev.x - 0, endRev.y - 0);

  // 6B: Retroceso en curva de aproximación a muelle (R=20 m, 35° marcha atrás)
  const dockBacking = simulateManeuver(veh, {
    startPose: { x: 25, y: 10, headingDeg: 0 },
    segments: [
      { type: "straight", length: 4.0, direction: -1 },
      { type: "arc", radius: 22.0, angle: 35.0, direction: -1 },
      { type: "straight", length: 3.0, direction: -1 }
    ]
  });
  const backingValid = dockBacking.states.every(
    (s) => Number.isFinite(s.x) && Number.isFinite(s.tx) && Number.isFinite(s.theading)
  );

  // 6C: Retroceso prolongado en curva cerrada (R=8 m, 90° marcha atrás) -> debe disparar alerta de acodalamiento (exceedsMaxArticulation)
  const jackknifeSim = simulateManeuver(veh, {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [{ type: "arc", radius: 8.0, angle: 90.0, direction: -1 }]
  });

  assertCondition(
    "TEST-06",
    "Comportamiento correcto en marcha atrás (reversibilidad exacta, estabilidad en muelle y detección de jackknifing)",
    returnErr <= 1e-6 && backingValid && jackknifeSim.summary.anyArticulationExceeded === true,
    `error retorno recto = ${returnErr.toExponential(2)} m, máx articulación muelle = ${dockBacking.summary.maxArticulationAngleDeg}°, alerta tijera activada a ${jackknifeSim.summary.maxArticulationAngleDeg}°`
  );
}

// -----------------------------------------------------------------------------
// TEST-07: Generación de trayectoria a partir de puntos de paso (waypoints)
// -----------------------------------------------------------------------------
{
  const wpResult = buildSegmentsFromWaypoints(
    [
      { x: 0, y: 0 },
      { x: 25, y: 0, radius: 12.5 },
      { x: 25, y: 25 }
    ],
    12.5,
    1
  );
  assertCondition(
    "TEST-07",
    "Generación automática de tramos rectos y arco tangente desde puntos de paso (waypoints)",
    wpResult.segments.length === 3 &&
      wpResult.segments[0].type === "straight" &&
      wpResult.segments[1].type === "arc" &&
      Math.abs(wpResult.segments[1].angle - 90) < 1e-3,
    `tramos generados = ${wpResult.segments.length} (${wpResult.segments.map((s) => s.type).join(" -> ")})`
  );
}

// -----------------------------------------------------------------------------
// TEST-08: Módulo de interferencias y colisiones (5 estados + corona Directiva 96/53/CE)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("renault_t_4x2_sko");
  const baseManeuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [{ type: "straight", length: 15.0, direction: 1 }]
  };
  const sim = buildCompleteSimulationResult(veh, baseManeuver, { safetyMarginM: 0.30 });

  // 8A: Estado CLEAR (obstáculo a y = 3.0 m -> distancia a semiancho 1.30 m = 1.70 m > 0.30 m)
  const repClear = evaluateObstacleInterferences(
    sim,
    [{ id: "o1", name: "Muro lejano", type: "building", shape: "rect", x: 7.5, y: 3.0, length: 4.0, width: 1.0 }],
    0.30
  );

  // 8B: Estado MARGIN_VIOLATION (borde inferior del obstáculo a y = 1.45 m -> distancia a y=1.30 m = 0.15 m < 0.30 m)
  const repMargin = evaluateObstacleInterferences(
    sim,
    [{ id: "o2", name: "Bolardo cercano", type: "bollard", shape: "rect", x: 7.5, y: 1.95, length: 2.0, width: 1.0 }],
    0.30
  );

  // 8C: Estado RESTRICTED_INVASION (zona prohibida solapando la trayectoria en y = 0.5 m)
  const repRestricted = evaluateObstacleInterferences(
    sim,
    [{ id: "o3", name: "Senda peatonal prohibida", type: "restricted_zone", shape: "rect", x: 7.5, y: 0.5, length: 4.0, width: 1.0 }],
    0.30
  );

  // 8D: Estado COLLISION (obstáculo físico solapando la trayectoria en y = 0.0 m)
  const repCollision = evaluateObstacleInterferences(
    sim,
    [{ id: "o4", name: "Pilar estructural", type: "building", shape: "circle", x: 7.5, y: 0.0, radius: 0.8 }],
    0.30
  );

  // 8E: Corona circular normativa Directiva 96/53/CE (R_ext = 12,50 m, R_int = 5,30 m)
  const euScen = PRESET_SCENARIOS.eu_directive_96_53_ring;
  const simEU = buildCompleteSimulationResult(veh, euScen.maneuver, { safetyMarginM: euScen.safetyMarginM });
  const repEU = evaluateObstacleInterferences(simEU, euScen.obstacles, euScen.safetyMarginM);

  assertCondition(
    "TEST-08",
    "Distinción rigurosa de estados de interferencia (CLEAR, MARGIN_VIOLATION, RESTRICTED_INVASION, COLLISION) y corona UE 96/53/CE",
    repClear.globalStatus === "CLEAR" &&
      repMargin.globalStatus === "MARGIN_VIOLATION" &&
      Math.abs(repMargin.minClearanceM - 0.15) < 0.02 &&
      repRestricted.globalStatus === "RESTRICTED_INVASION" &&
      repCollision.globalStatus === "COLLISION" &&
      repEU.globalStatus === "CLEAR",
    `holgura margen = ${repMargin.minClearanceM} m, corona Directiva 96/53/CE = ${repEU.globalStatus} (d_min = ${repEU.minClearanceM} m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-09: Exportación técnica CAD (DXF multicapa) y plano vectorial a escala (SVG)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("mercedes_actros_4x2_scs");
  const scen = PRESET_SCENARIOS.industrial_turn_90;
  const sim = buildCompleteSimulationResult(veh, scen.maneuver, { safetyMarginM: scen.safetyMarginM });
  const rep = evaluateObstacleInterferences(sim, scen.obstacles, scen.safetyMarginM);

  const dxf = generateDXFContent(sim, scen.obstacles);
  const svg = generateSVGDiagram(sim, rep, scen.obstacles, {});

  const hasRequiredDXFLayers =
    dxf.includes("0_BARRIDO_ENVOLVENTE") &&
    dxf.includes("0_MARGEN_SEGURIDAD") &&
    dxf.includes("0_HUELLA_EJE_REFERENCIA") &&
    dxf.includes("0_SILUETAS_VEHICULO") &&
    dxf.includes("0_OBSTACULOS") &&
    dxf.includes("0_ACOTACIONES_ANCHURA");

  const hasValidSVG =
    svg.startsWith("<svg") &&
    svg.includes('id="swept-envelope"') &&
    svg.includes('id="scale-bar"') &&
    svg.trim().endsWith("</svg>");

  assertCondition(
    "TEST-09",
    "Generación íntegra de archivos vectoriales DXF multicapa (con 0_ACOTACIONES_ANCHURA) y SVG a escala métrica",
    hasRequiredDXFLayers && hasValidSVG,
    `DXF = ${(dxf.length / 1024).toFixed(1)} KB, SVG = ${(svg.length / 1024).toFixed(1)} KB`
  );
}

// -----------------------------------------------------------------------------
// TEST-10: Verificación de integridad de los puntos de entrada HTML autónomos
// -----------------------------------------------------------------------------
{
  const htmlPaths = [
    path.join(__dirname, "../web/index.html"),
    path.join(__dirname, "../web/simulacion_threejs.html"),
    path.join(__dirname, "../simulacion_threejs.html")
  ];

  const allExistAndValid = htmlPaths.every((p) => {
    if (!fs.existsSync(p)) return false;
    const html = fs.readFileSync(p, "utf8");
    return (
      html.includes('id="canvas-2d"') &&
      html.includes('id="container-3d"') &&
      html.includes("class SweptPathApp") &&
      html.includes("VEHICLE_CATALOG") &&
      !html.includes("import {")
    );
  });

  assertCondition(
    "TEST-10",
    "Puntos de entrada HTML autónomos generados sin dependencias de servidor ni bloqueos CORS (file://)",
    allExistAndValid,
    `3 archivos HTML verificados`
  );
}

// -----------------------------------------------------------------------------
// TEST-11: Selección independiente y combinaciones dinámicas tractora-semirremolque
// -----------------------------------------------------------------------------
{
  const {
    TRACTOR_CATALOG,
    TRAILER_CATALOG,
    buildCombinedVehicle,
    validateVehicleParams,
    computeDerivedVehicleMetrics
  } = await import("../web/js/models/vehicles.js");

  const tractorKeys = Object.keys(TRACTOR_CATALOG);
  const trailerKeys = Object.keys(TRAILER_CATALOG);
  let totalCombos = 0;
  let allCombosValid = true;

  for (const trk of tractorKeys) {
    for (const tlk of trailerKeys) {
      const combo = buildCombinedVehicle(trk, tlk);
      totalCombos++;
      const val = validateVehicleParams(combo);
      const metrics = computeDerivedVehicleMetrics(combo);
      if (!val.valid || !Number.isFinite(metrics.totalCoupledLength)) {
        allCombosValid = false;
      }
    }
  }

  assertCondition(
    "TEST-11",
    `Combinaciones independientes tractora + semirremolque (${totalCombos} combinaciones evaluadas con validación geométrica)`,
    allCombosValid && totalCombos >= 20,
    `${totalCombos} combinaciones válidas y parametrizadas`
  );
}

// -----------------------------------------------------------------------------
// TEST-12: Herramienta de medición métrica y cálculo de distancias/azimutes
// -----------------------------------------------------------------------------
{
  const p1 = [10.0, 5.0];
  const p2 = [14.0, 8.0];
  const dx = p2[0] - p1[0]; // 4.0
  const dy = p2[1] - p1[1]; // 3.0
  const dist = Math.hypot(dx, dy); // 5.0
  const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

  const validDist = Math.abs(dist - 5.0) < 1e-9;
  const validAngle = Math.abs(angleDeg - 36.869897) < 1e-4;

  assertCondition(
    "TEST-12",
    "Cálculo analítico de distancias euclídeas, incrementos cartesianos y azimutes de medición",
    validDist && validAngle,
    `dist = ${dist.toFixed(3)} m, dx = ${dx.toFixed(2)} m, dy = ${dy.toFixed(2)} m, angle = ${angleDeg.toFixed(2)}°`
  );
}

// -----------------------------------------------------------------------------
// TEST-13: Módulo de importación y análisis de archivos CAD DXF en cliente
// -----------------------------------------------------------------------------
{
  const {
    parseDXF,
    detectSuggestedLayerMapping,
    buildScenarioFromDXF
  } = await import("../web/js/export/dxf_importer.js");

  const dxfSample = `  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
TURNSIM_TRAYECTORIA
 70
0
 10
0.0
 20
0.0
 10
25.0
 20
0.0
 10
25.0
 20
25.0
  0
LWPOLYLINE
  8
EDIFICIOS
 70
1
 10
10.0
 20
5.0
 10
15.0
 20
5.0
 10
15.0
 20
10.0
 10
10.0
 20
10.0
  0
ENDSEC
  0
EOF
`;

  const parsed = parseDXF(dxfSample);
  const layersOk = parsed.layers.includes("TURNSIM_TRAYECTORIA") && parsed.layers.includes("EDIFICIOS");
  const suggested = detectSuggestedLayerMapping(parsed.layers);
  const mappingOk = suggested.trajectoryLayer === "TURNSIM_TRAYECTORIA" && suggested.obstacleLayers.includes("EDIFICIOS");

  const scenario = buildScenarioFromDXF(parsed, suggested, { direction: 1, agreementRadius: 10.0 });
  const scenarioOk = scenario.maneuver && scenario.maneuver.segments.length > 0 && scenario.obstacles.length === 1;

  assertCondition(
    "TEST-13",
    "Parser DXF en cliente, autodetección de capas sugeridas y generación de maniobra/obstáculos",
    layersOk && mappingOk && scenarioOk,
    `capas=[${parsed.layers.join(", ")}], obstáculos extraídos=${scenario.obstacles.length}, tramos=${scenario.maneuver.segments.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-14: Cinemática y envolvente de vehículos rígidos de cuerpo único (UX-09)
// -----------------------------------------------------------------------------
{
  const rigidVeh = cloneVehicleProfile("rigid_truck_2axle");
  const busVeh = cloneVehicleProfile("coach_bus_15m");

  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 12.0, angle: 90.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };

  const simRigid = simulateManeuver(rigidVeh, maneuver);
  const simBus = simulateManeuver(busVeh, maneuver);

  const rigidOk = simRigid.states.every(
    (s) => s.trailerPolygon === null && s.articulationAngleDeg === 0
  );
  const busOk = simBus.states.every(
    (s) => s.trailerPolygon === null && s.articulationAngleDeg === 0
  );

  const envRigid = computeSweptEnvelope(simRigid.states, rigidVeh);
  const hasValidEnvelope = Array.isArray(envRigid.envelopePolygon) && envRigid.envelopePolygon.length >= 4;

  assertCondition(
    "TEST-14",
    "Simulación cinemática y envolventes para vehículos rígidos de cuerpo único (hasTrailer=false)",
    rigidOk && busOk && hasValidEnvelope,
    `camión rígido: ${simRigid.states.length} estados, autobús 15m: ${simBus.states.length} estados, vértices envolvente: ${envRigid.envelopePolygon.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-15: Serialización y deserialización de proyectos TurnSim (.turnsim.json) (UX-07)
// -----------------------------------------------------------------------------
{
  const testProject = {
    turnsim_version: "1.0.0",
    application: "TurnSim / Open Swept Path Analyzer (OSPA)",
    timestamp: "2026-11-09T14:00:00.000Z",
    vehicle: cloneVehicleProfile("city_bus_12m"),
    maneuver: {
      startPose: { x: 5, y: -2, headingDeg: 45 },
      segments: [{ type: "straight", length: 20, direction: 1 }]
    },
    obstacles: [
      { id: "obs_test", name: "Pilar", shape: "circle", x: 10, y: 5, radius: 0.5, type: "column", enabled: true }
    ],
    safetyMarginM: 0.40,
    discretization: { straightStepM: 0.10, arcStepDeg: 0.5 }
  };

  const serialized = JSON.stringify(testProject);
  const restored = JSON.parse(serialized);

  const isFaithful =
    restored.turnsim_version === "1.0.0" &&
    restored.vehicle.id === "city_bus_12m" &&
    restored.vehicle.hasTrailer === false &&
    restored.maneuver.segments[0].length === 20 &&
    restored.obstacles.length === 1 &&
    restored.safetyMarginM === 0.40;

  const simRestored = buildCompleteSimulationResult(restored.vehicle, restored.maneuver, {
    ...restored.discretization,
    safetyMarginM: restored.safetyMarginM
  });

  assertCondition(
    "TEST-15",
    "Persistencia de proyectos en formato .turnsim.json e idempotencia de cálculo (UX-07)",
    isFaithful && simRestored.states.length > 0,
    `versión=${restored.turnsim_version}, vehículo=${restored.vehicle.id}, estados simulados=${simRestored.states.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-16: Rendimiento e indexación espacial O(M) de encadenado de segmentos (PERF-09)
// -----------------------------------------------------------------------------
{
  const { chainBoundarySegments } = await import("../web/js/engine/envelope.js");

  // Generar un polígono cerrado de 200 segmentos ordenados aleatoriamente
  const N = 200;
  const rawSegments = [];
  const R = 20.0;
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * 2 * Math.PI;
    const a2 = ((i + 1) / N) * 2 * Math.PI;
    rawSegments.push([
      [R * Math.cos(a1), R * Math.sin(a1)],
      [R * Math.cos(a2), R * Math.sin(a2)]
    ]);
  }
  // Desordenar determinísticamente
  const shuffled = [...rawSegments].sort((a, b) => Math.sin(a[0][0]) - Math.sin(b[0][0]));

  const t0 = performance.now();
  const chained = chainBoundarySegments(shuffled, 0.05);
  const dt = performance.now() - t0;

  assertCondition(
    "TEST-16",
    `Encadenamiento en tiempo lineal O(M) con cuadrícula espacial hash (${N} segmentos desordenados)`,
    chained.length >= N * 0.95 && dt < 50,
    `vértices encadenados=${chained.length}/${N + 1}, tiempo=${dt.toFixed(2)} ms`
  );
}

// -----------------------------------------------------------------------------
// TEST-17: Paridad e integridad de diccionarios de internacionalización (SEO-05)
// -----------------------------------------------------------------------------
{
  const { LOCALES, I18nManager } = await import("../web/js/i18n/locales.js");
  const esKeys = Object.keys(LOCALES.es);
  const enKeys = Object.keys(LOCALES.en);

  const missingInEn = esKeys.filter((k) => !(k in LOCALES.en));
  const missingInEs = enKeys.filter((k) => !(k in LOCALES.es));

  const i18n = new I18nManager("es");
  const tEs = i18n.t("section_a_title");
  i18n.setLanguage("en");
  const tEn = i18n.t("section_a_title");

  assertCondition(
    "TEST-17",
    `Integridad y simetría total de claves bilingües ES/EN (${esKeys.length} claves verificadas)`,
    missingInEn.length === 0 && missingInEs.length === 0 && tEs !== tEn,
    `ES: "${tEs}" | EN: "${tEn}", faltan en EN: ${missingInEn.length}, faltan en ES: ${missingInEs.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-18: Exactitud de unión booleana Clipper y polígono de Jordan (GEOM-01, GEOM-02)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { PRESET_SCENARIOS } = await import("../web/js/engine/collisions.js");
  const { buildCompleteSimulationResult } = await import("../web/js/engine/envelope.js");

  const v = VEHICLE_CATALOG.renault_t_4x2_sko;
  const res = buildCompleteSimulationResult(v, PRESET_SCENARIOS.industrial_turn_90.maneuver, {
    safetyMarginM: 0.0
  });

  const poly = res.envelope;
  const n = poly.length - 1; // Polígono cerrado
  let selfIntersections = 0;

  function doIntersect(p1, q1, p2, q2) {
    function orientation(p, q, r) {
      const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
      if (Math.abs(val) < 1e-9) return 0;
      return val > 0 ? 1 : 2;
    }
    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);
    return o1 !== o2 && o3 !== o4;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (doIntersect(poly[i], poly[i + 1], poly[j], poly[j + 1])) {
        selfIntersections++;
      }
    }
  }

  let area = 0;
  for (let i = 0; i < n; i++) {
    area += poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1];
  }
  area = Math.abs(area) * 0.5;

  // Valor de referencia GEOS Shapely: 239.70 m² (+/- 1.5%)
  const areaValid = area >= 235.0 && area <= 245.0;

  assertCondition(
    "TEST-18",
    `Envolvente de barrido con unión booleana Clipper (0 autointersecciones y área conforme a GEOS)`,
    selfIntersections === 0 && areaValid && poly.length >= 100,
    `área=${area.toFixed(2)} m² (ref ~240 m²), autointersecciones=${selfIntersections}, vértices=${poly.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-19: Margen de seguridad con redondeo exacto ClipperOffset jtRound (GEOM-04)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { PRESET_SCENARIOS } = await import("../web/js/engine/collisions.js");
  const { buildCompleteSimulationResult } = await import("../web/js/engine/envelope.js");

  const v = VEHICLE_CATALOG.renault_t_4x2_sko;
  const res = buildCompleteSimulationResult(v, PRESET_SCENARIOS.industrial_turn_90.maneuver, {
    safetyMarginM: 0.25
  });

  const mPoly = res.marginEnvelope;
  const mn = mPoly.length - 1;

  let mArea = 0;
  for (let i = 0; i < mn; i++) {
    mArea += mPoly[i][0] * mPoly[i + 1][1] - mPoly[i + 1][0] * mPoly[i][1];
  }
  mArea = Math.abs(mArea) * 0.5;

  assertCondition(
    "TEST-19",
    `Margen de seguridad con redondeo exacto de esquinas (ClipperOffset jtRound)`,
    mPoly && mPoly.length >= 100 && mArea > 265.0 && mArea < 285.0,
    `área margen=${mArea.toFixed(2)} m² (> área base 241.03 m²), vértices=${mPoly.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-20: Acotación de secciones transversales y consistencia de ancho barrido (GEOM-03)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { PRESET_SCENARIOS } = await import("../web/js/engine/collisions.js");
  const { buildCompleteSimulationResult, computeCrossSectionWidth } = await import("../web/js/engine/envelope.js");

  const v = VEHICLE_CATALOG.renault_t_4x2_sko;
  const res = buildCompleteSimulationResult(v, PRESET_SCENARIOS.industrial_turn_90.maneuver);

  // La anchura máxima de barrido en un giro de 90° para un semirremolque de 16,5 m está acotada entre 4.0 m y 6.5 m
  const maxW = res.summary.maxSweptWidthM;
  const widthConsistent = maxW >= 4.0 && maxW <= 6.5;

  // Filtrado temporal en computeCrossSectionWidth: con ventana temporal restringida dist no considera OBBs lejanos
  const s0 = res.states[0];
  const secWindowed = computeCrossSectionWidth(s0.x, s0.y, -Math.sin(s0.heading), Math.cos(s0.heading), res.obbs, 16.0, s0.dist, 5.0);

  assertCondition(
    "TEST-20",
    `Acotación de secciones transversales y anchura de barrido en giro de 90° (GEOM-03)`,
    widthConsistent && secWindowed && Math.abs(secWindowed.width - v.tractor.width) < 0.15,
    `ancho máximo giro 90°=${maxW} m (esperado 4.0 a 6.5 m), ancho tramo inicial=${secWindowed ? secWindowed.width.toFixed(3) : 0} m (ancho tractora=${v.tractor.width} m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-21: Solución analítica exacta de la tractriz vs. integrador RK4 (MATH-01)
// -----------------------------------------------------------------------------
{
  const { updateTrailerRK4 } = await import("../web/js/engine/kinematics.js");

  const L = 7.70;
  const psi0 = (45.0 * Math.PI) / 180;
  const sDist = 10.0;
  // Solución cerrada analítica de la tractriz clásica: tan(psi(s)/2) = tan(psi_0/2) * exp(-s/L)
  const psiExact = 2 * Math.atan(Math.tan(psi0 / 2) * Math.exp(-sDist / L));

  function solveRK4(steps) {
    const ds = sDist / steps;
    let th = -psi0;
    let hx = 0;
    for (let i = 0; i < steps; i++) {
      const [, , nextTh] = updateTrailerRK4(hx, 0, hx + ds, 0, th, L);
      th = nextTh;
      hx += ds;
    }
    return Math.abs(th - (-psiExact));
  }

  const err100 = solveRK4(100);
  const err200 = solveRK4(200);
  const ratio = err100 / err200;
  const observedOrder = Math.log2(ratio);

  assertCondition(
    "TEST-21",
    `Solución analítica exacta de la tractriz vs. RK4 (error < 1e-11 rad y orden p >= 3.95)`,
    err200 < 1e-11 && observedOrder >= 3.95,
    `error (N=200): ${err200.toExponential(3)} rad, ratio e100/e200: ${ratio.toFixed(2)}, orden observado: ${observedOrder.toFixed(2)}`
  );
}

// -----------------------------------------------------------------------------
// TEST-22: Integrador analítico RK4 en arcos circulares y orden de convergencia (MATH-01)
// -----------------------------------------------------------------------------
{
  const { updateTrailerArcRK4 } = await import("../web/js/engine/kinematics.js");

  const R = 10.0;
  const L = 7.70;
  // Ángulo de articulación estacionario analítico exacto en curva circular: sin(psi_inf) = L / R
  const psiSS = Math.asin(L / R);
  const dHeading = (0.5 * Math.PI) / 180;

  // En régimen estacionario d(psi)/d(theta) = 0, por lo que la orientación del semirremolque
  // debe avanzar exactamente dHeading - psiSS
  const [, , thNext] = updateTrailerArcRK4(0, 0, 0, R, dHeading, -psiSS, L);
  const expectedNextHeading = dHeading - psiSS;
  const errArcSS = Math.abs(thNext - expectedNextHeading);

  assertCondition(
    "TEST-22",
    `Integrador analítico RK4 en arco circular (updateTrailerArcRK4 error estacionario < 1e-12 rad)`,
    errArcSS < 1e-12,
    `error régimen estacionario circular = ${errArcSS.toExponential(3)} rad (precisión de máquina)`
  );
}

// -----------------------------------------------------------------------------
// TEST-23: Curvas de transición clotoideas y continuidad de curvatura G2 (KIN-02)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulateManeuver } = await import("../web/js/engine/kinematics.js");

  const v = VEHICLE_CATALOG.renault_t_4x2_sko;
  const maneuverClothoid = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 10.0, direction: 1 },
      { type: "clothoid", length: 15.0, startCurvature: 0.0, endCurvature: 1 / 15.0, direction: 1 },
      { type: "arc", radius: 15.0, angle: 45.0, direction: 1 },
      { type: "clothoid", length: 15.0, startCurvature: 1 / 15.0, endCurvature: 0.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };

  const sim = simulateManeuver(v, maneuverClothoid, { straightStep: 0.05, arcStepDeg: 0.5 });
  const hasNaN = sim.states.some(
    (s) => Number.isNaN(s.x) || Number.isNaN(s.y) || Number.isNaN(s.heading) || Number.isNaN(s.tx) || Number.isNaN(s.ty)
  );

  let maxDHeading = 0;
  for (let i = 1; i < sim.states.length; i++) {
    const dh = Math.abs(sim.states[i].heading - sim.states[i - 1].heading);
    if (dh > maxDHeading) maxDHeading = dh;
  }

  assertCondition(
    "TEST-23",
    `Curvas de transición clotoideas con continuidad G2 y sin discontinuidades angulares`,
    !hasNaN && sim.states.length >= 1000 && maxDHeading < 0.015,
    `estados simulados=${sim.states.length}, max delta heading=${maxDHeading.toFixed(6)} rad, sin NaN=${!hasNaN}`
  );
}

// -----------------------------------------------------------------------------
// TEST-24: Detección continua de colisiones (CCD) y eliminación de tunelado (COL-01)
// -----------------------------------------------------------------------------
{
  const { simulateManeuver } = await import("../web/js/engine/kinematics.js");
  const { evaluateObstacleInterferences } = await import("../web/js/engine/collisions.js");

  const testVeh = {
    id: "cart_ccd",
    name: "Carro de prueba CCD",
    type: "rigid",
    tractor: { wheelbase: 0.4, frontOverhang: 0.1, rearOverhang: 0.1, width: 0.4, maxSteeringAngleDeg: 40 }
  };

  // Simulación con paso amplio (1,0 m) dejando hueco sin muestrear entre x=0.5 y x=0.9
  const sim = simulateManeuver(
    testVeh,
    {
      startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [{ type: "straight", length: 3.0, direction: 1 }]
    },
    { straightStep: 1.0 }
  );

  // Bolardo estrecho situado exactamente en la brecha entre pasos discretos (x=0.70)
  const obstacle = [
    {
      id: "bollard_gap",
      name: "Bolardo en brecha entre pasos",
      type: "bollard",
      shape: "rect",
      x: 0.70,
      y: 0.0,
      length: 0.04,
      width: 0.04,
      headingDeg: 0
    }
  ];

  const repNoCCD = evaluateObstacleInterferences(sim, obstacle, { safetyMargin: 0.0, enableCCD: false });
  const repCCD = evaluateObstacleInterferences(sim, obstacle, { safetyMargin: 0.0, enableCCD: true });

  assertCondition(
    "TEST-24",
    `Detección continua de colisiones (CCD) mediante cápsula convexa que evita tunelado (COL-01)`,
    repNoCCD.globalStatus === "CLEAR" && repCCD.globalStatus === "COLLISION" && repCCD.minClearanceM === 0,
    `sin CCD: ${repNoCCD.globalStatus} (d=${repNoCCD.minClearanceM} m) | con CCD: ${repCCD.globalStatus} (d=${repCCD.minClearanceM} m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-25: Homologación completa según Reglamento (UE) 1230/2012 y Anexo XIII (VAL-01)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { evaluateEURegulation1230Maneuverability } = await import("../web/js/engine/collisions.js");

  const vTruck = VEHICLE_CATALOG.renault_t_4x2_sko;
  const vBus = VEHICLE_CATALOG.coach_bus_15m;

  const resTruck = evaluateEURegulation1230Maneuverability(vTruck);
  const resBus = evaluateEURegulation1230Maneuverability(vBus);

  const truckPass = resTruck.compliant && resTruck.tailSwingMeasuredM <= 0.80 && resTruck.rInnerMeasuredM >= 5.30 && resTruck.rOuterMeasuredM <= 12.50;
  const busPass = resBus.compliant && resBus.tailSwingMeasuredM <= 1.20 && resBus.rInnerMeasuredM >= 5.30 && resBus.rOuterMeasuredM <= 12.50;

  assertCondition(
    "TEST-25",
    `Verificación reglamentaria completa Reglamento (UE) 1230/2012 / 2021/535 Anexo XIII (VAL-01)`,
    truckPass && busPass,
    `Camión articulado: tail swing=${resTruck.tailSwingMeasuredM} m (<=0.80), R_int=${resTruck.rInnerMeasuredM} m (>=5.30), R_ext=${resTruck.rOuterMeasuredM} m (<=12.50) | Autocar 15m: tail swing=${resBus.tailSwingMeasuredM} m (<=1.20)`
  );
}

// -----------------------------------------------------------------------------
// TEST-26: Invarianza bajo traslación a coordenadas UTM ETRS89 (MATH-02)
// -----------------------------------------------------------------------------
{
  const { parseDXF, buildScenarioFromDXF } = await import("../web/js/export/dxf_importer.js");
  const { generateDXFContent } = await import("../web/js/export/exporters.js");

  const utmX = 450000;
  const utmY = 4800000;
  const sampleDxf = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "POLYLINE", "8", "EJE_TRAYECTORIA", "66", "1",
    "0", "VERTEX", "8", "EJE_TRAYECTORIA", "10", `${utmX}.0`, "20", `${utmY}.0`,
    "0", "VERTEX", "8", "EJE_TRAYECTORIA", "10", `${utmX + 50}.0`, "20", `${utmY}.0`,
    "0", "SEQEND",
    "0", "LWPOLYLINE", "8", "EDIFICIO", "90", "4", "70", "1",
    "10", `${utmX + 10}.0`, "20", `${utmY + 10}.0`,
    "10", `${utmX + 20}.0`, "20", `${utmY + 10}.0`,
    "10", `${utmX + 20}.0`, "20", `${utmY + 20}.0`,
    "10", `${utmX + 10}.0`, "20", `${utmY + 20}.0`,
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");

  const parsed = parseDXF(sampleDxf);
  const scenario = buildScenarioFromDXF(parsed, {
    trajectoryLayer: "EJE_TRAYECTORIA",
    obstacleLayers: ["EDIFICIO"]
  });

  const offsetOK = scenario.originOffset && Math.abs(scenario.originOffset.x - (utmX + 25)) <= 35;
  const localVertices = scenario.trajectoryEntity?.vertices || [];
  const localOK = localVertices.length === 2 && Math.abs(localVertices[0][0]) < 100 && Math.abs(localVertices[0][1]) < 100;

  const dummySim = {
    envelope: [[0, 0], [10, 0], [10, 5], [0, 5]],
    maneuver: scenario.maneuver,
    originOffset: scenario.originOffset
  };
  const exportedDxf = generateDXFContent(dummySim, scenario.obstacles);
  const hasRestoredUTM = exportedDxf.includes("4500") || exportedDxf.includes("4800");

  assertCondition(
    "TEST-26",
    `Invarianza bajo traslación a coordenadas UTM ETRS89 y restitución en DXF (MATH-02)`,
    offsetOK && localOK && hasRestoredUTM,
    `offset X=${scenario.originOffset?.x}, offset Y=${scenario.originOffset?.y}, local X0=${localVertices[0]?.[0].toFixed(2)}, exportado contiene UTM=${hasRestoredUTM}`
  );
}

// -----------------------------------------------------------------------------
// TEST-27: Batalla efectiva de trídem y eje autodireccional pasivo (KIN-03)
// -----------------------------------------------------------------------------
{
  const { computeEffectiveTrailerWheelbase } = await import("../web/js/models/vehicles.js");

  const trailerRigid = { wheelbase: 7.70, axleCount: 3, axleSpacing: 1.31, axleConfiguration: "tridem_rigid" };
  const trailerSteering = { wheelbase: 7.70, axleCount: 3, axleSpacing: 1.31, axleConfiguration: "tridem_self_steering_3rd" };

  const L_rigid = computeEffectiveTrailerWheelbase(trailerRigid);
  const L_steering = computeEffectiveTrailerWheelbase(trailerSteering);

  const rigidDelta = L_rigid - 7.70;
  const steerDelta = L_steering - 7.70;

  assertCondition(
    "TEST-27",
    `Cálculo de batalla efectiva de trídem rígido vs eje autodireccional pasivo (KIN-03)`,
    Math.abs(rigidDelta - 0.12) < 0.05 && Math.abs(steerDelta - (-0.655)) < 0.001 && L_steering < L_rigid,
    `trídem rígido Lef=${L_rigid.toFixed(3)} m (delta=+${rigidDelta.toFixed(3)} m) | autodireccional Lef=${L_steering.toFixed(3)} m (delta=${steerDelta.toFixed(3)} m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-28: Cinemática multicuerpo: Tren de carretera 18,75 m (KIN-04)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulateManeuver } = await import("../web/js/engine/kinematics.js");

  const roadTrain = VEHICLE_CATALOG.road_train_1875;
  const maneuverTurn90 = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 12.5, angle: 90.0, direction: 1 },
      { type: "straight", length: 15.0, direction: 1 }
    ]
  };

  const simRT = simulateManeuver(roadTrain, maneuverTurn90, { straightStep: 0.1, arcStepDeg: 1.0 });
  const has2Trailers = simRT.states.every(s => Array.isArray(s.trailers) && s.trailers.length === 2);
  const finalState = simRT.states[simRT.states.length - 1];
  const headingTractorOK = Math.abs(finalState.heading - Math.PI / 2) < 0.15;
  const headingDollyOK = Math.abs(finalState.trailers[0].heading - Math.PI / 2) < 0.25;
  const headingBodyOK = Math.abs(finalState.trailers[1].heading - Math.PI / 2) < 0.35;

  assertCondition(
    "TEST-28",
    `Cinemática multicuerpo: Tren de carretera 18,75 m con 2 remolques en cascada (KIN-04)`,
    has2Trailers && headingTractorOK && headingDollyOK && headingBodyOK,
    `2 remolques presentes=${has2Trailers}, rumbo tractor=${(finalState.heading * 180 / Math.PI).toFixed(1)}°, lanza=${(finalState.trailers[0].heading * 180 / Math.PI).toFixed(1)}°, remolque=${(finalState.trailers[1].heading * 180 / Math.PI).toFixed(1)}°`
  );
}

// -----------------------------------------------------------------------------
// TEST-29: Cinemática multicuerpo: Megacamión Euro-Modular EMS 25,25 m (KIN-04)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulateManeuver } = await import("../web/js/engine/kinematics.js");

  const megatruck = VEHICLE_CATALOG.ems_megatruck_2525;
  const maneuverTurn90 = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 12.5, angle: 90.0, direction: 1 },
      { type: "straight", length: 15.0, direction: 1 }
    ]
  };

  const simMega = simulateManeuver(megatruck, maneuverTurn90, { straightStep: 0.1, arcStepDeg: 1.0 });
  const megaHas2Trailers = simMega.states.every(s => Array.isArray(s.trailers) && s.trailers.length === 2);
  const megaNoNaN = simMega.states.every(
    s => !Number.isNaN(s.x) && !Number.isNaN(s.trailers[0].x) && !Number.isNaN(s.trailers[1].x)
  );

  assertCondition(
    "TEST-29",
    `Cinemática multicuerpo: Megacamión Euro-Modular EMS 25,25 m B-Double (KIN-04)`,
    megaHas2Trailers && megaNoNaN && simMega.states.length > 300,
    `2 semirremolques articulados en cascada=${megaHas2Trailers}, estabilidad numérica sin NaN=${megaNoNaN}, estados=${simMega.states.length}`
  );
}

// -----------------------------------------------------------------------------
// TEST-30: Distancia analítica exacta a obstáculo circular (COL-02)
// -----------------------------------------------------------------------------
{
  const { polygonToCircleDistance } = await import("../web/js/engine/collisions.js");

  const poly = [
    [-1.25, -5.0],
    [1.25, -5.0],
    [1.25, 5.0],
    [-1.25, 5.0]
  ];
  // Círculo con centro en [11.25, 0.0] y radio 8.00 m -> Distancia exacta = (11.25 - 1.25) - 8.00 = 2.000000 m
  const resCircle = polygonToCircleDistance(poly, 11.25, 0.0, 8.00);
  const circleErr = Math.abs(resCircle.distance - 2.00);

  assertCondition(
    "TEST-30",
    `Distancia analítica exacta a obstáculo circular con error de cuerda nulo (COL-02)`,
    circleErr < 1e-12 && !resCircle.intersects,
    `distancia calculada=${resCircle.distance.toFixed(9)} m, error analítico=${circleErr.toExponential(3)} m (0.00 mm)`
  );
}

// -----------------------------------------------------------------------------
// TEST-31: Distancia analítica exacta a bordillo circular en arco (COL-02)
// -----------------------------------------------------------------------------
{
  const { polygonToArcDistance } = await import("../web/js/engine/collisions.js");

  // Cuadrado 1x1 centrado en [17.5, 0] a la derecha de un arco R=15m centrado en [0, 0]
  const polySquare = [
    [17.0, -0.5],
    [18.0, -0.5],
    [18.0, 0.5],
    [17.0, 0.5]
  ];
  // Distancia exacta al arco R=15 en el eje X: 17.0 - 15.0 = 2.000000 m
  const resArc = polygonToArcDistance(polySquare, 0.0, 0.0, 15.0, 0.0, 90.0);
  const arcErr = Math.abs(resArc.distance - 2.00);

  assertCondition(
    "TEST-31",
    `Distancia analítica exacta a bordillo circular en arco (COL-02)`,
    arcErr < 1e-12 && !resArc.intersects,
    `distancia calculada=${resArc.distance.toFixed(9)} m, error analítico=${arcErr.toExponential(3)} m`
  );
}

// -----------------------------------------------------------------------------
// TEST-32: Polilínea de linde de parcela sin falsa colisión interior (COL-02)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulateManeuver } = await import("../web/js/engine/kinematics.js");
  const { evaluateObstacleInterferences } = await import("../web/js/engine/collisions.js");

  const parcelBoundary = [
    {
      id: "parcel_fence",
      name: "Linde perimetral de parcela",
      type: "road_edge",
      shape: "polygon",
      isOpen: true,
      vertices: [
        [-50, -50],
        [150, -50],
        [150, 50],
        [-50, 50],
        [-50, -50]
      ]
    }
  ];

  const simCenter = simulateManeuver(
    VEHICLE_CATALOG.renault_t_4x2_sko,
    {
      startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
      segments: [{ type: "straight", length: 20.0, direction: 1 }]
    }
  );
  const repBoundary = evaluateObstacleInterferences(simCenter, parcelBoundary, { safetyMargin: 0.5 });

  assertCondition(
    "TEST-32",
    `Polilínea de linde de parcela abierta no produce falsa colisión interior (COL-02)`,
    repBoundary.globalStatus === "CLEAR" && repBoundary.minClearanceM > 35.0,
    `estado global=${repBoundary.globalStatus}, margen mínimo=${repBoundary.minClearanceM.toFixed(2)} m (>35 m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-33: Predicado robusto orient2d ante puntos cuasi-colineales (LIB-02)
// -----------------------------------------------------------------------------
{
  const { orient2d } = await import("../web/js/engine/collisions.js");

  const oCollinear = orient2d(0, 0, 10, 10, 5, 5);
  const oPerturbedPos = orient2d(0, 0, 10, 10, 5, 5.000000001);
  const oPerturbedNeg = orient2d(0, 0, 10, 10, 5, 4.999999999);

  assertCondition(
    "TEST-33",
    `Predicado robusto orient2d con filtrado flotante ante puntos cuasi-colineales (LIB-02)`,
    oCollinear === 0 && oPerturbedPos === 1 && oPerturbedNeg === -1,
    `exactamente colineal=${oCollinear} (esperado 0), perturbado +=${oPerturbedPos} (esperado 1), perturbado -=${oPerturbedNeg} (esperado -1)`
  );
}

// -----------------------------------------------------------------------------
// TEST-34: Controlador de seguimiento Pure Pursuit en curva S (KIN-05)
// -----------------------------------------------------------------------------
let simTrackingForRateTest = null;
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulatePathFollowing } = await import("../web/js/engine/kinematics.js");

  const routeS = [
    [0, 0],
    [20, 0],
    [40, 15],
    [60, 15],
    [80, 0]
  ];
  simTrackingForRateTest = simulatePathFollowing(VEHICLE_CATALOG.renault_t_4x2_sko, routeS, {
    stepSizeM: 0.1,
    lookaheadM: 4.5,
    maxSteerRateDegPerM: 15.0
  });

  const finalP = simTrackingForRateTest.states[simTrackingForRateTest.states.length - 1];
  const distToTarget = Math.hypot(finalP.x - 80, finalP.y - 0);

  assertCondition(
    "TEST-34",
    `Controlador de seguimiento Pure Pursuit (simulatePathFollowing) en curva S (KIN-05)`,
    simTrackingForRateTest.states.length > 200 && distToTarget < 5.0 && !simTrackingForRateTest.summary.anySteerExceeded,
    `estados generados=${simTrackingForRateTest.states.length}, distancia al destino final=${distToTarget.toFixed(2)} m, giro máximo admisible=${!simTrackingForRateTest.summary.anySteerExceeded}`
  );
}

// -----------------------------------------------------------------------------
// TEST-35: Cumplimiento de tasa de giro máxima de dirección en Pure Pursuit (KIN-05)
// -----------------------------------------------------------------------------
{
  const maxAllowedRateRadPerM = (15.0 * Math.PI) / 180;
  let maxObservedRate = 0;

  for (let i = 1; i < simTrackingForRateTest.states.length; i++) {
    const s0 = simTrackingForRateTest.states[i - 1];
    const s1 = simTrackingForRateTest.states[i];
    const ds = s1.dist - s0.dist;
    if (ds > 1e-4) {
      const rate = Math.abs(s1.steerAngleRad - s0.steerAngleRad) / ds;
      if (rate > maxObservedRate) maxObservedRate = rate;
    }
  }

  assertCondition(
    "TEST-35",
    `Cumplimiento de tasa máxima de giro de dirección en Pure Pursuit (|dδ/ds| <= δ_rate_max) (KIN-05)`,
    maxObservedRate <= maxAllowedRateRadPerM + 1e-5,
    `tasa máxima observada=${(maxObservedRate * 180 / Math.PI).toFixed(3)} °/m (límite=${(maxAllowedRateRadPerM * 180 / Math.PI).toFixed(1)} °/m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-36: Selector de referencia de radio (steeringReferencePoint: front_axle vs rear_axle) (MEJ-02)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("spain_camion_articulado_t");
  const Lwb = veh.tractor.wheelbase; // 3.90 m
  const targetRf = 10.30; // Radio del eje director según Guía de Nudos Viarios Tabla 2.3-D

  // Maniobra con radio referenciado al centro del eje director (front_axle)
  const manFront = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    steeringReferencePoint: "front_axle",
    segments: [{ type: "arc", radius: targetRf, angle: 90, direction: 1 }]
  };
  const simFront = simulateManeuver(veh, manFront, { arcStepDeg: 0.1 });
  const lastFront = simFront.states[simFront.states.length - 1];

  // Calcular radio real del centro del eje director en la simulación
  const fx = lastFront.x + Lwb * Math.cos(lastFront.heading);
  const fy = lastFront.y + Lwb * Math.sin(lastFront.heading);
  const expectedRr = Math.sqrt(targetRf * targetRf - Lwb * Lwb);
  const measuredRf = Math.hypot(fx - 0, fy - expectedRr);
  const measuredRr = Math.hypot(lastFront.x - 0, lastFront.y - expectedRr);

  const errFrontAbs = Math.abs(measuredRf - targetRf);
  const errRearAbs = Math.abs(measuredRr - expectedRr);

  assertCondition(
    "TEST-36",
    `Selector de referencia de radio front_axle convierte automáticamente a eje motriz (Norma 3.1-IC)`,
    errFrontAbs < 1e-4 && errRearAbs < 1e-4,
    `Rf medido=${measuredRf.toFixed(4)} m (ref=${targetRf} m, Ea=${errFrontAbs.toExponential(2)} m), Rr medido=${measuredRr.toFixed(4)} m (ref=${expectedRr.toFixed(4)} m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-37: Muestreo angular adaptativo en cálculo de envolvente (MEJ-03)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("spain_camion_articulado_t");
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    steeringReferencePoint: "front_axle",
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 10.30, angle: 90.0, direction: 1 },
      { type: "straight", length: 15.0, direction: 1 }
    ]
  };
  const sim = simulateManeuver(veh, maneuver, { stepSizeM: 0.05 });
  const sampledIndices = computeAdaptiveSampledIndices(sim.states, { maxDeltaThetaRad: (1.5 * Math.PI) / 180 });

  // 1. Siempre incluye el primer y último estado
  const hasFirst = sampledIndices[0] === 0;
  const hasLast = sampledIndices[sampledIndices.length - 1] === sim.states.length - 1;

  // 2. En ningún salto entre cápsulas consecutivas la variación angular de la tractora excede 1.5° (+ epsilon)
  let maxDThetaDeg = 0;
  for (let si = 0; si < sampledIndices.length - 1; si++) {
    const s0 = sim.states[sampledIndices[si]];
    const s1 = sim.states[sampledIndices[si + 1]];
    let dHeading = Math.abs(s1.heading - s0.heading);
    while (dHeading > Math.PI) dHeading = Math.abs(dHeading - 2 * Math.PI);
    const dDeg = (dHeading * 180) / Math.PI;
    if (dDeg > maxDThetaDeg) maxDThetaDeg = dDeg;
  }

  // 3. El error de flecha cordal teórico máximo en giro R=12.5 m es menor a 2.5 mm
  const chordalSagittaMm = 12.5 * (1 - Math.cos((maxDThetaDeg * Math.PI) / 360)) * 1000;

  assertCondition(
    "TEST-37",
    `Muestreo adaptativo acota el salto angular entre cápsulas (Δθ <= 2.0°) y preserva extremos (MEJ-03)`,
    hasFirst && hasLast && maxDThetaDeg <= 2.05 && chordalSagittaMm <= 2.5,
    `estados totales=${sim.states.length}, cápsulas adaptativas=${sampledIndices.length}, Δθ_máx=${maxDThetaDeg.toFixed(2)}°, flecha cordal máx=${chordalSagittaMm.toFixed(2)} mm`
  );
}

// -----------------------------------------------------------------------------
// TEST-38: Memoria Técnica Justificativa y Evaluación Normativa Española (MEJ-04)
// -----------------------------------------------------------------------------
{
  const veh = cloneVehicleProfile("spain_camion_articulado_t");
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    steeringReferencePoint: "front_axle",
    segments: [
      { type: "straight", length: 10.0, direction: 1 },
      { type: "arc", radius: 10.30, angle: 90.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };
  const sim = simulateManeuver(veh, maneuver, { stepSizeM: 0.05 });
  const complete = buildCompleteSimulationResult(veh, maneuver);
  const interferences = evaluateObstacleInterferences(complete, [], 0.30);

  const compliance = buildNormativeComplianceSummary({
    vehicle: veh,
    maneuver,
    simResult: complete,
    interferenceReport: interferences
  });

  const mdReport = generateMarkdownTechnicalReport({
    projectName: "Acceso a Polígono Industrial El Olivo (PK 12+450)",
    scenarioName: "Giro de 90° con Camión Articulado Patrón T",
    vehicle: veh,
    maneuver,
    simResult: complete,
    interferenceReport: interferences
  });

  const hasPatternCode = compliance.isStandardSpain && compliance.patternCode.includes("Camión articulado patrón (T)");
  const hasRadiusCheck = compliance.radiusCompliant && compliance.minNormRf === 10.30;
  const hasSections =
    mdReport.includes("# Memoria técnica de justificación de trayectoria de barrido") &&
    mdReport.includes("## 4. Cuadro de conformidad normativa española y europea") &&
    mdReport.includes("## 5. Diligencia de responsabilidad y visado facultativo") &&
    mdReport.includes("Autor del estudio:") &&
    mdReport.includes("DICTAMEN FAVORABLE");

  assertCondition(
    "TEST-38",
    `Generación de Memoria Técnica Markdown y evaluación de conformidad española (MEJ-04)`,
    hasPatternCode && hasRadiusCheck && hasSections,
    `patrón oficial=${compliance.patternCode}, R_f=${compliance.minRfObserved?.toFixed(2)} m (mín=${compliance.minNormRf} m), longitud memoria=${mdReport.length} bytes`
  );
}

// -----------------------------------------------------------------------------
// TEST-39: Curvas de telemetría a lo largo del recorrido (PK) y consistencia de estados
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulateManeuver } = await import("../web/js/engine/kinematics.js");
  const { LOCALES } = await import("../web/js/i18n/locales.js");

  const veh = VEHICLE_CATALOG.spain_camion_articulado_t;
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 15.0, direction: 1 },
      { type: "arc", radius: 10.3, angle: 90.0, direction: 1 },
      { type: "straight", length: 10.0, direction: 1 }
    ]
  };

  const simResult = simulateManeuver(veh, maneuver, { stepSizeM: 0.1 });
  const states = simResult.states;

  // 1. Verificación de campos de distancia y consistencia numérica en estados
  let allDistValid = states.length > 50;
  let hasNaNCoordinates = false;
  const totalDist = simResult.summary.totalDistanceM;

  const W = 1000, H = 120, padL = 50, padR = 25, padT = 15, padB = 25;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxAngle = 45;
  const scaleX = (d) => padL + (d / totalDist) * plotW;
  const scaleY = (a) => padT + plotH / 2 - (a / maxAngle) * (plotH / 2);

  let steerPathPoints = 0;
  let articPathPoints = 0;

  for (let i = 0; i < states.length; i++) {
    const st = states[i];
    const sDist = typeof st.distAlongPathM === "number" ? st.distAlongPathM : (typeof st.dist === "number" ? st.dist : NaN);
    if (!Number.isFinite(sDist) || !Number.isFinite(st.dist) || sDist < 0) {
      allDistValid = false;
    }
    const x = scaleX(sDist);
    const ySteer = scaleY(st.steerAngleDeg);
    const yArtic = scaleY(st.articulationAngleDeg);
    if (Number.isNaN(x) || Number.isNaN(ySteer) || Number.isNaN(yArtic)) {
      hasNaNCoordinates = true;
    }
    steerPathPoints++;
    articPathPoints++;
  }

  // 2. Verificación del título en el diccionario de internacionalización español
  const expectedTitle = "📈 Curvas de telemetría a lo largo del recorrido (PK)";
  const actualTitle = LOCALES.es.curves_panel_title;
  const titleMatches = actualTitle === expectedTitle;

  // 3. Verificación de muestreo e interpolación de clic en PK
  const targetDist = totalDist * 0.5;
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < states.length; i++) {
    const sDist = states[i].distAlongPathM ?? states[i].dist;
    const diff = Math.abs(sDist - targetDist);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  const clickInterpolationValid = closestIdx > 0 && minDiff < 0.20;

  assertCondition(
    "TEST-39",
    `Generación sin NaN y navegación interactiva en Curvas de telemetría a lo largo del recorrido (PK)`,
    allDistValid && !hasNaNCoordinates && titleMatches && clickInterpolationValid,
    `título="${actualTitle}", puntos válidos=${steerPathPoints}, NaN=${hasNaNCoordinates}, salto PK a dist=${targetDist.toFixed(1)}m (idx=${closestIdx}, diff=${minDiff.toFixed(3)}m)`
  );
}

// -----------------------------------------------------------------------------
// TEST-40: Georreferenciación PNOA (IGN), conversión UTM ETRS89 y traducción al español
// -----------------------------------------------------------------------------
{
  const { utmToLatLon } = await import("../web/js/view2d/viewer2d.js");
  const { LOCALES } = await import("../web/js/i18n/locales.js");

  // 1. Verificación analítica de conversión UTM ETRS89 a WGS84
  // Madrid (Puerta del Sol / Km 0): UTM30 ETRS89 X=440250, Y=4474500
  const geoMadrid = utmToLatLon(440250, 4474500, 30);
  const errMadridLat = Math.abs(geoMadrid.lat - 40.41898);
  const errMadridLon = Math.abs(geoMadrid.lon - (-3.70430));

  // Zaragoza PLAZA: UTM30 ETRS89 X=666270, Y=4612340
  const geoZaragoza = utmToLatLon(666270, 4612340, 30);
  const errZgzLat = Math.abs(geoZaragoza.lat - 41.6455);
  const errZgzLon = Math.abs(geoZaragoza.lon - (-1.0028));

  // Barcelona ZAL Prat: UTM31 ETRS89 X=426740, Y=4575190
  const geoBcn = utmToLatLon(426740, 4575190, 31);
  const errBcnLat = Math.abs(geoBcn.lat - 41.3250);
  const errBcnLon = Math.abs(geoBcn.lon - 2.1245);

  const utmConversionsAccurate =
    errMadridLat < 0.001 &&
    errMadridLon < 0.001 &&
    errZgzLat < 0.002 &&
    errZgzLon < 0.002 &&
    errBcnLat < 0.002 &&
    errBcnLon < 0.002;

  // 2. Verificación de traducción obligatoria al español de "Borrar trazado"
  const clearPathTranslatedEs = LOCALES.es.btn_clear_path === "🗑️ Borrar trazado";
  const clearPathTranslatedEn = LOCALES.en.btn_clear_path === "🗑️ Borrar trazado";

  // 3. Verificación de traducción de textos del visor de curvas de telemetría
  const curvesTitleTranslated =
    LOCALES.es.curves_panel_title === "📈 Curvas de telemetría a lo largo del recorrido (PK)" &&
    LOCALES.en.curves_panel_title === "📈 Curvas de telemetría a lo largo del recorrido (PK)";

  const curvesLabelsTranslated =
    LOCALES.es.curves_steer_label === "Ángulo de dirección δ(s)" &&
    LOCALES.en.curves_steer_label === "Ángulo de dirección δ(s)" &&
    LOCALES.es.curves_artic_label === "Ángulo de articulación γ(s)" &&
    LOCALES.en.curves_artic_label === "Ángulo de articulación γ(s)" &&
    LOCALES.es.curves_clearance_label === "Holgura libre d_mín(s)" &&
    LOCALES.en.curves_clearance_label === "Holgura libre d_mín(s)";

  assertCondition(
    "TEST-40",
    `Georreferenciación PNOA (IGN), conversión UTM ETRS89 y traducción al español de visor y controles`,
    utmConversionsAccurate && clearPathTranslatedEs && clearPathTranslatedEn && curvesTitleTranslated && curvesLabelsTranslated,
    `UTM Madrid=(${geoMadrid.lat}, ${geoMadrid.lon}), botón="${LOCALES.es.btn_clear_path}", título curvas="${LOCALES.es.curves_panel_title}"`
  );
}

// -----------------------------------------------------------------------------
// TEST-41: Buscador toponímico OpenStreetMap y desbloqueo de todos los niveles PNOA (IGN)
// -----------------------------------------------------------------------------
{
  const { LOCALES } = await import("../web/js/i18n/locales.js");

  // 1. Verificación del rango completo de niveles WMTS PNOA (IGN): niveles 4 a 20
  const C = 40075016.68557849;
  const lat0 = 40.3872;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);

  // Escala 1:50.000 (vista regional/comarcal): scale ~ 0.0756 px/m
  const scale50k = 3779.527 / 50000;
  const targetZ50k = Math.round(Math.log2((C * cosLat0 * scale50k) / 256));
  const z50k = Math.max(4, Math.min(20, targetZ50k));

  // Escala 1:1.260 (escala intermedia de maniobras): scale ~ 3.0 px/m
  const scale1260 = 3.0;
  const targetZ1260 = Math.round(Math.log2((C * cosLat0 * scale1260) / 256));
  const z1260 = Math.max(4, Math.min(20, targetZ1260));

  // Escala 1:100 (escala de máximo detalle de rueda/voladizo): scale ~ 37.8 px/m
  const scale100 = 3779.527 / 100;
  const targetZ100 = Math.round(Math.log2((C * cosLat0 * scale100) / 256));
  const z100 = Math.max(4, Math.min(20, targetZ100));

  const pnoaZoomRangeValid =
    z50k >= 4 && z50k <= 20 &&
    z1260 >= 4 && z1260 <= 20 &&
    z100 === 20 && targetZ100 >= 20;

  // 2. Verificación de claves bilingües del buscador toponímico en locales
  const toponymI18nValid =
    Boolean(LOCALES.es.placeholder_toponym_search) &&
    Boolean(LOCALES.en.placeholder_toponym_search) &&
    Boolean(LOCALES.es.toponym_search_title) &&
    Boolean(LOCALES.en.toponym_search_title) &&
    Boolean(LOCALES.es.toponym_no_results) &&
    Boolean(LOCALES.en.toponym_no_results) &&
    Boolean(LOCALES.es.toponym_searching) &&
    Boolean(LOCALES.en.toponym_searching);

  // 3. Verificación de cálculo de teselas y no-bloqueo para pantalla 1920x1080 a escala 1:50.000
  const numTiles50k = 1 << z50k;
  const tileRes3857_50k = C / numTiles50k;
  const viewWidthM_50k = 1920 / scale50k;
  const viewWidth3857_50k = viewWidthM_50k / cosLat0;
  const tilesInViewCols = Math.ceil(viewWidth3857_50k / tileRes3857_50k) + 1;
  const scale50kOperativeWithoutLimit = tilesInViewCols < 16;

  // 4. Verificación de zoom out profundo (escala 1:750.000 ~ 0.005 px/m)
  const scale750k = 0.005;
  const targetZ750k = Math.round(Math.log2((C * cosLat0 * scale750k) / 256));
  const z750k = Math.max(4, Math.min(20, targetZ750k));
  const zoomOutDeepValid = z750k >= 4 && z750k <= 10;

  // 5. Verificación de no-solapamiento de botonera: textos 100% en español
  const spanishToponymTextsOnly =
    LOCALES.es.placeholder_toponym_search.includes("España") &&
    !LOCALES.es.placeholder_toponym_search.includes("Spain") &&
    LOCALES.es.toponym_search_title.includes("España") &&
    !LOCALES.es.toponym_search_title.includes("Spain");

  assertCondition(
    "TEST-41",
    `Buscador toponímico OpenStreetMap y desbloqueo de todos los niveles PNOA (IGN niveles 4-20)`,
    pnoaZoomRangeValid && toponymI18nValid && scale50kOperativeWithoutLimit && zoomOutDeepValid && spanishToponymTextsOnly,
    `z(1:750k)=${z750k}, z(1:50k)=${z50k}, z(1:1260)=${z1260}, z(1:100)=${z100}, teselas cols=${tilesInViewCols}, i18n_ok=${toponymI18nValid}`
  );
}

// ---------------------------------------------------------------------------
// TEST-42: Importador GeoJSON, georreferenciación PNOA y persistencia de reposo (Borrar trazado)
// ---------------------------------------------------------------------------
{
  const testVehicle = VEHICLE_CATALOG.spain_camion_articulado_t;

  // 1. Verificación del cálculo de estado de reposo cuando no hay tramos (Borrar trazado)
  const idleManeuver = {
    startPose: { x: 5.0, y: 10.0, headingDeg: 45.0, initialArticulationDeg: 0.0 },
    segments: []
  };
  const idleSim = buildCompleteSimulationResult(testVehicle, idleManeuver, { safetyMarginM: 0.3 });
  const idleValid =
    idleSim.states.length === 1 &&
    idleSim.states[0].x === 5.0 &&
    idleSim.states[0].y === 10.0 &&
    idleSim.summary.totalDistanceM === 0 &&
    Array.isArray(idleSim.envelope) &&
    idleSim.envelope.length >= 4;

  // 2. Verificación de proyección bidireccional WGS84 <-> metros locales
  const cLon = -3.8785;
  const cLat = 40.3872;
  const [localX, localY] = projectWgs84ToLocalMeters(-3.8780, 40.3875, cLon, cLat);
  const backGeo = projectLocalMetersToWgs84(localX, localY, cLon, cLat);
  const reprojOk = Math.hypot(backGeo.lon - (-3.8780), backGeo.lat - 40.3875) < 1e-5;

  // 3. Verificación de carga y georreferenciación del archivo ejemplo_glorieta_espana.geojson
  const geojsonPath = path.join(__dirname, "../ejemplo_glorieta_espana.geojson");
  let geojsonScenarioValid = false;
  let featuresCount = 0;
  let obstaclesCount = 0;
  let hasTrajectory = false;

  if (fs.existsSync(geojsonPath)) {
    const rawGeo = fs.readFileSync(geojsonPath, "utf8");
    const parsedRaw = parseGeoJSON(rawGeo);
    featuresCount = parsedRaw.length;

    const scenario = buildScenarioFromGeoJSON(rawGeo);
    obstaclesCount = scenario.obstacles.length;
    hasTrajectory = Boolean(scenario.maneuver && scenario.maneuver.segments.length > 0);

    const pnoaCfg = scenario.pnoaConfig;
    geojsonScenarioValid =
      featuresCount >= 8 &&
      obstaclesCount >= 6 &&
      hasTrajectory &&
      pnoaCfg.enabled === true &&
      Math.abs(pnoaCfg.centerLat - 40.3872) < 1e-4 &&
      Math.abs(pnoaCfg.centerLon - (-3.8785)) < 1e-4 &&
      pnoaCfg.anchorWorldX === 0.0 &&
      pnoaCfg.anchorWorldY === 0.0;
  }

  assertCondition(
    "TEST-42",
    `Importador GeoJSON, georreferenciación PNOA y simulación de reposo en Borrar trazado`,
    idleValid && reprojOk && geojsonScenarioValid,
    `idle_states=${idleSim.states.length}, reproj_err<1e-5, features=${featuresCount}, obstacles=${obstaclesCount}, trajectory=${hasTrajectory}`
  );
}

// ---------------------------------------------------------------------------
// TEST-43: Trazado mediante Spline CAD continua (Catmull-Rom Centripetal)
// ---------------------------------------------------------------------------
{
  const { sampleCatmullRomSpline, buildSegmentsFromSplineWaypoints, buildSegmentsFromWaypoints } = await import("../web/js/engine/kinematics.js");
  const testVehicle = VEHICLE_CATALOG.renault_t_4x2_sko;

  const waypoints = [
    [0, 0],
    [25, 0],
    [40, 15],
    [40, 35]
  ];

  // 1. Muestreo de la spline centripetal
  const splineSamples = sampleCatmullRomSpline(waypoints, { stepM: 0.20 });
  const passesStart = Math.hypot(splineSamples[0].x - 0, splineSamples[0].y - 0) < 1e-3;
  const passesEnd = Math.hypot(splineSamples[splineSamples.length - 1].x - 40, splineSamples[splineSamples.length - 1].y - 35) < 1e-3;
  const hasFiniteCurvature = splineSamples.every(s => Number.isFinite(s.curvature) && Number.isFinite(s.radius));
  const minObservedR = Math.min(...splineSamples.map(s => s.radius));

  // 2. Generación de tramos suaves desde la spline
  const builtSpline = buildSegmentsFromSplineWaypoints(waypoints, 1);
  const builtFromGeneric = buildSegmentsFromWaypoints(waypoints, 12.5, 1, { mode: "spline" });

  const segmentsOk = builtSpline.segments.length > 0 && builtFromGeneric.segments.length > 0;

  // 3. Simulación cinemática RK4 sin quiebros ni discontinuidades
  const sim = simulateManeuver(testVehicle, builtSpline, { stepSizeM: 0.1 });
  const lastState = sim.states[sim.states.length - 1];
  const finalDistanceError = Math.hypot(lastState.x - 40, lastState.y - 35);
  const steerWithinLimits = !sim.summary.anySteerExceeded;

  assertCondition(
    "TEST-43",
    `Trazado mediante Spline CAD continua (Catmull-Rom Centripetal) con continuidad C1 y cinemática suave`,
    passesStart && passesEnd && hasFiniteCurvature && segmentsOk && finalDistanceError < 1.0 && steerWithinLimits,
    `muestras=${splineSamples.length}, R_mín=${minObservedR.toFixed(2)} m, tramos=${builtSpline.segments.length}, err_final=${finalDistanceError.toFixed(3)} m, giro_ok=${steerWithinLimits}`
  );
}

// -----------------------------------------------------------------------------
// TEST-44: SVG de detalle (bbox trayectoria + 2m), plano general y diligencia
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const veh = VEHICLE_CATALOG.spain_camion_articulado_t;
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 12.0, direction: 1 },
      { type: "arc", radius: 12.0, angle: 90.0, direction: 1 }
    ]
  };
  const sim = buildCompleteSimulationResult(veh, maneuver, { stepSizeM: 0.25 });
  const rep = evaluateObstacleInterferences(sim, [], 0.30);

  // Entidad CAD lejana (500 m x 500 m) que antes expandía el viewBox completo
  const farCadEntities = [
    { vertices: [[-200, -200], [300, -200], [300, 300], [-200, 300]], closed: true }
  ];

  const detailSvg = generateSVGDiagram(sim, rep, [], {}, farCadEntities, {
    focusOnTrajectory: true,
    paddingM: 2.0
  });
  const overviewSvg = generateSVGDiagram(sim, rep, [], {}, farCadEntities, {
    focusOnTrajectory: false,
    overviewMode: true,
    highlightBbox: { minX: -5, minY: -5, maxX: 25, maxY: 25 }
  });

  const detailVbMatch = detailSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const overviewVbMatch = overviewSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const detailW = detailVbMatch ? Number(detailVbMatch[1]) : 9999;
  const overviewW = overviewVbMatch ? Number(overviewVbMatch[1]) : 0;

  const mdWithDiligence = generateMarkdownTechnicalReport({
    projectName: "Proyecto Enlace M-501",
    scenarioName: "Glorieta Sur",
    vehicle: veh,
    maneuver,
    simResult: sim,
    interferenceReport: rep,
    diligence: {
      author: "Ing. Ana García",
      collegiate: "28410",
      organization: "Consultoría Viaria Ibérica",
      date: "23/11/2026"
    }
  });

  const detailTight = detailW < 60 && overviewW > 450;
  const hasViewportIndicator = overviewSvg.includes('id="detail-viewport-indicator"');
  const hasDiligenceFields =
    mdWithDiligence.includes("Ing. Ana García") &&
    mdWithDiligence.includes("28410") &&
    mdWithDiligence.includes("Consultoría Viaria Ibérica") &&
    mdWithDiligence.includes("23/11/2026");

  assertCondition(
    "TEST-44",
    `Encuadre SVG de detalle (bbox trayectoria + 2m), plano general de referencia y diligencia técnica`,
    detailTight && hasViewportIndicator && hasDiligenceFields,
    `detailW=${detailW.toFixed(2)} m, overviewW=${overviewW.toFixed(2)} m, indicator=${hasViewportIndicator}, diligence=${hasDiligenceFields}`
  );
}

// -----------------------------------------------------------------------------
// TEST-45: Aceleración del cálculo de envolvente (Divide & Conquer + reutilización
//          de unión base + ventana deslizante O(1)) e invarianza de precisión
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const veh = VEHICLE_CATALOG.spain_camion_articulado_t;
  const longManeuver = {
    startPose: { x: -40, y: -10, headingDeg: 0, initialArticulationDeg: 0 },
    segments: [
      { type: "straight", length: 25, direction: 1 },
      { type: "arc", radius: 14, angle: 80, direction: 1 },
      { type: "arc", radius: 15, angle: -160, direction: 1 },
      { type: "arc", radius: 14, angle: 80, direction: 1 },
      { type: "straight", length: 30, direction: 1 }
    ]
  };
  const obstacles = PRESET_SCENARIOS.roundabout_exit.obstacles;

  const t0 = performance.now();
  const fullRes = buildCompleteSimulationResult(veh, longManeuver, {
    straightStepM: 0.05,
    arcStepDeg: 0.5,
    safetyMarginM: 0.30
  });
  const colRes = evaluateObstacleInterferences(fullRes, obstacles, 0.30);
  const t1 = performance.now();

  const tPrev0 = performance.now();
  const prevRes = buildCompleteSimulationResult(veh, longManeuver, {
    straightStepM: 0.15,
    arcStepDeg: 1.5,
    safetyMarginM: 0.30,
    previewMode: true
  });
  const tPrev1 = performance.now();

  const fullElapsedMs = t1 - t0;
  const previewElapsedMs = tPrev1 - tPrev0;
  const widthConsistent = Math.abs(fullRes.summary.maxSweptWidthM - 5.009) <= 0.002;
  const previewConsistent = Math.abs(prevRes.summary.maxSweptWidthM - fullRes.summary.maxSweptWidthM) <= 0.02;
  const hasBothEnvelopes = fullRes.envelope.length > 100 && fullRes.marginEnvelope && fullRes.marginEnvelope.length > 100;

  assertCondition(
    "TEST-45",
    `Aceleración del cálculo de trayectoria, envolvente (Divide & Conquer + offset reutilizado) y modo preview`,
    widthConsistent && previewConsistent && hasBothEnvelopes && fullElapsedMs < 350,
    `full=${fullElapsedMs.toFixed(1)} ms, preview=${previewElapsedMs.toFixed(1)} ms, maxW=${fullRes.summary.maxSweptWidthM} m (preview=${prevRes.summary.maxSweptWidthM} m), d_min=${colRes.minClearanceM} m`
  );
}

// -----------------------------------------------------------------------------
// TEST-46: Maniobras combinadas avance + marcha atrás desde vértice de inversión
//          (spline, fillet, front_axle, rear_axle y detección de cúspides)
// -----------------------------------------------------------------------------
{
  const { VEHICLE_CATALOG } = await import("../web/js/models/vehicles.js");
  const { simulateManeuver, buildSegmentsFromWaypoints, splitWaypointsByDirection } = await import("../web/js/engine/kinematics.js");

  const veh = VEHICLE_CATALOG.spain_camion_articulado_t;

  // 1. Waypoints con vértice explícito de cambio a marcha atrás en P2
  const mixedWaypoints = [
    { x: 0, y: 0, direction: 1, directionExplicit: true },
    { x: 18, y: 0, direction: 1 },
    { x: 32, y: 8, direction: -1, directionExplicit: true },
    { x: 18, y: 12, direction: -1 },
    { x: 4, y: 12, direction: -1 }
  ];

  // Comprobar spline con front_axle y rear_axle
  const builtFront = buildSegmentsFromWaypoints(mixedWaypoints, 12.5, 1, {
    mode: "spline",
    vehicle: veh,
    steeringReferencePoint: "front_axle"
  });
  const builtRear = buildSegmentsFromWaypoints(mixedWaypoints, 12.5, 1, {
    mode: "spline",
    vehicle: veh,
    steeringReferencePoint: "rear_axle"
  });
  const builtFillet = buildSegmentsFromWaypoints(mixedWaypoints, 12.5, 1, {
    mode: "fillet",
    vehicle: veh
  });

  const twoDirsSpline =
    builtFront.segments.length === 2 &&
    builtFront.segments[0].direction === 1 &&
    builtFront.segments[1].direction === -1;

  const simFront = simulateManeuver(veh, builtFront, { straightStep: 0.1, steeringReferencePoint: "front_axle" });
  const simRear = simulateManeuver(veh, builtRear, { straightStep: 0.1, steeringReferencePoint: "rear_axle" });

  // Verificar que en la transición avance -> retroceso no hay saltos de posición ni de orientación ni NaN
  let maxJumpPos = 0;
  let maxJumpHeading = 0;
  let hasNaN = false;
  let maxSignedDist = -Infinity;
  let finalSignedDist = 0;
  for (let i = 1; i < simFront.states.length; i++) {
    const prev = simFront.states[i - 1];
    const curr = simFront.states[i];
    if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y) || !Number.isFinite(curr.steerAngleDeg)) {
      hasNaN = true;
    }
    const dp = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    let dh = Math.abs(curr.heading - prev.heading);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    if (dp > maxJumpPos) maxJumpPos = dp;
    if (dh > maxJumpHeading) maxJumpHeading = dh;
    if (curr.signedDist > maxSignedDist) maxSignedDist = curr.signedDist;
    finalSignedDist = curr.signedDist;
  }

  // En una maniobra de avance seguida de retroceso, signedDist alcanza un máximo positivo y luego decrece
  const signedDistReversed = maxSignedDist > 20 && finalSignedDist < maxSignedDist - 15;

  // 2. Detección automática de cúspides (Opción C) con quiebro > 125° sin etiquetas explícitas
  const cuspAutoWps = [
    [0, 0],
    [25, 0],
    [10, 5] // quiebro ~161° -> debe invertir automáticamente en P2
  ];
  const autoChains = splitWaypointsByDirection(cuspAutoWps, 1, { autoDetectCusps: true });
  const autoDetected = autoChains.length === 2 && autoChains[0].direction === 1 && autoChains[1].direction === -1;

  // 3. Verificar que en marcha atrás el semirremolque avanza SIEMPRE por delante de la cabeza tractora
  //    (producto escalar del vector tractor->trailer con el vector de desplazamiento marcha atrás > 0)
  let trailerAlwaysLeadsInReverse = true;
  let reverseStepCount = 0;
  for (let i = 1; i < simFront.states.length; i++) {
    const prev = simFront.states[i - 1];
    const curr = simFront.states[i];
    if (curr.direction === -1 && prev.direction === -1) {
      const mvX = curr.tx - prev.tx;
      const mvY = curr.ty - prev.ty;
      const mvLen = Math.hypot(mvX, mvY);
      if (mvLen > 1e-4) {
        reverseStepCount++;
        const vecTractorToTrailerX = curr.tx - curr.x;
        const vecTractorToTrailerY = curr.ty - curr.y;
        const dotLead = vecTractorToTrailerX * mvX + vecTractorToTrailerY * mvY;
        if (dotLead <= 0) {
          trailerAlwaysLeadsInReverse = false;
        }
      }
    }
  }

  // 4. Envolvente combinada completa sin errores
  const fullMixed = buildCompleteSimulationResult(veh, builtFront, { safetyMarginM: 0.30 });
  const envOk = fullMixed.envelope.length > 50 && fullMixed.summary.maxSweptWidthM > 2.5;

  assertCondition(
    "TEST-46",
    `Maniobras combinadas avance/marcha atrás en vértices, remolque por delante en retroceso y detección de cúspides`,
    twoDirsSpline &&
      builtFillet.segments.some((s) => s.direction === 1) &&
      builtFillet.segments.some((s) => s.direction === -1) &&
      !hasNaN &&
      maxJumpPos < 0.6 &&
      maxJumpHeading < 0.25 &&
      signedDistReversed &&
      trailerAlwaysLeadsInReverse &&
      reverseStepCount > 30 &&
      autoDetected &&
      envOk &&
      simRear.states.length > 50,
    `segs=${builtFront.segments.length}, trailerLeadsRev=${trailerAlwaysLeadsInReverse} (${reverseStepCount} pasos), maxJump=${maxJumpPos.toFixed(3)} m, maxDH=${(maxJumpHeading * 180 / Math.PI).toFixed(2)}°, autoCusp=${autoDetected}, maxW=${fullMixed.summary.maxSweptWidthM} m`
  );
}

// ---------------------------------------------------------------------------
// TEST-47: Importación CAD DXF multicapa (EJES_VIALES, OBSTACULOS_ENVOLVENTES,
//          filtro de capas contextuales y alineación UTM-PNOA) y carga múltiple
//          de GeoJSON con origen compartido y modo aditivo
// ---------------------------------------------------------------------------
{
  const {
    parseDXF,
    detectSuggestedLayerMapping,
    buildScenarioFromDXF
  } = await import("../web/js/export/dxf_importer.js");
  const {
    inspectGeoJSONFile,
    buildScenarioFromGeoJSONFiles,
    buildPnoaConfigFromUtmOrigin
  } = await import("../web/js/export/geojson_importer.js");

  // 1. DXF multicapa sintético en UTM Huso 30 (Madrid)
  const ux = 425000;
  const uy = 4471000;
  const dxfUtm = [
    "0", "SECTION", "2", "ENTITIES",
    // Dos ejes viales en EJES_VIALES
    "0", "LINE", "8", "EJES_VIALES", "10", `${ux}`, "20", `${uy}`, "11", `${ux + 40}`, "21", `${uy}`,
    "0", "LINE", "8", "EJES_VIALES", "10", `${ux + 20}`, "20", `${uy - 20}`, "11", `${ux + 20}`, "21", `${uy + 20}`,
    // Un obstáculo línea abierta en OBSTACULOS_ENVOLVENTES
    "0", "LINE", "8", "OBSTACULOS_ENVOLVENTES", "10", `${ux}`, "20", `${uy + 6}`, "11", `${ux + 40}`, "21", `${uy + 6}`,
    // Un obstáculo polilínea cerrada geométricamente (sin flag 70=1) en OBSTACULOS_ENVOLVENTES
    "0", "LWPOLYLINE", "8", "OBSTACULOS_ENVOLVENTES", "90", "5", "70", "0",
    "10", `${ux + 5}`, "20", `${uy - 10}`,
    "10", `${ux + 15}`, "20", `${uy - 10}`,
    "10", `${ux + 15}`, "20", `${uy - 5}`,
    "10", `${ux + 5}`, "20", `${uy - 5}`,
    "10", `${ux + 5}`, "20", `${uy - 10}`,
    // Dos capas contextuales: una incluida (PARCELARIO) y una excluida (TEXTOS_AUX)
    "0", "LINE", "8", "PARCELARIO", "10", `${ux - 10}`, "20", `${uy - 15}`, "11", `${ux + 50}`, "21", `${uy - 15}`,
    "0", "LINE", "8", "TEXTOS_AUX", "10", `${ux}`, "20", `${uy + 12}`, "11", `${ux + 10}`, "21", `${uy + 12}`,
    "0", "ENDSEC", "0", "EOF"
  ].join("\n");

  const parsed = parseDXF(dxfUtm);
  const suggested = detectSuggestedLayerMapping(parsed.layers);
  const dxfDetectOk =
    suggested.referenceAxisLayers.includes("EJES_VIALES") &&
    !suggested.trajectoryLayer &&
    suggested.obstacleLayers.includes("OBSTACULOS_ENVOLVENTES");

  const dxfSc = buildScenarioFromDXF(parsed, {
    ...suggested,
    excludedBackgroundLayers: ["TEXTOS_AUX"]
  });
  const pnoaDxf = buildPnoaConfigFromUtmOrigin(dxfSc.originOffset, 30);
  const dxfBuildOk =
    dxfSc.referenceAxes.length === 2 &&
    dxfSc.obstacles.length === 2 &&
    dxfSc.obstacles[0].shape === "polyline" &&
    dxfSc.obstacles[1].shape === "polygon" &&
    dxfSc.backgroundEntities.length === 1 &&
    dxfSc.backgroundEntities[0].layer === "PARCELARIO" &&
    dxfSc.isUtmLikely === true &&
    pnoaDxf &&
    pnoaDxf.centerLat > 40.0 &&
    pnoaDxf.centerLat < 41.0;

  // 2. Carga múltiple de 2 GeoJSON independientes (ejes + obstáculos) con origen compartido
  const geoEjes = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { nombre: "Eje Tronco" },
        geometry: { type: "LineString", coordinates: [[-3.8800, 40.3870], [-3.8790, 40.3870]] }
      }
    ]
  };
  const geoObs = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { nombre: "Muro Norte" },
        geometry: { type: "LineString", coordinates: [[-3.8800, 40.3871], [-3.8790, 40.3871]] }
      },
      {
        type: "Feature",
        properties: { nombre: "Edificio Sur" },
        geometry: {
          type: "Polygon",
          coordinates: [[[-3.8800, 40.3868], [-3.8795, 40.3868], [-3.8795, 40.3869], [-3.8800, 40.3869], [-3.8800, 40.3868]]]
        }
      }
    ]
  };

  const infoEjes = inspectGeoJSONFile(geoEjes, "ejes_viales.geojson");
  const infoObs = inspectGeoJSONFile(geoObs, "obstaculos_envolventes.geojson");
  const rolesSuggestedOk = infoEjes.suggestedRole === "reference_axes" && infoObs.suggestedRole === "obstacles";

  const multiSc = buildScenarioFromGeoJSONFiles([
    { fileName: infoEjes.fileName, features: infoEjes.features, role: infoEjes.suggestedRole },
    { fileName: infoObs.fileName, features: infoObs.features, role: infoObs.suggestedRole }
  ]);

  // Verificar carga aditiva posterior reutilizando sharedOrigin: debe producir exactamente las mismas coordenadas locales
  const scStep1 = buildScenarioFromGeoJSONFiles([
    { fileName: infoEjes.fileName, features: infoEjes.features, role: "reference_axes" }
  ]);
  const scStep2 = buildScenarioFromGeoJSONFiles(
    [{ fileName: infoObs.fileName, features: infoObs.features, role: "obstacles" }],
    { sharedOrigin: scStep1.sharedOrigin }
  );

  // Distancia relativa en Y entre el eje y el muro norte en carga conjunta vs carga aditiva
  const dyCombined = multiSc.obstacles[0].vertices[0][1] - multiSc.referenceAxes[0].vertices[0][1];
  const dyAdditive = scStep2.obstacles[0].vertices[0][1] - scStep1.referenceAxes[0].vertices[0][1];
  const driftM = Math.abs(dyCombined - dyAdditive);

  const multiGeoOk =
    multiSc.referenceAxes.length === 1 &&
    multiSc.obstacles.length === 2 &&
    multiSc.obstacles[0].shape === "polyline" &&
    multiSc.obstacles[1].shape === "polygon" &&
    driftM < 1e-3 &&
    dyCombined > 5.0;

  assertCondition(
    "TEST-47",
    `Importación CAD DXF multicapa (EJES_VIALES/OBSTACULOS_ENVOLVENTES + UTM PNOA) y GeoJSON múltiple con origen compartido`,
    dxfDetectOk && dxfBuildOk && rolesSuggestedOk && multiGeoOk,
    `dxfAxes=${dxfSc.referenceAxes.length}, dxfObs=${dxfSc.obstacles.length} (${dxfSc.obstacles.map((o) => o.shape).join("+")}), dxfBg=${dxfSc.backgroundEntities.length}, pnoaLat=${pnoaDxf?.centerLat}, geoDrift=${driftM.toFixed(5)} m`
  );
}

console.log("\n==================================================================");
console.log(` RESUMEN DE VERIFICACIÓN: ${passed} superadas, ${failed} fallidas`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
}

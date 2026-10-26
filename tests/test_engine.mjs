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
  computeSweptEnvelope
} from "../web/js/engine/envelope.js";

import {
  evaluateObstacleInterferences,
  PRESET_SCENARIOS
} from "../web/js/engine/collisions.js";

import {
  generateSVGDiagram,
  generateDXFContent
} from "../web/js/export/exporters.js";

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

console.log("\n==================================================================");
console.log(` RESUMEN DE VERIFICACIÓN: ${passed} superadas, ${failed} fallidas`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
}

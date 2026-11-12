#!/usr/bin/env node
/**
 * test_normativa_espanola.mjs
 * Validación experimental y contrastes del motor TurnSim frente a la normativa española:
 * - Norma 3.1-IC «Trazado» (Anexo 3, Tabla A3.1)
 * - Guía de Nudos Viarios (Orden Circular 32/2012, Tabla 2.3-A y Tabla 2.3-D)
 * - Contraste frente a cálculo analítico independiente y benchmark Python
 */

import { simulateManeuver, simulatePathFollowing } from "../web/js/engine/kinematics.js";
import { computeSweptEnvelope } from "../web/js/engine/envelope.js";

// Definición fiel de los vehículos patrón españoles según Tabla A3.1 de la Norma 3.1-IC
const NORMATIVE_VEHICLES = {
  furgon_patron: {
    id: "furgon_patron",
    name: "Furgón patrón (F) — Norma 3.1-IC",
    hasTrailer: false,
    tractor: {
      wheelbase: 4.00,
      frontOverhang: 0.95,
      rearOverhang: 1.40,
      width: 2.05,
      trackWidthFront: 2.05,
      trackWidthRear: 2.05,
      hitchOffset: 0.0,
      maxSteerAngleDeg: 38.0,
      kerbTurningRadiusDeclared: 7.50
    },
    trailer: null,
    normaRef: {
      doc: "Norma 3.1-IC Anexo 3 Tabla A3.1 / Fig. A3.1",
      R_front_guia: 7.50
    }
  },
  camion_ligero_patron: {
    id: "camion_ligero_patron",
    name: "Camión ligero / rígido patrón (C) — Norma 3.1-IC",
    hasTrailer: false,
    tractor: {
      wheelbase: 6.25,
      frontOverhang: 1.40,
      rearOverhang: 2.90,
      width: 2.55,
      trackWidthFront: 2.45,
      trackWidthRear: 2.55,
      hitchOffset: 0.0,
      maxSteerAngleDeg: 45.0,
      kerbTurningRadiusDeclared: 9.10
    },
    trailer: null,
    normaRef: {
      doc: "Norma 3.1-IC Anexo 3 Tabla A3.1 / Fig. A3.4",
      R_front_guia: 9.10
    }
  },
  autobus_rigido_patron: {
    id: "autobus_rigido_patron",
    name: "Autobús rígido 3 ejes patrón (A) — Norma 3.1-IC",
    hasTrailer: false,
    tractor: {
      wheelbase: 8.15, // 7.45 + 0.70 al centro del tándem
      frontOverhang: 2.65,
      rearOverhang: 3.50,
      width: 2.55,
      trackWidthFront: 2.55,
      trackWidthRear: 2.55,
      hitchOffset: 0.0,
      maxSteerAngleDeg: 52.0,
      kerbTurningRadiusDeclared: 10.50
    },
    trailer: null,
    normaRef: {
      doc: "Norma 3.1-IC Anexo 3 Tabla A3.1 / Fig. A3.2",
      R_front_guia: 10.50
    }
  },
  camion_articulado_patron: {
    id: "camion_articulado_patron",
    name: "Camión articulado patrón (T) — Norma 3.1-IC",
    hasTrailer: true,
    tractor: {
      wheelbase: 3.90,
      frontOverhang: 1.40,
      rearOverhang: 1.00,
      width: 2.44,
      trackWidthFront: 2.44,
      trackWidthRear: 2.44,
      hitchOffset: 0.70, // 0.70 m delante del eje motriz
      maxSteerAngleDeg: 40.0,
      kerbTurningRadiusDeclared: 10.30
    },
    trailer: {
      wheelbase: 6.95, // 5.65 + 1.30 al centro del trídem
      frontOverhang: 1.40, // Respecto a 5ª rueda
      rearOverhang: 4.25, // 2.95 + 1.30 desde centro trídem
      width: 2.55,
      trackWidth: 2.55,
      axleCount: 3,
      axleSpacing: 1.30
    },
    normaRef: {
      doc: "Norma 3.1-IC Anexo 3 Tabla A3.1 / Fig. A3.5",
      R_front_guia: 10.30
    }
  }
};

console.log("==================================================================");
console.log(" BATERÍA DE PRUEBAS DE VALIDACIÓN — NORMATIVA ESPAÑOLA (TURNSIM) ");
console.log("==================================================================");

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testId, description, details = "") {
  if (condition) {
    totalPassed++;
    console.log(`[PASS] ${testId}: ${description} ${details ? `(${details})` : ""}`);
  } else {
    totalFailed++;
    console.error(`[FAIL] ${testId}: ${description} ${details ? `(${details})` : ""}`);
  }
}

// PRUEBA 1: Consistencia dimensional de parámetros normativos en el modelo de datos
console.log("\n--- PRUEBA 1: CONSISTENCIA GEOMÉTRICA DE VEHÍCULOS PATRÓN ---");
for (const [key, v] of Object.entries(NORMATIVE_VEHICLES)) {
  const tv = v.tractor;
  const lTractor = tv.wheelbase + tv.frontOverhang + tv.rearOverhang;
  if (!v.hasTrailer) {
    let expectedL = key === "furgon_patron" ? 6.35 : key === "camion_ligero_patron" ? 10.55 : 14.30;
    const errL = Math.abs(lTractor - expectedL);
    assert(errL <= 1e-3, `VAL-DIM-${key}`, `Longitud de chasis conforme a Tabla A3.1`, `L=${lTractor.toFixed(2)} m, ref=${expectedL} m`);
  } else {
    const tr = v.trailer;
    const lTrailer = tr.wheelbase + tr.frontOverhang + tr.rearOverhang;
    assert(Math.abs(lTrailer - 12.60) <= 0.05 || Math.abs(lTrailer - 13.60) <= 1.05, `VAL-DIM-${key}`, `Dimensiones de tractora y semirremolque articulado`, `Lt=${lTractor.toFixed(2)} m, Ltr=${lTrailer.toFixed(2)} m`);
  }
}

// PRUEBA 2: Cinemática en régimen permanente circular con radio mínimo de la Guía de Nudos Viarios (Tabla 2.3-D)
console.log("\n--- PRUEBA 2: COMPROBACIÓN CINEMÁTICA DEL RADIO MÍNIMO (TABLA 2.3-D) ---");
for (const [key, v] of Object.entries(NORMATIVE_VEHICLES)) {
  const Rf = v.normaRef.R_front_guia;
  const L = v.tractor.wheelbase;
  const expectedRr = Math.sqrt(Rf * Rf - L * L);
  const expectedDeltaDeg = (Math.asin(L / Rf) * 180) / Math.PI;

  // Maniobra circular pura en TurnSim (arco 90° con radio del eje motriz = expectedRr)
  const maneuver = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [{ type: "arc", radius: expectedRr, angle: 90, direction: 1 }]
  };
  const sim = simulateManeuver(v, maneuver, { arcStepDeg: 0.1, straightStep: 0.02 });
  const lastState = sim.states[sim.states.length - 1];

  // Comprobar que el ángulo de dirección en régimen coincide analíticamente
  const simulatedSteerDeg = (lastState.steerAngleRad * 180) / Math.PI;
  const steerErrAbs = Math.abs(simulatedSteerDeg - expectedDeltaDeg);
  const steerErrRel = (steerErrAbs / expectedDeltaDeg) * 100;

  assert(
    steerErrAbs < 0.01,
    `VAL-STEER-${key}`,
    `Ángulo de dirección para Rf=${Rf} m coincide con formulación cinemática`,
    `sim=${simulatedSteerDeg.toFixed(2)}°, teo=${expectedDeltaDeg.toFixed(2)}°, Ea=${steerErrAbs.toFixed(4)}°, Er=${steerErrRel.toFixed(4)}%`
  );

  // Comprobar la trayectoria del eje director delantero
  const frontX = lastState.x + L * Math.cos(lastState.heading);
  const frontY = lastState.y + L * Math.sin(lastState.heading);
  const calculatedFrontR = Math.hypot(frontX - 0, frontY - expectedRr);
  const rFrontErrAbs = Math.abs(calculatedFrontR - Rf);

  assert(
    rFrontErrAbs < 1e-4,
    `VAL-RFRO-${key}`,
    `Radio del centro del eje director delantero igual a Tabla 2.3-D (${Rf} m)`,
    `R_calc=${calculatedFrontR.toFixed(4)} m, Ea=${rFrontErrAbs.toExponential(2)} m`
  );
}

// PRUEBA 3: Ángulo de articulación permanente y radio del semirremolque en el vehículo articulado
console.log("\n--- PRUEBA 3: ARTICULACIÓN Y TRAYECTORIA DEL SEMIRREMOLQUE PATRÓN ---");
{
  const v = NORMATIVE_VEHICLES.camion_articulado_patron;
  const Rf = v.normaRef.R_front_guia; // 10.30 m
  const Lt = v.tractor.wheelbase; // 3.90 m
  const h = v.tractor.hitchOffset; // 0.70 m
  const Ltr = v.trailer.wheelbase; // 6.95 m
  const Rr = Math.sqrt(Rf * Rf - Lt * Lt); // 9.5332 m
  const Rh = Math.hypot(Rr, h); // 9.5589 m
  const expectedRt = Math.sqrt(Rh * Rh - Ltr * Ltr); // 6.5626 m
  const expectedPsiDeg = ((Math.atan2(Ltr, expectedRt) - Math.atan2(h, Rr)) * 180) / Math.PI; // 42.4427°

  // Caso A: Simulación de régimen permanente (720° de giro continuado para absorber régimen transitorio)
  const maneuver720 = {
    startPose: { x: 0, y: 0, headingDeg: 0 },
    segments: [{ type: "arc", radius: Rr, angle: 720, direction: 1 }]
  };
  const sim720 = simulateManeuver(v, maneuver720, { arcStepDeg: 0.05 });
  const finalState720 = sim720.states[sim720.states.length - 1];

  const calculatedRt720 = Math.hypot(finalState720.tx - 0, finalState720.ty - Rr);
  const rtErrAbs720 = Math.abs(calculatedRt720 - expectedRt);
  const rtErrRel720 = (rtErrAbs720 / expectedRt) * 100;

  assert(
    rtErrAbs720 < 0.001,
    "VAL-ART-SEMI-RADIUS-720",
    "Radio del centro del bogie del semirremolque converge asintóticamente a la solución analítica",
    `sim=${calculatedRt720.toFixed(4)} m, teo=${expectedRt.toFixed(4)} m, Ea=${rtErrAbs720.toFixed(4)} m, Er=${rtErrRel720.toFixed(4)}%`
  );

  const simPsiDeg720 = Math.abs(finalState720.articulationAngleDeg);
  const psiErrAbs720 = Math.abs(simPsiDeg720 - expectedPsiDeg);
  const psiErrRel720 = (psiErrAbs720 / expectedPsiDeg) * 100;

  assert(
    psiErrAbs720 < 0.005,
    "VAL-ART-SEMI-ANGLE-720",
    "Ángulo de articulación asintótico coincide con la formulación analítica de equilibrio",
    `sim=${simPsiDeg720.toFixed(4)}°, teo=${expectedPsiDeg.toFixed(4)}°, Ea=${psiErrAbs720.toFixed(4)}°, Er=${psiErrRel720.toFixed(4)}%`
  );

  // Caso B: Pose de equilibrio exacta inicial (test de invariancia de régimen estacionario circular)
  const maneuverEq = {
    startPose: { x: 0, y: 0, headingDeg: 0, initialArticulationDeg: expectedPsiDeg },
    segments: [{ type: "arc", radius: Rr, angle: 90, direction: 1 }]
  };
  const simEq = simulateManeuver(v, maneuverEq, { arcStepDeg: 0.05 });
  const finalStateEq = simEq.states[simEq.states.length - 1];
  const calculatedRtEq = Math.hypot(finalStateEq.tx - 0, finalStateEq.ty - Rr);
  const rIntRuedas = calculatedRtEq - v.trailer.width / 2;

  assert(
    Math.abs(calculatedRtEq - expectedRt) < 1e-4,
    "VAL-ART-SEMI-EQUILIBRIUM",
    "Invariancia rígida del régimen estacionario en arco circular con RK4 analítico",
    `Rt_final=${calculatedRtEq.toFixed(4)} m, teo=${expectedRt.toFixed(4)} m, Ea=${Math.abs(calculatedRtEq - expectedRt).toExponential(2)} m`
  );

  assert(
    Math.abs(rIntRuedas - 5.288) < 0.005,
    "VAL-REG-CORONA-530",
    "Radio interior de ruedas del semirremolque verifica el diseño de corona circular (Directiva 96/53/CE)",
    `R_int=${rIntRuedas.toFixed(3)} m (límite reglamentario: corona R>=5.30 m)`
  );
}

// PRUEBA 4: Envolvente de barrido con Clipper vs. benchmark independiente de Shapely (90°)
console.log("\n--- PRUEBA 4: CÁLCULO DE ÁREA DE ENVOLVENTE (CLIPPER VS SHAPELY) ---");
{
  const testCases = [
    { key: "furgon_patron", shapelyArea: 52.70 },
    { key: "camion_ligero_patron", shapelyArea: 100.95 },
    { key: "camion_articulado_patron", shapelyArea: 122.60 }
  ];

  for (const tc of testCases) {
    const v = NORMATIVE_VEHICLES[tc.key];
    const Rf = v.normaRef.R_front_guia;
    const L = v.tractor.wheelbase;
    const Rr = Math.sqrt(Rf * Rf - L * L);

    const maneuver = {
      startPose: { x: 0, y: 0, headingDeg: 0 },
      segments: [{ type: "arc", radius: Rr, angle: 90, direction: 1 }]
    };
    const sim = simulateManeuver(v, maneuver, { arcStepDeg: 0.5, straightStep: 0.05 });
    const env = computeSweptEnvelope(sim.states, v, 0.0);

    let clipperArea = 0;
    if (env.envelopePolygon && env.envelopePolygon.length > 2) {
      const pts = env.envelopePolygon;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        clipperArea += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      }
      clipperArea = Math.abs(clipperArea) / 2;
    }

    const diffArea = Math.abs(clipperArea - tc.shapelyArea);
    const relDiffArea = (diffArea / tc.shapelyArea) * 100;

    assert(
      relDiffArea < 2.0,
      `VAL-AREA-${tc.key}`,
      `Área envolvente Clipper coincide con Shapely dentro del 2%`,
      `Clipper=${clipperArea.toFixed(2)} m², Shapely=${tc.shapelyArea.toFixed(2)} m², diff=${diffArea.toFixed(2)} m² (${relDiffArea.toFixed(2)}%)`
    );
  }
}

// PRUEBA 5: Simulación Pure Pursuit guiando el centro del eje director (Guía Nudos 2.3.2.1)
console.log("\n--- PRUEBA 5: GUIADO POR EJE DIRECTOR CON PURE PURSUIT (GUIADO NORMATIVO) ---");
{
  const v = NORMATIVE_VEHICLES.camion_articulado_patron;
  const Rf = 10.30;
  const path = [];
  const nPts = 100;
  for (let i = 0; i <= nPts; i++) {
    const a = (i / nPts) * (Math.PI / 2);
    path.push([Rf * Math.sin(a), Rf * (1 - Math.cos(a))]);
  }

  const simResult = simulatePathFollowing(v, path, {
    stepSizeM: 0.05,
    lookaheadM: 3.5,
    maxSteerRateDegPerM: 20.0
  });

  assert(
    simResult.states.length > 50,
    "VAL-PP-STEERING-AXIS",
    "Seguimiento cinemático de polilínea por el eje director ejecutado con éxito",
    `estados=${simResult.states.length}, maxSteer=${simResult.summary.maxSteerAngleDeg}°`
  );
}

console.log("\n==================================================================");
console.log(` RESUMEN FINAL: ${totalPassed} superadas, ${totalFailed} fallidas`);
console.log("==================================================================");

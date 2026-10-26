/**
 * Catálogo de vehículos pesados articulados, cabezas tractoras, semirremolques y validación paramétrica
 * TurnSim — Simulador de Barrido de Vehículos Pesados
 */

export const TRACTOR_CATALOG = {
  renault_t_480: {
    id: "renault_t_480",
    name: "Renault Trucks T 480 (4x2)",
    manufacturer: "Renault Trucks",
    axleConfig: "4x2 (1 directriz + 1 motriz gemelo)",
    wheelbase: 3.800,       // m (L_wb)
    frontOverhang: 1.365,   // m (L_fo)
    rearOverhang: 0.825,    // m (L_ro)
    width: 2.550,           // m (W)
    trackWidthFront: 2.150, // m
    trackWidthRear: 2.150,  // m
    hitchOffset: 0.550,     // m (h > 0: quinta rueda delante del eje motriz)
    kerbTurningRadiusDeclared: 6.856, // m
    wallTurningRadiusDeclared: 7.550, // m
    maxSteerAngleDeg: 36.2,           // grados
    colorCab: 0x0284c7,
    colorStripe: 0x0284c7,
    verified: true,
    source: "Ficha técnica oficial Renault Trucks T 4x2 Tractor (Batalla 3.800 mm)"
  },
  mercedes_actros_1845: {
    id: "mercedes_actros_1845",
    name: "Mercedes-Benz Actros 1845 LS (4x2)",
    manufacturer: "Mercedes-Benz Trucks",
    axleConfig: "4x2 (1 directriz + 1 motriz gemelo)",
    wheelbase: 3.700,
    frontOverhang: 1.440,
    rearOverhang: 1.050,
    width: 2.550,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.585,
    kerbTurningRadiusDeclared: 6.650,
    wallTurningRadiusDeclared: 7.400,
    maxSteerAngleDeg: 36.5,
    colorCab: 0x0f766e,
    colorStripe: 0x0d9488,
    verified: true,
    source: "Ficha técnica oficial Mercedes-Benz Actros 1845 LS 4x2 (Serie 963-4-A, batalla 3.700 mm)"
  },
  daf_xf_480: {
    id: "daf_xf_480",
    name: "DAF FT XF 480 (4x2)",
    manufacturer: "DAF Trucks",
    axleConfig: "4x2 (1 directriz 163N + 1 motriz SR1344)",
    wheelbase: 3.800,
    frontOverhang: 1.370,
    rearOverhang: 0.750,
    width: 2.550,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.540,
    kerbTurningRadiusDeclared: 6.720,
    wallTurningRadiusDeclared: 7.420,
    maxSteerAngleDeg: 36.9,
    colorCab: 0xd97706,
    colorStripe: 0xf59e0b,
    verified: true,
    source: "Portal oficial DAF Specification Sheets — DAF FT XF 4x2 (Batalla 3.800 mm)"
  },
  volvo_fh_500: {
    id: "volvo_fh_500",
    name: "Volvo FH 500 Globetrotter (4x2)",
    manufacturer: "Volvo Trucks",
    axleConfig: "4x2 (1 directriz + 1 motriz gemelo)",
    wheelbase: 3.800,
    frontOverhang: 1.370,
    rearOverhang: 0.825,
    width: 2.550,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.575,
    kerbTurningRadiusDeclared: 6.750,
    wallTurningRadiusDeclared: 7.450,
    maxSteerAngleDeg: 36.5,
    colorCab: 0x2563eb,
    colorStripe: 0x3b82f6,
    verified: true,
    source: "Ficha técnica oficial Volvo FH Tractor 4x2 (Batalla 3.800 mm)"
  },
  scania_r_450: {
    id: "scania_r_450",
    name: "Scania R 450 Highline (4x2)",
    manufacturer: "Scania",
    axleConfig: "4x2 (1 directriz + 1 motriz gemelo)",
    wheelbase: 3.750,
    frontOverhang: 1.390,
    rearOverhang: 0.775,
    width: 2.550,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.560,
    kerbTurningRadiusDeclared: 6.700,
    wallTurningRadiusDeclared: 7.410,
    maxSteerAngleDeg: 36.6,
    colorCab: 0xdc2626,
    colorStripe: 0xef4444,
    verified: true,
    source: "Ficha técnica oficial Scania R-Series Tractor (Batalla 3.750 mm)"
  },
  generic_schlepp_tractor: {
    id: "generic_schlepp_tractor",
    name: "Tractora de contraste Schlepp (4x2)",
    manufacturer: "Perfil de validación numérica",
    axleConfig: "4x2 genérico",
    wheelbase: 3.800,
    frontOverhang: 1.400,
    rearOverhang: 0.800,
    width: 2.550,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.300,
    kerbTurningRadiusDeclared: 6.850,
    wallTurningRadiusDeclared: 7.550,
    maxSteerAngleDeg: 36.0,
    colorCab: 0x475569,
    colorStripe: 0x64748b,
    verified: false,
    source: "Configuración sintética models/trailer_1650_giro90.toml"
  }
};

export const TRAILER_CATALOG = {
  schmitz_sko_cool: {
    id: "schmitz_sko_cool",
    name: "Schmitz Cargobull S.KO Cool (Frigorífico 13,62 m)",
    model: "Schmitz Cargobull S.KO Cool (FERROPLAST 13,62 m)",
    manufacturer: "Schmitz Cargobull",
    axleCount: 3,
    axleSpacing: 1.310,     // m (separación entre ejes del trídem)
    wheelbase: 7.700,       // m (L_t: kingpin al eje central del trídem)
    frontOverhang: 1.685,   // m (L_t_fo: voladizo delantero con equipo de frío)
    rearOverhang: 4.200,    // m (L_t_ro: desde el centro del trídem hasta el tope trasero)
    width: 2.600,           // m (W_t: anchura reglamentaria ATP frigorífico)
    trackWidth: 2.150,      // m
    isReefer: true,
    verified: true,
    source: "Ficha técnica Schmitz Cargobull S.KO Cool (Chasis 3 ejes ROTOS, 13.620 mm)"
  },
  schmitz_scs_universal: {
    id: "schmitz_scs_universal",
    name: "Schmitz Cargobull S.CS Universal (Lona 13,62 m)",
    model: "Schmitz Cargobull S.CS Universal (Tautliner 13,62 m)",
    manufacturer: "Schmitz Cargobull",
    axleCount: 3,
    axleSpacing: 1.310,
    wheelbase: 7.700,
    frontOverhang: 1.600,
    rearOverhang: 4.200,
    width: 2.550,
    trackWidth: 2.150,
    isReefer: false,
    verified: true,
    source: "Ficha técnica Schmitz Cargobull S.CS Universal (MODULOS 3 ejes, batalla 7.700 mm)"
  },
  krone_profi_liner: {
    id: "krone_profi_liner",
    name: "Krone Profi Liner (Lona estándar UE 13,62 m)",
    model: "Krone Profi Liner (Cortinas correderas 13,62 m)",
    manufacturer: "Krone",
    axleCount: 3,
    axleSpacing: 1.310,
    wheelbase: 7.630,
    frontOverhang: 1.600,
    rearOverhang: 4.200,
    width: 2.550,
    trackWidth: 2.150,
    isReefer: false,
    verified: true,
    source: "Ficha técnica oficial Krone Profi Liner 3 ejes (13.620 mm)"
  },
  generic_cisterna_1150: {
    id: "generic_cisterna_1150",
    name: "Semirremolque Cisterna (3 ejes, 11,50 m)",
    model: "Semirremolque Cisterna Cilíndrica (11,50 m)",
    manufacturer: "Cisterna Química / Combustible",
    axleCount: 3,
    axleSpacing: 1.310,
    wheelbase: 6.800,
    frontOverhang: 1.400,
    rearOverhang: 3.300,
    width: 2.550,
    trackWidth: 2.150,
    isReefer: false,
    verified: true,
    source: "Especificación dimensional cisterna 3 ejes (11.500 mm)"
  },
  generic_schlepp_trailer: {
    id: "generic_schlepp_trailer",
    name: "Semirremolque de prueba Schlepp (voladizo 2,80 m)",
    model: "Semirremolque de contraste numérico Schlepp",
    manufacturer: "Perfil sintético",
    axleCount: 3,
    axleSpacing: 1.300,
    wheelbase: 7.700,
    frontOverhang: 1.500,
    rearOverhang: 2.800,
    width: 2.550,
    trackWidth: 2.150,
    isReefer: true,
    verified: false,
    source: "Archivo de contraste models/trailer_1650_giro90.toml"
  }
};

/**
 * Crea una combinación articulada completa a partir de una tractora y un semirremolque.
 */
export function buildCombinedVehicle(tractorKey, trailerKey) {
  const tractor = TRACTOR_CATALOG[tractorKey] || TRACTOR_CATALOG.renault_t_480;
  const trailer = TRAILER_CATALOG[trailerKey] || TRAILER_CATALOG.schmitz_sko_cool;

  const isVerified = Boolean(tractor.verified && trailer.verified);
  const badge = isVerified
    ? "Perfil verificado (Ficha fabricante)"
    : "Perfil provisional de prueba (No apto para certificar obra real)";

  return {
    id: `combo_${tractor.id}_${trailer.id}`,
    presetKey: null,
    tractorKey: tractor.id,
    trailerKey: trailer.id,
    name: `${tractor.name} + ${trailer.name}`,
    manufacturer: `${tractor.manufacturer} / ${trailer.manufacturer}`,
    modelVariant: `${tractor.name} (Batalla ${tractor.wheelbase.toFixed(3)} m) + ${trailer.name}`,
    category: `Conjunto articulado 5 ejes (40 t) — ${trailer.isReefer ? "Frigorífico" : "Caja/Lona"}`,
    verified: isVerified,
    verificationBadge: badge,
    lastVerifiedDate: "2026-10-26",
    colorCab: tractor.colorCab,
    colorStripe: tractor.colorStripe,
    tractor: {
      axleConfig: tractor.axleConfig,
      wheelbase: tractor.wheelbase,
      frontOverhang: tractor.frontOverhang,
      rearOverhang: tractor.rearOverhang,
      width: tractor.width,
      trackWidthFront: tractor.trackWidthFront,
      trackWidthRear: tractor.trackWidthRear,
      hitchOffset: tractor.hitchOffset,
      kerbTurningRadiusDeclared: tractor.kerbTurningRadiusDeclared,
      wallTurningRadiusDeclared: tractor.wallTurningRadiusDeclared,
      maxSteerAngleDeg: tractor.maxSteerAngleDeg
    },
    trailer: {
      model: trailer.model,
      axleCount: trailer.axleCount,
      axleSpacing: trailer.axleSpacing,
      wheelbase: trailer.wheelbase,
      frontOverhang: trailer.frontOverhang,
      rearOverhang: trailer.rearOverhang,
      width: trailer.width,
      trackWidth: trailer.trackWidth,
      isReefer: trailer.isReefer
    },
    limits: {
      maxArticulationAngleDeg: 85.0
    },
    traceability: {
      sources: [
        tractor.source,
        trailer.source,
        "Reglamento General de Vehículos (RD 2822/1998, Anexo IX) y Directiva 96/53/CE"
      ],
      confidence: isVerified
        ? "Alto en dimensiones de chasis y carrocería según especificaciones técnicas oficiales."
        : "Perfil sintético para contraste numérico exacto."
    }
  };
}

/**
 * Catálogo maestro de conjuntos articulados preconfigurados
 * Compatible con la suite de pruebas y versiones anteriores.
 */
export const VEHICLE_CATALOG = {
  renault_t_4x2_sko: {
    ...buildCombinedVehicle("renault_t_480", "schmitz_sko_cool"),
    id: "renault_t_4x2_sko",
    presetKey: "renault_t_4x2_sko",
    tractorKey: "renault_t_480",
    trailerKey: "schmitz_sko_cool",
    name: "Renault Trucks T 480 (4x2) + Schmitz S.KO Cool",
    modelVariant: "Gama T 480 T4x2 E6 (Batalla 3.800 mm) + Semirremolque Frigorífico 3 ejes (13,62 m)",
    category: "Conjunto articulado frigorífico 5 ejes (40 t)"
  },
  mercedes_actros_4x2_scs: {
    ...buildCombinedVehicle("mercedes_actros_1845", "schmitz_scs_universal"),
    id: "mercedes_actros_4x2_scs",
    presetKey: "mercedes_actros_4x2_scs",
    tractorKey: "mercedes_actros_1845",
    trailerKey: "schmitz_scs_universal",
    name: "Mercedes-Benz Actros 1845 LS (4x2) + Schmitz S.CS",
    modelVariant: "Actros 1845 LS 4x2 F13 (Batalla 3.700 mm) + Semirremolque Lona S.CS Universal (13,62 m)",
    category: "Conjunto articulado lona corredera 5 ejes (40 t)"
  },
  daf_xf_4x2_eu: {
    ...buildCombinedVehicle("daf_xf_480", "krone_profi_liner"),
    id: "daf_xf_4x2_eu",
    presetKey: "daf_xf_4x2_eu",
    tractorKey: "daf_xf_480",
    trailerKey: "krone_profi_liner",
    name: "DAF FT XF 480 (4x2) + Semirremolque Europeo 13,62 m",
    modelVariant: "FT XF 480 4x2 (Batalla 3.800 mm) + Semirremolque Europeo 3 ejes (13,62 m)",
    category: "Conjunto articulado europeo estándar 5 ejes (40 t)"
  },
  volvo_fh_scs: {
    ...buildCombinedVehicle("volvo_fh_500", "schmitz_scs_universal"),
    id: "volvo_fh_scs",
    presetKey: "volvo_fh_scs",
    tractorKey: "volvo_fh_500",
    trailerKey: "schmitz_scs_universal",
    name: "Volvo FH 500 (4x2) + Schmitz S.CS Universal",
    modelVariant: "Volvo FH 500 Globetrotter (Batalla 3.800 mm) + Semirremolque Lona 3 ejes (13,62 m)",
    category: "Conjunto articulado lona corredera 5 ejes (40 t)"
  },
  scania_r_sko: {
    ...buildCombinedVehicle("scania_r_450", "schmitz_sko_cool"),
    id: "scania_r_sko",
    presetKey: "scania_r_sko",
    tractorKey: "scania_r_450",
    trailerKey: "schmitz_sko_cool",
    name: "Scania R 450 (4x2) + Schmitz S.KO Cool",
    modelVariant: "Scania R 450 Highline (Batalla 3.750 mm) + Semirremolque Frigorífico 3 ejes (13,62 m)",
    category: "Conjunto articulado frigorífico 5 ejes (40 t)"
  },
  generic_schlepp_1650: {
    ...buildCombinedVehicle("generic_schlepp_tractor", "generic_schlepp_trailer"),
    id: "generic_schlepp_1650",
    presetKey: "generic_schlepp_1650",
    tractorKey: "generic_schlepp_tractor",
    trailerKey: "generic_schlepp_trailer",
    name: "[PROVISIONAL / REFERENCIA] Tráiler de contraste Schlepp",
    modelVariant: "Configuración original de prueba (models/trailer_1650_giro90.toml)",
    category: "Perfil de prueba / validación cruzada (No comercial)",
    verified: false,
    verificationBadge: "Perfil provisional de prueba (No apto para certificar obra real)",
    traceability: {
      sources: [
        "Archivo de prueba local models/trailer_1650_giro90.toml para validación frente a brombirium/schlepp"
      ],
      confidence: "Perfil sintético para contraste numérico exacto con simulation_data_rich.json. El voladizo trasero del semirremolque (2,80 m) es inferior al de un semirremolque real de 13,60 m (4,20 m)."
    }
  }
};

/**
 * Clona profundamente un perfil del catálogo para permitir su edición sin mutar el original.
 */
export function cloneVehicleProfile(vehicleId) {
  const base = VEHICLE_CATALOG[vehicleId] || VEHICLE_CATALOG.renault_t_4x2_sko;
  return JSON.parse(JSON.stringify(base));
}

/**
 * Calcula las magnitudes geométricas derivadas y los diferentes radios de giro
 * distinguiendo estrictamente entre:
 * - Longitud de tractora, longitud de semirremolque y longitud total acoplada.
 * - Radio del eje de referencia (R_ref), radio exterior de rueda (R_rueda,ext) y
 *   radio/diámetro exterior de barrido de carrocería (R_barrido,ext / D_barrido,ext).
 */
export function computeDerivedVehicleMetrics(vehicle) {
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;

  const tractorLength = tv.wheelbase + tv.frontOverhang + tv.rearOverhang;
  const trailerLength = tr.wheelbase + tr.frontOverhang + tr.rearOverhang;

  // En alineación recta, el kingpin está en x = hitchOffset respecto al eje motriz.
  // El extremo delantero del conjunto es max(wheelbase + frontOverhang, hitchOffset + trailer.frontOverhang)
  // El extremo trasero del conjunto es min(-rearOverhang, hitchOffset - trailer.wheelbase - trailer.rearOverhang)
  const frontExtremeX = Math.max(tv.wheelbase + tv.frontOverhang, tv.hitchOffset + tr.frontOverhang);
  const rearExtremeX = Math.min(-tv.rearOverhang, tv.hitchOffset - tr.wheelbase - tr.rearOverhang);
  const totalCoupledLength = frontExtremeX - rearExtremeX;

  const kingpinToRear = tr.wheelbase + tr.rearOverhang;
  const frontSwingRadius = Math.hypot(tr.frontOverhang, tr.width / 2);

  // Distancia libre entre la trasera de la cabina y el frontal del semirremolque
  const maxSteerRad = (tv.maxSteerAngleDeg * Math.PI) / 180;
  const minRefRadius = tv.wheelbase / Math.tan(maxSteerRad);
  const trackFront = tv.trackWidthFront || (tv.width - 0.40);
  const minKerbTurningRadius = Math.hypot(tv.wheelbase, minRefRadius + trackFront / 2);
  const minWallTurningRadius = Math.hypot(tv.wheelbase + tv.frontOverhang, minRefRadius + tv.width / 2);

  return {
    tractorLength: Number(tractorLength.toFixed(3)),
    trailerLength: Number(trailerLength.toFixed(3)),
    totalCoupledLength: Number(totalCoupledLength.toFixed(3)),
    kingpinToRear: Number(kingpinToRear.toFixed(3)),
    frontSwingRadius: Number(frontSwingRadius.toFixed(3)),
    minRefRadius: Number(minRefRadius.toFixed(3)),
    minKerbTurningRadius: Number(minKerbTurningRadius.toFixed(3)),
    minKerbTurningDiameter: Number((2 * minKerbTurningRadius).toFixed(3)),
    minWallTurningRadius: Number(minWallTurningRadius.toFixed(3)),
    minWallTurningDiameter: Number((2 * minWallTurningRadius).toFixed(3))
  };
}

/**
 * Valida la consistencia geométrica y normativa de una configuración de vehículo.
 * Devuelve { valid: boolean, errors: string[], warnings: string[], metrics: object }
 */
export function validateVehicleParams(vehicle) {
  const errors = [];
  const warnings = [];
  const tv = vehicle.tractor;
  const tr = vehicle.trailer;

  if (!tv || !tr) {
    return { valid: false, errors: ["Faltan las definiciones de tractora o semirremolque."], warnings };
  }

  if (!(tv.wheelbase >= 2.5 && tv.wheelbase <= 6.5)) {
    errors.push(`La batalla de la tractora (${tv.wheelbase} m) debe estar entre 2,50 m y 6,50 m.`);
  }
  if (!(tv.frontOverhang >= 0.5 && tv.frontOverhang <= 2.5)) {
    errors.push(`El voladizo delantero de la tractora (${tv.frontOverhang} m) debe estar entre 0,50 m y 2,50 m.`);
  }
  if (!(tv.rearOverhang >= 0.3 && tv.rearOverhang <= 2.5)) {
    errors.push(`El voladizo trasero de la tractora (${tv.rearOverhang} m) debe estar entre 0,30 m y 2,50 m.`);
  }
  if (!(tv.width >= 1.8 && tv.width <= 3.2)) {
    errors.push(`La anchura de la tractora (${tv.width} m) debe estar entre 1,80 m y 3,20 m.`);
  }
  if (!(tv.hitchOffset >= -1.5 && tv.hitchOffset <= 2.0)) {
    errors.push(`El desplazamiento de la quinta rueda (${tv.hitchOffset} m) está fuera del rango admisible (-1,50 m a +2,00 m).`);
  }
  if (!(tv.maxSteerAngleDeg >= 15 && tv.maxSteerAngleDeg <= 55)) {
    errors.push(`El ángulo máximo de dirección (${tv.maxSteerAngleDeg}°) debe estar entre 15° y 55°.`);
  }

  if (!(tr.wheelbase >= 3.0 && tr.wheelbase <= 12.0)) {
    errors.push(`La distancia kingpin a centro del trídem (${tr.wheelbase} m) debe estar entre 3,00 m y 12,00 m.`);
  }
  if (!(tr.frontOverhang >= 0.5 && tr.frontOverhang <= 3.0)) {
    errors.push(`El voladizo delantero del semirremolque (${tr.frontOverhang} m) debe estar entre 0,50 m y 3,00 m.`);
  }
  if (!(tr.rearOverhang >= 0.5 && tr.rearOverhang <= 6.0)) {
    errors.push(`El voladizo trasero del semirremolque (${tr.rearOverhang} m) debe estar entre 0,50 m y 6,00 m.`);
  }
  if (!(tr.width >= 1.8 && tr.width <= 3.2)) {
    errors.push(`La anchura del semirremolque (${tr.width} m) debe estar entre 1,80 m y 3,20 m.`);
  }

  // Comprobaciones normativas (Directiva 96/53/CE y RD 2822/1998)
  const metrics = computeDerivedVehicleMetrics(vehicle);
  if (metrics.totalCoupledLength > 16.50) {
    warnings.push(
      `Longitud total acoplada (${metrics.totalCoupledLength.toFixed(2)} m) superior al límite general de 16,50 m para vehículos articulados en España/UE (RD 2822/1998).`
    );
  }
  if (metrics.kingpinToRear > 12.00) {
    warnings.push(
      `Distancia del kingpin al extremo trasero (${metrics.kingpinToRear.toFixed(2)} m) superior al máximo reglamentario de 12,00 m (Directiva 96/53/CE).`
    );
  }
  if (tr.frontOverhang > 2.04) {
    warnings.push(
      `El voladizo frontal del semirremolque (${tr.frontOverhang.toFixed(2)} m) supera el radio frontal reglamentario de 2,04 m desde el kingpin.`
    );
  }
  if (!vehicle.verified) {
    warnings.push(
      "Este perfil utiliza dimensiones provisionales o de referencia numérica. No debe utilizarse para certificar maniobras reales sin verificar los parámetros."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics
  };
}

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
  },
  rigid_truck_2axle: {
    id: "rigid_truck_2axle",
    name: "Camión rígido 2 ejes (8,50 m)",
    isRigid: true,
    manufacturer: "Estándar UE (4x2)",
    category: "Camión rígido 2 ejes (18 t)",
    axleConfig: "4x2 (1 directriz + 1 motriz gemelo)",
    wheelbase: 4.500,
    frontOverhang: 1.400,
    rearOverhang: 2.600,
    width: 2.550,
    trackWidthFront: 2.050,
    trackWidthRear: 2.050,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 7.200,
    wallTurningRadiusDeclared: 8.100,
    maxSteerAngleDeg: 38.0,
    colorCab: 0x2563eb,
    colorStripe: 0x3b82f6,
    verified: true,
    source: "Reglamento General de Vehículos RD 2822/1998 y Directiva 96/53/CE (Camión rígido 2 ejes 18 t)"
  },
  rigid_truck_3axle: {
    id: "rigid_truck_3axle",
    name: "Camión rígido 3 ejes (10,20 m)",
    isRigid: true,
    manufacturer: "Estándar UE (6x2)",
    category: "Camión rígido 3 ejes (26 t)",
    axleConfig: "6x2 (1 directriz + 1 motriz + 1 arrastrado)",
    wheelbase: 5.100,
    frontOverhang: 1.450,
    rearOverhang: 3.650,
    width: 2.550,
    trackWidthFront: 2.050,
    trackWidthRear: 2.050,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 8.400,
    wallTurningRadiusDeclared: 9.300,
    maxSteerAngleDeg: 36.0,
    colorCab: 0x059669,
    colorStripe: 0x10b981,
    verified: true,
    source: "Reglamento General de Vehículos RD 2822/1998 y Directiva 96/53/CE (Camión rígido 3 ejes 26 t)"
  },
  city_bus_12m: {
    id: "city_bus_12m",
    name: "Autobús urbano estándar clase I (12,00 m)",
    isRigid: true,
    manufacturer: "Autobús urbano estándar UE",
    category: "Transporte colectivo urbano rígido (12,00 m)",
    axleConfig: "4x2 (1 directriz delantero + 1 motriz trasero)",
    wheelbase: 5.850,
    frontOverhang: 2.700,
    rearOverhang: 3.450,
    width: 2.550,
    trackWidthFront: 2.100,
    trackWidthRear: 2.000,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 8.900,
    wallTurningRadiusDeclared: 10.600,
    maxSteerAngleDeg: 42.0,
    colorCab: 0xd97706,
    colorStripe: 0xf59e0b,
    verified: true,
    source: "Directiva 96/53/CE Anexo I y Reglamento CEPE/ONU 107 (Autobús urbano clase I 12 m)"
  },
  coach_bus_15m: {
    id: "coach_bus_15m",
    name: "Autobús interurbano 3 ejes (15,00 m)",
    isRigid: true,
    manufacturer: "Autocar de largo recorrido UE",
    category: "Transporte de viajeros clase III (15,00 m)",
    axleConfig: "6x2 (1 directriz delantero + 1 motriz + 1 directriz pasivo)",
    wheelbase: 7.100,
    frontOverhang: 2.800,
    rearOverhang: 3.800,
    width: 2.550,
    trackWidthFront: 2.100,
    trackWidthRear: 2.000,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 10.200,
    wallTurningRadiusDeclared: 11.900,
    maxSteerAngleDeg: 40.0,
    colorCab: 0x7c3aed,
    colorStripe: 0x8b5cf6,
    verified: true,
    source: "Directiva 96/53/CE modificada (Autocar 3 ejes longitud máxima 15,00 m)"
  },
  standard_turismo_p: {
    id: "standard_turismo_p",
    name: "Turismo patrón estándar (P) — Referencia diseño viario",
    isRigid: true,
    manufacturer: "Estándar normativo (AASHTO P / FGSV PKW / Diseño viario)",
    category: "Turismo ligero estándar (4,75 m)",
    axleConfig: "4x2 (1 directriz + 1 motriz)",
    wheelbase: 2.850,
    frontOverhang: 0.920,
    rearOverhang: 0.980,
    width: 1.850,
    trackWidthFront: 1.580,
    trackWidthRear: 1.580,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 5.950,
    wallTurningRadiusDeclared: 6.450,
    maxSteerAngleDeg: 34.0,
    colorCab: 0x0ea5e9,
    colorStripe: 0x7dd3fc,
    verified: true,
    source: "Estándares de diseño geométrico viario (AASHTO Passenger Car P / FGSV Pkw)"
  },
  standard_furgoneta_l2: {
    id: "standard_furgoneta_l2",
    name: "Furgoneta estándar de reparto (L2) — Referencia diseño viario",
    isRigid: true,
    manufacturer: "Estándar comercial europeo (Segmento N1 L2H2)",
    category: "Furgoneta de reparto estándar (5,93 m)",
    axleConfig: "4x2 (1 directriz + 1 motriz)",
    wheelbase: 3.665,
    frontOverhang: 1.000,
    rearOverhang: 1.265,
    width: 2.020,
    trackWidthFront: 1.720,
    trackWidthRear: 1.720,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 6.800,
    wallTurningRadiusDeclared: 7.450,
    maxSteerAngleDeg: 38.0,
    colorCab: 0x0284c7,
    colorStripe: 0xbae6fd,
    verified: true,
    source: "Especificación geométrica estándar de furgoneta comercial europea L2 (5,93 m)"
  },
  spain_furgon_f: {
    id: "spain_furgon_f",
    name: "Furgón patrón (F) — Norma 3.1-IC",
    isRigid: true,
    manufacturer: "Normativa española (Ministerio de Fomento / DGC)",
    category: "Vehículo patrón Norma 3.1-IC (Furgón F)",
    axleConfig: "4x2 (1 directriz + 1 motriz)",
    wheelbase: 4.000,
    frontOverhang: 0.950,
    rearOverhang: 1.400,
    width: 2.050,
    trackWidthFront: 1.800,
    trackWidthRear: 1.800,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 7.500,
    wallTurningRadiusDeclared: 8.877,
    maxSteerAngleDeg: 38.0,
    colorCab: 0x0284c7,
    colorStripe: 0x38bdf8,
    verified: true,
    source: "Norma 3.1-IC (Tabla A3.1, Fig. A3.1) y Guía de Nudos Viarios OC 32/2012 (Tabla 2.3-A, 2.3-D)"
  },
  spain_camion_ligero_c: {
    id: "spain_camion_ligero_c",
    name: "Camión ligero patrón (C) — Norma 3.1-IC",
    isRigid: true,
    manufacturer: "Normativa española (Ministerio de Fomento / DGC)",
    category: "Vehículo patrón Norma 3.1-IC (Camión rígido C)",
    axleConfig: "4x2 (1 directriz + 1 motriz)",
    wheelbase: 6.250,
    frontOverhang: 1.400,
    rearOverhang: 2.900,
    width: 2.550,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 9.100,
    wallTurningRadiusDeclared: 10.989,
    maxSteerAngleDeg: 45.0,
    colorCab: 0x059669,
    colorStripe: 0x10b981,
    verified: true,
    source: "Norma 3.1-IC (Tabla A3.1, Fig. A3.4) y Guía de Nudos Viarios OC 32/2012 (Tabla 2.3-A, 2.3-D)"
  },
  spain_autobus_rigido_a: {
    id: "spain_autobus_rigido_a",
    name: "Autobús rígido 3 ejes patrón (A) — Norma 3.1-IC",
    isRigid: true,
    manufacturer: "Normativa española (Ministerio de Fomento / DGC)",
    category: "Vehículo patrón Norma 3.1-IC (Autobús A)",
    axleConfig: "6x2 (1 directriz + 2 en tándem)",
    wheelbase: 7.450,
    frontOverhang: 2.650,
    rearOverhang: 3.500,
    width: 2.550,
    trackWidthFront: 2.100,
    trackWidthRear: 2.050,
    hitchOffset: 0.0,
    kerbTurningRadiusDeclared: 10.500,
    wallTurningRadiusDeclared: 13.378,
    maxSteerAngleDeg: 45.0,
    colorCab: 0x7c3aed,
    colorStripe: 0x8b5cf6,
    verified: true,
    source: "Norma 3.1-IC (Tabla A3.1, Fig. A3.2) y Guía de Nudos Viarios OC 32/2012 (Tabla 2.3-A, 2.3-D)",
    notes: "Norma 3.1-IC Fig. A3.2 cotas de chasis tándem (7,45 + 1,40 m). En flotas reales de autocar de 15 m (Directiva 96/53/CE) el 3.er eje es autodireccional pasivo, reduciendo la batalla efectiva a Lef ~ 7,10 m (ver preset coach_bus_15m)."
  },
  spain_tractor_t: {
    id: "spain_tractor_t",
    name: "Tractora patrón (T) — Norma 3.1-IC",
    manufacturer: "Normativa española (Ministerio de Fomento / DGC)",
    axleConfig: "4x2 (1 directriz + 1 motriz)",
    wheelbase: 3.900,
    frontOverhang: 1.400,
    rearOverhang: 1.000,
    width: 2.440,
    trackWidthFront: 2.150,
    trackWidthRear: 2.150,
    hitchOffset: 0.700,
    kerbTurningRadiusDeclared: 10.300,
    wallTurningRadiusDeclared: 11.988,
    maxSteerAngleDeg: 40.0,
    colorCab: 0xd97706,
    colorStripe: 0xf59e0b,
    verified: true,
    source: "Norma 3.1-IC (Tabla A3.1, Fig. A3.5) y Guía de Nudos Viarios OC 32/2012 (Tabla 2.3-A, 2.3-D)"
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
  },
  spain_semitrailer_t: {
    id: "spain_semitrailer_t",
    name: "Semirremolque trídem patrón 13,60 m — Norma 3.1-IC",
    model: "Semirremolque estándar español trídem (13,60 m)",
    manufacturer: "Norma 3.1-IC Fig. A3.5",
    axleCount: 3,
    axleSpacing: 1.300,
    wheelbase: 6.950,
    frontOverhang: 1.400,
    rearOverhang: 4.250,
    width: 2.550,
    trackWidth: 2.150,
    isReefer: false,
    verified: true,
    source: "Norma 3.1-IC (Tabla A3.1 y Fig. A3.5)"
  },
  none: {
    id: "none",
    name: "Sin semirremolque (Vehículo rígido / Autobús)",
    model: "Sin semirremolque",
    manufacturer: "N/A",
    axleCount: 0,
    axleSpacing: 0,
    wheelbase: 0,
    frontOverhang: 0,
    rearOverhang: 0,
    width: 0,
    trackWidth: 0,
    isReefer: false,
    verified: true,
    source: "Vehículo rígido de cuerpo único"
  }
};

/**
 * Crea una configuración de vehículo (articulado o rígido) a partir de una tractora y un semirremolque.
 */
export function buildCombinedVehicle(tractorKey, trailerKey) {
  const tractor = TRACTOR_CATALOG[tractorKey] || TRACTOR_CATALOG.renault_t_480;
  const isRigid = Boolean(tractor.isRigid) || !trailerKey || trailerKey === "none";
  const trailer = isRigid ? null : (TRAILER_CATALOG[trailerKey] || TRAILER_CATALOG.schmitz_sko_cool);

  const isVerified = Boolean(tractor.verified && (isRigid || trailer.verified));
  const badge = isVerified
    ? "Perfil verificado (Ficha fabricante)"
    : "Perfil provisional de prueba (No apto para certificar obra real)";

  return {
    id: isRigid ? `rigid_${tractor.id}` : `combo_${tractor.id}_${trailer.id}`,
    presetKey: null,
    tractorKey: tractor.id,
    trailerKey: isRigid ? "none" : trailer.id,
    hasTrailer: !isRigid,
    name: isRigid ? tractor.name : `${tractor.name} + ${trailer.name}`,
    manufacturer: isRigid ? tractor.manufacturer : `${tractor.manufacturer} / ${trailer.manufacturer}`,
    modelVariant: isRigid
      ? `${tractor.name} (Batalla ${tractor.wheelbase.toFixed(3)} m)`
      : `${tractor.name} (Batalla ${tractor.wheelbase.toFixed(3)} m) + ${trailer.name}`,
    category: isRigid
      ? (tractor.category || "Vehículo rígido de cuerpo único")
      : `Conjunto articulado 5 ejes (40 t) — ${trailer.isReefer ? "Frigorífico" : "Caja/Lona"}`,
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
      hitchOffset: isRigid ? 0 : tractor.hitchOffset,
      kerbTurningRadiusDeclared: tractor.kerbTurningRadiusDeclared,
      wallTurningRadiusDeclared: tractor.wallTurningRadiusDeclared,
      maxSteerAngleDeg: tractor.maxSteerAngleDeg
    },
    trailer: isRigid ? null : {
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
      maxArticulationAngleDeg: isRigid ? 0 : 85.0
    },
    traceability: {
      sources: isRigid
        ? [tractor.source, "Reglamento General de Vehículos (RD 2822/1998, Anexo IX) y Directiva 96/53/CE"]
        : [tractor.source, trailer.source, "Reglamento General de Vehículos (RD 2822/1998, Anexo IX) y Directiva 96/53/CE"],
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
  // 1. ESTÁNDARES Y NORMATIVA — TURISMOS Y FURGONETAS
  standard_turismo_p: {
    ...buildCombinedVehicle("standard_turismo_p", "none"),
    id: "standard_turismo_p",
    presetKey: "standard_turismo_p",
    tractorKey: "standard_turismo_p",
    trailerKey: "none",
    name: "Turismo patrón estándar (P) — Referencia diseño viario (4,75 m)",
    modelVariant: "Turismo ligero estándar (Batalla 2,85 m, longitud total 4,75 m)",
    category: "Estándar viario — Turismo (AASHTO P / FGSV Pkw)"
  },
  standard_furgoneta_l2: {
    ...buildCombinedVehicle("standard_furgoneta_l2", "none"),
    id: "standard_furgoneta_l2",
    presetKey: "standard_furgoneta_l2",
    tractorKey: "standard_furgoneta_l2",
    trailerKey: "none",
    name: "Furgoneta estándar de reparto (L2) — Referencia diseño viario (5,93 m)",
    modelVariant: "Furgoneta comercial ligera N1 L2 (Batalla 3,665 m, longitud total 5,93 m)",
    category: "Estándar viario — Furgoneta comercial (5,93 m)"
  },
  spain_furgon_f: {
    ...buildCombinedVehicle("spain_furgon_f", "none"),
    id: "spain_furgon_f",
    presetKey: "spain_furgon_f",
    tractorKey: "spain_furgon_f",
    trailerKey: "none",
    name: "Furgón patrón (F) — Norma 3.1-IC",
    modelVariant: "Furgón ligero 2 ejes (Batalla 4,00 m, longitud total 6,35 m)",
    category: "Vehículo patrón oficial Norma 3.1-IC (Furgón F)"
  },
  // 2. ESTÁNDARES Y NORMATIVA — CAMIONES RÍGIDOS Y AUTOBUSES
  spain_camion_ligero_c: {
    ...buildCombinedVehicle("spain_camion_ligero_c", "none"),
    id: "spain_camion_ligero_c",
    presetKey: "spain_camion_ligero_c",
    tractorKey: "spain_camion_ligero_c",
    trailerKey: "none",
    name: "Camión rígido patrón (C) — Norma 3.1-IC",
    modelVariant: "Camión rígido 2 ejes (Batalla 6,25 m, longitud total 10,55 m)",
    category: "Vehículo patrón oficial Norma 3.1-IC (Camión C)"
  },
  spain_autobus_rigido_a: {
    ...buildCombinedVehicle("spain_autobus_rigido_a", "none"),
    id: "spain_autobus_rigido_a",
    presetKey: "spain_autobus_rigido_a",
    tractorKey: "spain_autobus_rigido_a",
    trailerKey: "none",
    name: "Autobús rígido 3 ejes patrón (A) — Norma 3.1-IC",
    modelVariant: "Autocar rígido 3 ejes (Batalla 7,45 m, longitud total 15,00 m)",
    category: "Vehículo patrón oficial Norma 3.1-IC (Autobús A)"
  },
  rigid_truck_2axle: {
    ...buildCombinedVehicle("rigid_truck_2axle", "none"),
    id: "rigid_truck_2axle",
    presetKey: "rigid_truck_2axle",
    tractorKey: "rigid_truck_2axle",
    trailerKey: "none",
    name: "Camión rígido 2 ejes (8,50 m)",
    modelVariant: "Camión rígido 2 ejes 4x2 (Batalla 4.500 mm, longitud total 8,50 m)",
    category: "Camión rígido de distribución 2 ejes (18 t)"
  },
  rigid_truck_3axle: {
    ...buildCombinedVehicle("rigid_truck_3axle", "none"),
    id: "rigid_truck_3axle",
    presetKey: "rigid_truck_3axle",
    tractorKey: "rigid_truck_3axle",
    trailerKey: "none",
    name: "Camión rígido 3 ejes (10,20 m)",
    modelVariant: "Camión rígido 3 ejes 6x2 (Batalla 5.100 mm, longitud total 10,20 m)",
    category: "Camión rígido pesado 3 ejes (26 t)"
  },
  city_bus_12m: {
    ...buildCombinedVehicle("city_bus_12m", "none"),
    id: "city_bus_12m",
    presetKey: "city_bus_12m",
    tractorKey: "city_bus_12m",
    trailerKey: "none",
    name: "Autobús urbano estándar clase I (12,00 m)",
    modelVariant: "Autobús urbano rígido estándar clase I (Batalla 5.850 mm, longitud total 12,00 m)",
    category: "Transporte público urbano rígido (12,00 m)"
  },
  coach_bus_15m: {
    ...buildCombinedVehicle("coach_bus_15m", "none"),
    id: "coach_bus_15m",
    presetKey: "coach_bus_15m",
    tractorKey: "coach_bus_15m",
    trailerKey: "none",
    name: "Autobús interurbano 3 ejes (15,00 m)",
    modelVariant: "Autocar de largo recorrido 3 ejes (Batalla 7.100 mm, longitud total 15,00 m)",
    category: "Transporte de viajeros clase III (15,00 m)"
  },
  // 3. ESTÁNDARES Y NORMATIVA — ARTICULADOS, TRENES Y EMS
  spain_camion_articulado_t: {
    ...buildCombinedVehicle("spain_tractor_t", "spain_semitrailer_t"),
    id: "spain_camion_articulado_t",
    presetKey: "spain_camion_articulado_t",
    tractorKey: "spain_tractor_t",
    trailerKey: "spain_semitrailer_t",
    name: "Camión articulado patrón (T) — Norma 3.1-IC",
    modelVariant: "Tractora 4x2 (Batalla 3,90 m, h=0,70 m) + Semirremolque trídem 13,60 m (L_total 16,50 m)",
    category: "Vehículo patrón oficial Norma 3.1-IC (Vehículo articulado T)"
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
  },
  // 4. MARCAS COMERCIALES — CONJUNTOS ARTICULADOS
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
  road_train_1875: {
    id: "road_train_1875",
    name: "Tren de carretera europeo (18,75 m)",
    modelVariant: "Camión rígido 3 ejes (6x2) + Lanza con remolque de 2 ejes tándem",
    category: "Tren de carretera 5 ejes (18,75 m, 40 t)",
    verified: true,
    hasTrailer: true,
    tractor: {
      wheelbase: 4.800,
      frontOverhang: 1.400,
      rearOverhang: 2.200,
      width: 2.550,
      trackWidthFront: 2.050,
      trackWidthRear: 2.050,
      hitchOffset: -2.100,
      kerbTurningRadiusDeclared: 8.500,
      wallTurningRadiusDeclared: 9.600,
      maxSteerAngleDeg: 37.0,
      colorCab: 0x0284c7,
      colorStripe: 0x38bdf8
    },
    trailers: [
      {
        id: "drawbar_dolly",
        name: "Lanza directriz y tren delantero del remolque",
        wheelbase: 2.200,
        frontOverhang: 0.300,
        rearOverhang: 0.000,
        width: 2.500,
        hitchOffset: 0.000,
        axleCount: 1,
        color: 0x475569
      },
      {
        id: "trailer_body",
        name: "Caja de remolque secundario (8,20 m)",
        wheelbase: 4.800,
        frontOverhang: 1.200,
        rearOverhang: 2.200,
        width: 2.550,
        hitchOffset: 0.000,
        axleCount: 2,
        color: 0x0ea5e9
      }
    ],
    trailer: {
      wheelbase: 4.800,
      frontOverhang: 1.200,
      rearOverhang: 2.200,
      width: 2.550,
      axleCount: 2
    }
  },
  ems_megatruck_2525: {
    id: "ems_megatruck_2525",
    name: "Megacamión Euro-Modular EMS (25,25 m)",
    modelVariant: "Tractora 4x2 + Semirremolque 13,62 m con quinta rueda trasera + Semirremolque secundario",
    category: "Conjunto Euro-Modular EMS tipo B-Double / Dolly (25,25 m, 60 t)",
    verified: true,
    hasTrailer: true,
    tractor: {
      wheelbase: 3.800,
      frontOverhang: 1.400,
      rearOverhang: 0.800,
      width: 2.550,
      trackWidthFront: 2.150,
      trackWidthRear: 2.150,
      hitchOffset: 0.550,
      kerbTurningRadiusDeclared: 6.750,
      wallTurningRadiusDeclared: 7.450,
      maxSteerAngleDeg: 36.5,
      colorCab: 0x16a34a,
      colorStripe: 0x4ade80
    },
    trailers: [
      {
        id: "primary_semitrailer",
        name: "Semirremolque primario B-Link (13,62 m)",
        wheelbase: 7.700,
        frontOverhang: 1.600,
        rearOverhang: 4.200,
        width: 2.550,
        hitchOffset: 4.100,
        axleCount: 3,
        axleSpacing: 1.310,
        color: 0x15803d
      },
      {
        id: "secondary_semitrailer",
        name: "Semirremolque secundario (7,82 m)",
        wheelbase: 5.500,
        frontOverhang: 1.300,
        rearOverhang: 1.800,
        width: 2.550,
        hitchOffset: 0.000,
        axleCount: 2,
        axleSpacing: 1.310,
        color: 0x22c55e
      }
    ],
    trailer: {
      wheelbase: 7.700,
      frontOverhang: 1.600,
      rearOverhang: 4.200,
      width: 2.550,
      axleCount: 3
    }
  }
};

/**
 * Calcula la batalla efectiva (L_t,ef) de un semirremolque o remolque teniendo en cuenta
 * la separación entre ejes del trídem, el rozamiento transversal en seco (tire scrub)
 * y la presencia de ejes autodireccionales pasivos (KIN-03).
 *
 * @param {object} trailer Especificación del remolque o semirremolque
 * @returns {number} Batalla efectiva en metros
 */
export function computeEffectiveTrailerWheelbase(trailer) {
  if (!trailer) return 0;
  const baseL = Number(trailer.wheelbase || 7.70);
  const axleCount = Number(trailer.axleCount || 3);
  const axleSpacing = Number(trailer.axleSpacing || 1.31);

  // Eje 3 autodireccional pasivo: al no generar resistencia lateral en curva lenta,
  // el centro instantáneo de rotación se desplaza al punto medio entre los ejes 1 y 2
  if (
    trailer.selfSteeringAxle === "axle3" ||
    trailer.hasSelfSteeringAxle ||
    trailer.axleConfiguration === "tridem_self_steering_3rd"
  ) {
    return Number((baseL - axleSpacing / 2).toFixed(4));
  }

  // Corrección empírica directa
  if (trailer.effectiveWheelbaseCorrectionM !== undefined) {
    return Number((baseL + Number(trailer.effectiveWheelbaseCorrectionM)).toFixed(4));
  }

  // Trídem rígido convencional de 3 ejes: rozamiento lateral en seco desplaza ligeramente
  // el centro de rotación efectivo hacia atrás (+0,12 m)
  if (
    (axleCount === 3 && trailer.applyTireScrubCorrection) ||
    trailer.axleConfiguration === "tridem_rigid"
  ) {
    return Number((baseL + 0.12).toFixed(4));
  }

  return baseL;
}

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
  const isRigid = !vehicle.hasTrailer || !tr;

  const tractorLength = tv.wheelbase + tv.frontOverhang + tv.rearOverhang;
  const trailerLength = isRigid ? 0 : (tr.wheelbase + tr.frontOverhang + tr.rearOverhang);
  const effectiveTrailerWheelbase = isRigid ? 0 : computeEffectiveTrailerWheelbase(tr);

  let totalCoupledLength;
  let kingpinToRear = 0;
  let frontSwingRadius = 0;

  if (isRigid) {
    totalCoupledLength = tractorLength;
  } else {
    // En alineación recta, el kingpin está en x = hitchOffset respecto al eje motriz.
    // El extremo delantero del conjunto es max(wheelbase + frontOverhang, hitchOffset + trailer.frontOverhang)
    // El extremo trasero del conjunto es min(-rearOverhang, hitchOffset - trailer.wheelbase - trailer.rearOverhang)
    const frontExtremeX = Math.max(tv.wheelbase + tv.frontOverhang, tv.hitchOffset + tr.frontOverhang);
    const rearExtremeX = Math.min(-tv.rearOverhang, tv.hitchOffset - tr.wheelbase - tr.rearOverhang);
    totalCoupledLength = frontExtremeX - rearExtremeX;
    kingpinToRear = tr.wheelbase + tr.rearOverhang;
    frontSwingRadius = Math.hypot(tr.frontOverhang, tr.width / 2);
  }

  const trackFront = tv.trackWidthFront || (tv.width - 0.40);
  let minRefRadius;
  let minKerbTurningRadius;
  let steerAngleEquivDeg;
  let steerAngleExtDeg;
  let steerAngleIntDeg;

  if (tv.kerbTurningRadiusDeclared && Number(tv.kerbTurningRadiusDeclared) > tv.wheelbase) {
    // KIN-01: Homologación geométrica de Ackermann con radios oficiales de fabricantes
    minKerbTurningRadius = Number(tv.kerbTurningRadiusDeclared);
    const radSq = minKerbTurningRadius ** 2 - tv.wheelbase ** 2;
    minRefRadius = Math.max(0.5, Math.sqrt(Math.max(0.1, radSq)) - trackFront / 2);
    steerAngleEquivDeg = (Math.atan(tv.wheelbase / minRefRadius) * 180) / Math.PI;
    steerAngleExtDeg = (Math.asin(tv.wheelbase / minKerbTurningRadius) * 180) / Math.PI;
    steerAngleIntDeg = (Math.atan(tv.wheelbase / Math.max(0.5, minRefRadius - trackFront / 2)) * 180) / Math.PI;
  } else {
    const maxSteerRad = (tv.maxSteerAngleDeg * Math.PI) / 180;
    minRefRadius = tv.wheelbase / Math.tan(maxSteerRad);
    minKerbTurningRadius = Math.hypot(tv.wheelbase, minRefRadius + trackFront / 2);
    steerAngleEquivDeg = tv.maxSteerAngleDeg;
    steerAngleExtDeg = (Math.asin(tv.wheelbase / minKerbTurningRadius) * 180) / Math.PI;
    steerAngleIntDeg = (Math.atan(tv.wheelbase / Math.max(0.5, minRefRadius - trackFront / 2)) * 180) / Math.PI;
  }

  const minWallTurningRadius = Math.hypot(tv.wheelbase + tv.frontOverhang, minRefRadius + tv.width / 2);

  return {
    tractorLength: Number(tractorLength.toFixed(3)),
    trailerLength: Number(trailerLength.toFixed(3)),
    effectiveTrailerWheelbase: Number(effectiveTrailerWheelbase.toFixed(3)),
    totalCoupledLength: Number(totalCoupledLength.toFixed(3)),
    kingpinToRear: Number(kingpinToRear.toFixed(3)),
    frontSwingRadius: Number(frontSwingRadius.toFixed(3)),
    minRefRadius: Number(minRefRadius.toFixed(3)),
    minKerbTurningRadius: Number(minKerbTurningRadius.toFixed(3)),
    minKerbTurningDiameter: Number((2 * minKerbTurningRadius).toFixed(3)),
    minWallTurningRadius: Number(minWallTurningRadius.toFixed(3)),
    minWallTurningDiameter: Number((2 * minWallTurningRadius).toFixed(3)),
    steerAngleEquivDeg: Number(steerAngleEquivDeg.toFixed(2)),
    steerAngleExtDeg: Number(steerAngleExtDeg.toFixed(2)),
    steerAngleIntDeg: Number(steerAngleIntDeg.toFixed(2))
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
  const isRigid = !vehicle.hasTrailer || !tr;

  if (!tv) {
    return { valid: false, errors: ["Falta la definición del chasis del vehículo."], warnings };
  }
  if (!isRigid && !tr) {
    return { valid: false, errors: ["Falta la definición del semirremolque en el conjunto articulado."], warnings };
  }

  const maxWb = isRigid ? 8.5 : 6.5;
  const maxFo = isRigid ? 3.0 : 2.5;
  const maxRo = isRigid ? 4.5 : 2.5;

  if (!(tv.wheelbase >= 2.0 && tv.wheelbase <= maxWb)) {
    errors.push(`La batalla del vehículo (${tv.wheelbase} m) debe estar entre 2,00 m y ${maxWb.toFixed(2)} m.`);
  }
  if (!(tv.frontOverhang >= 0.5 && tv.frontOverhang <= maxFo)) {
    errors.push(`El voladizo delantero (${tv.frontOverhang} m) debe estar entre 0,50 m y ${maxFo.toFixed(2)} m.`);
  }
  if (!(tv.rearOverhang >= 0.3 && tv.rearOverhang <= maxRo)) {
    errors.push(`El voladizo trasero (${tv.rearOverhang} m) debe estar entre 0,30 m y ${maxRo.toFixed(2)} m.`);
  }
  if (!(tv.width >= 1.8 && tv.width <= 3.2)) {
    errors.push(`La anchura (${tv.width} m) debe estar entre 1,80 m y 3,20 m.`);
  }
  const isMultiBody = Boolean(vehicle.trailers && vehicle.trailers.length > 0);
  const minHitch = isMultiBody ? -Math.max(3.0, (tv.rearOverhang || 0) + 0.5) : -1.5;
  if (!isRigid && !(tv.hitchOffset >= minHitch && tv.hitchOffset <= 2.0)) {
    errors.push(`El desplazamiento de la quinta rueda o enganche (${tv.hitchOffset} m) está fuera del rango admisible (${minHitch.toFixed(2)} m a +2,00 m).`);
  }
  if (!(tv.maxSteerAngleDeg >= 15 && tv.maxSteerAngleDeg <= 60)) {
    errors.push(`El ángulo máximo de dirección (${tv.maxSteerAngleDeg}°) debe estar entre 15° y 60°.`);
  }

  if (!isRigid) {
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
  }

  // Comprobaciones normativas (Directiva 96/53/CE y RD 2822/1998)
  const metrics = computeDerivedVehicleMetrics(vehicle);
  if (!isRigid) {
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
        `El voladizo frontal del semirremolque (${tr.frontOverhang.toFixed(2)} m) supera la cota cilíndrica de 2,04 m desde el kingpin de la Directiva 96/53/CE.`
      );
    } else if (metrics.frontSwingRadius > 2.04 && !tr.chamferedCorners && !tr.frontSwingRadiusDeclared) {
      warnings.push(
        `El radio diagonal rectangular a las esquinas (${metrics.frontSwingRadius.toFixed(2)} m) excede 2,04 m (Directiva 96/53/CE). Requiere esquinas achaflanadas o redondeadas reglamentarias.`
      );
    }
  } else {
    if (metrics.totalCoupledLength > 15.00) {
      warnings.push(
        `Longitud total (${metrics.totalCoupledLength.toFixed(2)} m) superior al límite máximo de 15,00 m para autobuses de 3 ejes (Directiva 96/53/CE y RD 2822/1998).`
      );
    }
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

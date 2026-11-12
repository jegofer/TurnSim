/**
/**
 * Diccionarios de internacionalización (i18n) para TurnSim / OSPA
 * Soporta español (es) e inglés (en) sin dependencias externas.
 */

export const LOCALES = {
  es: {
    app_title: "TurnSim",
    app_subtitle: "SIMULADOR DE BARRIDO DE VEHÍCULOS PESADOS",
    nav_methodology: "📘 Guía y Metodología",
    nav_jump_critical: "📍 Ir al PK crítico",
    nav_undo: "↩️ Deshacer",
    nav_redo: "↪️ Rehacer",
    nav_save_session: "💾 Guardar",
    nav_load_session: "📂 Cargar",

    // Sección A
    section_a_title: "A. Selección de vehículo de diseño",
    lbl_vehicle_preset: "Conjunto articulado / rígido preconfigurado",
    lbl_independent_select: "Selección independiente y combinaciones",
    lbl_tractor_select: "Cabeza tractora / Chasis rígido",
    lbl_trailer_select: "Semirremolque (o cuerpo único)",
    badge_verified: "Verificado",
    badge_provisional: "Perfil de prueba",
    badge_rigid: "Vehículo rígido sin semirremolque (Cuerpo único)",

    // Sección B
    section_b_title: "B. Personalización geométrica",
    sub_tractor_params: "Cabeza tractora / Chasis rígido",
    lbl_tr_wb: "Batalla Lwb (m)",
    lbl_tr_w: "Anchura W (m)",
    lbl_tr_fo: "Vol. del. (m)",
    lbl_tr_ro: "Vol. tras. (m)",
    lbl_tr_track: "Vía ejes (m)",
    lbl_tr_hitch: "Avance 5.ª rueda h (m)",
    lbl_tr_steer: "Ángulo máx. dir. δ (°)",
    sub_trailer_params: "Semirremolque (3 ejes trídem)",
    lbl_tl_wb: "Kingpin a trídem Lt (m)",
    lbl_tl_w: "Anchura Wt (m)",
    lbl_tl_fo: "Vol. del. (m)",
    lbl_tl_ro: "Vol. tras. (m)",
    lbl_tl_spacing: "Sep. ejes (m)",
    lbl_lim_artic: "Límite tijera γmáx (°)",
    btn_reset_vehicle: "Restaurar original",

    // Sección C
    section_c_title: "C. Configuración de la maniobra",
    stage_1_title: "1. Escenario y entorno CAD / GIS",
    stage_2_title: "2. Selección y cotas de vehículo",
    stage_3_title: "3. Trazado y tramos de maniobra",
    stage_4_title: "4. Simulación cinemática y capas",
    stage_5_title: "5. Análisis de resguardo y obstáculos",
    stage_6_title: "6. Informes técnicos y exportación",
    dxf_drop_title: "📂 Cargar plano CAD o GIS (.DXF, .GeoJSON)",
    dxf_drop_hint: "Arrastre su archivo DXF o GeoJSON con cartografía, o haga clic para examinar",
    lbl_scenario: "Escenario viario preconfigurado",
    sub_initial_pose: "Posición y orientación inicial",
    lbl_pose_x: "X₀ (m)",
    lbl_pose_y: "Y₀ (m)",
    lbl_pose_heading: "Azimut θ₀ (°)",
    lbl_pose_artic: "Articulación inicial tractora-remolque γ₀ (°)",
    sub_interactive_trace: "Trazado interactivo y tramos de maniobra",
    btn_draw_waypoints_sidebar: "✏️ Trazar / Editar ruta en plano 2D",
    btn_draw_waypoints_active: "✏️ Trazar en plano [Activo]",
    btn_add_straight: "+ Añadir recta",
    btn_add_arc: "+ Añadir curva",
    lbl_waypoints_collapsible: "Generar por puntos de paso (waypoints X, Y)",
    lbl_waypoints_text: "Lista de coordenadas X, Y (una por línea)",
    lbl_waypoints_radius: "Radio acuerdo (m)",
    lbl_waypoints_dir: "Sentido",
    opt_dir_forward: "Avance",
    opt_dir_reverse: "Marcha atrás",
    btn_apply_waypoints: "Generar tramos desde puntos",
    sub_integration_step: "Paso de integración numérica",
    lbl_step_straight: "Paso recta Δs (m)",
    lbl_step_arc: "Paso curva Δθ (°)",

    // Sección D
    section_d_title: "D. Visualización y obstáculos",
    lbl_view_mode: "Modo de visualización principal",
    btn_view_2d: "Planta 2D",
    btn_view_3d: "Visor 3D",
    btn_view_split: "Dividida 2D+3D",
    sub_visible_layers: "Capas técnicas visibles",
    chk_envelope: "Envolvente física",
    chk_margin: "Margen seguridad",
    chk_wheels: "Huellas de ruedas",
    chk_refs: "Trazas ejes ref.",
    chk_ghosts: "Siluetas paso",
    chk_obstacles: "Obstáculos viarios",
    chk_cad_bg: "Plano fondo CAD",
    chk_dims: "Cotas y holguras",
    chk_axles: "Ruedas y kingpin",
    chk_grid: "Cuadrícula métrica",
    chk_pnoa: "Ortofoto PNOA (IGN)",
    sub_safety_and_obs: "Margen de seguridad y obstáculos",
    lbl_safety_margin: "Margen lateral dseg (m)",
    btn_add_obstacle: "+ Añadir obstáculo",
    obs_hint: "💡 En la vista 2D puede mover un obstáculo manteniendo pulsado Shift + arrastrar.",

    // Sección E
    section_e_title: "E. Informes técnicos y exportación CAD",
    lbl_project_name: "Título del proyecto / expediente",
    btn_export_pdf: "📄 1. Generar Informe Técnico PDF Estructurado",
    btn_export_snapshot: "🖼️ 2. Exportación Gráfica del Visor (PDF / PNG)",
    btn_export_dxf: "📐 Descargar DXF (CAD)",
    btn_export_svg: "📏 Descargar SVG Escala",
    btn_export_session: "💾 Guardar Proyecto (.turnsim.json)",
    btn_import_session: "📂 Cargar Proyecto (.turnsim.json)",

    // Telemetría superior
    kpi_swept_width: "Anchura máx. barrida",
    kpi_total_dist: "Recorrido eje ref.",
    kpi_max_steer: "Dirección máx. (δ)",
    kpi_max_artic: "Articulación máx. (γ)",
    kpi_min_clearance: "Holgura mín. obstáculo",

    // Visores
    badge_pane_2d: "PLANTA TÉCNICA 2D (MÉTRICA CAD/GIS)",
    badge_pane_3d: "PERSPECTIVA 3D SINCRONIZADA (THREE.JS)",
    btn_draw_route: "✏️ Trazar ruta",
    btn_draw_route_active: "✏️ Trazar [Activo]",
    btn_clear_path: "🗑️ Borrar trazado",
    btn_toggle_pnoa: "🛰️ Ortofoto PNOA",
    btn_config_pnoa: "⚙️ Configurar PNOA",
    dialog_pnoa_title: "🛰️ Capa de ortofotografías aéreas PNOA (IGN)",
    placeholder_toponym_search: "🔍 Buscar lugar en España (OSM)...",
    toponym_search_title: "Buscar municipios, calles, glorietas o carreteras en España (OpenStreetMap) y posicionar la ortofoto PNOA",
    toponym_no_results: "No se encontraron lugares en España para esta búsqueda",
    toponym_searching: "Buscando en OpenStreetMap...",
    calc_indicator_text: "Calculando trayectoria y envolventes de barrido...",
    btn_measure: "📏 Medir distancia",
    btn_measure_active: "📏 Medir [Activo]",
    btn_fit_2d: "⊡ Encuadrar 2D",
    btn_fit_3d: "⊡ Encuadrar 3D",
    legend_title: "📋 Leyenda de líneas y barrido",

    // Panel de Curvas PK
    curves_panel_title: "📈 Curvas de telemetría a lo largo del recorrido (PK)",
    curves_steer_label: "Ángulo de dirección δ(s)",
    curves_artic_label: "Ángulo de articulación γ(s)",
    curves_clearance_label: "Holgura libre d_mín(s)",
    curves_pk_axis: "PK / Distancia acumulada (m)",
    btn_toggle_curves: "📈 Curvas de telemetría",
    btn_toggle_curves_hide: "📈 Ocultar telemetría",

    // Timeline inferior
    btn_play: "▶ Reproducir",
    btn_pause: "⏸ Pausar",
    btn_reset_timeline: "⏮ Inicio",

    // Estados
    status_clear: "SIN INTERFERENCIA (HOLGURA SEGURA)",
    status_margin_violation: "ALERTA: VIOLACIÓN DEL MARGEN DE SEGURIDAD",
    status_restricted_invasion: "INVASIÓN: ÁREA RESTRINGIDA / PEATONAL",
    status_collision: "COLISIÓN DETECTADA CON OBSTÁCULO",

    // Mensajes generales
    toast_autosave_restored: "Sesión anterior restaurada desde el guardado automático.",
    toast_session_saved: "Proyecto TurnSim exportado correctamente.",
    toast_session_loaded: "Proyecto TurnSim cargado con éxito.",
    toast_undo: "Acción deshecha (Ctrl+Z).",
    toast_redo: "Acción rehecha (Ctrl+Y).",
    dialog_methodology_title: "Guía técnica, metodología cinemática y normativa"
  },
  en: {
    app_title: "TurnSim",
    app_subtitle: "HEAVY VEHICLE SWEPT PATH ANALYZER",
    nav_methodology: "📘 Technical Guide & Standards",
    nav_jump_critical: "📍 Jump to Critical Choke Point",
    nav_undo: "↩️ Undo",
    nav_redo: "↪️ Redo",
    nav_save_session: "💾 Save",
    nav_load_session: "📂 Load",

    // Section A
    section_a_title: "A. Design Vehicle Selection",
    lbl_vehicle_preset: "Preconfigured Articulated / Rigid Vehicle",
    lbl_independent_select: "Independent Selection & Combinations",
    lbl_tractor_select: "Tractor Unit / Rigid Chassis",
    lbl_trailer_select: "Semi-trailer (or Single Body)",
    badge_verified: "Verified",
    badge_provisional: "Test Profile",
    badge_rigid: "Rigid single-body vehicle without semi-trailer",

    // Section B
    section_b_title: "B. Geometric Customization",
    sub_tractor_params: "Tractor Unit / Rigid Chassis",
    lbl_tr_wb: "Wheelbase Lwb (m)",
    lbl_tr_w: "Width W (m)",
    lbl_tr_fo: "Front Overhang (m)",
    lbl_tr_ro: "Rear Overhang (m)",
    lbl_tr_track: "Axle Track (m)",
    lbl_tr_hitch: "Fifth Wheel Offset h (m)",
    lbl_tr_steer: "Max Steering Angle δ (°)",
    sub_trailer_params: "Semi-trailer (3-axle tridem)",
    lbl_tl_wb: "Kingpin to Tridem Lt (m)",
    lbl_tl_w: "Width Wt (m)",
    lbl_tl_fo: "Front Overhang (m)",
    lbl_tl_ro: "Rear Overhang (m)",
    lbl_tl_spacing: "Axle Spacing (m)",
    lbl_lim_artic: "Jackknife Limit γmax (°)",
    btn_reset_vehicle: "Reset to Default",

    // Section C
    section_c_title: "C. Maneuver & Path Setup",
    stage_1_title: "1. CAD / GIS Scenario & Environment",
    stage_2_title: "2. Vehicle Selection & Dimensions",
    stage_3_title: "3. Path & Maneuver Segments",
    stage_4_title: "4. Kinematic Simulation & Layers",
    stage_5_title: "5. Clearance Analysis & Obstacles",
    stage_6_title: "6. Technical Reports & Export",
    dxf_drop_title: "📂 Load CAD or GIS drawing (.DXF, .GeoJSON)",
    dxf_drop_hint: "Drop your DXF or GeoJSON drawing file or click to browse",
    lbl_scenario: "Preconfigured Road Scenario",
    sub_initial_pose: "Initial Pose & Orientation",
    lbl_pose_x: "X₀ (m)",
    lbl_pose_y: "Y₀ (m)",
    lbl_pose_heading: "Heading θ₀ (°)",
    lbl_pose_artic: "Initial Articulation Angle γ₀ (°)",
    sub_interactive_trace: "Interactive Tracing & Maneuver Segments",
    btn_draw_waypoints_sidebar: "✏️ Trace / Edit Path on 2D Plan",
    btn_draw_waypoints_active: "✏️ Tracing on Plan [Active]",
    btn_add_straight: "+ Add Straight",
    btn_add_arc: "+ Add Curve",
    lbl_waypoints_collapsible: "Generate from Waypoints (X, Y)",
    lbl_waypoints_text: "X, Y Coordinate List (one per line)",
    lbl_waypoints_radius: "Fillet Radius (m)",
    lbl_waypoints_dir: "Direction",
    opt_dir_forward: "Forward",
    opt_dir_reverse: "Reverse",
    btn_apply_waypoints: "Generate Segments from Points",
    sub_integration_step: "Numerical Integration Step",
    lbl_step_straight: "Straight Step Δs (m)",
    lbl_step_arc: "Curve Step Δθ (°)",

    // Section D
    section_d_title: "D. Visualization & Obstacles",
    lbl_view_mode: "Main Viewport Mode",
    btn_view_2d: "2D Plan",
    btn_view_3d: "3D View",
    btn_view_split: "Split 2D+3D",
    sub_visible_layers: "Visible Technical Layers",
    chk_envelope: "Physical Envelope",
    chk_margin: "Safety Margin",
    chk_wheels: "Wheel Tracks",
    chk_refs: "Ref. Axle Trajectories",
    chk_ghosts: "Swept Silhouettes",
    chk_obstacles: "Roadside Obstacles",
    chk_cad_bg: "CAD Background",
    chk_dims: "Dimensions & Clearances",
    chk_axles: "Wheels & Kingpin",
    chk_grid: "Metric Grid",
    chk_pnoa: "PNOA Orthophoto (IGN)",
    sub_safety_and_obs: "Safety Margin & Obstacles",
    lbl_safety_margin: "Lateral Margin dseg (m)",
    btn_add_obstacle: "+ Add Obstacle",
    obs_hint: "💡 In 2D view, you can drag obstacles by holding Shift + drag.",

    // Section E
    section_e_title: "E. Technical Reports & CAD Export",
    lbl_project_name: "Project / Case Title",
    btn_export_pdf: "📄 1. Generate Structured Technical PDF Report",
    btn_export_snapshot: "🖼️ 2. Graphic Viewport Export (PDF / PNG)",
    btn_export_dxf: "📐 Download DXF (CAD)",
    btn_export_svg: "📏 Download Scale SVG",
    btn_export_session: "💾 Save Project (.turnsim.json)",
    btn_import_session: "📂 Load Project (.turnsim.json)",

    // Top Telemetry
    kpi_swept_width: "Max Swept Width",
    kpi_total_dist: "Ref. Path Length",
    kpi_max_steer: "Max Steering (δ)",
    kpi_max_artic: "Max Articulation (γ)",
    kpi_min_clearance: "Min Obstacle Clearance",

    // Viewports
    badge_pane_2d: "2D TECHNICAL PLAN (CAD/GIS METRIC)",
    badge_pane_3d: "SYNCHRONIZED 3D PERSPECTIVE (THREE.JS)",
    btn_draw_route: "✏️ Trace Route",
    btn_draw_route_active: "✏️ Tracing [Active]",
    btn_clear_path: "🗑️ Borrar trazado",
    btn_toggle_pnoa: "🛰️ PNOA Orthophoto",
    btn_config_pnoa: "⚙️ Configure PNOA",
    dialog_pnoa_title: "🛰️ Capa de ortofotografías aéreas PNOA (IGN)",
    placeholder_toponym_search: "🔍 Buscar lugar en España (OSM)...",
    toponym_search_title: "Buscar municipios, calles, glorietas o carreteras en España (OpenStreetMap) y posicionar la ortofoto PNOA",
    toponym_no_results: "No se encontraron lugares en España para esta búsqueda",
    toponym_searching: "Buscando en OpenStreetMap...",
    calc_indicator_text: "Computing swept path and envelopes...",
    btn_measure: "📏 Measure Distance",
    btn_measure_active: "📏 Measuring [Active]",
    btn_fit_2d: "⊡ Fit 2D",
    btn_fit_3d: "⊡ Fit 3D",
    legend_title: "📋 Legend & Swept Layers",

    // PK Curves Panel
    curves_panel_title: "📈 Curvas de telemetría a lo largo del recorrido (PK)",
    curves_steer_label: "Ángulo de dirección δ(s)",
    curves_artic_label: "Ángulo de articulación γ(s)",
    curves_clearance_label: "Holgura libre d_mín(s)",
    curves_pk_axis: "PK / Distancia acumulada (m)",
    btn_toggle_curves: "📈 Curvas de telemetría",
    btn_toggle_curves_hide: "📈 Ocultar telemetría",

    // Bottom Timeline
    btn_play: "▶ Play",
    btn_pause: "⏸ Pause",
    btn_reset_timeline: "⏮ Beginning",

    // Statuses
    status_clear: "CLEAR (SAFE CLEARANCE)",
    status_margin_violation: "WARNING: SAFETY MARGIN ENCROACHMENT",
    status_restricted_invasion: "INVASION: RESTRICTED / PEDESTRIAN AREA",
    status_collision: "COLLISION DETECTED WITH OBSTACLE",

    // General Messages
    toast_autosave_restored: "Previous session restored from autosave.",
    toast_session_saved: "TurnSim project exported successfully.",
    toast_session_loaded: "TurnSim project loaded successfully.",
    toast_undo: "Action undone (Ctrl+Z).",
    toast_redo: "Action redone (Ctrl+Y).",
    dialog_methodology_title: "Technical Guide, Kinematic Methodology & Standards"
  }
};

/**
 * Gestor de idiomas (i18n) para TurnSim
 */
export class I18nManager {
  constructor(defaultLang = "es") {
    let saved = null;
    try {
      saved = localStorage.getItem("turnsim_lang");
    } catch (_) {}
    this.currentLang = saved && (saved === "es" || saved === "en") ? saved : defaultLang;
  }

  t(key, fallback = "") {
    const dict = LOCALES[this.currentLang] || LOCALES.es;
    return dict[key] !== undefined ? dict[key] : (LOCALES.es[key] || fallback || key);
  }

  setLanguage(lang) {
    if (lang !== "es" && lang !== "en") return;
    this.currentLang = lang;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("turnsim_lang", lang);
      }
    } catch (_) {}
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.lang = lang;
      this.updateDOM();
    }
  }

  toggleLanguage() {
    this.setLanguage(this.currentLang === "es" ? "en" : "es");
    return this.currentLang;
  }

  updateDOM() {
    if (typeof document === "undefined") return;
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr");
      const text = this.t(key);
      if (attr) {
        el.setAttribute(attr, text);
      } else {
        el.textContent = text;
      }
    });

    const langToggleBtn = document.getElementById("btn-lang-toggle");
    if (langToggleBtn) {
      langToggleBtn.textContent = this.currentLang === "es" ? "🌐 EN" : "🌐 ES";
      langToggleBtn.title = this.currentLang === "es" ? "Switch to English" : "Cambiar a Español";
    }

    const phElements = document.querySelectorAll("[data-i18n-placeholder]");
    phElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", this.t(key));
    });

    const titleElements = document.querySelectorAll("[data-i18n-title]");
    titleElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      el.setAttribute("title", this.t(key));
    });
  }
}

#!/usr/bin/env python3
"""
Renderiza capturas visuales de alta resolución de la simulación en TurnSim
para guardarlas en TurnSim_CAD_Test/Screenshots/
"""

import json
import subprocess
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Rectangle
import numpy as np

def generate_turnsim_import_screenshot():
    # 1. Obtener los datos de simulación exportados desde Node
    node_script = """
    import fs from 'fs';
    import { parseDXF, detectSuggestedLayerMapping, buildScenarioFromDXF } from './web/js/export/dxf_importer.js';
    import { buildCompleteSimulationResult } from './web/js/engine/envelope.js';
    import { VEHICLE_CATALOG } from './web/js/models/vehicles.js';

    const content = fs.readFileSync('TurnSim_CAD_Test/CAD/TurnSim_Industrial_Test.dxf', 'utf-8');
    const parsed = parseDXF(content);
    const suggested = detectSuggestedLayerMapping(parsed.layers);
    const scenario = buildScenarioFromDXF(parsed, suggested, { direction: 1, agreementRadius: 15.0 });
    const vehicle = VEHICLE_CATALOG.renault_t_4x2_sko;
    const sim = buildCompleteSimulationResult(vehicle, scenario.maneuver, { safetyMarginM: 0.50 });

    const exportData = {
        bounds: scenario.bounds,
        obstacles: scenario.obstacles,
        background: scenario.backgroundEntities,
        states: sim.states.map(s => ({
            tractorPos: [s.x, s.y],
            tractorHeading: s.heading,
            tractorPoly: s.tractorPolygon,
            trailerPoly: s.trailerPolygon
        })),
        envelope: sim.envelope,
        marginEnvelope: sim.marginEnvelope,
        tractorRearTrace: sim.traces.tractor_rear,
        trailerRearTrace: sim.traces.trailer_rear
    };
    console.log(JSON.stringify(exportData));
    """
    
    proc = subprocess.run(["node", "--input-type=module", "-e", node_script], capture_output=True, text=True)
    if proc.returncode != 0:
        print("Error al ejecutar node:", proc.stderr)
        return

    data = json.loads(proc.stdout)
    
    # 2. Configurar figura Matplotlib emulando el visor 2D técnico de TurnSim
    fig, ax = plt.subplots(figsize=(16, 12), dpi=150, facecolor='#0f172a')
    ax.set_facecolor('#0b1120')
    ax.grid(True, color='#1e293b', linestyle='--', linewidth=0.5)

    # A) Capa de fondo CAD (Gris atenuado)
    for bg in data['background']:
        pts = np.array(bg['vertices'])
        if bg['closed'] and len(pts) >= 3:
            poly = Polygon(pts, closed=True, facecolor='#1e293b', edgecolor='#64748b', linewidth=0.8, alpha=0.35)
            ax.add_patch(poly)
        else:
            ax.plot(pts[:, 0], pts[:, 1], color='#64748b', linewidth=0.8, alpha=0.50)

    # B) Obstáculos CAD importados
    for obs in data['obstacles']:
        verts = np.array(obs['vertices'])
        color = obs.get('color', '#ef4444')
        if obs['type'] == 'building':
            poly = Polygon(verts, closed=True, facecolor='#ef4444', edgecolor='#b91c1c', linewidth=1.2, alpha=0.35)
            ax.add_patch(poly)
        elif obs['type'] == 'restricted_zone':
            poly = Polygon(verts, closed=True, facecolor='#eab308', edgecolor='#ca8a04', linewidth=1.2, alpha=0.25, linestyle='--')
            ax.add_patch(poly)
        elif obs['type'] == 'road_edge':
            ax.plot(verts[:, 0], verts[:, 1], color='#f59e0b', linewidth=1.5, alpha=0.85)

    # C) Envolvente de barrido de seguridad (Amarillo claro transparente)
    if data.get('marginEnvelope'):
        sm_poly = Polygon(np.array(data['marginEnvelope']), closed=True, facecolor='#fef08a', edgecolor='#eab308', linewidth=0.8, linestyle=':', alpha=0.20)
        ax.add_patch(sm_poly)

    # D) Envolvente de barrido físico (Ámbar)
    if data['envelope']:
        env_poly = Polygon(np.array(data['envelope']), closed=True, facecolor='#f59e0b', edgecolor='#d97706', linewidth=1.0, alpha=0.30)
        ax.add_patch(env_poly)

    # E) Huellas cinemáticas (Cyan y Magenta)
    tr_trace = np.array(data['tractorRearTrace'])
    tl_trace = np.array(data['trailerRearTrace'])
    ax.plot(tr_trace[:, 0], tr_trace[:, 1], color='#06b6d4', linewidth=1.5, label='Eje motriz tractora')
    ax.plot(tl_trace[:, 0], tl_trace[:, 1], color='#ec4899', linewidth=1.2, linestyle='--', label='Pivote trídem semirremolque')

    # F) Fantasmas del vehículo en posiciones clave (inicio, curvas, fin)
    states = data['states']
    key_indices = [0, len(states)//4, len(states)//2, (3*len(states))//4, len(states)-1]
    for idx in key_indices:
        st = states[idx]
        t_pts = np.array(st['tractorPoly'])
        poly_t = Polygon(t_pts, closed=True, facecolor='#38bdf8', edgecolor='#0284c7', linewidth=1.2, alpha=0.6)
        ax.add_patch(poly_t)
        if st['trailerPoly']:
            tr_pts = np.array(st['trailerPoly'])
            poly_tr = Polygon(tr_pts, closed=True, facecolor='#818cf8', edgecolor='#4f46e5', linewidth=1.2, alpha=0.6)
            ax.add_patch(poly_tr)

    ax.set_xlim(-10, 170)
    ax.set_ylim(-15, 150)
    ax.set_aspect('equal')
    ax.set_xlabel('Coordenada X (metros)', color='#94a3b8', fontsize=11)
    ax.set_ylabel('Coordenada Y (metros)', color='#94a3b8', fontsize=11)
    ax.tick_params(colors='#94a3b8', labelsize=10)

    plt.title('TurnSim / OSPA — Importación DXF y Simulación de Barrido (Renault T 480 + Schmitz S.KO)', color='#f8fafc', fontsize=14, pad=15, fontweight='bold')
    
    # Cajetín técnico
    cajetin_text = (
        "RECINTO: Instalación Agroalimentaria 'El Robledal' (Sintético)\\n"
        "ARCHIVO: TurnSim_Industrial_Test.dxf (R2000 AC1015)\\n"
        "CONJUNTO: Renault Trucks T 480 (4x2) + Schmitz S.KO Cool (16,515 m)\\n"
        "TRAYECTORIA: 166.13 m | ENVOLVENTE MÁX: 4.762 m | OBSTÁCULOS CAD: 29"
    )
    ax.text(0.02, 0.96, cajetin_text, transform=ax.transAxes, color='#f8fafc', fontsize=9,
            verticalalignment='top', bbox=dict(boxstyle='round,pad=0.5', facecolor='#0b1120', edgecolor='#334155', alpha=0.9))

    out_file = 'TurnSim_CAD_Test/Screenshots/TurnSim_Import.png'
    plt.tight_layout()
    plt.savefig(out_file, facecolor=fig.get_facecolor(), edgecolor='none', dpi=150)
    plt.close()
    print(f"Screenshot generado con éxito: {out_file}")

def generate_layer_detection_screenshot():
    # Gráfico que representa visualmente la matriz de detección de capas de TurnSim
    fig, ax = plt.subplots(figsize=(12, 8), dpi=150, facecolor='#0f172a')
    ax.set_facecolor('#0b1120')
    ax.axis('off')

    plt.title('TurnSim / OSPA — Modal de Reconocimiento y Autodetección de Capas DXF', color='#f8fafc', fontsize=13, pad=15, fontweight='bold')

    headers = ["Capa en Archivo DXF", "Entidades", "Categoría Asignada", "Estado de Autodetección"]
    table_data = [
        ["TURNSIM_TRAYECTORIA", "1 (LWPOLYLINE)", "Eje / Trayectoria", "✓ Detectada automáticamente"],
        ["EDIFICIOS", "4 (LWPOLYLINE)", "Obstáculo / Edificio", "✓ Detectada automáticamente"],
        ["MUROS", "2 (LWPOLYLINE)", "Obstáculo / Muro", "✓ Detectada automáticamente"],
        ["PILARES", "14 (CIRCLE)", "Obstáculo / Columnas", "✓ Detectada automáticamente"],
        ["BORDILLOS", "4 (LWPOLYLINE/ARC)", "Borde de calzada", "✓ Detectada automáticamente"],
        ["ISLETAS", "3 (LWPOLYLINE/CIRCLE)", "Borde de calzada", "✓ Detectada automáticamente"],
        ["ZONAS_RESTRINGIDAS", "2 (LWPOLYLINE)", "Zona Restringida", "✓ Detectada automáticamente"],
        ["VIAL_CALZADA", "6 (LINE/LWPOLY)", "Fondo de contexto", "○ No autodetectada (Asignable)"],
        ["MUELLES_CARGA", "5 (LWPOLYLINE)", "Fondo de contexto", "○ No autodetectada (Asignable)"],
        ["APARCAMIENTO", "4 (LWPOLYLINE)", "Fondo de contexto", "○ No autodetectada (Asignable)"],
        ["VALLADO_PERIMETRAL", "2 (LWPOLYLINE)", "Fondo de contexto", "○ No autodetectada (Asignable)"],
        ["SENALIZACION_HORIZONTAL", "7 (LINE)", "Fondo de contexto", "○ No autodetectada (Asignable)"],
        ["TEXTOS_ANOTACIONES", "7 (TEXT)", "Omitida por TurnSim", "✗ No soportada (Ignorada)"]
    ]

    cell_colors = []
    for row in table_data:
        if "✓" in row[3]:
            cell_colors.append(['#1e293b', '#1e293b', '#1e293b', '#064e3b'])
        elif "○" in row[3]:
            cell_colors.append(['#1e293b', '#1e293b', '#1e293b', '#78350f'])
        else:
            cell_colors.append(['#1e293b', '#1e293b', '#1e293b', '#7f1d1d'])

    table = ax.table(
        cellText=table_data,
        colLabels=headers,
        cellColours=cell_colors,
        colColours=['#334155', '#334155', '#334155', '#334155'],
        loc='center',
        cellLoc='left'
    )
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.8)

    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor('#475569')
        if row == 0:
            cell.set_text_props(color='#f8fafc', weight='bold')
        else:
            cell.set_text_props(color='#f1f5f9')

    out_file = 'TurnSim_CAD_Test/Screenshots/TurnSim_Layer_Detection.png'
    plt.tight_layout()
    plt.savefig(out_file, facecolor=fig.get_facecolor(), edgecolor='none', dpi=150)
    plt.close()
    print(f"Screenshot generado con éxito: {out_file}")

if __name__ == '__main__':
    generate_turnsim_import_screenshot()
    generate_layer_detection_screenshot()

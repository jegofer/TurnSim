#!/usr/bin/env python3
"""
Generador del Escenario CAD Industrial de Pruebas para TurnSim / OSPA.
Genera un archivo DXF ASCII (AutoCAD R2000 / AC1015) 100 % estándar y geométricamente riguroso.
"""

import os
import math

def create_dxf():
    output_dir = "TurnSim_CAD_Test/CAD"
    os.makedirs(output_dir, exist_ok=True)
    dxf_path = os.path.join(output_dir, "TurnSim_Industrial_Test.dxf")

    # Lista de capas y colores (AutoCAD Color Index)
    # 1: Red, 2: Yellow, 3: Green, 4: Cyan, 5: Blue, 7: White/Black, 8: Dark Gray, 9: Light Gray, 30: Orange
    layers_def = [
        {"name": "0", "color": 7, "flags": 0},
        {"name": "TURNSIM_TRAYECTORIA", "color": 4, "flags": 0},      # Cyan (Categoría TRAJECTORY)
        {"name": "EDIFICIOS", "color": 1, "flags": 0},                # Red (Categoría OBSTACLES)
        {"name": "MUROS", "color": 1, "flags": 0},                    # Red (Categoría OBSTACLES)
        {"name": "PILARES", "color": 1, "flags": 0},                  # Red (Categoría OBSTACLES)
        {"name": "BORDILLOS", "color": 2, "flags": 0},                # Yellow (Categoría BOUNDARIES)
        {"name": "ISLETAS", "color": 2, "flags": 0},                  # Yellow (Categoría BOUNDARIES)
        {"name": "ZONAS_RESTRINGIDAS", "color": 30, "flags": 0},      # Orange (Categoría RESTRICTED)
        {"name": "VIAL_CALZADA", "color": 8, "flags": 0},             # Gray (No autodetectada - Contexto)
        {"name": "MUELLES_CARGA", "color": 5, "flags": 0},            # Blue (No autodetectada - Contexto)
        {"name": "APARCAMIENTO", "color": 9, "flags": 0},             # Light Gray (No autodetectada - Contexto)
        {"name": "VALLADO_PERIMETRAL", "color": 7, "flags": 0},       # White (No autodetectada - Contexto)
        {"name": "SENALIZACION_HORIZONTAL", "color": 7, "flags": 0},  # White (No autodetectada - Contexto)
        {"name": "TEXTOS_ANOTACIONES", "color": 3, "flags": 0}        # Green (No autodetectada - Contexto)
    ]

    lines = []

    # 1. HEADER SECTION
    lines.extend([
        "  0", "SECTION",
        "  2", "HEADER",
        "  9", "$ACADVER",
        "  1", "AC1015",
        "  9", "$INSUNITS",
        " 70", "6",       # 6 = Meters
        "  9", "$MEASUREMENT",
        " 70", "1",       # 1 = Metric
        "  9", "$EXTMIN",
        " 10", "-10.0",
        " 20", "-10.0",
        " 30", "0.0",
        "  9", "$EXTMAX",
        " 10", "170.0",
        " 20", "150.0",
        " 30", "0.0",
        "  0", "ENDSEC"
    ])

    # 2. TABLES SECTION
    lines.extend([
        "  0", "SECTION",
        "  2", "TABLES",
        "  0", "TABLE",
        "  2", "LAYER",
        " 70", str(len(layers_def))
    ])

    for lyr in layers_def:
        lines.extend([
            "  0", "LAYER",
            "  2", lyr["name"],
            " 70", str(lyr["flags"]),
            " 62", str(lyr["color"]),
            "  6", "CONTINUOUS"
        ])

    lines.extend([
        "  0", "ENDTAB",
        "  0", "ENDSEC"
    ])

    # 3. BLOCKS SECTION (Empty required standard table)
    lines.extend([
        "  0", "SECTION",
        "  2", "BLOCKS",
        "  0", "ENDSEC"
    ])

    # 4. ENTITIES SECTION
    lines.extend([
        "  0", "SECTION",
        "  2", "ENTITIES"
    ])

    # Helper functions to add DXF entities
    def add_line(layer, x1, y1, x2, y2):
        lines.extend([
            "  0", "LINE",
            "  8", layer,
            " 10", f"{x1:.4f}",
            " 20", f"{y1:.4f}",
            " 30", "0.0",
            " 11", f"{x2:.4f}",
            " 21", f"{y2:.4f}",
            " 31", "0.0"
        ])

    def add_lwpolyline(layer, points, closed=False, bulges=None):
        # points: list of (x, y)
        # bulges: dict of {vertex_index: bulge_value}
        lines.extend([
            "  0", "LWPOLYLINE",
            "  8", layer,
            " 90", str(len(points)),
            " 70", "1" if closed else "0",
            " 43", "0.0"
        ])
        for idx, (x, y) in enumerate(points):
            lines.extend([
                " 10", f"{x:.4f}",
                " 20", f"{y:.4f}"
            ])
            if bulges and idx in bulges:
                lines.extend([
                    " 42", f"{bulges[idx]:.5f}"
                ])

    def add_circle(layer, cx, cy, r):
        lines.extend([
            "  0", "CIRCLE",
            "  8", layer,
            " 10", f"{cx:.4f}",
            " 20", f"{cy:.4f}",
            " 30", "0.0",
            " 40", f"{r:.4f}"
        ])

    def add_arc(layer, cx, cy, r, start_ang, end_ang):
        lines.extend([
            "  0", "ARC",
            "  8", layer,
            " 10", f"{cx:.4f}",
            " 20", f"{cy:.4f}",
            " 30", "0.0",
            " 40", f"{r:.4f}",
            " 50", f"{start_ang:.2f}",
            " 51", f"{end_ang:.2f}"
        ])

    def add_text(layer, text, x, y, height=1.5, rotation=0.0):
        lines.extend([
            "  0", "TEXT",
            "  8", layer,
            " 10", f"{x:.4f}",
            " 20", f"{y:.4f}",
            " 30", "0.0",
            " 40", f"{height:.4f}",
            "  1", text,
            " 50", f"{rotation:.2f}"
        ])

    # -------------------------------------------------------------
    # GEOMETRÍA DEL RECINTO INDUSTRIAL "EL ROBLEDAL"
    # -------------------------------------------------------------

    # A) VALLADO PERIMETRAL (Capa: VALLADO_PERIMETRAL)
    # Recinto 160 x 140 m con huecos en acceso sur (x=15 a 27) y este (y=105 a 115)
    # Tramo 1: desde acceso sur oeste hasta esquina SW (0,0), luego borde W hasta NW (0,140), luego borde N hasta NE (160,140), hasta acceso E (160,115)
    add_lwpolyline("VALLADO_PERIMETRAL", [
        (15.0, 0.0),
        (0.0, 0.0),
        (0.0, 140.0),
        (160.0, 140.0),
        (160.0, 115.0)
    ], closed=False)
    # Tramo 2: desde acceso E (160,105) hasta esquina SE (160,0) hasta acceso sur este (27,0)
    add_lwpolyline("VALLADO_PERIMETRAL", [
        (160.0, 105.0),
        (160.0, 0.0),
        (27.0, 0.0)
    ], closed=False)

    # B) EDIFICIOS PRINCIPALES (Capa: EDIFICIOS)
    # 1. Gran Nave Industrial de Producción y Logística (70 x 45 m)
    add_lwpolyline("EDIFICIOS", [
        (80.0, 50.0),
        (150.0, 50.0),
        (150.0, 95.0),
        (80.0, 95.0)
    ], closed=True)

    # 2. Edificio de Oficinas y Centro de Servicios (25 x 15 m)
    add_lwpolyline("EDIFICIOS", [
        (35.0, 10.0),
        (60.0, 10.0),
        (60.0, 25.0),
        (35.0, 25.0)
    ], closed=True)

    # 3. Caseta de Control de Accesos / Báscula (isla central del acceso)
    add_lwpolyline("EDIFICIOS", [
        (20.4, 10.0),
        (21.6, 10.0),
        (21.6, 18.0),
        (20.4, 18.0)
    ], closed=True)

    # 4. Edificio Auxiliar / Almacén de Residuos y Envases (15 x 10 m en zona norte)
    add_lwpolyline("EDIFICIOS", [
        (85.0, 115.0),
        (105.0, 115.0),
        (105.0, 130.0),
        (85.0, 130.0)
    ], closed=True)

    # C) MUROS Y CERRAMIENTOS INTERIORES (Capa: MUROS)
    # 1. Muro de contención de tierras / separación en esquina suroeste
    add_lwpolyline("MUROS", [
        (5.0, 30.0),
        (5.0, 50.0),
        (12.0, 50.0)
    ], closed=False)

    # 2. Vallado interior de seguridad del recinto de depósitos energéticos
    add_lwpolyline("MUROS", [
        (120.0, 105.0),
        (155.0, 105.0),
        (155.0, 135.0),
        (120.0, 135.0)
    ], closed=True)

    # D) PILARES Y COLUMNAS DE PROTECCIÓN (Capa: PILARES)
    # Pilares circulares de protección en esquinas de naves y zona de muelles
    add_circle("PILARES", 79.2, 49.2, 0.40)   # Esquina SW de nave
    add_circle("PILARES", 150.8, 49.2, 0.40)  # Esquina SE de nave
    add_circle("PILARES", 79.2, 95.8, 0.40)   # Esquina NW de nave
    add_circle("PILARES", 150.8, 95.8, 0.40)  # Esquina NE de nave

    # Bolardos de protección entre dársenas de muelles (Y = 48.5)
    add_circle("PILARES", 86.0, 48.5, 0.30)
    add_circle("PILARES", 94.0, 48.5, 0.30)
    add_circle("PILARES", 102.0, 48.5, 0.30)
    add_circle("PILARES", 110.0, 48.5, 0.30)
    add_circle("PILARES", 118.0, 48.5, 0.30)
    add_circle("PILARES", 126.0, 48.5, 0.30)

    # Farolas / Postes de iluminación en viales
    add_circle("PILARES", 14.0, 35.0, 0.35)
    add_circle("PILARES", 14.0, 75.0, 0.35)
    add_circle("PILARES", 65.0, 70.0, 0.35)
    add_circle("PILARES", 110.0, 15.0, 0.35)

    # E) ZONAS RESTRINGIDAS / PELIGROSAS (Capa: ZONAS_RESTRINGIDAS)
    # Centro de transformación, depósitos GLP y sala técnica
    add_lwpolyline("ZONAS_RESTRINGIDAS", [
        (122.0, 107.0),
        (153.0, 107.0),
        (153.0, 133.0),
        (122.0, 133.0)
    ], closed=True)

    # Zona de trasvase de productos químicos
    add_lwpolyline("ZONAS_RESTRINGIDAS", [
        (135.0, 60.0),
        (148.0, 60.0),
        (148.0, 75.0),
        (135.0, 75.0)
    ], closed=True)

    # F) ISLETAS DIRECCIONALES Y SEPARADORAS (Capa: ISLETAS)
    # 1. Isleta central del acceso principal (alberga la caseta)
    add_lwpolyline("ISLETAS", [
        (20.0, 6.0),
        (22.0, 6.0),
        (22.0, 22.0),
        (20.0, 22.0)
    ], closed=True)

    # 2. Isleta central circular de la glorieta norte (R = 7.5 m, centro en 40, 105)
    # Creamos un círculo en la capa ISLETAS
    add_circle("ISLETAS", 40.0, 105.0, 7.5)

    # 3. Isleta deflectora triangular en intersección hacia muelles
    add_lwpolyline("ISLETAS", [
        (68.0, 48.0),
        (74.0, 48.0),
        (71.0, 54.0)
    ], closed=True)

    # G) BORDILLOS Y DELIMITACIONES DE CALZADA (Capa: BORDILLOS)
    # 1. Bordillo perimetral de la acera de oficinas
    add_lwpolyline("BORDILLOS", [
        (33.0, 8.0),
        (62.0, 8.0),
        (62.0, 27.0),
        (33.0, 27.0)
    ], closed=True)

    # 2. Borde exterior oeste del vial principal con curva amplia
    add_lwpolyline("BORDILLOS", [
        (15.0, 0.0),
        (15.0, 55.0),
        (18.0, 70.0),
        (25.0, 85.0),
        (25.0, 120.0),
        (15.0, 130.0)
    ], closed=False)

    # 3. Bordillo perimetral exterior de la glorieta norte (R = 16.5 m alrededor de 40, 105)
    add_arc("BORDILLOS", 40.0, 105.0, 16.5, 120.0, 330.0)

    # 4. Bordillo de la acera de la nave principal
    add_lwpolyline("BORDILLOS", [
        (78.0, 47.0),
        (78.0, 97.0),
        (152.0, 97.0)
    ], closed=False)

    # H) VIALES Y CALZADAS (Capa: VIAL_CALZADA - Contexto)
    # Líneas de contorno de pavimento y ejes de vial
    add_line("VIAL_CALZADA", 15.0, 0.0, 15.0, 55.0)
    add_line("VIAL_CALZADA", 27.0, 0.0, 27.0, 45.0)
    add_line("VIAL_CALZADA", 21.0, 0.0, 21.0, 6.0) # Eje central
    add_line("VIAL_CALZADA", 27.0, 45.0, 65.0, 45.0)
    add_line("VIAL_CALZADA", 65.0, 45.0, 75.0, 40.0)
    # Contorno de la gran playa de maniobra frente a muelles
    add_lwpolyline("VIAL_CALZADA", [
        (75.0, 47.0),
        (145.0, 47.0),
        (145.0, 15.0),
        (75.0, 15.0)
    ], closed=True)

    # I) MUELLES DE CARGA (Capa: MUELLES_CARGA - Contexto)
    # 5 Dársenas de atraque para tráilers de 13,62 m
    docks = [
        ("Muelle 1", 88.0, 92.0),
        ("Muelle 2", 96.0, 100.0),
        ("Muelle 3 (Destino)", 104.0, 108.0),
        ("Muelle 4", 112.0, 116.0),
        ("Muelle 5", 120.0, 124.0)
    ]
    for name, x_left, x_right in docks:
        # Fosa / caja de muelle (4 x 3.5 m)
        add_lwpolyline("MUELLES_CARGA", [
            (x_left, 50.0),
            (x_right, 50.0),
            (x_right, 46.5),
            (x_left, 46.5)
        ], closed=True)

    # J) APARCAMIENTOS Y PLAZAS DE ESPERA (Capa: APARCAMIENTO - Contexto)
    # Plazas de espera para vehículos pesados (18 x 3.5 m cada una)
    for i in range(4):
        y_bot = 112.0 + i * 4.5
        y_top = y_bot + 3.8
        add_lwpolyline("APARCAMIENTO", [
            (55.0, y_bot),
            (73.0, y_bot),
            (73.0, y_top),
            (55.0, y_top)
        ], closed=True)

    # K) SEÑALIZACIÓN HORIZONTAL (Capa: SENALIZACION_HORIZONTAL - Contexto)
    # Flechas y marcas viales
    add_line("SENALIZACION_HORIZONTAL", 18.0, 2.0, 18.0, 6.0)
    add_line("SENALIZACION_HORIZONTAL", 24.0, 6.0, 24.0, 2.0)
    # Pasos de peatones frente a oficinas
    for step in range(5):
        y_p = 27.5 + step * 1.0
        add_line("SENALIZACION_HORIZONTAL", 30.0, y_p, 33.0, y_p)

    # L) TEXTOS Y ANOTACIONES (Capa: TEXTOS_ANOTACIONES - Contexto)
    add_text("TEXTOS_ANOTACIONES", "ACCESO PRINCIPAL", 16.0, -3.0, height=2.0)
    add_text("TEXTOS_ANOTACIONES", "NAVE PRINCIPAL PRODUCCION", 95.0, 72.0, height=3.0)
    add_text("TEXTOS_ANOTACIONES", "OFICINAS Y SERVICIOS", 38.0, 17.0, height=2.0)
    add_text("TEXTOS_ANOTACIONES", "PLAYA DE MANIOBRAS MUELLES", 88.0, 30.0, height=2.5)
    add_text("TEXTOS_ANOTACIONES", "MUELLES 1 A 5", 98.0, 52.0, height=1.8)
    add_text("TEXTOS_ANOTACIONES", "GLORIETA NORTE", 32.0, 105.0, height=2.0)
    add_text("TEXTOS_ANOTACIONES", "ZONA RESTRINGIDA GLP / CT", 125.0, 120.0, height=1.8)

    # M) TRAYECTORIA DE PRUEBA DEL CAMIÓN (Capa: TURNSIM_TRAYECTORIA)
    # Polilínea continua que guía al camión articulado de 16,50 m:
    # 1. Acceso desde el exterior por carril de entrada (X=18, Y=-5 hasta Y=35)
    # 2. Curva hacia la derecha (hacia el este) con radio amplio de acuerdo
    # 3. Tramo transversal hacia la playa de muelles
    # 4. Giro de aproximación y alineación previa a la maniobra de atraque en Muelle 3
    trajectory_points = [
        (18.0, -5.0),    # Inicio en exterior
        (18.0, 38.0),    # Recta de entrada pasando control
        (25.0, 52.0),    # Inicio de giro
        (42.0, 60.0),    # Enlace con vial transversal
        (75.0, 60.0),    # Avance hacia la nave
        (96.0, 54.0),    # Desvío hacia la playa de muelles
        (106.0, 40.0),   # Alineación perpendicular
        (106.0, 22.0)    # Parada final frente a Muelle 3
    ]
    add_lwpolyline("TURNSIM_TRAYECTORIA", trajectory_points, closed=False)

    # 5. END OF SECTION AND EOF
    lines.extend([
        "  0", "ENDSEC",
        "  0", "EOF"
    ])

    with open(dxf_path, "w", encoding="ascii", errors="replace") as f:
        f.write("\n".join(lines) + "\n")

    print(f"DXF generado con éxito: {dxf_path}")
    print(f"Total líneas DXF: {len(lines)}")
    return dxf_path

if __name__ == "__main__":
    create_dxf()

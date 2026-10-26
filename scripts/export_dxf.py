#!/usr/bin/env python3
"""
Exportador CAD a formato DXF (AutoCAD R2010) con 5 capas normalizadas:
- 0_BARRIDO_ENVOLVENTE (Color 1 - Rojo)
- 0_HUELLA_EJE_REFERENCIA (Color 3 - Verde)
- 0_HUELLA_EJE_REMOLQUE (Color 4 - Cian)
- 0_SILUETAS_VEHICULO (Color 7/8 - Blanco / Gris)
- 0_ACOTACIONES_ANCHURA (Color 2 - Amarillo)
"""
import math
import pathlib
import sys
import ezdxf
from shapely.geometry import LineString
from schlepp import load, simulate, compute_envelope
from schlepp.envelope import body_polygon


def compute_dxf_dimensions(states, envelope):
    """Calcula secciones transversales perpendiculares al eje de referencia sobre la envolvente."""
    if len(states) < 4:
        return []

    total = len(states)
    candidate_indices = [
        (max(1, int(total * 0.12)), "Recta inicial"),
        (int(total * 0.38), "Entrada giro"),
        (int(total * 0.56), "Máx. barrido"),
        (min(total - 2, int(total * 0.86)), "Salida"),
    ]

    dims = []
    for idx, label in candidate_indices:
        s = states[idx]
        nx = -math.sin(s.heading)
        ny = math.cos(s.heading)
        cut_line = LineString([
            (s.x - 15.0 * nx, s.y - 15.0 * ny),
            (s.x + 15.0 * nx, s.y + 15.0 * ny),
        ])
        inter = envelope.intersection(cut_line)
        if inter.is_empty:
            continue

        geoms = [inter] if inter.geom_type == "LineString" else getattr(inter, "geoms", [])
        best_seg = None
        best_dist_to_ref = float("inf")
        for g in geoms:
            if g.geom_type != "LineString":
                continue
            d = g.distance(LineString([(s.x, s.y), (s.x + 0.01 * nx, s.y + 0.01 * ny)]))
            if d < best_dist_to_ref:
                best_dist_to_ref = d
                best_seg = g

        if best_seg is not None:
            coords = list(best_seg.coords)
            p1 = coords[0]
            p2 = coords[-1]
            width = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            dims.append({
                "label": f"{label}: {width:.2f} m",
                "width": width,
                "p1": p1,
                "p2": p2,
            })
    return dims


def export_to_dxf(toml_path: str | pathlib.Path, dxf_path: str | pathlib.Path) -> None:
    toml_file = pathlib.Path(toml_path)
    dxf_file = pathlib.Path(dxf_path)

    vehicle, maneuver, render = load(toml_file)
    states = simulate(vehicle, maneuver, straight_step=0.05, arc_step=0.5)
    envelope = compute_envelope(states, vehicle)

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    # 5 Capas normalizadas
    doc.layers.add("0_BARRIDO_ENVOLVENTE", color=1)      # Rojo
    doc.layers.add("0_HUELLA_EJE_REFERENCIA", color=3)   # Verde
    doc.layers.add("0_HUELLA_EJE_REMOLQUE", color=4)     # Cian
    doc.layers.add("0_SILUETAS_VEHICULO", color=7)       # Blanco / Gris claro
    doc.layers.add("0_ACOTACIONES_ANCHURA", color=2)     # Amarillo

    # 1. Envolvente continua de barrido
    if envelope.geom_type == "Polygon":
        geoms = [envelope]
    elif envelope.geom_type == "MultiPolygon":
        geoms = list(envelope.geoms)
    else:
        geoms = []

    for poly in geoms:
        ext_coords = list(poly.exterior.coords)
        msp.add_lwpolyline(
            ext_coords, close=True, dxfattribs={"layer": "0_BARRIDO_ENVOLVENTE", "color": 1}
        )
        for interior in poly.interiors:
            int_coords = list(interior.coords)
            msp.add_lwpolyline(
                int_coords, close=True, dxfattribs={"layer": "0_BARRIDO_ENVOLVENTE", "color": 1}
            )

    # 2. Huellas de los ejes
    ref_points = [(s.x, s.y) for s in states]
    msp.add_lwpolyline(ref_points, dxfattribs={"layer": "0_HUELLA_EJE_REFERENCIA", "color": 3})

    if vehicle.trailer is not None:
        trailer_points = [(s.trailer_x, s.trailer_y) for s in states if s.trailer_x is not None]
        if trailer_points:
            msp.add_lwpolyline(
                trailer_points, dxfattribs={"layer": "0_HUELLA_EJE_REMOLQUE", "color": 4}
            )

    # 3. Siluetas muestreadas del vehículo (ghosts)
    step_interval = max(1, int(len(states) / 12))
    sampled_states = [states[0]] + states[step_interval::step_interval]
    if states[-1] not in sampled_states:
        sampled_states.append(states[-1])

    for s in sampled_states:
        p_tractor = body_polygon(s.x, s.y, s.heading, vehicle.tractor)
        msp.add_lwpolyline(
            list(p_tractor.exterior.coords),
            close=True,
            dxfattribs={"layer": "0_SILUETAS_VEHICULO", "color": 8},
        )
        if vehicle.trailer is not None and s.trailer_x is not None:
            p_trailer = body_polygon(s.trailer_x, s.trailer_y, s.trailer_heading, vehicle.trailer)
            msp.add_lwpolyline(
                list(p_trailer.exterior.coords),
                close=True,
                dxfattribs={"layer": "0_SILUETAS_VEHICULO", "color": 8},
            )

    # 4. Acotaciones de anchura libre barrida
    dims = compute_dxf_dimensions(states, envelope)
    for d in dims:
        p1, p2 = d["p1"], d["p2"]
        msp.add_line(p1, p2, dxfattribs={"layer": "0_ACOTACIONES_ANCHURA", "color": 2})
        mid_x = 0.5 * (p1[0] + p2[0])
        mid_y = 0.5 * (p1[1] + p2[1])
        txt = msp.add_text(
            d["label"],
            dxfattribs={"layer": "0_ACOTACIONES_ANCHURA", "color": 2, "height": 0.40},
        )
        txt.dxf.insert = (mid_x, mid_y)

    dxf_file.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(dxf_file)
    print(f"DXF generado con éxito ({len(dims)} cotas): {dxf_file}")


if __name__ == "__main__":
    base_dir = pathlib.Path(__file__).resolve().parent.parent
    if (base_dir / "models" / "trailer_1650_giro90.toml").exists():
        default_in = base_dir / "models" / "trailer_1650_giro90.toml"
        default_out = base_dir / "exports" / "trailer_1650_giro90.dxf"
    else:
        default_in = pathlib.Path("trailer_1650_giro90.toml")
        default_out = pathlib.Path("trailer_1650_giro90.dxf")

    in_path = sys.argv[1] if len(sys.argv) > 1 else default_in
    out_path = sys.argv[2] if len(sys.argv) > 2 else default_out
    export_to_dxf(in_path, out_path)

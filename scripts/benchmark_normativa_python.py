#!/usr/bin/env python3
"""
benchmark_normativa_python.py
Cálculo analítico e independiente (NumPy + Shapely) para la validación y calibración
de vehículos patrón según la normativa española (Norma 3.1-IC y Guía de Nudos Viarios OC 32/2012).
"""

import math
import numpy as np
import shapely.geometry as sg
from shapely.ops import unary_union

def get_normative_vehicles():
    """
    Retorna los vehículos patrón definidos en la Tabla A3.1 de la Norma 3.1-IC
    y Tabla 2.3-D de la Guía de Nudos Viarios (OC 32/2012).
    """
    return {
        "furgon": {
            "name": "Furgón patrón (F)",
            "norma_ref": "Norma 3.1-IC Tabla A3.1 / Fig. A3.1; Guía Nudos Tabla 2.3-A / 2.3-D",
            "is_articulated": False,
            "width": 2.05,
            "length_total": 6.35,
            "front_overhang": 0.95,
            "wheelbase": 4.00,
            "rear_overhang": 1.40,
            "R_front_guia": 7.50, # Radio en centro del eje director (Tabla 2.3-D)
        },
        "camion_ligero": {
            "name": "Camión ligero / rígido patrón (C)",
            "norma_ref": "Norma 3.1-IC Tabla A3.1 / Fig. A3.4; Guía Nudos Tabla 2.3-A / 2.3-D",
            "is_articulated": False,
            "width_cab": 2.45,
            "width": 2.55,
            "length_total": 10.55,
            "front_overhang": 1.40,
            "wheelbase": 6.25,
            "rear_overhang": 2.90,
            "R_front_guia": 9.10,
        },
        "autobus_rigido": {
            "name": "Autobús rígido 3 ejes patrón (A)",
            "norma_ref": "Norma 3.1-IC Tabla A3.1 / Fig. A3.2; Guía Nudos Tabla 2.3-A / 2.3-D",
            "is_articulated": False,
            "width": 2.55,
            "length_total": 15.00,
            "front_overhang": 2.65,
            "wheelbase_axle1_axle2": 7.45,
            "axle_spacing_rear": 1.40,
            "wheelbase_effective": 7.45 + 0.70, # 8.15 m al centro del tándem
            "rear_overhang": 3.50,
            "R_front_guia": 10.50,
        },
        "camion_articulado": {
            "name": "Camión articulado patrón (T)",
            "norma_ref": "Norma 3.1-IC Tabla A3.1 / Fig. A3.5; Guía Nudos Tabla 2.3-A / 2.3-D",
            "is_articulated": True,
            "width_tractor": 2.44,
            "width_trailer": 2.55,
            "length_total": 16.50,
            "tractor_length": 6.30,
            "tractor_fo": 1.40,
            "tractor_wb": 3.90,
            "tractor_ro": 1.00,
            "fifth_wheel_offset": 0.70, # Delante del eje motriz
            "trailer_length": 13.60,
            "trailer_fo": 1.40, # Respecto al kingpin
            "trailer_kingpin_to_first_axle": 5.65,
            "tridem_axle_spacing": 1.30,
            "trailer_effective_wb": 5.65 + 1.30, # 6.95 m del kingpin al centro del trídem
            "trailer_ro_from_last_axle": 2.95,
            "trailer_ro_from_bogie_center": 2.95 + 1.30, # 4.25 m
            "R_front_guia": 10.30,
        }
    }

def solve_steady_state_circle(v):
    """
    Calcula de forma analítica exacta el régimen circular permanente para un vehículo.
    """
    Rf = v["R_front_guia"]
    res = {"name": v["name"], "Rf": Rf}

    if not v["is_articulated"]:
        L = v.get("wheelbase_effective", v.get("wheelbase"))
        W = v["width"]
        L_fo = v["front_overhang"]
        L_ro = v["rear_overhang"]

        Rr = math.sqrt(Rf**2 - L**2)
        delta_rad = math.asin(L / Rf)
        delta_deg = math.degrees(delta_rad)
        R_ext_wall = math.hypot(L + L_fo, Rr + W / 2)
        R_int_wheel = Rr - W / 2
        swept_width = R_ext_wall - R_int_wheel
        offtracking = Rf - Rr

        res.update({
            "Rr": Rr,
            "steer_angle_deg": delta_deg,
            "R_ext_wall": R_ext_wall,
            "R_int_wheel": R_int_wheel,
            "swept_width": swept_width,
            "offtracking": offtracking,
        })
    else:
        Lt = v["tractor_wb"]
        h = v["fifth_wheel_offset"]
        Wt = v["width_tractor"]
        Wtr = v["width_trailer"]
        L_fo = v["tractor_fo"]
        Ltr = v["trailer_effective_wb"]

        Rr = math.sqrt(Rf**2 - Lt**2)
        Rh = math.hypot(Rr, h)
        delta_deg = math.degrees(math.asin(Lt / Rf))

        # Radio del bogie del semirremolque en régimen permanente
        Rt = math.sqrt(Rh**2 - Ltr**2)
        # Ángulo de articulación en régimen permanente
        # psi = atan(Ltr / Rt) - atan(h / Rr)
        psi_rad = math.atan2(Ltr, Rt) - math.atan2(h, Rr)
        psi_deg = math.degrees(psi_rad)

        R_ext_wall = math.hypot(Lt + L_fo, Rr + Wt / 2)
        R_int_semi = Rt - Wtr / 2
        swept_width = R_ext_wall - R_int_semi
        offtracking = Rf - Rt

        res.update({
            "Rr": Rr,
            "Rh": Rh,
            "Rt": Rt,
            "steer_angle_deg": delta_deg,
            "articulation_angle_deg": psi_deg,
            "R_ext_wall": R_ext_wall,
            "R_int_wheel": R_int_semi,
            "swept_width": swept_width,
            "offtracking": offtracking,
        })

    return res

def simulate_independent_python_swept_path(v, turn_angle_deg=90.0, step_m=0.02):
    """
    Simulación numérica independiente utilizando NumPy y cálculo vectorial paso a paso.
    Genera los polígonos exactos de la carrocería en cada instante e integra el área
    mediante Shapely (cascada de uniones poligonales).
    """
    Rf = v["R_front_guia"]
    is_art = v["is_articulated"]
    
    if not is_art:
        L = v.get("wheelbase_effective", v.get("wheelbase"))
        W = v["width"]
        L_fo = v["front_overhang"]
        L_ro = v["rear_overhang"]
        Rr = math.sqrt(Rf**2 - L**2)
    else:
        L = v["tractor_wb"]
        h = v["fifth_wheel_offset"]
        Wt = v["width_tractor"]
        Wtr = v["width_trailer"]
        L_fo = v["tractor_fo"]
        L_ro = v["tractor_ro"]
        Ltr = v["trailer_effective_wb"]
        Ltr_fo = v["trailer_fo"]
        Ltr_ro = v["trailer_ro_from_bogie_center"]
        Rr = math.sqrt(Rf**2 - L**2)

    # Centro de rotación instantánea del giro a izquierdas
    # Eje trasero en (0, 0), orientación 0 rad (+X). Centro de giro en (0, Rr)
    cx, cy = 0.0, Rr
    
    arc_rad = math.radians(turn_angle_deg)
    arc_len = Rr * arc_rad
    n_steps = max(20, int(math.ceil(arc_len / step_m)))
    d_theta = arc_rad / n_steps
    
    polygons = []
    
    # Estado inicial de la tractora / vehículo rígido
    theta_tractor = 0.0
    x_r, y_r = 0.0, 0.0
    
    # Articulación si aplica
    if is_art:
        theta_trailer = 0.0
        # Posición inicial kingpin
        hx, hy = x_r + h * math.cos(theta_tractor), y_r + h * math.sin(theta_tractor)
        # Posición inicial bogie remolque
        tx, ty = hx - Ltr * math.cos(theta_trailer), hy - Ltr * math.sin(theta_trailer)
    
    for k in range(n_steps + 1):
        angle = k * d_theta
        # Posición del eje trasero sobre el arco
        # x_r = cx + Rr * sin(angle)
        # y_r = cy - Rr * cos(angle)
        cur_xr = cx + Rr * math.sin(angle)
        cur_yr = cy - Rr * math.cos(angle)
        cur_th = angle
        
        # Polígono de vehículo rígido o tractora
        cos_t = math.cos(cur_th)
        sin_t = math.sin(cur_th)
        cur_W = W if not is_art else Wt
        
        # Vértices locales: [-L_ro, -cur_W/2], [-L_ro, cur_W/2], [L + L_fo, cur_W/2], [L + L_fo, -cur_W/2]
        corners_local = [
            [-L_ro, -cur_W/2],
            [-L_ro, cur_W/2],
            [L + L_fo, cur_W/2],
            [L + L_fo, -cur_W/2]
        ]
        poly_t = [
            (cur_xr + lx * cos_t - ly * sin_t, cur_yr + lx * sin_t + ly * cos_t)
            for lx, ly in corners_local
        ]
        polygons.append(sg.Polygon(poly_t))
        
        if is_art:
            cur_hx = cur_xr + h * cos_t
            cur_hy = cur_yr + h * sin_t
            
            if k > 0:
                # Integración RK4 del semirremolque para el paso
                dhx = cur_hx - prev_hx
                dhy = cur_hy - prev_hy
                
                def deriv(th):
                    return (-dhx * math.sin(th) + dhy * math.cos(th)) / Ltr
                
                k1 = deriv(theta_trailer)
                k2 = deriv(theta_trailer + 0.5 * k1)
                k3 = deriv(theta_trailer + 0.5 * k2)
                k4 = deriv(theta_trailer + k3)
                theta_trailer = theta_trailer + (k1 + 2*k2 + 2*k3 + k4) / 6.0
                
            tx = cur_hx - Ltr * math.cos(theta_trailer)
            ty = cur_hy - Ltr * math.sin(theta_trailer)
            prev_hx, prev_hy = cur_hx, cur_hy
            
            cos_tr = math.cos(theta_trailer)
            sin_tr = math.sin(theta_trailer)
            
            # Polígono del semirremolque respecto a (tx, ty)
            # Frontal está en kingpin + Ltr_fo = Ltr + Ltr_fo
            # Trasera está en -Ltr_ro
            tr_corners_local = [
                [-Ltr_ro, -Wtr/2],
                [-Ltr_ro, Wtr/2],
                [Ltr + Ltr_fo, Wtr/2],
                [Ltr + Ltr_fo, -Wtr/2]
            ]
            poly_tr = [
                (tx + lx * cos_tr - ly * sin_tr, ty + lx * sin_tr + ly * cos_tr)
                for lx, ly in tr_corners_local
            ]
            polygons.append(sg.Polygon(poly_tr))
        else:
            prev_hx, prev_hy = 0, 0

    envelope = unary_union(polygons)
    return {
        "area": envelope.area,
        "n_polygons": len(polygons),
        "bounds": envelope.bounds
    }

if __name__ == "__main__":
    veh_dict = get_normative_vehicles()
    print("=" * 70)
    print("BENCHMARK CINEMÁTICO INDEPENDIENTE — VEHÍCULOS PATRÓN ESPAÑOLES")
    print("=" * 70)
    
    for key, v in veh_dict.items():
        res = solve_steady_state_circle(v)
        print(f"\n[{res['name']}]")
        print(f"  Referencia documental: {v['norma_ref']}")
        print(f"  R eje director (Guía Tabla 2.3-D) : {res['Rf']:.3f} m")
        print(f"  R eje trasero calculado          : {res['Rr']:.3f} m")
        print(f"  Ángulo de dirección teórico       : {res['steer_angle_deg']:.2f}°")
        print(f"  R exterior pared / voladizo       : {res['R_ext_wall']:.3f} m")
        print(f"  R interior ruedas traseras        : {res['R_int_wheel']:.3f} m")
        print(f"  Ancho de barrido régimen perm.    : {res['swept_width']:.3f} m")
        print(f"  Offtracking (desvío de barrido)   : {res['offtracking']:.3f} m")
        if "articulation_angle_deg" in res:
            print(f"  R quinta rueda (kingpin)          : {res['Rh']:.3f} m")
            print(f"  R bogie semirremolque (Rt)        : {res['Rt']:.3f} m")
            print(f"  Ángulo articulación permanente    : {res['articulation_angle_deg']:.2f}°")
            
        print("  Calculando área envolvente de barrido 90° con Shapely (step=0.05m)...")
        sim_res = simulate_independent_python_swept_path(v, turn_angle_deg=90.0, step_m=0.05)
        print(f"  -> Área envolvente Shapely (90°)  : {sim_res['area']:.2f} m²")

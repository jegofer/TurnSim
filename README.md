# TurnSim — Simulador de barrido de vehículos pesados 🚛📐

Aplicación web técnica de alto rendimiento, motor cinemático diferencial y generador de planos e informes para la simulación, verificación espacial y análisis de maniobrabilidad de **vehículos pesados articulados (cabezas tractoras 4x2 + semirremolques de 3 ejes)** en accesos industriales, intersecciones urbanas, glorietas, viales y muelles logísticos.

---

## 1. Características principales

1. **Configuración modular y combinable de vehículos de diseño:**
   - **Selección independiente de cabeza tractora y semirremolque:** el usuario puede combinar cualquier cabeza tractora (Renault Trucks T 480, Mercedes-Benz Actros 1845 LS, DAF FT XF 480, Volvo FH 500, Scania R 450, etc.) con cualquier semirremolque (Schmitz Cargobull S.KO Cool frigorífico, Schmitz S.CS lonas correderas, Krone Profi Liner, Cisterna ADR, etc.).
   - **Carga de conjunto articulado preconfigurado al inicio:** arranca automáticamente con un conjunto estándar verificado (Renault Trucks T 480 + Schmitz S.KO Cool) listo para simular.
   - **Personalización geométrica en vivo:** edición paramétrica de batalla ($L_{wb}$, $L_t$), voladizos delantero/trasero, posición de quinta rueda (*kingpin offset* $h$), ancho de vía, anchura de carrocería y ángulos máximos de dirección y articulación con validación normativa en tiempo real (Directiva 96/53/CE y RD 2822/1998).

2. **Herramienta de medición de distancias en planta 2D:**
   - Modo de medición métrica interactiva con cálculo en tiempo real de distancia euclídea ($\Delta s$), incrementos cartesianos ($\Delta X, \Delta Y$) y azimut angular ($\angle \theta$).
   - **Snap automático magnético:** ajuste de precisión a vértices de obstáculos, puntos clave del vehículo (ejes motrices, eje directriz, quinta rueda, trídem) y esquinas de carrocería.

3. **Motor cinemático y geométrico 100 % local (sin servidor ni dependencias externas):**
   - Integración diferencial RK4 de la tractriz con acoplamiento de quinta rueda, soporte reversible de **avance y marcha atrás**, prevención de límites de giro y detección de acodalamiento (*jackknifing*).
   - Generación de maniobras por tramos sucesivos (rectas y arcos tangentes) o cálculo automático a partir de puntos de paso (*waypoints*).
   - Cálculo analítico exacto de la envolvente de barrido (*swept path envelope*), banda perimetral de margen de seguridad lateral y huellas de neumáticos.

4. **Comprobación geométrica de obstáculos e interferencias:**
   - Detección precisa de **Colisión geométrica**, **Invasión de zona prohibida**, **Incumplimiento de margen de seguridad**, **Situación no evaluable** y **Maniobra viable**.
   - Escenarios viarios preconfigurados: giro de 90° en acceso industrial, glorieta, muelle de carga marcha atrás y corona circular UE (Directiva 96/53/CE).

5. **Doble visualización sincronizada (Planta Técnica 2D + Perspectiva 3D en Three.js):**
   - Vistas conmutables: **Planta 2D**, **Visor 3D** y **Vista Dividida (2D + 3D)** con escala gráfica dinámica y rosa de los vientos.

6. **Informes técnicos y exportación CAD:**
   - **Informe Técnico PDF Estructurado** para expedientes y memorias de ingeniería vial.
   - **Exportación Gráfica del Visor** (alta resolución con cajetín técnico).
   - **Descarga directa en DXF multicapa (CAD)** y **SVG vectorial a escala métrica**.

---

## 2. Estructura del proyecto

```text
TurnSim/
├── index.html                         # Entrada principal web autónoma (lista para GitHub Pages)
├── simulacion_threejs.html            # Acceso directo autónomo sin dependencias
├── package.json                       # Metadatos del proyecto y scripts npm
├── requirements.txt                   # Dependencias Python opcionales para exportador CAD offline
├── .gitignore                         # Control de versiones (excluye entornos y documentación interna)
├── README.md                          # Documentación del proyecto
├── models/                            # Perfiles paramétricos TOML
│   ├── renault_t_4x2_sko.toml
│   ├── mercedes_actros_4x2_scs.toml
│   ├── daf_xf_4x2_eu.toml
│   └── trailer_1650_giro90.toml
├── web/                               # Código fuente modular de la aplicación web
│   ├── index.html                     # Punto de entrada web
│   ├── simulacion_threejs.html        # Punto de entrada réplica
│   ├── css/
│   │   └── styles.css                 # Hojas de estilo técnicas CAD con soporte responsivo
│   ├── js/
│   │   ├── app.js                     # Controlador principal e interactividad
│   │   ├── models/vehicles.js         # Catálogo de tractoras, remolques y combinaciones
│   │   ├── engine/kinematics.js       # Integrador numérico RK4 y tractrices
│   │   ├── engine/envelope.js         # Envolventes OBB Liang-Barsky y huellas
│   │   ├── engine/collisions.js       # Evaluador de interferencias y escenarios
│   │   ├── view2d/viewer2d.js         # Visor 2D Canvas con herramienta de medición
│   │   ├── view3d/viewer3d.js         # Visor 3D Three.js
│   │   └── export/exporters.js        # Generadores PDF, DXF y SVG
│   ├── simulation_data.json           # Datos de prueba de referencia
│   └── simulation_data_rich.json      # Datos numéricos para validación cruzada
├── scripts/                           # Scripts de construcción y utilidades
│   ├── build_standalone_html.mjs      # Compilador autónomo en archivo único (sin servidor / sin CORS)
│   └── export_dxf.py                  # Script Python para exportación de referencia CAD
├── tests/                             # Batería de pruebas automatizadas
│   └── test_engine.mjs                # 18 pruebas unitarias y de integración geométrica
└── exports/                           # Salidas CAD exportadas de referencia
    ├── trailer_1650_giro90.dxf
    └── trailer_1650_giro90.svg
```

---

## 3. Puesta en marcha

### 3.1. Uso inmediato en el navegador (100 % cliente)
Al no requerir compiladores pesados ni servidores backend, puede ejecutarse abriendo directamente cualquiera de los archivos HTML mediante doble clic (`file://`):
- `index.html` (en la raíz)
- `simulacion_threejs.html` (en la raíz)
- `web/index.html`

### 3.2. Servidor HTTP local (opcional)
```bash
# Mediante Python
python3 -m http.server 8000

# O mediante npm
npm start
```
Abra `http://localhost:8000` en su navegador.

### 3.3. Batería de pruebas automatizadas
Para ejecutar la suite de 18 pruebas geométricas y de validación:
```bash
node tests/test_engine.mjs
# O mediante npm:
npm test
```

### 3.4. Reconstrucción tras modificaciones
Si realiza cambios en los archivos modulares de `web/js/` o `web/css/styles.css`, regenere los archivos autónomos con:
```bash
node scripts/build_standalone_html.mjs
# O mediante npm:
npm run build
```

---

## 4. Licencia

Distribuido bajo licencia MIT. Consulte el código fuente para más detalles.

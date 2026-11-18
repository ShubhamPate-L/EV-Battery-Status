# VoltSense — Portable EV Battery Diagnostic & Health Analytics Engine

[![Web Serial API](https://img.shields.io/badge/Web_Serial-115200_Baud-00D4FF.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![Machine Learning](https://img.shields.io/badge/NASA_ML_Model-R%C2%B2_0.943-00FF88.svg)](https://data.nasa.gov/)
[![Firmware](https://img.shields.io/badge/ESP32-Arduino_C%2B%2B-FF9933.svg)](https://www.espressif.com/)
[![License](https://img.shields.io/badge/License-Academic_Evaluation-B0B8C1.svg)]()

VoltSense is a portable electric vehicle (EV) battery health diagnostic, degradation prediction, and real-time telemetry console. It bridges physical embedded sensors on battery packs to a responsive browser dashboard via the browser-native **Web Serial API**, combined with **NASA PCoE machine learning models** and semi-empirical physics equations for 10-year battery lifespan forecasting.

---

## System Architecture

```
 +-------------------------------------------------------------------------+
 |                            PHYSICAL HARDWARE                            |
 |                                                                         |
 |  +--------------------+   +-------------------+   +------------------+  |
 |  |  DS18B20 Temp IC   |   | ACS712-20A Curr.  |   | 16x2 I2C LCD     |  |
 |  |  (1-Wire, GPIO 4)  |   | (Divider, GPIO 34)|   | (Addr 0x27)      |  |
 |  +---------+----------+   +---------+---------+   +--------+---------+  |
 |            |                        |                      ^            |
 |            +------------+-----------+                      |            |
 |                         v                                  |            |
 |                 +---------------+                          |            |
 |                 | ESP32 NodeMCU +--------------------------+            |
 |                 | (12-bit ADC)  |                                       |
 |                 +-------+-------+                                       |
 +-------------------------|-----------------------------------------------+
                           | USB Virtual COM Port (115200 Baud)
                           v
 +-------------------------------------------------------------------------+
 |                          FRONTEND WEB CONSOLE                           |
 |                                                                         |
 |  +-------------------------------------------------------------------+  |
 |  | Browser Web Serial API (navigator.serial - No middleware/server)  |  |
 |  +---------------------------------+---------------------------------+  |
 |                                    |                                    |
 |      +-----------------------------+-----------------------------+      |
 |      v                             v                             v      |
 | +--------------------+    +--------------------+    +-----------------+ |
 | | 16x2 LCD Emulator  |    | Triple Oscilloscope|    | NASA ML Predict | |
 | | (Temp / Curr View) |    | (V, I, T Traces)   |    | (RUL & SoH Fit) | |
 | +--------------------+    +--------------------+    +-----------------+ |
 +-------------------------------------------------------------------------+
```

---

## Key Capabilities

### 1. Direct Web Serial Hardware Streaming (USB COM Port)
- Connects directly to ESP32 over standard USB at **115,200 baud** using the W3C Web Serial standard without requiring Node.js serial bridges or Python WebSocket servers.
- Automatic stream parsing handles JSON objects (`{"temperature":25.5,"current":1.25,"voltage":24.2}`) and raw text lines.
- Hardware zero-point calibration accounts for measured **`0.81V` offset** on the ACS712 sensor.
- Includes a **1-click bench simulator** for offline evaluation when physical hardware is detached.

### 2. Machine Learning Battery Health Models (NASA Ames PCoE)
- Trained on real-world Li-ion battery aging datasets (NASA Ames Prognostics Center of Excellence cells: B0005, B0006, B0007, B0018).
- **Remaining Useful Life (RUL) Regressor:** Random Forest model predicting cycles remaining until 70% End-of-Life ($R^2 = 0.9433$, $\text{MAE} = 3.34\text{ cycles}$).
- **State of Health (SoH) Capacity Fade Model:** Empirical polynomial capacity curve ($R^2 = 0.8397$).
- Exported to pure JSON weights (`trained_ml_model.json`) for zero-latency client-side inference.

### 3. Four Synthetic Battery Pack Profiles
Designed for academic demonstration and viva presentations:
- **Battery Pack #1 (NMC — Good Health):** Optimal condition, $95\%\text{ SoH}$, low impedance, $24.4\text{ V}$.
- **Battery Pack #2 (NMC — Thermal Stressed / Bad Health):** $64\%\text{ SoH}$, high temperature exposure, heavy degradation.
- **Battery Pack #3 (LFP — Resilient / Good Health):** $97\%\text{ SoH}$, flat voltage plateau, durable phosphate chemistry.
- **Battery Pack #4 (LFP — High C-Rate Stressed / Bad Health):** $71\%\text{ SoH}$, DC fast charging fatigue, retirement candidate.

### 4. Interactive Simulation & Diagnostics
- **10-Year Semi-Empirical Trajectory:** Real-time physics equations splitting Calendar Aging ($t, T$) and Cycle Aging ($N, \text{C-rate}$).
- **Second-Life Suitability Engine:** Automatic grading for stationary Energy Storage System (BESS) reuse (Grid peak shaving, telecom backup, microgrid).
- **Professor Viva Walkthrough Guide:** Built-in modal presenting step-by-step examination talking points with one-click live demonstration triggers.

---

## Hardware Pinout & Wiring

| Component | ESP32 Pin | Details / Signal Conditioning |
| :--- | :--- | :--- |
| **DS18B20 Temp Sensor** | `GPIO 4` | 1-Wire Digital IC with $4.7\,\text{k}\Omega$ pullup resistor to $3.3\,\text{V}$ |
| **ACS712 Current (20A)** | `GPIO 34` | $1\,\text{k}\Omega : 2.2\,\text{k}\Omega$ voltage divider ratio ($1.4545$) to scale $5\,\text{V} \rightarrow 3.3\,\text{V}$ max ADC |
| **16x2 I2C LCD (0x27)** | `GPIO 21` (SDA), `GPIO 22` (SCL) | Powered by $5\,\text{V}$, I2C pullup bus |
| **Pack Voltage Sense** | `GPIO 35` (Optional) | High-impedance resistive divider for direct terminal voltage |

### ACS712 Signal Conditioning Math
$$\text{Sensor Voltage} = V_{\text{pin}} \times \frac{1\,\text{k}\Omega + 2.2\,\text{k}\Omega}{2.2\,\text{k}\Omega} = V_{\text{pin}} \times 1.4545$$
$$I_{\text{Amps}} = \frac{\text{Sensor Voltage} - 0.81\,\text{V}}{0.100\,\text{V/A}}$$

---

## Repository Structure

```
EV-Battery-Status/
├── index.html                  # Main diagnostic dashboard & SPA router
├── login.html                  # Secure authentication portal
├── README.md                   # Project documentation
├── log_telemetry_csv.py        # Standalone Python hardware CSV logger
├── trained_ml_model.json       # Exported NASA ML weights (RUL & SoH)
├── train_battery_ml.py         # NASA Ames dataset ML training script
├── css/
│   ├── main.css                # Design tokens, variables & typography
│   ├── components.css          # Cards, buttons, sliders, badges & modal
│   ├── diagnostics.css         # Tab styles, 16x2 LCD bezel & oscilloscope
│   └── login.css               # Portal styling
├── js/
│   ├── app.js                  # Main controller, tab router & event bus
│   ├── auth.js                 # Authentication logic
│   ├── authGuard.js            # Route protection guard
│   ├── chartConfig.js          # Chart.js theme and configuration helpers
│   ├── degradationMath.js      # Semi-empirical 10-year degradation physics
│   ├── diagnosticsTab.js       # Tab 1 physics charts & parameter sliders
│   ├── liveFeedTab.js          # Tab 4 Web Serial, 16x2 LCD & oscilloscope
│   ├── mlPredictions.js        # Tab 2 NASA ML inference & second life
│   ├── mockData.js             # 4 synthetic battery pack profiles
│   ├── poller.js               # Background telemetry poller & dropout handler
│   ├── state.js                # Reactive application state store
│   ├── telemetryData.js        # Logs table data provider
│   └── webSerialService.js     # Native W3C Web Serial API driver
└── firmware/
    └── esp32_voltsense.ino     # Arduino C++ sketch for ESP32 hardware
```

---

## Getting Started

### 1. Run the Web Dashboard
Since the application uses standard modern ES6 JavaScript and the W3C Web Serial API, run any local HTTP server:

```bash
# Using Python 3:
python -m http.server 8080

# Or using Node.js npx:
npx serve -l 8080
```

Open Google Chrome or Microsoft Edge and navigate to:
```
http://localhost:8080
```

### 2. Sign In (Demo Credentials)
- **Username:** `admin`
- **Password:** `battery2026`

### 3. Flash the ESP32 Firmware
1. Open `firmware/esp32_voltsense.ino` in the Arduino IDE.
2. Install the required libraries via Arduino Library Manager:
   - `DallasTemperature`
   - `OneWire`
   - `LiquidCrystal_I2C`
3. Select your board (`ESP32 Dev Module`) and COM Port.
4. Upload the sketch.
5. In the dashboard, switch to **"ESP32 Live Feed & LCD"** and click **"🔌 Connect ESP32 (USB COM Port)"**.

# HoneyChain IoT Edge Telemetry Simulator

Standalone IoT edge gateway and telemetry simulator for the **HoneyChain** decentralized honey supply chain and apiary intelligence platform.

Simulates physical IoT edge nodes (such as ESP32-S3 microcontroller sensor suites) deployed across remote smart apiaries, streaming real-time colony biometrics, acoustics, thermoregulation dynamics, and environmental metrics over HTTP to the HoneyChain Express Backend.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────┐
│      HoneyChain_IoT_Simulator (Standalone Client)      │
│  - Microcontroller node simulation (ESP32-S3)           │
│  - Brood nest thermoregulation (34.5°C - 35.5°C)        │
│  - Circadian diurnal daylight curve & bee flow         │
│  - Weight accumulation (nectar flow dynamics)          │
│  - Colony acoustic hum & decibel monitoring            │
│  - Battery discharge curves & LoRa/Wi-Fi signal stats  │
└───────────────────────────┬────────────────────────────┘
                            │
               HTTP POST /api/iot/telemetry
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│       HoneyChain_Backend (Express Ingestion Service)   │
│  - Ingestion: POST /api/iot/telemetry                   │
│  - Strict validation & physical plausibility checks     │
│  - Clock drift limits & anti-tamper constraints        │
│  - Idempotent deduplication (SHA-256 timestamp hash)    │
│  - MongoDB SensorReading storage & Hive health updates  │
└────────────────────────────────────────────────────────┘
```

---

## Simulated Apiaries & Hives

The simulator maintains state for the 5 seeded HoneyChain hives:

| Hive ID | Device ID | Apiary | Region | Floral Source |
| :--- | :--- | :--- | :--- | :--- |
| `HIVE-SB-101` | `ESP32-SB-GW-01` | `APIARY-SB-01` | Sundarbans Mangrove Reserve | Sundarbans Wild Mangrove Flower |
| `HIVE-SB-102` | `ESP32-SB-GW-02` | `APIARY-SB-01` | Sundarbans Mangrove Reserve | Sundarbans Wild Mangrove Flower |
| `HIVE-KV-201` | `ESP32-KV-GW-01` | `APIARY-KV-02` | Kashmir Valley Apiary | Kashmiri White Acacia & Saffron |
| `HIVE-KV-202` | `ESP32-KV-GW-02` | `APIARY-KV-02` | Kashmir Valley Apiary | Kashmiri White Acacia & Saffron |
| `HIVE-WG-301` | `ESP32-WG-GW-01` | `APIARY-WG-03` | Western Ghats Rainforest | Cardamom & Forest Multifloral |

---

## Installation & Setup

### Prerequisites
- Node.js v18.0.0 or higher
- npm or yarn

### Quick Start
```bash
# 1. Clone or navigate to the repository
cd HoneyChain_IoT_Simulator

# 2. Install dependencies
npm install

# 3. Configure environment variables (optional, defaults to http://localhost:5000)
cp .env.example .env

# 4. Run automated test suite
npm test
```

---

## Running the Simulator

### 1. Continuous Daemon Mode with Embedded Web UI (Default)
Runs as an edge telemetry daemon on an immutable **10-minute cadence** (600 seconds) and launches an interactive Web Control Center on port `3001`:
```bash
npm start
```
Once started, open your browser at:
👉 **`http://localhost:3001/ui`**

#### Web Dashboard Features:
- ⏱️ **Live 10-Minute Countdown Clock**: Real-time ticker and progress bar displaying exact seconds remaining until the next automatic batch dispatch.
- 🔒 **Fixed 10m Cadence**: Protocol-enforced 10-minute transmission loop.
- 📦 **Per-Hive Telemetry Cards**: Direct visual inspection of pending readings for each hive (`HIVE-SB-101`, `HIVE-SB-102`, `HIVE-KV-201`, `HIVE-KV-202`, `HIVE-WG-301`).
- ✍️ **Live Data Manipulation**: Edit any sensor parameter (Brood Temperature, Humidity, Weight, Acoustic Frequency, Sound Level, Bee In/Out flow, Battery) before the countdown expires!
- ⚡ **Quick Anomaly Presets**: One-click scenario buttons:
  - 🐝 *Swarm Alert* (285 Hz frequency, exit flow surge)
  - 🔥 *Brood Overheating* (38.6°C fever)
  - ❄️ *Brood Chilling* (31.8°C cold stress)
  - 🍯 *Nectar Flow Surge* (+0.85 kg weight gain)
  - 🪫 *Low Battery Warning* (8% critical discharge)
  - 🔄 *Reset to Natural Physics*
- 🚀 **Manual Dispatch**: "Transmit Batch Now" or per-hive "Send Now" button for instant on-demand delivery.
- 📡 **Live Ingestion Activity Log**: Real-time audit log of HTTP response codes (`201 Created`, `200 Duplicate`, `400 Error`) and payload receipts.

### 2. Single-Cycle Run (Headless one-off transmission)
Transmits a single telemetry cycle for all monitored hives to the backend and exits immediately. Ideal for CI/CD and integration testing:
```bash
npm run once

# Or with CLI flags:
npm run once -- --target http://localhost:5000 --hives HIVE-SB-101,HIVE-KV-201
```

### 3. Development Mode (Hot-Reload)
Runs with `tsx watch` for auto-reloading upon file changes:
```bash
npm run dev
```

---

## REST & Real-Time API Reference

The simulator server provides the following endpoints:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/ui` or `/` | Interactive Web Dashboard HTML interface |
| `GET` | `/api/status` | Current countdown, seconds remaining, fixed cadence, and cycle statistics |
| `GET` | `/api/hives` | All monitored hives with current pending telemetry and override states |
| `PUT` | `/api/hives/:hiveId` | Manipulate pending telemetry values for a hive (e.g. `{ "temperature": 38.5 }`) |
| `POST` | `/api/hives/:hiveId/preset` | Apply an anomaly scenario preset (`swarm`, `overheating`, `chilling`, `nectar_surge`, `low_battery`) |
| `POST` | `/api/hives/:hiveId/reset` | Revert hive pending readings back to natural physics model |
| `POST` | `/api/hives/:hiveId/transmit` | Immediately transmit a single hive's pending telemetry |
| `POST` | `/api/transmit-now` | Immediately transmit all hives and reset the 10-minute timer |
| `GET` | `/api/logs` | Retrieve recent transmission history log entries |
| `DELETE`| `/api/logs` | Clear transmission log history |
| `GET` | `/api/events` | Server-Sent Events (SSE) stream for second-by-second countdown and live sync |

---

## CLI Options

| Flag | Shorthand | Description | Default |
| :--- | :--- | :--- | :--- |
| `--target <url>` | `-t` | Backend target URL (auto-resolves to `/api/iot/telemetry`) | `IOT_TARGET_URL` or `http://localhost:5000` |
| `--port <port>` | `-p` | Web UI Dashboard port | `UI_PORT` or `3001` |
| `--no-ui` | | Run daemon in headless mode without the Web UI | `false` |
| `--interval <ms>` | `-i` | Interval between transmission cycles in milliseconds | `IOT_INTERVAL_MS` or `600000` (10 min) |
| `--once` | `-1` | Transmit a single cycle across all hives and terminate | `false` |
| `--hives <ids>` | | Comma-separated list of hive IDs to simulate | All 5 seeded hives |
| `--help` | `-h` | Display usage instructions | |

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `IOT_TARGET_URL` | Express backend endpoint or base URL | `http://localhost:5000/api/iot/telemetry` |
| `UI_PORT` | Port for the Web Dashboard | `3001` |
| `IOT_INTERVAL_MS` | Delay between cycles in milliseconds | `600000` (10 minutes) |
| `REQUEST_TIMEOUT_MS` | HTTP connection timeout in milliseconds | `10000` (10 seconds) |

---

## Telemetry Payload Schema

Each reading transmitted to `POST /api/iot/telemetry` matches the following contract:

```json
{
  "deviceId": "ESP32-SB-GW-01",
  "hiveId": "HIVE-SB-101",
  "timestamp": "2026-09-09T01:30:00.000Z",
  "temperature": 34.82,
  "humidity": 58.4,
  "weightKg": 31.462,
  "flow": 42,
  "beeInCount": 68,
  "beeOutCount": 26,
  "soundFrequencyHz": 218,
  "acousticsDb": 61.2,
  "batteryLevelPct": 96,
  "ambientTemperature": 27.5,
  "ambientHumidity": 62.1,
  "metadata": {
    "source": "simulator",
    "protocol": "HTTP/REST",
    "firmwareVersion": "v2.4.0-edge",
    "gatewayId": "SIM-GATEWAY-ALPHA",
    "simulationCycle": 1,
    "simulationVersion": "2.0",
    "rssi": -78,
    "snr": 9.4,
    "region": "Sundarbans Mangrove Reserve"
  }
}
```

---

## Running in Production

### With PM2:
```bash
npm run build
pm2 start dist/index.js --name "honeychain-iot-sim" -- --target https://your-backend.onrender.com
```

### With Docker / Container:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### With Cron (e.g. every 15 minutes):
```cron
*/15 * * * * cd /path/to/HoneyChain_IoT_Simulator && npm run once -- --target https://your-backend.onrender.com >> /var/log/iot-sim.log 2>&1
```

---

## License

MIT © HoneyChain Team

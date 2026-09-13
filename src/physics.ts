import { DeviceSimulationState } from "./devices.js";

export interface TelemetryReadingPayload {
  hiveId: string;
  deviceId: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  weightKg: number;
  batteryLevelPct: number;
  beeInCount: number;
  beeOutCount: number;
}

/**
 * Evolves device telemetry statefully with realistic honeybee colony biology,
 * dynamic microclimate oscillations, and natural sensor volatility matching physical IoT hardware.
 */
export function evolveDeviceState(state: DeviceSimulationState): TelemetryReadingPayload {
  state.cycleCount += 1;

  const isSundarbans = state.hiveId.includes("SB");

  // --- 1. TEMPERATURE (°C) ---
  // Mean-reverting brood nest temperature with dynamic volatility (±0.2°C to ±0.5°C swing)
  const baseTemp = isSundarbans ? 34.8 : 34.3;
  const tempOscillation = Math.sin(state.cycleCount * 0.85) * 0.35;
  const tempNoise = (Math.random() - 0.5) * 0.5; // ±0.25°C noise
  state.temp = Number((baseTemp + tempOscillation + tempNoise).toFixed(1));
  state.temp = Math.max(33.4, Math.min(36.0, state.temp));

  // --- 2. HUMIDITY (%) ---
  // Cavity respiration & ambient draft fluctuations (±1.5% to ±3.5% swing per cycle)
  const baseHum = isSundarbans ? 61.5 : 55.5;
  const humOscillation = Math.cos(state.cycleCount * 0.75) * 2.8;
  const humNoise = (Math.random() - 0.5) * 3.2; // ±1.6% noise
  state.humidity = Number((baseHum + humOscillation + humNoise).toFixed(1));
  state.humidity = Math.max(48.0, Math.min(72.0, state.humidity));

  // --- 3. WEIGHT (kg) ---
  // Load cell strain gauge measurement noise + active bee foraging weight jitter (±0.1kg to ±0.3kg)
  const baseWeight = isSundarbans ? 31.5 : 36.2;
  const slowGrowth = (state.cycleCount % 60) * 0.015;
  const weightNoise = (Math.random() - 0.5) * 0.45; // ±0.22kg fluctuation
  state.weightKg = Number((baseWeight + slowGrowth + weightNoise).toFixed(1));

  // --- 4. BATTERY LEVEL (%) ---
  // Slow discharge with natural ±1% ADC voltage measurement flutter
  const baseBattery = isSundarbans ? 96 : 93;
  const batteryJitter = Math.round((Math.random() - 0.5) * 2); // -1, 0, or +1
  const batteryVal = Math.max(
    10,
    Math.min(100, baseBattery + batteryJitter - Math.floor(state.cycleCount / 50))
  );
  state.batteryPct = batteryVal;

  // --- 5. BEE TRAFFIC (Bee In / Bee Out count) ---
  // Dynamic foraging activity with waves and realistic count fluctuations matching hardware scale (~80-150)
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const isDay = hour >= 6 && hour <= 20;

  const baseTraffic = isDay ? (isSundarbans ? 118 : 102) : 32;
  const waveFactor = Math.sin(state.cycleCount * 0.6) * (isDay ? 24 : 8);
  const trafficJitter = (Math.random() - 0.5) * (isDay ? 28 : 10);

  // Slight imbalance for net departures vs arrivals
  const flowBias = Math.round((Math.random() - 0.48) * (isDay ? 12 : 4));

  const beeIn = Math.max(5, Math.round(baseTraffic + waveFactor + trafficJitter + flowBias));
  const beeOut = Math.max(5, Math.round(baseTraffic + waveFactor + trafficJitter - flowBias));

  return {
    hiveId: state.hiveId,
    deviceId: state.deviceId,
    timestamp: now.toISOString(),
    temperature: state.temp,
    humidity: state.humidity,
    weightKg: state.weightKg,
    batteryLevelPct: state.batteryPct,
    beeInCount: beeIn,
    beeOutCount: beeOut,
  };
}

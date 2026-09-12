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
 * thermoregulation physics, and circadian diurnal cycles matching physical IoT hardware.
 */
export function evolveDeviceState(state: DeviceSimulationState): TelemetryReadingPayload {
  state.cycleCount += 1;

  // Temperature: holds tight brood nest thermoregulation around 34.5-35.5°C
  const tempDrift = (Math.random() - 0.49) * 0.15;
  state.temp = Number(Math.max(33.2, Math.min(36.2, state.temp + tempDrift)).toFixed(1));

  // Humidity: fluctuates mildly inside hive cavity
  const humDrift = (Math.random() - 0.5) * 0.4;
  state.humidity = Number(Math.max(48.0, Math.min(68.0, state.humidity + humDrift)).toFixed(1));

  // Weight: slow gradual nectar flow accumulation with minor jitter
  const weightGain = Math.random() * 0.015 - 0.003;
  state.weightKg = Number(Math.max(15.0, state.weightKg + weightGain).toFixed(1));

  // Battery: very slow discharge over time
  const batteryDrain = 0.005 + Math.random() * 0.005;
  state.batteryPct = Number(Math.max(5.0, state.batteryPct - batteryDrain).toFixed(1));

  // Bee foraging activity flow: active during daylight (07:00 - 19:00), dormant at night
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const diurnalFactor = Math.sin(((hour - 6) * Math.PI) / 12);
  const isDay = hour >= 7 && hour <= 19;
  const baseFlow = isDay ? Math.round(diurnalFactor * 65) : 0;
  const diurnalFlow = isDay
    ? Math.max(-10, Math.min(90, baseFlow + Math.round(Math.random() * 14 - 7)))
    : Math.round(Math.random() * 4 - 2);

  // Compute realistic directional bee traffic
  const beeIn = isDay ? Math.max(0, Math.round(40 + diurnalFlow * 0.6 + Math.random() * 10)) : Math.round(Math.random() * 3);
  const beeOut = isDay ? Math.max(0, Math.round(40 - diurnalFlow * 0.4 + Math.random() * 10)) : Math.round(Math.random() * 3);

  return {
    hiveId: state.hiveId,
    deviceId: state.deviceId,
    timestamp: now.toISOString(),
    temperature: state.temp,
    humidity: state.humidity,
    weightKg: state.weightKg,
    batteryLevelPct: Math.round(state.batteryPct),
    beeInCount: beeIn,
    beeOutCount: beeOut,
  };
}

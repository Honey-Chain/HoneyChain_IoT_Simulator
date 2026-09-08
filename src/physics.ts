import { DeviceSimulationState } from "./devices.js";

export interface TelemetryReadingPayload {
  deviceId: string;
  hiveId: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  weightKg: number;
  flow: number;
  beeInCount: number;
  beeOutCount: number;
  soundFrequencyHz: number;
  acousticsDb: number;
  batteryLevelPct: number;
  ambientTemperature: number;
  ambientHumidity: number;
  metadata: {
    source: string;
    protocol: string;
    firmwareVersion: string;
    gatewayId: string;
    simulationCycle: number;
    simulationVersion: string;
    rssi: number;
    snr: number;
    region?: string;
  };
}

/**
 * Evolves device telemetry statefully with realistic honeybee colony biology,
 * thermoregulation physics, and circadian diurnal cycles.
 */
export function evolveDeviceState(state: DeviceSimulationState): TelemetryReadingPayload {
  state.cycleCount += 1;

  // Temperature: holds tight brood nest thermoregulation around 34.5-35.5°C
  const tempDrift = (Math.random() - 0.49) * 0.15;
  state.temp = Number(Math.max(33.2, Math.min(36.2, state.temp + tempDrift)).toFixed(2));

  // Humidity: fluctuates mildly inside hive cavity
  const humDrift = (Math.random() - 0.5) * 0.4;
  state.humidity = Number(Math.max(48.0, Math.min(68.0, state.humidity + humDrift)).toFixed(1));

  // Weight: slow gradual nectar flow accumulation with minor jitter
  const weightGain = Math.random() * 0.015 - 0.003;
  state.weightKg = Number(Math.max(15.0, state.weightKg + weightGain).toFixed(3));

  // Battery: very slow discharge over time
  const batteryDrain = 0.005 + Math.random() * 0.005;
  state.batteryPct = Number(Math.max(5.0, state.batteryPct - batteryDrain).toFixed(1));

  // Acoustics: minor fluctuation around base frequency with occasional active spikes
  const acousticJitter = Math.round((Math.random() - 0.5) * 6);
  const acousticHz = state.baseFrequencyHz + acousticJitter;
  const acousticDb = Number((58.0 + Math.random() * 6.0).toFixed(1));

  // Ambient environment: simulated diurnal solar curve
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const diurnalFactor = Math.sin(((hour - 6) * Math.PI) / 12);
  const diurnalTemp = Number((25.0 + diurnalFactor * 6.0 + (Math.random() - 0.5)).toFixed(1));
  const diurnalHum = Number((65.0 - diurnalFactor * 12.0 + (Math.random() - 0.5) * 2).toFixed(1));

  // Bee foraging activity flow: active during daylight (07:00 - 19:00), dormant at night
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
    flow: diurnalFlow,
    beeInCount: beeIn,
    beeOutCount: beeOut,
    soundFrequencyHz: acousticHz,
    acousticsDb: acousticDb,
    batteryLevelPct: Math.round(state.batteryPct),
    ambientTemperature: diurnalTemp,
    ambientHumidity: diurnalHum,
    metadata: {
      source: "simulator",
      protocol: "HTTP/REST",
      firmwareVersion: "v2.4.0-edge",
      gatewayId: "SIM-GATEWAY-ALPHA",
      simulationCycle: state.cycleCount,
      simulationVersion: "2.0",
      rssi: -76 - Math.round(Math.random() * 10),
      snr: Number((8.5 + Math.random() * 2.5).toFixed(1)),
      region: state.region,
    },
  };
}

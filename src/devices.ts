export interface DeviceSimulationState {
  hiveId: string;
  deviceId: string;
  apiaryId?: string;
  region?: string;
  temp: number;
  humidity: number;
  weightKg: number;
  batteryPct: number;
  baseFrequencyHz: number;
  cycleCount: number;
}

/**
 * Baseline stateful parameters for the seeded HoneyChain hives and ESP32 nodes.
 */
export const defaultDevices: DeviceSimulationState[] = [
  {
    hiveId: "HIVE-SB-101",
    deviceId: "ESP32-SB-GW-01",
    apiaryId: "APIARY-SB-01",
    region: "Sundarbans Mangrove Reserve",
    temp: 34.8,
    humidity: 58.2,
    weightKg: 31.45,
    batteryPct: 96.5,
    baseFrequencyHz: 215,
    cycleCount: 0,
  },
  {
    hiveId: "HIVE-SB-102",
    deviceId: "ESP32-SB-GW-02",
    apiaryId: "APIARY-SB-01",
    region: "Sundarbans Mangrove Reserve",
    temp: 34.3,
    humidity: 59.1,
    weightKg: 28.7,
    batteryPct: 89.0,
    baseFrequencyHz: 208,
    cycleCount: 0,
  },
  {
    hiveId: "HIVE-KV-201",
    deviceId: "ESP32-KV-GW-01",
    apiaryId: "APIARY-KV-02",
    region: "Kashmir Valley Apiary",
    temp: 33.9,
    humidity: 55.4,
    weightKg: 36.1,
    batteryPct: 92.3,
    baseFrequencyHz: 236,
    cycleCount: 0,
  },
  {
    hiveId: "HIVE-KV-202",
    deviceId: "ESP32-KV-GW-02",
    apiaryId: "APIARY-KV-02",
    region: "Kashmir Valley Apiary",
    temp: 34.5,
    humidity: 56.8,
    weightKg: 32.8,
    batteryPct: 98.0,
    baseFrequencyHz: 212,
    cycleCount: 0,
  },
  {
    hiveId: "HIVE-WG-301",
    deviceId: "ESP32-WG-GW-01",
    apiaryId: "APIARY-WG-03",
    region: "Western Ghats Rainforest",
    temp: 35.1,
    humidity: 61.2,
    weightKg: 29.85,
    batteryPct: 95.0,
    baseFrequencyHz: 220,
    cycleCount: 0,
  },
];

/**
 * Returns a cloned array of initial device states.
 */
export function getInitialDevices(hiveFilter?: string[]): DeviceSimulationState[] {
  const cloned = defaultDevices.map((d) => ({ ...d }));
  if (hiveFilter && hiveFilter.length > 0) {
    const filterSet = new Set(hiveFilter.map((id) => id.toUpperCase()));
    return cloned.filter((d) => filterSet.has(d.hiveId.toUpperCase()));
  }
  return cloned;
}

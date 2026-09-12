import { DeviceSimulationState, getInitialDevices } from "./devices.js";
import { TelemetryReadingPayload, evolveDeviceState } from "./physics.js";
import {
  TransmissionResult,
  CycleSummary,
  sendTelemetry,
} from "./transmitter.js";
import { DEFAULT_INTERVAL_MS, resolveTargetEndpoint } from "./config.js";

export interface LogEntry {
  id: string;
  timestamp: string;
  hiveId: string;
  deviceId: string;
  success: boolean;
  status?: number;
  duplicate?: boolean;
  message?: string;
  temperature: number;
  humidity: number;
  weightKg: number;
  flow: number;
  batteryLevelPct: number;
  soundFrequencyHz: number;
}

export interface HiveStatus {
  hiveId: string;
  deviceId: string;
  apiaryId?: string;
  region?: string;
  isManipulated: boolean;
  pendingPayload: TelemetryReadingPayload;
  lastResult?: TransmissionResult;
  lastTransmittedAt?: string;
}

export interface SimulatorStatus {
  intervalMs: number;
  intervalMinutes: number;
  nextBatchAt: string;
  secondsRemaining: number;
  totalCycles: number;
  targetUrl: string;
  hivesCount: number;
  isRunning: boolean;
}

export type SimulatorEventCallback = (event: {
  type: "tick" | "update" | "reset" | "transmit" | "cycle_complete";
  data?: any;
}) => void;

/**
 * Stateful Simulation Engine that maintains device physics, pending readings,
 * countdown timers, manual overrides, and automated 10-minute transmissions.
 */
export class SimulationEngine {
  private devices: Map<string, DeviceSimulationState> = new Map();
  private pendingReadings: Map<string, TelemetryReadingPayload> = new Map();
  private isManipulated: Map<string, boolean> = new Map();
  private lastResults: Map<string, TransmissionResult> = new Map();
  private lastTransmittedAt: Map<string, string> = new Map();

  private intervalMs: number = DEFAULT_INTERVAL_MS; // Fixed 10 minutes
  private nextBatchTimestamp: number = 0;
  private targetUrl: string;
  private cycleIndex: number = 0;
  private isRunning: boolean = false;
  private isTransmitting: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private recentLogs: LogEntry[] = [];
  private maxLogs: number = 100;
  private listeners: Set<SimulatorEventCallback> = new Set();

  constructor(options?: {
    targetUrl?: string;
    intervalMs?: number;
    hives?: string[];
  }) {
    const rawTarget =
      options?.targetUrl ||
      process.env.IOT_TARGET_URL ||
      "http://localhost:5000";
    this.targetUrl = resolveTargetEndpoint(rawTarget);

    // Default to 10 minutes (600,000 ms)
    if (options?.intervalMs && options.intervalMs > 0) {
      this.intervalMs = options.intervalMs;
    } else {
      this.intervalMs = DEFAULT_INTERVAL_MS;
    }

    // Initialize devices
    const deviceList = getInitialDevices(options?.hives);
    for (const dev of deviceList) {
      this.devices.set(dev.hiveId, dev);
    }

    // Prepare initial pending batch
    this.prepareInitialBatch();
  }

  /**
   * Prepares the initial batch of pending readings.
   */
  private prepareInitialBatch(): void {
    for (const [hiveId, dev] of this.devices.entries()) {
      const payload = evolveDeviceState(dev);
      this.pendingReadings.set(hiveId, payload);
      this.isManipulated.set(hiveId, false);
    }
    this.nextBatchTimestamp = Date.now() + this.intervalMs;
  }

  /**
   * Prepares the next cycle readings from current device state.
   */
  public prepareNextBatch(): void {
    for (const [hiveId, dev] of this.devices.entries()) {
      const payload = evolveDeviceState(dev);
      this.pendingReadings.set(hiveId, payload);
      this.isManipulated.set(hiveId, false);
    }
    this.nextBatchTimestamp = Date.now() + this.intervalMs;
    this.notifyListeners({ type: "cycle_complete" });
  }

  /**
   * Starts the automatic cadence timer.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.nextBatchTimestamp = Date.now() + this.intervalMs;

    this.timer = setInterval(async () => {
      if (!this.isRunning) return;

      const remaining = this.nextBatchTimestamp - Date.now();
      if (remaining <= 0) {
        if (!this.isTransmitting) {
          // Immediately advance nextBatchTimestamp so subsequent 1-second ticks don't re-trigger while async I/O is in-flight
          this.nextBatchTimestamp = Date.now() + this.intervalMs;
          await this.transmitBatch();
        }
      } else {
        this.notifyListeners({ type: "tick", data: this.getStatus() });
      }
    }, 1000);
  }

  /**
   * Stops the background simulator timer.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Transmits all pending telemetry readings in the current batch.
   */
  public async transmitBatch(targetUrl?: string): Promise<CycleSummary> {
    if (this.isTransmitting) {
      // Guard against concurrent re-entry
      return {
        total: 0,
        successful: 0,
        duplicates: 0,
        failed: 0,
        results: [],
      };
    }

    this.isTransmitting = true;
    try {
      const endpoint = targetUrl ? resolveTargetEndpoint(targetUrl) : this.targetUrl;
      this.cycleIndex += 1;

      const payloads: TelemetryReadingPayload[] = [];
      const txTime = new Date();
      for (const [hiveId, payload] of this.pendingReadings.entries()) {
        // Refresh timestamp to transmission instant and assign unique deterministic ID
        payload.timestamp = txTime.toISOString();
        payload.id = `read-${payload.deviceId}-${txTime.getTime()}`;
        payload.readingId = payload.id;
        payloads.push(payload);
      }

      const results: TransmissionResult[] = [];
      let successful = 0;
      let duplicates = 0;
      let failed = 0;

      for (const payload of payloads) {
        const res = await sendTelemetry(endpoint, payload);
        results.push(res);
        this.lastResults.set(payload.hiveId, res);
        this.lastTransmittedAt.set(payload.hiveId, new Date().toISOString());

        if (res.success) {
          if (res.duplicate) duplicates += 1;
          else successful += 1;
        } else {
          failed += 1;
        }

        this.addLog({
          id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: new Date().toLocaleTimeString(),
          hiveId: payload.hiveId,
          deviceId: payload.deviceId,
          success: res.success,
          status: res.status,
          duplicate: res.duplicate,
          message: res.message || res.error,
          temperature: payload.temperature,
          humidity: payload.humidity,
          weightKg: payload.weightKg,
          flow: payload.flow,
          batteryLevelPct: payload.batteryLevelPct,
          soundFrequencyHz: payload.soundFrequencyHz,
        });
      }

      // Schedule next cycle and reset manipulated states
      this.prepareNextBatch();

      const summary: CycleSummary = {
        total: payloads.length,
        successful,
        duplicates,
        failed,
        results,
      };

      this.notifyListeners({ type: "transmit", data: summary });
      return summary;
    } finally {
      this.isTransmitting = false;
    }
  }

  /**
   * Transmits a single hive's pending telemetry immediately.
   */
  public async transmitSingleHive(
    hiveId: string,
    targetUrl?: string
  ): Promise<TransmissionResult> {
    const upperId = hiveId.toUpperCase();
    const payload = this.pendingReadings.get(upperId);
    if (!payload) {
      throw new Error(`Hive ${hiveId} not found in simulator.`);
    }

    const endpoint = targetUrl ? resolveTargetEndpoint(targetUrl) : this.targetUrl;
    const txTime = new Date();
    payload.timestamp = txTime.toISOString();
    payload.id = `read-${payload.deviceId}-${txTime.getTime()}`;
    payload.readingId = payload.id;

    const res = await sendTelemetry(endpoint, payload);
    this.lastResults.set(upperId, res);
    this.lastTransmittedAt.set(upperId, new Date().toISOString());

    this.addLog({
      id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      hiveId: payload.hiveId,
      deviceId: payload.deviceId,
      success: res.success,
      status: res.status,
      duplicate: res.duplicate,
      message: res.message || res.error,
      temperature: payload.temperature,
      humidity: payload.humidity,
      weightKg: payload.weightKg,
      flow: payload.flow,
      batteryLevelPct: payload.batteryLevelPct,
      soundFrequencyHz: payload.soundFrequencyHz,
    });

    // Evolve single hive for next cycle
    const dev = this.devices.get(upperId);
    if (dev) {
      const nextPayload = evolveDeviceState(dev);
      this.pendingReadings.set(upperId, nextPayload);
      this.isManipulated.set(upperId, false);
    }

    this.notifyListeners({ type: "transmit", data: { hiveId: upperId, result: res } });
    return res;
  }

  /**
   * Manipulates pending telemetry values for a specific hive before sending.
   */
  public updatePendingTelemetry(
    hiveId: string,
    overrides: Partial<TelemetryReadingPayload>
  ): TelemetryReadingPayload {
    const upperId = hiveId.toUpperCase();
    const current = this.pendingReadings.get(upperId);
    if (!current) {
      throw new Error(`Hive ${hiveId} not found.`);
    }

    if (overrides.temperature !== undefined) {
      current.temperature = Number(Number(overrides.temperature).toFixed(2));
    }
    if (overrides.humidity !== undefined) {
      current.humidity = Number(Number(overrides.humidity).toFixed(1));
    }
    if (overrides.weightKg !== undefined) {
      current.weightKg = Number(Number(overrides.weightKg).toFixed(3));
    }
    if (overrides.flow !== undefined) {
      current.flow = Math.round(Number(overrides.flow));
    }
    if (overrides.beeInCount !== undefined) {
      current.beeInCount = Math.max(0, Math.round(Number(overrides.beeInCount)));
    }
    if (overrides.beeOutCount !== undefined) {
      current.beeOutCount = Math.max(0, Math.round(Number(overrides.beeOutCount)));
    }
    if (overrides.soundFrequencyHz !== undefined) {
      current.soundFrequencyHz = Math.round(Number(overrides.soundFrequencyHz));
    }
    if (overrides.acousticsDb !== undefined) {
      current.acousticsDb = Number(Number(overrides.acousticsDb).toFixed(1));
    }
    if (overrides.batteryLevelPct !== undefined) {
      current.batteryLevelPct = Math.max(
        0,
        Math.min(100, Math.round(Number(overrides.batteryLevelPct)))
      );
    }
    if (overrides.ambientTemperature !== undefined) {
      current.ambientTemperature = Number(
        Number(overrides.ambientTemperature).toFixed(1)
      );
    }
    if (overrides.ambientHumidity !== undefined) {
      current.ambientHumidity = Number(
        Number(overrides.ambientHumidity).toFixed(1)
      );
    }

    this.isManipulated.set(upperId, true);
    this.notifyListeners({ type: "update", data: { hiveId: upperId, payload: current } });
    return current;
  }

  /**
   * Resets a hive's pending telemetry back to natural physics simulation.
   */
  public resetPendingTelemetry(hiveId: string): TelemetryReadingPayload {
    const upperId = hiveId.toUpperCase();
    const dev = this.devices.get(upperId);
    if (!dev) {
      throw new Error(`Hive ${hiveId} not found.`);
    }

    const resetPayload = evolveDeviceState(dev);
    this.pendingReadings.set(upperId, resetPayload);
    this.isManipulated.set(upperId, false);

    this.notifyListeners({ type: "reset", data: { hiveId: upperId, payload: resetPayload } });
    return resetPayload;
  }

  /**
   * Applies common anomaly/simulation presets to a hive.
   */
  public applyScenarioPreset(
    hiveId: string,
    preset: "swarm" | "overheating" | "chilling" | "nectar_surge" | "low_battery"
  ): TelemetryReadingPayload {
    const upperId = hiveId.toUpperCase();
    const current = this.pendingReadings.get(upperId);
    if (!current) {
      throw new Error(`Hive ${hiveId} not found.`);
    }

    switch (preset) {
      case "swarm":
        return this.updatePendingTelemetry(upperId, {
          soundFrequencyHz: 285,
          acousticsDb: 72.5,
          beeOutCount: 140,
          beeInCount: 15,
          flow: -85,
        });
      case "overheating":
        return this.updatePendingTelemetry(upperId, {
          temperature: 38.6,
          humidity: 45.0,
          acousticsDb: 68.0,
        });
      case "chilling":
        return this.updatePendingTelemetry(upperId, {
          temperature: 31.8,
          humidity: 69.5,
          soundFrequencyHz: 195,
        });
      case "nectar_surge":
        return this.updatePendingTelemetry(upperId, {
          weightKg: current.weightKg + 0.85,
          flow: 65,
          beeInCount: 95,
          beeOutCount: 60,
        });
      case "low_battery":
        return this.updatePendingTelemetry(upperId, {
          batteryLevelPct: 8,
        });
      default:
        return current;
    }
  }

  /**
   * Gets simulator status and countdown.
   */
  public getStatus(): SimulatorStatus {
    const now = Date.now();
    const remainingMs = Math.max(0, this.nextBatchTimestamp - now);
    return {
      intervalMs: this.intervalMs,
      intervalMinutes: Math.round(this.intervalMs / 60000),
      nextBatchAt: new Date(this.nextBatchTimestamp).toISOString(),
      secondsRemaining: Math.ceil(remainingMs / 1000),
      totalCycles: this.cycleIndex,
      targetUrl: this.targetUrl,
      hivesCount: this.devices.size,
      isRunning: this.isRunning,
    };
  }

  /**
   * Returns list of all hives with their device details and pending payloads.
   */
  public getAllHives(): HiveStatus[] {
    const list: HiveStatus[] = [];
    for (const [hiveId, dev] of this.devices.entries()) {
      const pending = this.pendingReadings.get(hiveId)!;
      const manipulated = this.isManipulated.get(hiveId) || false;
      const lastResult = this.lastResults.get(hiveId);
      const lastTx = this.lastTransmittedAt.get(hiveId);

      list.push({
        hiveId: dev.hiveId,
        deviceId: dev.deviceId,
        apiaryId: dev.apiaryId,
        region: dev.region,
        isManipulated: manipulated,
        pendingPayload: pending,
        lastResult,
        lastTransmittedAt: lastTx,
      });
    }
    return list;
  }

  /**
   * Sets the target endpoint URL.
   */
  public setTargetUrl(url: string): void {
    this.targetUrl = resolveTargetEndpoint(url);
  }

  /**
   * Adds an entry to recent logs.
   */
  private addLog(entry: LogEntry): void {
    this.recentLogs.unshift(entry);
    if (this.recentLogs.length > this.maxLogs) {
      this.recentLogs.pop();
    }
  }

  /**
   * Returns recent transmission logs.
   */
  public getLogs(): LogEntry[] {
    return [...this.recentLogs];
  }

  /**
   * Clears recent logs.
   */
  public clearLogs(): void {
    this.recentLogs = [];
  }

  /**
   * Subscribes a listener to simulation events.
   */
  public subscribe(callback: SimulatorEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(event: {
    type: "tick" | "update" | "reset" | "transmit" | "cycle_complete";
    data?: any;
  }): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener failure
      }
    }
  }
}

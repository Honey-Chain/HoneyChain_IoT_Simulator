import { TelemetryReadingPayload } from "./physics.js";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "./config.js";

export interface TransmissionResult {
  deviceId: string;
  hiveId: string;
  success: boolean;
  status?: number;
  duplicate?: boolean;
  message?: string;
  error?: string;
}

export interface CycleSummary {
  total: number;
  successful: number;
  duplicates: number;
  failed: number;
  results: TransmissionResult[];
}

/**
 * Transmits a single telemetry payload to the backend ingestion endpoint.
 */
export async function sendTelemetry(
  endpointUrl: string,
  payload: TelemetryReadingPayload,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<TransmissionResult> {
  const result: TransmissionResult = {
    deviceId: payload.deviceId,
    hiveId: payload.hiveId,
    success: false,
  };

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "HoneyChain-IoTSimulator/2.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    result.status = response.status;
    const body = (await response.json().catch(() => ({}))) as any;

    if (response.ok) {
      result.success = true;
      result.duplicate = body?.duplicate === true;
      result.message = result.duplicate
        ? "Duplicate reading accepted (idempotent)"
        : body?.message || "Telemetry ingested successfully";
    } else {
      result.success = false;
      result.message = body?.error?.message || body?.message || `HTTP ${response.status} Error`;
    }
  } catch (err: any) {
    result.success = false;
    if (err.name === "TimeoutError") {
      result.error = `Connection timed out after ${timeoutMs}ms`;
      result.message = result.error;
    } else {
      result.error = err.message || "Network error connecting to backend";
      result.message = result.error;
    }
  }

  return result;
}

/**
 * Transmits a cycle of telemetry payloads across multiple devices with formatted logging.
 */
export async function transmitTelemetryCycle(
  endpointUrl: string,
  payloads: TelemetryReadingPayload[],
  timeoutMs?: number
): Promise<CycleSummary> {
  const results: TransmissionResult[] = [];
  let successful = 0;
  let duplicates = 0;
  let failed = 0;

  for (const payload of payloads) {
    const res = await sendTelemetry(endpointUrl, payload, timeoutMs);
    results.push(res);

    if (res.success) {
      if (res.duplicate) {
        duplicates += 1;
        console.log(
          `  [↷ DUP] ${payload.deviceId} (${payload.hiveId}): ` +
            `${payload.temperature}°C | ${payload.humidity}% | ${payload.weightKg}kg | ` +
            `${payload.batteryLevelPct}% batt -> ${res.message}`
        );
      } else {
        successful += 1;
        console.log(
          `  [✓ OK ] ${payload.deviceId} (${payload.hiveId}): ` +
            `${payload.temperature}°C | ${payload.humidity}% | ${payload.weightKg}kg | ` +
            `${payload.batteryLevelPct}% batt | flow ${payload.flow} -> ${res.message}`
        );
      }
    } else {
      failed += 1;
      console.warn(
        `  [✗ ERR] ${payload.deviceId} (${payload.hiveId}): ` +
          `[${res.status || "NET"}] ${res.message}`
      );
    }
  }

  return {
    total: payloads.length,
    successful,
    duplicates,
    failed,
    results,
  };
}

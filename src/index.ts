import {
  parseCliArgs,
  printHelp,
  resolveTargetEndpoint,
  resolveIntervalMs,
} from "./config.js";
import { getInitialDevices } from "./devices.js";
import { evolveDeviceState } from "./physics.js";
import { transmitTelemetryCycle } from "./transmitter.js";

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  // Resolve target endpoint
  const rawTarget =
    cli.targetUrl || process.env.IOT_TARGET_URL || "http://localhost:5000";
  let endpointUrl: string;
  try {
    endpointUrl = resolveTargetEndpoint(rawTarget);
  } catch (err: any) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  // Resolve interval
  const intervalMs = resolveIntervalMs(cli.intervalMs || process.env.IOT_INTERVAL_MS);

  // Initialize devices
  const devices = getInitialDevices(cli.hives);
  if (devices.length === 0) {
    console.error("[FATAL] No matching hives found to simulate.");
    process.exit(1);
  }

  // Print startup banner
  console.log("\n=======================================================");
  console.log("       HONEYCHAIN IOT EDGE TELEMETRY SIMULATOR         ");
  console.log("=======================================================");
  console.log(`[CONFIG] Ingestion Endpoint : ${endpointUrl}`);
  console.log(`[CONFIG] Monitored Devices  : ${devices.length} hives`);
  console.log(`[CONFIG] Transmission Period: ${intervalMs} ms (${(intervalMs / 1000).toFixed(1)}s)`);
  console.log(`[CONFIG] Execution Mode     : ${cli.once ? "Single Cycle (--once)" : "Continuous Daemon"}`);
  console.log("=======================================================\n");

  let isRunning = true;
  let cycleIndex = 0;
  let timer: NodeJS.Timeout | null = null;

  const runCycle = async () => {
    if (!isRunning) return;
    cycleIndex += 1;
    const startTime = new Date();
    console.log(
      `--- [Cycle #${cycleIndex}] Transmitting Telemetry at ${startTime.toLocaleTimeString()} ---`
    );

    // Evolve state for each device
    const payloads = devices.map((device) => evolveDeviceState(device));

    // Transmit to backend
    const summary = await transmitTelemetryCycle(endpointUrl, payloads);

    console.log(
      `--- [Cycle #${cycleIndex} Summary] Total: ${summary.total} | OK: ${summary.successful} | Dup: ${summary.duplicates} | Failed: ${summary.failed} ---\n`
    );

    if (cli.once) {
      process.exit(summary.failed > 0 && summary.successful === 0 ? 1 : 0);
    }
  };

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    console.log(`\n[SIMULATOR] Received ${signal}. Shutting down edge simulator cleanly...`);
    isRunning = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // First cycle immediately
  await runCycle();

  // If continuous mode, schedule subsequent cycles
  if (!cli.once) {
    timer = setInterval(runCycle, intervalMs);
  }
}

main().catch((err) => {
  console.error("[FATAL] Unhandled simulator error:", err);
  process.exit(1);
});

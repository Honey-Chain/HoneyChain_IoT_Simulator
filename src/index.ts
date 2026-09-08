import {
  parseCliArgs,
  printHelp,
  resolveTargetEndpoint,
  resolveIntervalMs,
  DEFAULT_UI_PORT,
} from "./config.js";
import { getInitialDevices } from "./devices.js";
import { SimulationEngine } from "./simulator.js";
import { startSimulatorServer } from "./server.js";

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

  // Resolve interval (default 10 minutes = 600,000ms)
  const intervalMs = resolveIntervalMs(
    cli.intervalMs || process.env.IOT_INTERVAL_MS
  );

  // Validate devices
  const initialDevices = getInitialDevices(cli.hives);
  if (initialDevices.length === 0) {
    console.error("[FATAL] No matching hives found to simulate.");
    process.exit(1);
  }

  // If single-cycle CLI mode requested, execute immediately and exit
  if (cli.once) {
    console.log("\n=======================================================");
    console.log("       HONEYCHAIN IOT EDGE TELEMETRY SIMULATOR         ");
    console.log("=======================================================");
    console.log(`[CONFIG] Ingestion Endpoint : ${endpointUrl}`);
    console.log(`[CONFIG] Monitored Devices  : ${initialDevices.length} hives`);
    console.log(`[CONFIG] Mode               : Single Cycle (--once)`);
    console.log("=======================================================\n");

    const engine = new SimulationEngine({
      targetUrl: endpointUrl,
      intervalMs,
      hives: cli.hives,
    });

    console.log(`--- Transmitting Single Telemetry Cycle at ${new Date().toLocaleTimeString()} ---`);
    const summary = await engine.transmitBatch();
    console.log(
      `--- Cycle Summary: Total ${summary.total} | OK: ${summary.successful} | Dup: ${summary.duplicates} | Failed: ${summary.failed} ---\n`
    );

    process.exit(summary.failed > 0 && summary.successful === 0 ? 1 : 0);
  }

  // Continuous Daemon Mode with Embedded Web UI
  const engine = new SimulationEngine({
    targetUrl: endpointUrl,
    intervalMs,
    hives: cli.hives,
  });

  const uiPort =
    cli.uiPort ||
    (process.env.UI_PORT ? parseInt(process.env.UI_PORT, 10) : DEFAULT_UI_PORT);

  let webServer: any = null;

  if (!cli.noUi) {
    try {
      const { server } = await startSimulatorServer(engine, uiPort);
      webServer = server;
    } catch (err: any) {
      console.error(`[WARN] Could not start Web UI on port ${uiPort}: ${err.message}`);
    }
  }

  // Print startup banner
  console.log("\n=======================================================");
  console.log("       HONEYCHAIN IOT EDGE TELEMETRY SIMULATOR         ");
  console.log("=======================================================");
  console.log(`[CONFIG] Ingestion Endpoint : ${endpointUrl}`);
  console.log(`[CONFIG] Monitored Devices  : ${initialDevices.length} hives`);
  console.log(`[CONFIG] Cadence (Fixed)    : ${intervalMs} ms (${Math.round(intervalMs / 60000)} minutes)`);
  if (!cli.noUi && webServer) {
    console.log(`[UI]     Web Dashboard      : http://localhost:${uiPort}/ui`);
    console.log(`[UI]     REST Status API    : http://localhost:${uiPort}/api/status`);
  }
  console.log("=======================================================\n");

  // Start the 10-minute cadence timer
  engine.start();
  console.log(
    `[SIMULATOR] Simulation engine active. Next batch auto-dispatch at ${new Date(
      Date.now() + intervalMs
    ).toLocaleTimeString()}.\n`
  );

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    console.log(`\n[SIMULATOR] Received ${signal}. Shutting down cleanly...`);
    engine.stop();
    if (webServer) {
      webServer.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[FATAL] Unhandled simulator error:", err);
  process.exit(1);
});

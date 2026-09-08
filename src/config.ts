import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

export const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000; // 10 seconds
export const DEFAULT_UI_PORT = 3001;

export interface SimulatorCliOptions {
  targetUrl?: string;
  intervalMs?: number;
  uiPort?: number;
  noUi?: boolean;
  once: boolean;
  hives?: string[];
  help: boolean;
}

/**
 * Resolves and normalizes the target backend endpoint URL.
 * Accepts full endpoint, base API URL, or domain base and canonicalizes to /api/iot/telemetry.
 */
export function resolveTargetEndpoint(rawUrl?: string): string {
  const url = rawUrl?.trim();

  if (!url) {
    throw new Error(
      "Missing required target URL. Provide IOT_TARGET_URL in environment or pass --target <url>"
    );
  }

  // Strip trailing slashes
  const cleanBase = url.replace(/\/+$/, "");

  if (cleanBase.endsWith("/api/iot/telemetry")) {
    return cleanBase;
  }
  if (cleanBase.endsWith("/api/iot")) {
    return `${cleanBase}/telemetry`;
  }
  if (cleanBase.endsWith("/api")) {
    return `${cleanBase}/iot/telemetry`;
  }

  return `${cleanBase}/api/iot/telemetry`;
}

/**
 * Parses and validates the cycle interval in milliseconds.
 */
export function resolveIntervalMs(rawInterval?: string | number): number {
  if (rawInterval === undefined || rawInterval === null) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = typeof rawInterval === "number" ? rawInterval : parseInt(rawInterval, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return DEFAULT_INTERVAL_MS;
  }

  return parsed;
}

/**
 * Parses CLI arguments.
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): SimulatorCliOptions {
  const options: SimulatorCliOptions = {
    once: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--once" || arg === "-1") {
      options.once = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--target" || arg === "-t") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        options.targetUrl = args[++i];
      }
    } else if (arg === "--interval" || arg === "-i") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        options.intervalMs = parseInt(args[++i], 10);
      }
    } else if (arg === "--port" || arg === "-p") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        options.uiPort = parseInt(args[++i], 10);
      }
    } else if (arg === "--no-ui") {
      options.noUi = true;
    } else if (arg === "--hives") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        options.hives = args[++i].split(",").map((h) => h.trim());
      }
    }
  }

  return options;
}

/**
 * Prints usage instructions to the console.
 */
export function printHelp(): void {
  console.log(`
HoneyChain IoT Edge Telemetry Simulator
=========================================

Usage:
  npm start                      Run simulator daemon with embedded Web UI (http://localhost:3001/ui)
  npm run once                   Run a single telemetry cycle across all hives and exit
  npm run dev                    Run in hot-reload mode with tsx watch

Options:
  -t, --target <url>             Backend URL (default: IOT_TARGET_URL or http://localhost:5000)
  -p, --port <port>              Web UI port (default: UI_PORT or 3001)
  --no-ui                        Disable the embedded Web UI server
  -i, --interval <ms>            Cycle interval in ms (default: IOT_INTERVAL_MS or 600000 = 10m)
  --once, -1                     Transmit a single cycle and terminate
  --hives <ids>                  Comma-separated hive IDs to simulate (e.g. HIVE-SB-101,HIVE-KV-201)
  -h, --help                     Display this help message

Environment Variables:
  IOT_TARGET_URL                 Target Express backend endpoint (e.g. http://localhost:5000/api/iot/telemetry)
  UI_PORT                        Port for the Web Dashboard (default: 3001)
  IOT_INTERVAL_MS                Cycle duration in milliseconds (default: 600000 = 10m)
  REQUEST_TIMEOUT_MS             HTTP timeout in milliseconds (default: 10000)
`);
}

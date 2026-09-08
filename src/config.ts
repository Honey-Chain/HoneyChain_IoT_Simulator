import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

export const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000; // 10 seconds

export interface SimulatorCliOptions {
  targetUrl?: string;
  intervalMs?: number;
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
  npm start                      Run simulator in continuous daemon mode
  npm run once                   Run a single telemetry cycle across all hives and exit
  npm run dev                    Run in hot-reload mode with tsx watch

Options:
  -t, --target <url>             Backend URL (default: IOT_TARGET_URL or http://localhost:5000)
  -i, --interval <ms>            Cycle interval in ms (default: IOT_INTERVAL_MS or 600000 = 10m)
  --once, -1                     Transmit a single cycle and terminate
  --hives <ids>                  Comma-separated hive IDs to simulate (e.g. HIVE-SB-101,HIVE-KV-201)
  -h, --help                     Display this help message

Environment Variables:
  IOT_TARGET_URL                 Target Express backend endpoint (e.g. http://localhost:5000/api/iot/telemetry)
  IOT_INTERVAL_MS                Cycle duration in milliseconds (default: 600000)
  REQUEST_TIMEOUT_MS             HTTP timeout in milliseconds (default: 10000)
`);
}

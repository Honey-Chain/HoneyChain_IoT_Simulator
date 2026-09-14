import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { SimulationEngine } from "./simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the absolute path to the dashboard HTML file across dev and build environments.
 */
export function resolveDashboardPath(): string {
  const candidates = [
    path.resolve(__dirname, "ui", "dashboard.html"),
    path.resolve(__dirname, "../src/ui", "dashboard.html"),
    path.resolve(process.cwd(), "src", "ui", "dashboard.html"),
    path.resolve(process.cwd(), "dist", "ui", "dashboard.html"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not find dashboard.html in any expected location.");
}

/**
 * Creates and configures the Express application for the HoneyChain IoT Simulator.
 */
export function createSimulatorApp(engine: SimulationEngine): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Serve UI Dashboard directly at root '/' and '/ui'
  // When accessed via the root link or /ui, directly serves the UI and triggers telemetry dispatch to backend
  const dashboardPath = resolveDashboardPath();
  let lastLinkDispatchTime = 0;

  app.get("/favicon.ico", (_req: Request, res: Response) => {
    res.status(204).end();
  });

  const handleRootOrUi = async (req: Request, res: Response) => {
    const wantsJson =
      req.xhr ||
      (req.headers.accept &&
        req.headers.accept.includes("application/json") &&
        !req.headers.accept.includes("text/html")) ||
      req.query.format === "json";

    // Trigger telemetry transmission to backend on access (with 2s debounce to prevent duplicate browser pre-fetches)
    const now = Date.now();
    let dispatchPromise: Promise<any> | null = null;
    if (now - lastLinkDispatchTime > 2000) {
      lastLinkDispatchTime = now;
      dispatchPromise = engine.transmitBatch().catch((err) => {
        console.error(`[SIMULATOR] Error transmitting batch on link access: ${err.message}`);
      });
    }

    if (wantsJson) {
      const summary = dispatchPromise ? await dispatchPromise : { message: "Cycle already in progress or recently sent" };
      return res.json({
        success: true,
        message: "Telemetry dispatched to backend from link access",
        status: engine.getStatus(),
        transmission: summary,
      });
    }

    return res.sendFile(dashboardPath);
  };

  app.get("/", handleRootOrUi);
  app.get("/ui", handleRootOrUi);

  // POST / triggers telemetry batch transmission directly
  app.post("/", async (_req: Request, res: Response) => {
    try {
      const summary = await engine.transmitBatch();
      res.json({
        success: true,
        message: "Telemetry batch transmitted successfully",
        summary,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Simulator Status & Countdown
  app.get("/api/status", (_req: Request, res: Response) => {
    res.json(engine.getStatus());
  });

  // Get all monitored hives and pending telemetry
  app.get("/api/hives", (_req: Request, res: Response) => {
    res.json(engine.getAllHives());
  });

  // Manipulate pending telemetry for a specific hive
  app.put("/api/hives/:hiveId", (req: Request, res: Response) => {
    try {
      const hiveId = String(req.params.hiveId);
      const updated = engine.updatePendingTelemetry(hiveId, req.body);
      res.json({ success: true, hiveId, updated });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  // Apply scenario preset to a hive
  app.post("/api/hives/:hiveId/preset", (req: Request, res: Response) => {
    try {
      const hiveId = String(req.params.hiveId);
      const { preset } = req.body;
      const updated = engine.applyScenarioPreset(hiveId, preset);
      res.json({ success: true, hiveId, updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Reset a hive's pending telemetry to natural physics
  app.post("/api/hives/:hiveId/reset", (req: Request, res: Response) => {
    try {
      const hiveId = String(req.params.hiveId);
      const reset = engine.resetPendingTelemetry(hiveId);
      res.json({ success: true, hiveId, reset });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  // Transmit a single hive immediately
  app.post("/api/hives/:hiveId/transmit", async (req: Request, res: Response) => {
    try {
      const hiveId = String(req.params.hiveId);
      const result = await engine.transmitSingleHive(hiveId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Transmit full batch immediately (resets 10m countdown)
  app.post("/api/transmit-now", async (_req: Request, res: Response) => {
    try {
      const summary = await engine.transmitBatch();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Transmission Activity Logs
  app.get("/api/logs", (_req: Request, res: Response) => {
    res.json(engine.getLogs());
  });

  app.delete("/api/logs", (_req: Request, res: Response) => {
    engine.clearLogs();
    res.json({ success: true, message: "Logs cleared" });
  });

  // Server-Sent Events (SSE) stream for live updates
  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Send initial status
    res.write(`data: ${JSON.stringify({ type: "tick", data: engine.getStatus() })}\n\n`);

    const unsubscribe = engine.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  return app;
}

/**
 * Starts the simulator web server on the specified port.
 */
export function startSimulatorServer(
  engine: SimulationEngine,
  port: number
): Promise<{ app: express.Express; server: any }> {
  const app = createSimulatorApp(engine);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve({ app, server });
    });
    server.on("error", (err) => reject(err));
  });
}

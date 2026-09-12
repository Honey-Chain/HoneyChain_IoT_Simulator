import { expect } from "chai";
import {
  resolveTargetEndpoint,
  resolveIntervalMs,
  parseCliArgs,
  DEFAULT_INTERVAL_MS,
} from "../src/config.js";
import { getInitialDevices, defaultDevices } from "../src/devices.js";
import { evolveDeviceState } from "../src/physics.js";
import { sendTelemetry, transmitTelemetryCycle } from "../src/transmitter.js";
import { SimulationEngine } from "../src/simulator.js";

describe("HoneyChain Standalone IoT Edge Simulator Test Suite", function () {
  describe("1. Configuration & CLI Argument Parser", function () {
    it("resolveTargetEndpoint normalizes base URL and canonicalizes path", function () {
      expect(resolveTargetEndpoint("http://localhost:5000")).to.equal(
        "http://localhost:5000/api/iot/telemetry"
      );
      expect(resolveTargetEndpoint("https://honeychain.onrender.com/")).to.equal(
        "https://honeychain.onrender.com/api/iot/telemetry"
      );
      expect(resolveTargetEndpoint("http://localhost:5000/api/iot")).to.equal(
        "http://localhost:5000/api/iot/telemetry"
      );
      expect(resolveTargetEndpoint("http://localhost:5000/api")).to.equal(
        "http://localhost:5000/api/iot/telemetry"
      );
      expect(resolveTargetEndpoint("http://localhost:5000/api/iot/telemetry")).to.equal(
        "http://localhost:5000/api/iot/telemetry"
      );
    });

    it("resolveTargetEndpoint throws descriptive error when target URL is missing", function () {
      expect(() => resolveTargetEndpoint("")).to.throw("Missing required target URL");
      expect(() => resolveTargetEndpoint(undefined)).to.throw("Missing required target URL");
    });

    it("resolveIntervalMs parses numbers and strings with fallback", function () {
      expect(resolveIntervalMs(15000)).to.equal(15000);
      expect(resolveIntervalMs("30000")).to.equal(30000);
      expect(resolveIntervalMs(undefined)).to.equal(DEFAULT_INTERVAL_MS);
      expect(resolveIntervalMs("invalid")).to.equal(DEFAULT_INTERVAL_MS);
      expect(resolveIntervalMs(-500)).to.equal(DEFAULT_INTERVAL_MS);
    });

    it("parseCliArgs accurately interprets CLI flags", function () {
      const args = ["--once", "--target", "https://api.honeychain.org", "--interval", "5000", "--hives", "HIVE-SB-101,HIVE-KV-201"];
      const parsed = parseCliArgs(args);

      expect(parsed.once).to.be.true;
      expect(parsed.targetUrl).to.equal("https://api.honeychain.org");
      expect(parsed.intervalMs).to.equal(5000);
      expect(parsed.hives).to.deep.equal(["HIVE-SB-101", "HIVE-KV-201"]);
    });
  });

  describe("2. Device State & Hive Filtering", function () {
    it("getInitialDevices loads all 5 seeded hives by default", function () {
      const devices = getInitialDevices();
      expect(devices).to.have.lengthOf(5);
      expect(devices.map((d) => d.hiveId)).to.include.members([
        "HIVE-SB-101",
        "HIVE-SB-102",
        "HIVE-KV-201",
        "HIVE-KV-202",
        "HIVE-WG-301",
      ]);
    });

    it("getInitialDevices filters by specific hive IDs when requested", function () {
      const filtered = getInitialDevices(["hive-sb-101", "HIVE-WG-301"]);
      expect(filtered).to.have.lengthOf(2);
      expect(filtered.map((d) => d.hiveId)).to.have.members(["HIVE-SB-101", "HIVE-WG-301"]);
    });
  });

  describe("3. Physics Engine & Biological Telemetry Simulation", function () {
    it("evolveDeviceState produces compliant telemetry within biological ranges", function () {
      const device = { ...defaultDevices[0] };
      const reading = evolveDeviceState(device);

      expect(reading.deviceId).to.equal("ESP32-SB-GW-01");
      expect(reading.hiveId).to.equal("HIVE-SB-101");
      expect(reading.timestamp).to.be.a("string");
      expect(new Date(reading.timestamp).getTime()).to.not.be.NaN;

      // Internal Brood Nest Thermoregulation
      expect(reading.temperature).to.be.within(33.0, 36.5);

      // Relative Humidity
      expect(reading.humidity).to.be.within(45.0, 75.0);

      // Weight accumulation
      expect(reading.weightKg).to.be.within(20.0, 50.0);

      // Battery & Acoustics
      expect(reading.batteryLevelPct).to.be.within(1, 100);
      expect(reading.soundFrequencyHz).to.be.within(180, 260);
      expect(reading.acousticsDb).to.be.within(50, 75);

      // Metadata
      expect(reading.metadata.source).to.equal("simulator");
      expect(reading.metadata.protocol).to.equal("HTTP/REST");
      expect(reading.metadata.simulationCycle).to.equal(1);
    });

    it("evolveDeviceState increments cycle count monotonically", function () {
      const device = { ...defaultDevices[1] };
      expect(device.cycleCount).to.equal(0);
      evolveDeviceState(device);
      expect(device.cycleCount).to.equal(1);
      evolveDeviceState(device);
      expect(device.cycleCount).to.equal(2);
    });
  });

  describe("4. HTTP Telemetry Transmitter & Network Resilience", function () {
    const originalFetch = global.fetch;

    afterEach(function () {
      global.fetch = originalFetch;
    });

    it("sendTelemetry successfully transmits payload and returns status 201", async function () {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            duplicate: false,
            message: "Telemetry reading ingested successfully",
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }
        );

      const reading = evolveDeviceState({ ...defaultDevices[0] });
      const result = await sendTelemetry("http://localhost:5000/api/iot/telemetry", reading);

      expect(result.success).to.be.true;
      expect(result.status).to.equal(201);
      expect(result.duplicate).to.be.false;
      expect(result.message).to.include("ingested successfully");
    });

    it("sendTelemetry detects idempotent duplicate responses (status 200, duplicate: true)", async function () {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            duplicate: true,
            message: "Telemetry reading already ingested for this device and timestamp",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );

      const reading = evolveDeviceState({ ...defaultDevices[0] });
      const result = await sendTelemetry("http://localhost:5000/api/iot/telemetry", reading);

      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.duplicate).to.be.true;
      expect(result.message).to.include("Duplicate");
    });

    it("sendTelemetry handles HTTP 400 validation rejection gracefully", async function () {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { message: "temperature out of plausible range (-40°C to 70°C)" },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );

      const reading = evolveDeviceState({ ...defaultDevices[0] });
      const result = await sendTelemetry("http://localhost:5000/api/iot/telemetry", reading);

      expect(result.success).to.be.false;
      expect(result.status).to.equal(400);
      expect(result.message).to.include("temperature out of plausible range");
    });

    it("sendTelemetry catches network connection refused errors without crashing", async function () {
      global.fetch = async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5000");
      };

      const reading = evolveDeviceState({ ...defaultDevices[0] });
      const result = await sendTelemetry("http://localhost:5000/api/iot/telemetry", reading);

      expect(result.success).to.be.false;
      expect(result.message).to.include("ECONNREFUSED");
    });

    it("transmitTelemetryCycle aggregates results across multiple devices", async function () {
      global.fetch = async () =>
        new Response(
          JSON.stringify({ success: true, duplicate: false, message: "OK" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );

      const devices = getInitialDevices();
      const payloads = devices.map((d) => evolveDeviceState(d));
      const summary = await transmitTelemetryCycle("http://localhost:5000/api/iot/telemetry", payloads);

      expect(summary.total).to.equal(5);
      expect(summary.successful).to.equal(5);
      expect(summary.duplicates).to.equal(0);
      expect(summary.failed).to.equal(0);
      expect(summary.results).to.have.lengthOf(5);
    });
  });

  describe("5. SimulationEngine & 10-Minute Cadence Scheduler", function () {
    const originalFetch = global.fetch;

    afterEach(function () {
      global.fetch = originalFetch;
    });

    it("initializes with fixed 10-minute cadence and prepared pending readings", function () {
      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      const status = engine.getStatus();

      expect(status.intervalMs).to.equal(600000);
      expect(status.intervalMinutes).to.equal(10);
      expect(status.secondsRemaining).to.be.within(590, 600);
      expect(status.hivesCount).to.equal(5);

      const hives = engine.getAllHives();
      expect(hives).to.have.lengthOf(5);
      expect(hives[0].pendingPayload.temperature).to.be.a("number");
      expect(hives[0].isManipulated).to.be.false;
    });

    it("updatePendingTelemetry manipulates sensor values and flags isManipulated", function () {
      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      const updated = engine.updatePendingTelemetry("HIVE-SB-101", {
        temperature: 38.65,
        humidity: 42.1,
        weightKg: 35.12,
        batteryLevelPct: 15,
      });

      expect(updated.temperature).to.equal(38.65);
      expect(updated.humidity).to.equal(42.1);
      expect(updated.weightKg).to.equal(35.12);
      expect(updated.batteryLevelPct).to.equal(15);

      const hives = engine.getAllHives();
      const hiveSB101 = hives.find((h) => h.hiveId === "HIVE-SB-101");
      expect(hiveSB101?.isManipulated).to.be.true;
      expect(hiveSB101?.pendingPayload.temperature).to.equal(38.65);
    });

    it("resetPendingTelemetry reverts manipulated values back to natural physics", function () {
      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      engine.updatePendingTelemetry("HIVE-SB-101", { temperature: 39.9 });

      const reset = engine.resetPendingTelemetry("HIVE-SB-101");
      expect(reset.temperature).to.be.within(33.0, 36.5);

      const hive = engine.getAllHives().find((h) => h.hiveId === "HIVE-SB-101");
      expect(hive?.isManipulated).to.be.false;
    });

    it("applyScenarioPreset configures swarming and overheating anomalies", function () {
      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });

      const swarming = engine.applyScenarioPreset("HIVE-SB-101", "swarm");
      expect(swarming.soundFrequencyHz).to.equal(285);
      expect(swarming.acousticsDb).to.equal(72.5);

      const overheating = engine.applyScenarioPreset("HIVE-KV-201", "overheating");
      expect(overheating.temperature).to.equal(38.6);
    });

    it("transmitBatch dispatches customized telemetry and logs the event", async function () {
      let sentBody: any = null;
      global.fetch = async (_url, init) => {
        sentBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({ success: true, duplicate: false, message: "Ingested" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      };

      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      engine.updatePendingTelemetry("HIVE-WG-301", { temperature: 38.8 });

      const summary = await engine.transmitBatch();
      expect(summary.total).to.equal(5);
      expect(summary.successful).to.equal(5);

      const logs = engine.getLogs();
      expect(logs.length).to.equal(5);
      expect(logs[0].status).to.equal(201);
    });

    it("transmitSingleHive transmits only one hive and advances its state", async function () {
      global.fetch = async () =>
        new Response(
          JSON.stringify({ success: true, message: "OK" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );

      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      const result = await engine.transmitSingleHive("HIVE-KV-202");

      expect(result.success).to.be.true;
      expect(result.hiveId).to.equal("HIVE-KV-202");
    });

    it("prevents concurrent re-entry when transmitBatch is already in-flight", async function () {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Response(
          JSON.stringify({ success: true, message: "OK" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      };

      const engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      const p1 = engine.transmitBatch();
      const p2 = engine.transmitBatch(); // Attempt concurrent transmission while p1 is in-flight

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.total).to.equal(5);
      expect(res2.total).to.equal(0); // Second call rejected by isTransmitting guard
      expect(callCount).to.equal(5); // Only 5 calls made, not 10
    });
  });

  describe("6. Web Dashboard Server & REST API", function () {
    let server: any;
    let baseUrl: string;
    let engine: SimulationEngine;
    const originalFetch = global.fetch;

    before(async function () {
      global.fetch = async () =>
        new Response(
          JSON.stringify({ success: true, duplicate: false, message: "OK" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );

      engine = new SimulationEngine({ targetUrl: "http://localhost:5000" });
      const { createSimulatorApp } = await import("../src/server.js");
      const app = createSimulatorApp(engine);

      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const port = server.address().port;
          baseUrl = `http://localhost:${port}`;
          resolve();
        });
      });
    });

    after(function () {
      global.fetch = originalFetch;
      if (server) server.close();
    });

    it("GET /ui serves dashboard HTML interface", async function () {
      const res = await originalFetch(`${baseUrl}/ui`);
      expect(res.status).to.equal(200);
      const text = await res.text();
      expect(text).to.include("HoneyChain IoT Simulator");
      expect(text).to.include("Next Batch Auto-Transmission");
      expect(text).to.include("10m Fixed Cadence");
    });

    it("GET / redirects to /ui", async function () {
      const res = await originalFetch(`${baseUrl}/`, { redirect: "manual" });
      expect(res.status).to.equal(302);
      expect(res.headers.get("location")).to.equal("/ui");
    });

    it("GET /api/status returns simulator countdown and cadence", async function () {
      const res = await originalFetch(`${baseUrl}/api/status`);
      expect(res.status).to.equal(200);
      const data = await res.json();
      expect(data.intervalMinutes).to.equal(10);
      expect(data.intervalMs).to.equal(600000);
      expect(data.secondsRemaining).to.be.a("number");
      expect(data.targetUrl).to.equal("http://localhost:5000/api/iot/telemetry");
    });

    it("GET /api/hives returns all monitored hives with pending data", async function () {
      const res = await originalFetch(`${baseUrl}/api/hives`);
      expect(res.status).to.equal(200);
      const hives = await res.json();
      expect(hives).to.have.lengthOf(5);
      expect(hives[0]).to.have.property("hiveId");
      expect(hives[0]).to.have.property("pendingPayload");
    });

    it("PUT /api/hives/:hiveId updates pending sensor values", async function () {
      const res = await originalFetch(`${baseUrl}/api/hives/HIVE-SB-101`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature: 37.85, acousticsDb: 70.2 }),
      });

      expect(res.status).to.equal(200);
      const body = await res.json();
      expect(body.success).to.be.true;
      expect(body.updated.temperature).to.equal(37.85);
      expect(body.updated.acousticsDb).to.equal(70.2);
    });

    it("POST /api/hives/:hiveId/preset applies anomaly preset", async function () {
      const res = await originalFetch(`${baseUrl}/api/hives/HIVE-SB-101/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: "low_battery" }),
      });

      expect(res.status).to.equal(200);
      const body = await res.json();
      expect(body.updated.batteryLevelPct).to.equal(8);
    });

    it("POST /api/hives/:hiveId/reset reverts overrides", async function () {
      const res = await originalFetch(`${baseUrl}/api/hives/HIVE-SB-101/reset`, {
        method: "POST",
      });

      expect(res.status).to.equal(200);
      const body = await res.json();
      expect(body.success).to.be.true;
      expect(body.reset.temperature).to.be.within(33.0, 36.5);
    });

    it("POST /api/transmit-now executes full batch transmission", async function () {
      const res = await originalFetch(`${baseUrl}/api/transmit-now`, {
        method: "POST",
      });

      expect(res.status).to.equal(200);
      const summary = await res.json();
      expect(summary.total).to.equal(5);
      expect(summary.successful).to.equal(5);
    });

    it("GET /api/logs returns transmission history and DELETE /api/logs clears it", async function () {
      const res1 = await originalFetch(`${baseUrl}/api/logs`);
      const logs = await res1.json();
      expect(logs).to.be.an("array");
      expect(logs.length).to.be.greaterThan(0);

      const res2 = await originalFetch(`${baseUrl}/api/logs`, { method: "DELETE" });
      expect(res2.status).to.equal(200);

      const res3 = await originalFetch(`${baseUrl}/api/logs`);
      const cleared = await res3.json();
      expect(cleared).to.have.lengthOf(0);
    });
  });
});


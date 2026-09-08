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
});

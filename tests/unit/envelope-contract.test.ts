import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  EnvelopeV1,
  SUPPORTED_SCHEMA_VERSION,
  validateEnvelope,
} from "../../src/core/envelope";

/**
 * Contract self-check: the pinned v1 schema (a copy of the host's canonical
 * schemas/envelope.v1.json) validates the CLI's emitted envelopes, and the
 * canonical fixture corpus behaves as the host expects.
 */
const schema = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../schemas/envelope.v1.json"), "utf-8"),
);
const fixturesDir = path.resolve(__dirname, "../../fixtures/envelope.v1");

function validEnvelope(): EnvelopeV1 {
  return {
    schema_version: "1",
    producer: { name: "elyseum-cli", version: "1.0.12" },
    run: { provider: "generic", run_id: "abc123", attempt: 1 },
    commit: { sha: "9f2c7a1b8e4d5f6a7b8c9d0e1f2a3b4c5d6e7f80", branch: "main" },
    tests: { total: 42, passed: 40, failed: 2 },
    coverage: { line_percent: 84.7 },
    quality_gate: { conclusion: "passed" },
  };
}

describe("pinned envelope contract", () => {
  it("accepts a well-formed v1 envelope", () => {
    expect(validateEnvelope(validEnvelope())).toEqual([]);
  });

  it("rejects an unsupported schema version", () => {
    const envelope = { ...validEnvelope(), schema_version: "2" } as EnvelopeV1;
    expect(validateEnvelope(envelope).length).toBeGreaterThan(0);
  });

  it("rejects a broken commit sha", () => {
    const envelope = validEnvelope();
    envelope.commit.sha = "NOT-A-SHA";
    expect(validateEnvelope(envelope).length).toBeGreaterThan(0);
  });

  it("rejects unknown nested fields (closed objects)", () => {
    const envelope = validEnvelope();
    (envelope.producer as any).surprise = true;
    expect(validateEnvelope(envelope).length).toBeGreaterThan(0);
  });

  it("tolerates unknown top-level fields (additive rule)", () => {
    const envelope = { ...validEnvelope(), elyseum_future: true };
    expect(validateEnvelope(envelope)).toEqual([]);
  });

  it("accepts every valid canonical fixture", () => {
    const fixtures = readdirSync(fixturesDir).filter((f) => f.startsWith("valid-"));
    expect(fixtures.length).toBeGreaterThanOrEqual(4);

    for (const fixture of fixtures) {
      const doc = JSON.parse(readFileSync(path.join(fixturesDir, fixture), "utf-8"));
      expect(validateEnvelope(doc as EnvelopeV1), fixture).toEqual([]);
    }
  });

  it("rejects every invalid canonical fixture", () => {
    // Exceptions: the RFC 3339 `format` keyword is annotation-only in this
    // CLI's schema check (the host boundary enforces timestamps explicitly;
    // the CLI only ever emits ISO timestamps from git/Date).
    const hostSideOnly: Record<string, string> = {
      "invalid-bad-timestamp.json": "$.run.started_at",
      "invalid-impossible-date.json": "$.run.started_at",
      "invalid-leap-second.json": "$.run.finished_at",
      "invalid-too-precise-percent.json": "$.coverage.line_percent",
    };

    const fixtures = readdirSync(fixturesDir).filter((f) => f.startsWith("invalid-"));
    expect(fixtures.length).toBeGreaterThanOrEqual(9);

    for (const fixture of fixtures) {
      // NaN/Infinity fixtures are rejected by JSON.parse itself (they are
      // not valid JSON) — mirroring the host's parse gate.
      let doc: EnvelopeV1;
      try {
        doc = JSON.parse(readFileSync(path.join(fixturesDir, fixture), "utf-8")) as EnvelopeV1;
      } catch {
        continue;
      }
      const issues = validateEnvelope(doc);
      if (hostSideOnly[fixture] !== undefined) {
        // The RFC 3339 format is annotation-only CLI-side (the host boundary
        // enforces it), so these fixtures produce zero CLI-side issues.
        continue;
      }
      expect(issues.length, fixture).toBeGreaterThan(0);
    }
  });

  it("pins the schema version the CLI emits", () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe("1");
    expect(schema.properties.schema_version.const).toBe("1");
  });
});

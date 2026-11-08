import Ajv from "ajv/dist/2020";
import schemaJson from "../../schemas/envelope.v1.json";

/**
 * The pinned copy of the canonical Elyseum v1 CI result envelope contract.
 * The schema and fixtures are owned by the elyseum host repository and
 * pinned here per the workspace pairing rule; `validateEnvelope` is the
 * self-check every emitted envelope passes before it is written.
 *
 * Drift between this copy and the host's canonical file is a contract
 * violation; the planned cross-repo contract checks (elyseum#14) will
 * catch it in CI.
 */

export const SUPPORTED_SCHEMA_VERSION = "1";

// strict:false lets the RFC 3339 `format` keyword pass as an annotation
// (the host enforces timestamps explicitly at its own boundary).
const ajv = new Ajv({ allErrors: true, strict: false });
// RFC 3339 format is enforced explicitly by the host boundary; here it is
// annotation-only, so register a pass-through to keep strict mode quiet.
ajv.addFormat("date-time", true);
const validate = ajv.compile(schemaJson);

export interface EnvelopeV1 {
  schema_version: "1";
  producer: { name: string; version: string };
  run: {
    provider: string;
    run_id: string;
    job_id?: string | null;
    attempt: number;
    url?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  };
  commit: {
    sha: string;
    branch: string;
    base_sha?: string | null;
    committed_at?: string | null;
  };
  tests?: {
    total?: number | null;
    passed?: number | null;
    failed?: number | null;
    skipped?: number | null;
    duration_ms?: number | null;
    failed_tests?: {
      name: string;
      message?: string | null;
      file?: string | null;
      line?: number | null;
    }[];
  };
  coverage?: {
    line_percent?: number | null;
    function_percent?: number | null;
    branch_percent?: number | null;
    diff_percent?: number | null;
    files?: {
      path: string;
      line_percent?: number | null;
      function_percent?: number | null;
      branch_percent?: number | null;
    }[];
  };
  quality_gate?: { conclusion: "passed" | "failed" | "unknown" };
  [key: string]: unknown;
}

export interface EnvelopeIssue {
  pointer: string;
  message: string;
}

/** Validates an envelope against the pinned v1 schema. Pure. */
export function validateEnvelope(envelope: EnvelopeV1): EnvelopeIssue[] {
  const valid = validate(envelope);
  const issues: EnvelopeIssue[] = valid
    ? []
    : (validate.errors ?? []).map((error) => ({
        pointer: `${error.instancePath}/${error.params?.missingProperty ?? ""}`.replace(/\/+/g, "/"),
        message: error.message ?? "schema violation",
      }));

  // The contract caps percentages at 4 decimal places, but JSON Schema
  // cannot express that constraint, so the host enforces it beyond the
  // schema and rejects with envelope.schema-violation. Check it here too:
  // an emit that would be rejected downstream is a CLI bug (exit 5), not
  // a silent upload failure.
  issues.push(...percentPrecisionIssues(envelope));
  return issues;
}

function percentPrecisionIssues(node: unknown, pointer = ""): EnvelopeIssue[] {
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => percentPrecisionIssues(item, `${pointer}/${i}`));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => {
      const childPointer = `${pointer}/${key}`;
      if (
        /_percent$/.test(key) &&
        typeof value === "number" &&
        decimalPlaces(value) > 4
      ) {
        return [
          { pointer: childPointer, message: "Percentages carry at most 4 decimal places." },
        ];
      }
      return percentPrecisionIssues(value, childPointer);
    });
  }
  return [];
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

import fs from "fs/promises";
import { CloverFile, parseCloverDocument } from "./clover";
import { InvalidConfigError, MissingLcovError } from "./errors";
import { LcovRecord, readLcovReport } from "./lcov";

export const COVERAGE_INPUT_FORMATS = ["lcov", "clover"] as const;
export type CoverageInputFormat = (typeof COVERAGE_INPUT_FORMATS)[number];

/** Validates a configured coverage input format; invalid values are config errors. */
export function assertCoverageInputFormat(value: string): CoverageInputFormat {
  if ((COVERAGE_INPUT_FORMATS as readonly string[]).includes(value)) {
    return value as CoverageInputFormat;
  }
  throw new InvalidConfigError(
    `Unknown coverage format "${value}". Supported: ${COVERAGE_INPUT_FORMATS.join(", ")}.`,
  );
}

/**
 * PHPUnit writes absolute paths into Clover reports; the diff machinery
 * compares repo-relative paths. Strip the checkout prefix when the file
 * lives under it, and the leading slash otherwise — both match the
 * normalization the diff side already applies.
 */
export function toRepoRelativePath(name: string, cwd: string): string {
  const normalizedCwd = cwd.replace(/\/+$/, "");
  if (name.startsWith(`${normalizedCwd}/`)) {
    return name.slice(normalizedCwd.length + 1);
  }
  return name.replace(/^\//, "");
}

/**
 * Converts parsed Clover files into the LCOV record shape the coverage
 * engine computes on. Statement lines become line details, method lines
 * become function details. Totals prefer the file's <metrics> element
 * (statement-granular truth) and fall back to the line elements when the
 * producer omits metrics. Clover carries no per-line branch data, so branch
 * details stay empty — diff coverage simply reports no per-line branch
 * facts — while the file-level conditional totals are preserved.
 */
export function cloverToLcovRecords(files: CloverFile[], cwd: string): LcovRecord[] {
  return files.map((file): LcovRecord => {
    const lineDetails = file.lines
      .filter((line) => line.type === "stmt")
      .map((line) => ({ line: line.num, hit: line.count }));
    const functionDetails = file.lines
      .filter((line) => line.type === "method")
      .map((line) => ({ name: line.name ?? "unknown", line: line.num, hit: line.count }));

    const metrics = file.metrics;
    return {
      file: toRepoRelativePath(file.name, cwd),
      lines: {
        found: metrics ? metrics.statements : lineDetails.length,
        hit: metrics ? metrics.coveredstatements : lineDetails.filter((d) => d.hit > 0).length,
        details: lineDetails,
      },
      functions: {
        found: metrics ? metrics.methods : functionDetails.length,
        hit: metrics ? metrics.coveredmethods : functionDetails.filter((d) => d.hit > 0).length,
        details: functionDetails,
      },
      branches: {
        found: metrics?.conditionals ?? 0,
        hit: metrics?.coveredconditionals ?? 0,
        details: [],
      },
    };
  });
}

/**
 * Reads a coverage report in any supported format into the engine's LCOV
 * record shape. A missing file is the actionable MissingLcovError (exit 4)
 * regardless of format; a malformed file is a calculation error.
 */
export async function readCoverageReport(
  path: string,
  format: CoverageInputFormat,
): Promise<LcovRecord[]> {
  if (format === "lcov") {
    return readLcovReport(path);
  }

  let raw: string;
  try {
    raw = await fs.readFile(path, "utf-8");
  } catch {
    throw new MissingLcovError(path, format);
  }

  return cloverToLcovRecords(parseCloverDocument(raw), process.cwd());
}

import fs from "fs/promises";
import parse from "lcov-parse";
import { CalculationFailure, MissingLcovError } from "./errors";
import { CoverageDetail, CoverageFile } from "../types/coverage-result";

/**
 * Pure coverage math. Total coverage percentages are finite by definition:
 * a zero denominator means "nothing to cover", which is 100% covered —
 * never NaN.
 */
export function percent(covered: number, total: number): number {
  if (total === 0) {
    return 100;
  }

  return (covered / total) * 100;
}

/** LCOV record as produced by lcov-parse, typed loosely on purpose. */
export interface LcovRecord {
  file: string;
  lines: { found: number; hit: number; details: LineDetail[] };
  functions: { found: number; hit: number; details: FunctionDetail[] };
  branches: { found: number; hit: number; details: BranchDetail[] };
}

export interface LineDetail {
  line: number;
  hit: number;
}

export interface FunctionDetail {
  name: string;
  line: number;
  hit: number;
}

export interface BranchDetail {
  block: number;
  branch: number;
  line: number;
  taken: number;
}

/**
 * Reads and parses an LCOV report. A missing file is an actionable
 * MissingLcovError; a malformed file is a calculation error.
 */
export async function readLcovReport(path: string): Promise<LcovRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf-8");
  } catch {
    throw new MissingLcovError(path);
  }

  return new Promise((resolve, reject) => {
    parse(raw, (err, data) => {
      if (err || !data) {
        reject(new CalculationFailure(`Could not parse LCOV report at "${path}".`));
        return;
      }
      resolve(data as LcovRecord[]);
    });
  });
}


/**
 * Aggregates parsed LCOV records into the total coverage result. Pure.
 */
export function calculateTotalCoverage(records: LcovRecord[]): {
  lines: CoverageDetail;
  functions: CoverageDetail;
  branches: CoverageDetail;
  files: CoverageFile[];
} {
  const result = {
    lines: { total: 0, covered: 0, percent: 100 },
    functions: { total: 0, covered: 0, percent: 100 },
    branches: { total: 0, covered: 0, percent: 100 },
    files: [] as CoverageFile[],
  };

  for (const record of records) {
    const lines: CoverageDetail = {
      total: record.lines.found,
      covered: record.lines.hit,
      percent: percent(record.lines.hit, record.lines.found),
    };
    const functions: CoverageDetail = {
      total: record.functions.found,
      covered: record.functions.hit,
      percent: percent(record.functions.hit, record.functions.found),
    };
    const branches: CoverageDetail = {
      total: record.branches.found,
      covered: record.branches.hit,
      percent: percent(record.branches.hit, record.branches.found),
    };

    result.files.push({
      file: record.file,
      lines,
      functions,
      branches,
    });

    result.lines.total += lines.total;
    result.lines.covered += lines.covered;
    result.functions.total += functions.total;
    result.functions.covered += functions.covered;
    result.branches.total += branches.total;
    result.branches.covered += branches.covered;
  }

  result.lines.percent = percent(result.lines.covered, result.lines.total);
  result.functions.percent = percent(result.functions.covered, result.functions.total);
  result.branches.percent = percent(result.branches.covered, result.branches.total);

  return result;
}

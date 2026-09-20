import { CalculationFailure } from "../core/errors";
import { readLcovReport } from "../core/lcov";
import { CoverageFacts, TestFacts } from "./types";
import { parseGoCoverprofile } from "./go-coverprofile";
import { parseCloverXml } from "./clover";
import { parseGoTestJson } from "./go-test-json";
import { parseJunitXml } from "./junit";
import { parseVitestJson } from "./vitest-json";

export * from "./types";

/**
 * Adapter registry (elyseum-cli#7). Explicit format selection only — there
 * is no auto-detection. Adding an adapter means adding a parser, a format
 * literal here, and fixtures; the envelope and commands do not change.
 */

export type TestsParser = (raw: string) => TestFacts;
export type CoverageParser = (raw: string) => Promise<CoverageFacts>;

const TESTS_PARSERS: Record<string, TestsParser> = {
  "vitest-json": parseVitestJson,
  junit: parseJunitXml,
  "go-test-json": parseGoTestJson,
};

const COVERAGE_PARSERS: Record<string, CoverageParser> = {
  lcov: async (raw) => {
    // lcov-parse is callback-based; reuse the core's promise wrapper.
    const parse = (await import("lcov-parse")).default;
    return new Promise<CoverageFacts>((resolve, reject) => {
      parse(raw, (err, data) => {
        if (err || !data) {
          reject(new CalculationFailure("Could not parse LCOV coverage input."));
          return;
        }
        const totals = {
          lines: { total: 0, covered: 0 },
          functions: { total: 0, covered: 0 },
          branches: { total: 0, covered: 0 },
        };
        const files: CoverageFacts["files"] = [];
        for (const record of data as any[]) {
          files.push({
            path: record.file,
            line_percent:
              record.lines.found === 0
                ? null
                : (record.lines.hit / record.lines.found) * 100,
            function_percent:
              record.functions.found === 0
                ? null
                : (record.functions.hit / record.functions.found) * 100,
            branch_percent:
              record.branches.found === 0
                ? null
                : (record.branches.hit / record.branches.found) * 100,
          });
          totals.lines.total += record.lines.found;
          totals.lines.covered += record.lines.hit;
          totals.functions.total += record.functions.found;
          totals.functions.covered += record.functions.hit;
          totals.branches.total += record.branches.found;
          totals.branches.covered += record.branches.hit;
        }
        resolve({
          line_percent:
            totals.lines.total === 0
              ? null
              : (totals.lines.covered / totals.lines.total) * 100,
          function_percent:
            totals.functions.total === 0
              ? null
              : (totals.functions.covered / totals.functions.total) * 100,
          branch_percent:
            totals.branches.total === 0
              ? null
              : (totals.branches.covered / totals.branches.total) * 100,
          files,
        });
      });
    });
  },
  clover: async (raw) => parseCloverXml(raw),
  "go-coverprofile": async (raw) => parseGoCoverprofile(raw),
};

export function testsParserFor(format: string): TestsParser {
  const parser = TESTS_PARSERS[format];
  if (!parser) {
    throw new CalculationFailure(
      `Unknown tests format "${format}". Supported: ${Object.keys(TESTS_PARSERS).join(", ")}.`,
    );
  }
  return parser;
}

export function coverageParserFor(format: string): CoverageParser {
  const parser = COVERAGE_PARSERS[format];
  if (!parser) {
    throw new CalculationFailure(
      `Unknown coverage format "${format}". Supported: ${Object.keys(COVERAGE_PARSERS).join(", ")}.`,
    );
  }
  return parser;
}

export { parseGoCoverprofile, parseCloverXml, parseGoTestJson, parseJunitXml, parseVitestJson };

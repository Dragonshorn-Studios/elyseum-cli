import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCloverDocument } from "../../src/core/clover";
import {
  cloverToLcovRecords,
  toRepoRelativePath,
  assertCoverageInputFormat,
} from "../../src/core/coverage-input";
import { calculateDiffCoverage } from "../../src/core/git-diff";
import { InvalidConfigError } from "../../src/core/errors";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures/adapters");

function fixture(...segments: string[]): string {
  return readFileSync(path.join(FIXTURES, ...segments), "utf-8");
}

describe("parseCloverDocument", () => {
  it("collects files nested under packages with their line elements", () => {
    const files = parseCloverDocument(fixture("clover", "nested-packages.xml"));
    expect(files).toHaveLength(2);
    const project = files[0];
    expect(project.name).toBe("/var/www/app/Models/Project.php");
    expect(project.metrics?.statements).toBe(20);
    expect(project.lines).toHaveLength(3);
    expect(project.lines[0]).toMatchObject({ num: 10, type: "method", count: 1, name: "boot" });
    expect(project.lines[1]).toMatchObject({ num: 12, type: "stmt", count: 1 });
  });

  it("collects files directly under project (un-nested shape)", () => {
    const files = parseCloverDocument(fixture("clover", "ordinary.xml"));
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("/var/www/app/Models/Project.php");
  });
});

describe("toRepoRelativePath", () => {
  it("strips the checkout prefix from absolute paths", () => {
    expect(toRepoRelativePath("/home/runner/work/r/r/app/Model.php", "/home/runner/work/r/r")).toBe(
      "app/Model.php",
    );
  });

  it("strips a trailing slash on cwd before matching", () => {
    expect(toRepoRelativePath("/repo/src/a.php", "/repo/")).toBe("src/a.php");
  });

  it("strips only the leading slash for paths outside the checkout", () => {
    expect(toRepoRelativePath("/var/www/app/Model.php", "/home/runner/work/r/r")).toBe(
      "var/www/app/Model.php",
    );
  });

  it("leaves already-relative paths untouched", () => {
    expect(toRepoRelativePath("app/Model.php", "/repo")).toBe("app/Model.php");
  });
});

describe("cloverToLcovRecords", () => {
  const files = parseCloverDocument(fixture("clover", "nested-packages.xml"));
  const records = cloverToLcovRecords(files, "/var/www");

  it("converts statement lines to line details and method lines to function details", () => {
    const record = records[0];
    expect(record.file).toBe("app/Models/Project.php");
    expect(record.lines.details).toEqual([
      { line: 12, hit: 1 },
      { line: 13, hit: 0 },
    ]);
    expect(record.functions.details).toEqual([{ name: "boot", line: 10, hit: 1 }]);
  });

  it("prefers metrics totals and preserves branch totals without per-line details", () => {
    const record = records[0];
    expect(record.lines.found).toBe(20);
    expect(record.lines.hit).toBe(16);
    expect(record.functions.found).toBe(5);
    expect(record.functions.hit).toBe(4);
    expect(record.branches.found).toBe(4);
    expect(record.branches.hit).toBe(3);
    expect(record.branches.details).toEqual([]);
  });

  it("feeds diff coverage: only coverable statement lines count as changed", () => {
    const result = calculateDiffCoverage(
      [{ path: "app/Models/Project.php" }],
      records,
      { headSha: "h", baseSha: "b" },
    );
    // Whole-file mode: the two coverable statement lines count, one covered.
    expect(result.lines.total).toBe(2);
    expect(result.lines.covered).toBe(1);
    expect(result.lines.percent).toBe(50);
  });
});

describe("assertCoverageInputFormat", () => {
  it("accepts supported formats", () => {
    expect(assertCoverageInputFormat("lcov")).toBe("lcov");
    expect(assertCoverageInputFormat("clover")).toBe("clover");
  });

  it("rejects unknown formats as a config error", () => {
    expect(() => assertCoverageInputFormat("cobertura")).toThrow(InvalidConfigError);
    expect(() => assertCoverageInputFormat("cobertura")).toThrow(/lcov, clover/);
  });
});

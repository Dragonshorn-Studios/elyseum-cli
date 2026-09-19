import { describe, expect, it } from "vitest";
import { percent, calculateTotalCoverage } from "../../src/core/lcov";
import {
  extractChangedLineNumbers,
  isCommentLine,
  normalizePath,
  calculateDiffCoverage,
} from "../../src/core/git-diff";
import { evaluateQualityGate } from "../../src/core/quality-gate";

describe("percent", () => {
  it("is finite for zero denominators (never NaN)", () => {
    expect(percent(0, 0)).toBe(100);
    expect(percent(5, 0)).toBe(100);
  });

  it("computes ordinary ratios", () => {
    expect(percent(50, 100)).toBe(50);
    expect(percent(1, 3)).toBeCloseTo(33.3333, 3);
  });
});

describe("normalizePath", () => {
  it("strips a single leading slash and leaves the rest", () => {
    expect(normalizePath("/src/a.ts")).toBe("src/a.ts");
    expect(normalizePath("src/a.ts")).toBe("src/a.ts");
    expect(normalizePath("//weird//b.ts")).toBe("/weird//b.ts");
  });
});

describe("isCommentLine", () => {
  it("recognizes comment-only and blank additions", () => {
    expect(isCommentLine("// note")).toBe(true);
    expect(isCommentLine("/* block")).toBe(true);
    expect(isCommentLine(" * continued")).toBe(true);
    expect(isCommentLine("   ")).toBe(true);
    expect(isCommentLine("const x = 1; // trailing")).toBe(false);
    expect(isCommentLine("return value;")).toBe(false);
  });
});

describe("extractChangedLineNumbers", () => {
  const coverable = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

  it("counts added code lines and skips comment-only additions", () => {
    const hunks = [
      {
        newStart: 1,
        newLines: 4,
        lines: ["+const a = 1;", "+// explanation", "+", "+const b = 2;"],
      },
    ];

    expect([...extractChangedLineNumbers(hunks, coverable)]).toEqual([1, 4]);
  });

  it("skips removed lines and context lines", () => {
    const hunks = [
      {
        newStart: 2,
        newLines: 1,
        lines: ["-old line", "+new line", "const kept = 1;"],
      },
    ];

    expect([...extractChangedLineNumbers(hunks, coverable)]).toEqual([2]);
  });

  it("ignores lines the LCOV report does not cover", () => {
    const hunks = [{ newStart: 10, newLines: 3, lines: ["a", "b", "c"] }];
    expect(extractChangedLineNumbers(hunks, coverable).size).toBe(0);
  });

  it("counts added lines without per-line annotations", () => {
    const hunks = [{ newStart: 3, newLines: 2 }];
    expect([...extractChangedLineNumbers(hunks, coverable)].sort()).toEqual([3, 4]);
  });
});

describe("calculateDiffCoverage", () => {
  const coverage = [
    {
      file: "src/app.ts",
      lines: {
        found: 4,
        hit: 3,
        details: [
          { line: 1, hit: 1 },
          { line: 2, hit: 0 },
          { line: 3, hit: 1 },
          { line: 4, hit: 1 },
        ],
      },
      functions: { found: 1, hit: 1, details: [{ name: "f", line: 1, hit: 1 }] },
      branches: { found: 0, hit: 0, details: [] },
    },
  ];

  const files = [
    {
      path: "/src/app.ts",
      lines: 4,
      type: "modify" as const,
      diff: {
        hunks: [
          {
            newStart: 1,
            newLines: 3,
            lines: ["+const a = 1;", "+const b = 2;", "+// changed comment"],
          },
        ],
      },
    },
    { path: "/src/not-in-lcov.ts", lines: 10, type: "add" as const, diff: { hunks: [] } },
  ];

  it("aggregates changed-line coverage and stays finite on no-coverable files", () => {
    const result = calculateDiffCoverage(files, coverage, {
      headSha: "head",
      baseSha: "base",
    });

    // two code lines (1, 2) count; the comment line does not; line 2 uncovered.
    expect(result.lines.total).toBe(2);
    expect(result.lines.covered).toBe(1);
    expect(result.lines.percent).toBe(50);
    expect(result.files[0].lines.total).toBe(2);
    // no-coverable-line file: finite 100, not NaN
    expect(result.files[1].lines.percent).toBe(100);
    expect(Number.isNaN(result.functions.percent)).toBe(false);
    expect(Number.isNaN(result.branches.percent)).toBe(false);
    expect(result.branches.percent).toBe(100);
  });
});

describe("calculateTotalCoverage", () => {
  it("is finite for zero-line files and aggregates", () => {
    const result = calculateTotalCoverage([
      {
        file: "a.ts",
        lines: { found: 0, hit: 0, details: [] },
        functions: { found: 0, hit: 0, details: [] },
        branches: { found: 0, hit: 0, details: [] },
      },
      {
        file: "b.ts",
        lines: { found: 10, hit: 5, details: [] },
        functions: { found: 2, hit: 2, details: [] },
        branches: { found: 4, hit: 1, details: [] },
      },
    ]);

    expect(result.lines.percent).toBe(50);
    expect(result.functions.percent).toBe(100);
    expect(Number.isNaN(result.lines.percent)).toBe(false);
  });
});

describe("evaluateQualityGate", () => {
  it("fails at or below the fail threshold", () => {
    expect(evaluateQualityGate(10, { gate: 80, fail: 10 })).toBe("failed");
  });

  it("warns between fail and gate", () => {
    expect(evaluateQualityGate(50, { gate: 80, fail: 10 })).toBe("warning");
  });

  it("passes above the gate and passes when disabled", () => {
    expect(evaluateQualityGate(80, { gate: 80, fail: 10 })).toBe("passed");
    expect(evaluateQualityGate(0, {})).toBe("passed");
  });
});

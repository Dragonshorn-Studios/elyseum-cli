import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseGoTestJson } from "../../src/adapters/go-test-json";
import { parseJunitXml } from "../../src/adapters/junit";
import { parseVitestJson } from "../../src/adapters/vitest-json";
import { parseCloverXml } from "../../src/adapters/clover";
import { parseGoCoverprofile } from "../../src/adapters/go-coverprofile";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures/adapters");

function fixture(...segments: string[]): string {
  return readFileSync(path.join(FIXTURES, ...segments), "utf-8");
}

describe("vitest-json adapter", () => {
  it("maps pass/fail/skip with failure identity", () => {
    const facts = parseVitestJson(fixture("vitest-json", "fail.json"));
    expect(facts.total).toBe(3);
    expect(facts.passed).toBe(1);
    expect(facts.failed).toBe(1);
    expect(facts.skipped).toBe(1);
    expect(facts.failed_tests[0].name).toBe("app divides");
    expect(facts.failed_tests[0].message).toContain("expected 2 to be 3");
  });

  it("reports an empty suite as zero tests, not unknown", () => {
    const facts = parseVitestJson(fixture("vitest-json", "empty.json"));
    expect(facts.total).toBe(0);
    expect(facts.duration_ms).toBeNull();
  });

  it("fails on malformed JSON", () => {
    expect(() => parseVitestJson(fixture("vitest-json", "malformed.json"))).toThrow(/not valid JSON/);
  });
});

describe("junit adapter (Pest/PHPUnit)", () => {
  it("distinguishes failures, errors, skips, and passes", () => {
    const facts = parseJunitXml(fixture("junit", "fail-error-skip.xml"));
    expect(facts.total).toBe(4);
    expect(facts.passed).toBe(1);
    expect(facts.failed).toBe(2);
    expect(facts.skipped).toBe(1);
    expect(facts.failed_tests[1].message).toContain("undefined method");
    expect(facts.failed_tests[0].name).toContain("DivTest");
  });

  it("handles an empty suite", () => {
    const facts = parseJunitXml(fixture("junit", "empty.xml"));
    expect(facts.total).toBe(0);
    expect(facts.passed).toBe(0);
  });

  it("fails on malformed XML", () => {
    expect(() => parseJunitXml(fixture("junit", "malformed.xml"))).toThrow(/testsuite/);
  });
});

describe("go-test-json adapter", () => {
  it("counts subtests separately from their parent", () => {
    const facts = parseGoTestJson(fixture("go-test-json", "fail-skip-subtest.jsonl"));
    expect(facts.total).toBe(4);
    expect(facts.passed).toBe(1);
    expect(facts.failed).toBe(2);
    expect(facts.skipped).toBe(1);
    expect(facts.failed_tests.map((f) => f.name)).toContain("example.com/m/div#TestDiv/sub");
  });

  it("treats cached passing tests as passed", () => {
    const facts = parseGoTestJson(fixture("go-test-json", "cached.jsonl"));
    expect(facts.total).toBe(1);
    expect(facts.passed).toBe(1);
  });

  it("represents build failures as one bounded failed identity per package", () => {
    const facts = parseGoTestJson(fixture("go-test-json", "build-failure.jsonl"));
    expect(facts.total).toBe(2);
    expect(facts.failed).toBe(1);
    expect(facts.failed_tests[0].name).toContain("broken");
    expect(facts.failed_tests[0].message).toContain("undefined: x");
  });

  it("captures bounded package panic output", () => {
    const facts = parseGoTestJson(fixture("go-test-json", "panic.jsonl"));
    expect(facts.failed).toBeGreaterThanOrEqual(2);
    expect(facts.failed_tests.length).toBe(2);
  });

  it("fails on malformed event lines", () => {
    expect(() => parseGoTestJson(fixture("go-test-json", "malformed.jsonl"))).toThrow(/go test -json/);
  });
});

describe("clover adapter", () => {
  it("maps statements/methods/conditionals to line/function/branch", () => {
    const facts = parseCloverXml(fixture("clover", "ordinary.xml"));
    expect(facts.line_percent).toBeCloseTo((16 + 15) / 50 * 100, 2);
    expect(facts.files[0].line_percent).toBe(80);
    expect(facts.files[1].function_percent).not.toBeNull();
  });

  it("reports zero-statement files as 100 percent (nothing to cover)", () => {
    const facts = parseCloverXml(fixture("clover", "zero-denominator.xml"));
    expect(facts.files[0].line_percent).toBe(100);
    expect(facts.files[0].function_percent).toBeNull();
    expect(facts.branch_percent).toBeNull();
  });
});

describe("go-coverprofile adapter", () => {
  it("aggregates block coverage per file with null function/branch", () => {
    const facts = parseGoCoverprofile(fixture("go-coverprofile", "ordinary.cov"));
    expect(facts.line_percent).toBeCloseTo(3 / 4 * 100, 1);
    expect(facts.files).toHaveLength(2);
    expect(facts.files[0].function_percent).toBeNull();
    expect(facts.files[0].branch_percent).toBeNull();
  });

  it("treats an empty profile as unknown coverage", () => {
    const facts = parseGoCoverprofile(fixture("go-coverprofile", "empty.cov"));
    expect(facts.files).toHaveLength(0);
    expect(facts.line_percent).toBeNull();
  });
});

describe("lcov coverage parser (registry)", () => {
  it("treats zero-coverable-line files as unknown, not zero", async () => {
    const { coverageParserFor } = await import("../../src/adapters");
    const facts = await coverageParserFor("lcov")(fixture("lcov", "zero-denominator.info"));
    expect(facts.files[0].line_percent).toBeNull();
  });

  it("keeps monorepo relative paths and strips leading slashes", async () => {
    const { coverageParserFor } = await import("../../src/adapters");
    const facts = await coverageParserFor("lcov")(fixture("lcov", "monorepo.info"));
    expect(facts.files.map((f) => f.path)).toEqual([
      "packages/core/src/sum.ts",
      "/abs/path/src/other.ts",
    ]);
    expect(facts.line_percent).toBeCloseTo(2 / 3 * 100, 1);
  });
});

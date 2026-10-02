import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import git from "isomorphic-git";
import fs from "fs/promises";

const CLI = path.resolve(__dirname, "../../dist/index.js");

const schema = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../schemas/envelope.v1.json"), "utf-8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date-time", true);
const validateSchema = ajv.compile(schema);

const LCOV = `
TN:
SF:src/sum.ts
DA:1,1
DA:2,0
LF:2
LH:1
end_of_record
`;

const VITEST_JSON = JSON.stringify({
  numTotalTests: 2,
  numPassedTests: 1,
  numFailedTests: 1,
  numPendingTests: 0,
  testResults: [
    {
      name: "src/sum.test.ts",
      status: "failed",
      assertionResults: [
        { fullName: "sum adds", status: "passed" },
        {
          fullName: "sum wraps negatives",
          status: "failed",
          failureMessages: ["Error: expected -1"],
          location: { line: 4 },
        },
      ],
    },
  ],
});

const GO_TEST_JSON = [
  { Action: "pass", Package: "example.com/m/sum", Test: "TestSum", Elapsed: 0.02 },
  { Action: "pass", Package: "example.com/m/sum", Elapsed: 0.03 },
].map((e) => JSON.stringify(e)).join("\n") + "\n";

const GO_COVER = `mode: set
example.com/m/sum/sum.go:5.20,7.3 2 1
example.com/m/sum/sum.go:9.20,11.3 1 0
`;

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Unit" tests="2" failures="1" errors="0" skipped="0" time="0.20">
    <testcase name="test_adds" classname="Unit\\SumTest" time="0.10"/>
    <testcase name="test_wraps" classname="Unit\\WrapTest" time="0.10">
      <failure message="Failed asserting that -1 is 0">-1 is not 0.</failure>
    </testcase>
  </testsuite>
</testsuites>
`;

const CLOVER = `<?xml version="1.0"?>
<coverage generated="1695000000">
  <project timestamp="1695000000">
    <file name="app/Support/Math.php">
      <metrics statements="10" coveredstatements="8" methods="3" coveredmethods="2" conditionals="4" coveredconditionals="2"/>
    </file>
  </project>
</coverage>
`;

let repo: string;
let headSha: string;

beforeAll(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "elyseum-adapters-"));
  await mkdir(path.join(repo, "src"), { recursive: true });
  await writeFile(path.join(repo, "src", "sum.ts"), "const sum = 1;\n");
  await git.init({ fs, dir: repo });
  await git.add({ fs, dir: repo, filepath: "src/sum.ts" });
  headSha = await git.commit({
    fs,
    dir: repo,
    message: "seed",
    author: { name: "t", email: "t@example.com" },
  });
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

function writeReports(
  dir: string,
  files: Record<string, string>,
): Promise<unknown> {
  return Promise.all(
    Object.entries(files).map(([name, content]) => {
      const full = path.join(dir, name);
      return mkdir(path.dirname(full), { recursive: true }).then(() =>
        writeFile(full, content),
      );
    }),
  );
}

async function makeRepoDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  await git.init({ fs, dir });
  await writeFile(path.join(dir, "seed.txt"), "seed");
  await git.add({ fs, dir, filepath: "seed.txt" });
  await git.commit({
    fs,
    dir,
    message: "seed",
    author: { name: "t", email: "t@example.com" },
  });
  return dir;
}

function emit(args: string[], cwd: string) {
  const result = spawnSync(process.execPath, [CLI, "emit-envelope", ...args], {
    cwd,
    encoding: "utf-8",
  });
  return { code: result.status ?? 1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

describe("combined adapter stacks", () => {
  it("builds a Maomao-shaped envelope (vitest-json + lcov) that validates", async () => {
    const dir = await makeRepoDir("elyseum-maomao-");
    await writeReports(dir, {
      "tests/vitest.json": VITEST_JSON,
      "coverage/lcov.info": LCOV,
    });

    const result = emit(
      [
        "--emit-envelope.tests-format", "vitest-json",
        "--emit-envelope.tests-input", "tests/vitest.json",
        "--emit-envelope.coverage-format", "lcov",
        "--emit-envelope.coverage-input", "coverage/lcov.info",
      ],
      dir,
    );

    const envelope = JSON.parse(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.provenance.tests_format).toBe("vitest-json");
    expect(envelope.provenance.coverage_format).toBe("lcov");
    expect(envelope.tests.failed).toBe(1);
    expect(envelope.tests.failed_tests[0].name).toBe("sum wraps negatives");
    await rm(dir, { recursive: true, force: true });
  });

  it("builds a Marller-shaped envelope (go-test-json + go-coverprofile) that validates", async () => {
    const dir = await makeRepoDir("elyseum-marller-");
    await writeReports(dir, {
      "tests/go.json": GO_TEST_JSON,
      "coverage/cover.out": GO_COVER,
    });

    const result = emit(
      [
        "--emit-envelope.tests-format", "go-test-json",
        "--emit-envelope.tests-input", "tests/go.json",
        "--emit-envelope.coverage-format", "go-coverprofile",
        "--emit-envelope.coverage-input", "coverage/cover.out",
      ],
      dir,
    );

    const envelope = JSON.parse(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.coverage.line_percent).toBe(66.6667);
    expect(envelope.provenance.coverage_format).toBe("go-coverprofile");
    await rm(dir, { recursive: true, force: true });
  });

  it("builds a Laravel-shaped envelope (junit + clover) that validates", async () => {
    const dir = await makeRepoDir("elyseum-laravel-");
    await writeReports(dir, {
      "build/reports/junit.xml": JUNIT,
      "build/reports/coverage.xml": CLOVER,
    });

    const result = emit(
      [
        "--emit-envelope.tests-format", "junit",
        "--emit-envelope.tests-input", "build/reports/junit.xml",
        "--emit-envelope.coverage-format", "clover",
        "--emit-envelope.coverage-input", "build/reports/coverage.xml",
      ],
      dir,
    );

    const envelope = JSON.parse(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.tests.failed).toBe(1);
    expect(envelope.coverage.line_percent).toBe(80);
    expect(envelope.coverage.files[0].path).toBe("app/Support/Math.php");
    await rm(dir, { recursive: true, force: true });
  });

  it("supports a partial envelope with only tests (no coverage section from adapters)", async () => {
    const dir = await makeRepoDir("elyseum-partial-");
    await writeReports(dir, { "tests/junit.xml": JUNIT });

    const result = emit(
      [
        "--emit-envelope.tests-format", "junit",
        "--emit-envelope.tests-input", "tests/junit.xml",
      ],
      dir,
    );

    expect(result.code, result.out).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.tests.total).toBe(2);
    // Coverage absence is represented by omission, never fabricated zeros.
    expect(envelope.coverage).toBeUndefined();
  });

  it("accepts coverage reports from stdin (-)", async () => {
    const dir = await makeRepoDir("elyseum-stdin-");
    await writeReports(dir, { "tests/vitest.json": VITEST_JSON });

    const result = spawnSync(
      process.execPath,
      [
        CLI, "emit-envelope",
        "--emit-envelope.tests-format", "vitest-json",
        "--emit-envelope.tests-input", "tests/vitest.json",
        "--emit-envelope.coverage-format", "lcov",
        "--emit-envelope.coverage-input", "-",
      ],
      { cwd: dir, encoding: "utf-8", input: LCOV },
    );
    const envelope = JSON.parse(result.stdout);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.coverage.line_percent).toBe(50);
  });

  it("enforces bounds on failed tests and coverage files", async () => {
    const dir = await makeRepoDir("elyseum-bounds-");
    const manyFiles = Array.from({ length: 2500 }, (_, i) => ({
      path: `src/file${i}.ts`,
      line_percent: 50,
    }));
    await writeReports(dir, {
      "coverage/clover.xml": `<?xml version="1.0"?><coverage><project>` +
        Array.from({ length: 2500 }, (_, i) =>
          `<file name="src/f${i}.ts"><metrics statements="2" coveredstatements="1" methods="0" coveredmethods="0" conditionals="0" coveredconditionals="0"/></file>`,
        ).join("") + `</project></coverage>`,
    });

    const result = emit(
      [
        "--emit-envelope.coverage-format", "clover",
        "--emit-envelope.coverage-input", "coverage/clover.xml",
      ],
      dir,
    );

    const envelope = JSON.parse(result.out);
    expect(envelope.coverage.files).toHaveLength(2000);
  });

  it("rejects unknown formats deterministically", () => {
    const result = emit(["--emit-envelope.tests-format", "cucumber"], repo);
    expect(result.code).toBe(2);
    expect(result.err).toContain("tests-format must be one of");
  });

  it("requires an input path when a tests format is given", () => {
    const result = emit(["--emit-envelope.tests-format", "junit"], repo);
    expect(result.code).toBe(2);
    expect(result.err).toContain("tests-input");
  });
});

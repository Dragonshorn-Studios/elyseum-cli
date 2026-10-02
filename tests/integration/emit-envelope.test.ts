import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import fs from "fs/promises";
import { readFileSync } from "node:fs";
import git from "isomorphic-git";

const CLI = path.resolve(__dirname, "../../dist/index.js");

const schema = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../schemas/envelope.v1.json"), "utf-8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date-time", true);
const validateSchema = ajv.compile(schema);

const LCOV = `
TN:
SF:src/app.ts
DA:1,1
DA:2,0
LF:2
LH:1
end_of_record
`;

let repo: string;
let headSha: string;

beforeAll(async () => {
  repo = await mkdtemp(path.join(tmpdir(), "elyseum-emit-"));
  await mkdir(path.join(repo, "src"), { recursive: true });
  await writeFile(path.join(repo, "src", "app.ts"), "const a = 1;\nconst b = 2;\n");
  await git.init({ fs, dir: repo });
  await git.add({ fs, dir: repo, filepath: "src/app.ts" });
  headSha = await git.commit({
    fs,
    dir: repo,
    message: "seed",
    author: { name: "t", email: "t@example.com" },
  });
  await mkdir(path.join(repo, "coverage"), { recursive: true });
  await writeFile(path.join(repo, "coverage", "lcov.info"), LCOV);
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});


function run(args: string[], cwd: string = repo, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return { code: result.status ?? 1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

function parseEnvelope(out: string): any {
  // Diagnostics go to stderr, so stdout carries exactly one JSON document.
  return JSON.parse(out);
}

describe("emit-envelope", () => {
  it("emits a schema-valid envelope from coverage and git facts", () => {
    // Clear GitHub variables so the generic-CI fallback applies on runners.
    const result = run(["emit-envelope"], repo, {
      GITHUB_RUN_ID: "",
      GITHUB_RUN_ATTEMPT: "",
      GITHUB_REPOSITORY: "",
    });
    expect(result.code, result.out).toBe(0);

    const envelope = parseEnvelope(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.commit.sha).toBe(headSha);
    // unknown test facts are omitted, never zeroed
    expect(envelope.tests).toBeUndefined();
    expect(envelope.quality_gate).toBeUndefined();
    expect(envelope.run.provider).toBe("generic");
    // generic-CI fallback: run_id is the HEAD sha, attempt 1
    expect(envelope.run.run_id).toBe(headSha);
    expect(envelope.run.attempt).toBe(1);
  });

  it("includes the tests section when test facts are provided", () => {
    const result = run([
      "emit-envelope",
      "--emit-envelope.tests-total", "42",
      "--emit-envelope.tests-passed", "40",
      "--emit-envelope.tests-failed", "2",
    ]);
    expect(result.code, result.out).toBe(0);

    const envelope = parseEnvelope(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.tests.total).toBe(42);
    expect(envelope.tests.failed).toBe(2);
  });

  it("honors explicit run identity options", () => {
    const result = run([
      "emit-envelope",
      "--emit-envelope.run-provider", "github",
      "--emit-envelope.run-id", "1234567890",
      "--emit-envelope.run-job-id", "987",
      "--emit-envelope.run-attempt", "2",
      "--emit-envelope.quality-gate-conclusion", "failed",
    ]);
    expect(result.code, result.out).toBe(0);

    const envelope = parseEnvelope(result.out);
    expect(validateSchema(envelope)).toBe(true);
    expect(envelope.run.provider).toBe("github");
    expect(envelope.run.run_id).toBe("1234567890");
    expect(envelope.run.attempt).toBe(2);
    expect(envelope.quality_gate.conclusion).toBe("failed");
  });

  it("writes the envelope to a file with --emit-envelope.out", async () => {
    const out = path.join(repo, "envelope.json");
    const result = run(["emit-envelope", "--emit-envelope.out", "envelope.json"]);
    expect(result.code, result.out).toBe(0);

    const envelope = JSON.parse(await fs.readFile(out, "utf-8"));
    expect(validateSchema(envelope)).toBe(true);
  });

  it("exits 4 when the LCOV report is missing", () => {
    const result = run(["emit-envelope", "--emit-envelope.lcov-path", "nope.info"]);
    if (result.code !== 4) {
      throw new Error(`exit=${result.code} stdout=${JSON.stringify(result.out.slice(0, 200))} stderr=${JSON.stringify(result.err.slice(0, 900))}`);
    }
    expect(result.code).toBe(4);
  });

  it("emits null coverage (never fabricated) for an empty go coverprofile", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "elyseum-nullcov-"));
    await mkdir(path.join(dir, "coverage"), { recursive: true });
    await writeFile(path.join(dir, "coverage", "empty.cov"), "mode: set\n");
    await git.init({ fs, dir });
    await writeFile(path.join(dir, "seed.txt"), "seed");
    await git.add({ fs, dir, filepath: "seed.txt" });
    await git.commit({ fs, dir, message: "seed", author: { name: "t", email: "t@example.com" } });

    const result = run([
      "emit-envelope",
      "--emit-envelope.coverage-format", "go-coverprofile",
      "--emit-envelope.coverage-input", "coverage/empty.cov",
    ], dir);
    expect(result.code, `out=${result.out} err=${result.err}`).toBe(0);

    const envelope = JSON.parse(result.out);
    expect(envelope.coverage.line_percent).toBeNull();
    expect(envelope.coverage.function_percent).toBeNull();
    expect(envelope.coverage.branch_percent).toBeNull();
  });

  it("exits 4 for a missing lcov path configured via .elyseum.yml", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "elyseum-cfglcov-"));
    await mkdir(path.join(dir, "reports"), { recursive: true });
    await writeFile(path.join(dir, "seed.txt"), "seed");
    await writeFile(
      path.join(dir, ".elyseum.yml"),
      "config:\n  coverage:\n    lcov-path: reports/missing-lcov.info\n",
    );
    await git.init({ fs, dir });
    await git.add({ fs, dir, filepath: "seed.txt" });
    await git.commit({ fs, dir, message: "seed", author: { name: "t", email: "t@example.com" } });

    const result = run(["emit-envelope"], dir);
    expect(result.code, result.err).toBe(4);
    expect(result.err).toContain("LCOV report not found");
  });

  it("exits 2 when a quality-gate conclusion override is invalid", () => {
    const result = run([
      "emit-envelope",
      "--emit-envelope.quality-gate-conclusion", "banana",
    ]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("quality-gate-conclusion");
  });

  it("exits 3 when git is missing (commit facts are required)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "elyseum-emit-nogit-"));
    try {
      mkdirSync(path.join(dir, "coverage"), { recursive: true });
      writeFileSync(path.join(dir, "coverage", "lcov.info"), LCOV);

      const result = spawnSync(process.execPath, [CLI, "emit-envelope"], {
        cwd: dir,
        encoding: "utf-8",
      });
      expect(result.status).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

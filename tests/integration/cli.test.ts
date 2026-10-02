import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import git from "isomorphic-git";

const CLI = path.resolve(__dirname, "../../dist/index.js");

let workdir: string;

const LCOV = `
TN:
SF:src/app.ts
FN:1,boot
FNDA:1,boot
FNF:1
FNH:1
BRDA:2,0,0,1
BRDA:2,0,1,0
BRF:2
BRH:1
DA:1,1
DA:2,0
DA:3,1
LF:3
LH:2
end_of_record
`;

beforeAll(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "elyseum-cli-it-"));
  await mkdir(path.join(workdir, "src"), { recursive: true });
  await mkdir(path.join(workdir, "coverage"), { recursive: true });
  await writeFile(path.join(workdir, "coverage", "lcov.info"), LCOV);
});

afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

function run(args: string[], cwd: string): { code: number; out: string; err: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf-8" });
  return { code: result.status ?? 1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

describe("packed/built CLI integration", () => {
  it("computes diff coverage from an explicit changed-file list without git", () => {
    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "coverage/lcov.info",
        "--reporter.coverage", "markdown-table",
      ],
      workdir,
    );

    expect(result.code, result.out).toBe(0);
    // Whole-file mode: all 3 coverable lines count, 2 covered.
    expect(result.out).toContain("| Lines     | 3 | 2 | 66.67% |");
  });

  it("exits 1 when the quality gate is not met", () => {
    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "coverage/lcov.info",
        "--reporter.coverage", "markdown-table",
        "--reporter.coverage.quality-gate", "90",
        "--reporter.coverage.quality-gate-fail", "90",
      ],
      workdir,
    );

    // changed-line coverage for src/app.ts is 2/3 (lines 1 and 3 covered)
    expect(result.code).toBe(1);
  });

  it("exits 3 with an actionable message when git is missing", () => {
    const result = run(["diff-coverage", "--coverage.lcov-path", "coverage/lcov.info"], workdir);
    expect(result.code).toBe(3);
    expect(result.err).toContain("git repository");
  });

  it("exits 4 with an actionable message when the LCOV report is missing", () => {
    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "nope/lcov.info",
      ],
      workdir,
    );
    expect(result.code).toBe(4);
    expect(result.err).toContain("LCOV report not found");
  });

  it("lets an explicit CLI flag beat a config-defined lcov path", async () => {
    // .elyseum.yml points at the valid report; the flag points at a missing
    // one. The flag must win (exit 4), proving precedence.
    await writeFile(
      path.join(workdir, ".elyseum.yml"),
      "config:\n  coverage:\n    lcov-path: coverage/lcov.info\n",
    );

    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "nope/lcov.info",
      ],
      workdir,
    );
    expect(result.code).toBe(4);
  });

  it("keeps configured quality gates when a reporter list flag is passed", async () => {
    await writeFile(
      path.join(workdir, ".elyseum.yml"),
      "config:\n  reporter:\n    coverage:\n      quality-gate-fail: 100\n",
    );

    // The flag replaces the reporter LIST; the configured gate (fail at
    // <=100) must survive, so the run still fails.
    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "coverage/lcov.info",
        "--reporter.coverage", "markdown-table",
      ],
      workdir,
    );
    expect(result.code, result.out).toBe(1);
  });

  it("exits 2 with every violation listed for an invalid config", async () => {
    const bad = await mkdtemp(path.join(tmpdir(), "elyseum-cli-bad-"));
    await writeFile(
      path.join(bad, ".elyseum.yml"),
      "default-environment: 123\nconfig: 42\n",
    );

    const written = await readFile(path.join(bad, ".elyseum.yml"), "utf-8");
    expect(written.length).toBeGreaterThan(0);
    const result = run(["coverage", "--coverage.lcov-path", "coverage/lcov.info"], bad);
    expect(result.code, result.out).toBe(2);
    expect(result.err).toContain("Invalid config");
    await rm(bad, { recursive: true, force: true });
  });

  it("exits 2 for a malformed .elyseum.yml instead of crashing", async () => {
    const bad = await mkdtemp(path.join(tmpdir(), "elyseum-cli-yaml-"));
    await writeFile(
      path.join(bad, ".elyseum.yml"),
      "config: [unclosed",
    );

    const result = run(["coverage"], bad);
    expect(result.code, result.out).toBe(2);
    expect(result.err).toContain("Invalid config");
    await rm(bad, { recursive: true, force: true });
  });

  it("exits 5 for a malformed LCOV report", async () => {
    const bad = await mkdtemp(path.join(tmpdir(), "elyseum-cli-lcov-"));
    await writeFile(
      path.join(bad, "garbage.info"),
      "not an lcov report at all",
    );

    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "garbage.info",
      ],
      bad,
    );
    expect(result.code).toBe(5);
    await rm(bad, { recursive: true, force: true });
  });

  it("exits 4 from the coverage command when the report is missing", () => {
    const result = run(["coverage", "--coverage.lcov-path", "nope/lcov.info"], workdir);
    expect(result.code).toBe(4);
    expect(result.err).toContain("LCOV report not found");
  });

  it("warns (exit 0) when changed-line coverage is below the gate but above fail", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "elyseum-cli-warn-"));
    await mkdir(path.join(dir, "coverage"), { recursive: true });
    await writeFile(path.join(dir, "coverage", "lcov.info"), LCOV);

    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "coverage/lcov.info",
        "--reporter.coverage", "markdown-table",
        "--reporter.coverage.quality-gate", "90",
      ],
      dir,
    );

    // 2/3 changed-line coverage: below the 90 gate, no fail threshold set.
    expect(result.code, result.out).toBe(0);
    expect(result.err).toContain("Quality gate warning");
    await rm(dir, { recursive: true, force: true });
  });

  it("computes the diff from a real fixture repository", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "elyseum-cli-repo-"));
    await mkdir(path.join(repo, "src"), { recursive: true });
    await writeFile(path.join(repo, "src", "app.ts"), "const a = 1;\nconst b = 2;\n");

    const fsAny = await import("fs/promises");
    await git.init({ fs: fsAny, dir: repo });
    await git.add({ fs: fsAny, dir: repo, filepath: "src/app.ts" });
    const baseSha = await git.commit({
      fs: fsAny,
      dir: repo,
      message: "base",
      author: { name: "t", email: "t@example.com" },
    });

    await writeFile(path.join(repo, "src", "app.ts"), "const a = 1;\nconst b = 2;\nconst c = 3;\n");
    await git.add({ fs: fsAny, dir: repo, filepath: "src/app.ts" });
    const headSha = await git.commit({
      fs: fsAny,
      dir: repo,
      message: "head",
      author: { name: "t", email: "t@example.com" },
    });

    // LCOV covers only lines 1-2 of the head file; line 3 is uncovered.
    const lcov = `
TN:
SF:src/app.ts
DA:1,1
DA:2,1
DA:3,0
LF:3
LH:2
end_of_record
`;
    await mkdir(path.join(repo, "coverage"), { recursive: true });
    await writeFile(path.join(repo, "coverage", "lcov.info"), lcov);

    const result = run(
      [
        "diff-coverage",
        `--diff-coverage.head=${headSha}`,
        `--diff-coverage.base=${baseSha}`,
        "--coverage.lcov-path", "coverage/lcov.info",
        "--reporter.coverage", "markdown-table",
      ],
      repo,
    );

    expect(result.code, result.out).toBe(0);
    // head adds line 3, which the LCOV marks uncovered: 1 changed line, 0 covered.
    expect(result.out).toContain("| Lines     | 1 | 0 | 0.00% |");

    await rm(repo, { recursive: true, force: true });
  });
});

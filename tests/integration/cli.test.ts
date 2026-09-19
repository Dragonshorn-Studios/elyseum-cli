import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readdir } from "node:fs/promises";
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
  await writeFile(path.join(workdir, "coverage", "lcov.info").replace("coverage", "coverage"), LCOV, {
    recursive: true,
  } as any).catch(async () => {
    await mkdir(path.join(workdir, "coverage"), { recursive: true });
    await writeFile(path.join(workdir, "coverage", "lcov.info"), LCOV);
  });
});

afterAll(async () => {
  await rm(workdir, { recursive: true, force: true });
});

function run(args: string[], cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], { cwd, stdio: "pipe" });
    return { code: 0, out: out.toString() };
  } catch (error: any) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

describe("packed/built CLI integration", () => {
  it("computes diff coverage from an explicit changed-file list without git", () => {
    const result = run(
      [
        "diff-coverage",
        "--diff-coverage.changed-files", "src/app.ts",
        "--coverage.lcov-path", "coverage/lcov.info",
        "--reporter.coverage", "markdown-table",
        "--reporter.coverage.github-pr-comment.quality-gate", "50",
      ],
      workdir,
    );

    expect(result.code, result.out).toBe(0);
    expect(result.out).toContain("app.ts");
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

    // changed-line coverage for src/app.ts is 2/3 (comment line excluded)
    expect(result.code).toBe(1);
  });

  it("exits 3 with an actionable message when git is missing", () => {
    const result = run(["diff-coverage", "--coverage.lcov-path", "coverage/lcov.info"], workdir);
    expect(result.code).toBe(3);
    expect(result.out).toContain("git repository");
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
    expect(result.out).toContain("LCOV report not found");
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

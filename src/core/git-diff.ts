import git from "isomorphic-git";
import fs from "fs/promises";
import { merge } from "diff";
import { MissingGitError } from "./errors";
import { LcovRecord, percent } from "./lcov";

export interface ChangedFile {
  path: string;
  /** Present when the diff is computed from git; absent for whole-file lists. */
  lines?: number;
  type?: "add" | "modify" | "remove";
  /** Present when the diff is computed from git; absent for whole-file lists. */
  diff?: {
    hunks: { newStart: number; newLines: number; lines?: string[] }[];
  };
}

export interface DiffFacts {
  headSha: string;
  baseSha: string;
}

/** Normalizes a leading slash so LCOV paths and diff paths compare equal. */
export function normalizePath(path: string): string {
  return path.replace(/^\//, "");
}

/**
 * Lines the diff adds that can carry coverage: added (+) lines, or — when a
 * hunk carries no per-line annotations (new files) — every new line in the
 * hunk. Removed lines, context lines, and comment/blank additions are
 * excluded. Pure.
 */
export function extractChangedLineNumbers(
  hunks: { newStart: number; newLines: number; lines?: string[] }[],
  coverableLineNumbers: Set<number>,
): Set<number> {
  const changed = new Set<number>();

  for (const hunk of hunks) {
    const lines = hunk.lines ?? [];

    if (lines.length === 0) {
      // New files: every line of the hunk is an addition.
      for (let line = hunk.newStart; line < hunk.newStart + hunk.newLines; line++) {
        if (coverableLineNumbers.has(line)) {
          changed.add(line);
        }
      }
      continue;
    }

    let line = hunk.newStart;
    for (const raw of lines) {
      if (raw.startsWith("-")) {
        // Removed lines belong to the old file and consume no new number.
        continue;
      }
      if (raw.startsWith("\\")) {
        // "\ No newline at end of file" marker.
        continue;
      }

      if (raw.startsWith("+")) {
        const content = raw.slice(1);
        if (coverableLineNumbers.has(line) && !isCommentLine(content)) {
          changed.add(line);
        }
      }

      line++;
    }
  }

  return changed;
}

/**
 * Comment-only or blank additions cannot carry coverage; counting them as
 * uncovered would punish documentation. Pure.
 */
export function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed === "" ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  );
}

/** Pure diff-coverage aggregation over changed files and LCOV records. */
export function calculateDiffCoverage(
  files: ChangedFile[],
  coverage: LcovRecord[],
  facts: DiffFacts,
): {
  headSha: string;
  baseSha: string;
  lines: { total: number; covered: number; percent: number };
  functions: { total: number; covered: number; percent: number };
  branches: { total: number; covered: number; percent: number };
  files: {
    file: string;
    lines: { total: number; covered: number; percent: number };
    functions: { total: number; covered: number; percent: number };
    branches: { total: number; covered: number; percent: number };
  }[];
} {
  const result = {
    headSha: facts.headSha,
    baseSha: facts.baseSha,
    lines: { total: 0, covered: 0, percent: 100 },
    functions: { total: 0, covered: 0, percent: 100 },
    branches: { total: 0, covered: 0, percent: 100 },
    files: [] as {
      file: string;
      lines: { total: number; covered: number; percent: number; details?: unknown };
      functions: { total: number; covered: number; percent: number; details?: unknown };
      branches: { total: number; covered: number; percent: number; details?: unknown };
    }[],
  };

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const coverageData = coverage.find((c) => c.file === normalizedPath);

    // A changed file with no LCOV record contributes no coverable lines.
    if (!coverageData) {
      result.files.push({
        file: normalizedPath,
        lines: { total: 0, covered: 0, percent: 100 },
        functions: { total: 0, covered: 0, percent: 100 },
        branches: { total: 0, covered: 0, percent: 100 },
      });
      continue;
    }

    const coverable = new Set(coverageData.lines.details.map((d) => d.line));

    // An explicit changed-file list carries no diff: every coverable line of
    // the file counts as changed.
    const changedLines = file.diff
      ? extractChangedLineNumbers(file.diff.hunks, coverable)
      : new Set(coverable);

    let coveredLines = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalBranches = 0;
    let coveredBranches = 0;

    const uncoveredLineBlocks: { hit: boolean; start: number; end: number }[] = [];
    const changedFunctions: unknown[] = [];
    const changedBranches: unknown[] = [];

    let firstUncoveredLine = 0;
    let uncoveredBlockLength = 0;

    for (const detail of coverageData.lines.details) {
      if (!changedLines.has(detail.line)) {
        continue;
      }
      if (detail.hit > 0) {
        coveredLines++;
        if (uncoveredBlockLength > 0) {
          uncoveredLineBlocks.push({
            hit: false,
            start: firstUncoveredLine,
            end: firstUncoveredLine + uncoveredBlockLength,
          });
          uncoveredBlockLength = 0;
        }
        firstUncoveredLine = detail.line + 1;
      } else {
        if (firstUncoveredLine === 0) {
          firstUncoveredLine = detail.line;
        }
        uncoveredBlockLength++;
      }
    }

    if (uncoveredBlockLength > 0) {
      uncoveredLineBlocks.push({
        hit: false,
        start: firstUncoveredLine,
        end: firstUncoveredLine + uncoveredBlockLength,
      });
    }

    for (const fn of coverageData.functions.details) {
      if (changedLines.has(fn.line)) {
        totalFunctions++;
        if (fn.hit > 0) {
          coveredFunctions++;
        }
        changedFunctions.push(fn);
      }
    }
    for (const branch of coverageData.branches.details) {
      if (changedLines.has(branch.line)) {
        totalBranches++;
        if (branch.taken > 0) {
          coveredBranches++;
        }
        changedBranches.push(branch);
      }
    }

    result.lines.total += changedLines.size;
    result.lines.covered += coveredLines;
    result.functions.total += totalFunctions;
    result.functions.covered += coveredFunctions;
    result.branches.total += totalBranches;
    result.branches.covered += coveredBranches;

    result.files.push({
      file: normalizedPath,
      lines: {
        total: changedLines.size,
        covered: coveredLines,
        percent: percent(coveredLines, changedLines.size),
        details: uncoveredLineBlocks,
      },
      functions: {
        total: totalFunctions,
        covered: coveredFunctions,
        percent: percent(coveredFunctions, totalFunctions),
        details: changedFunctions,
      },
      branches: {
        total: totalBranches,
        covered: coveredBranches,
        percent: percent(coveredBranches, totalBranches),
        details: changedBranches,
      },
    });
  }

  result.lines.percent = percent(result.lines.covered, result.lines.total);
  result.functions.percent = percent(result.functions.covered, result.functions.total);
  result.branches.percent = percent(result.branches.covered, result.branches.total);

  return result;
}

/** Throws MissingGitError when the working directory is not a git checkout. */
export async function assertGitRepository(dir: string): Promise<void> {
  const gitExists = await fs
    .access(`${dir}/.git`)
    .then(() => true)
    .catch(() => false);

  if (!gitExists) {
    throw new MissingGitError(dir);
  }
}

/** Walks head vs base and returns changed files with their unified diffs. */
export async function getChangedFiles(
  dir: string,
  head: string,
  base: string,
): Promise<ChangedFile[]> {
  return git.walk({
    fs,
    dir,
    trees: [git.TREE({ ref: head }), git.TREE({ ref: base })],
    map: async function (filepath, [HEAD, BASE]) {
      if (filepath === "." || !HEAD) {
        return;
      }
      if ((await HEAD.type()) === "tree" || (BASE && (await BASE.type())) === "tree") {
        return;
      }

      const headOid = await HEAD.oid();
      const baseOid = BASE ? await BASE.oid() : undefined;

      let type: "add" | "modify" | "remove" | "equal" = "equal";
      let process = false;
      if (headOid !== baseOid) {
        type = "modify";
        process = true;
      }
      if (headOid === undefined) {
        type = "remove";
      }
      if (baseOid === undefined) {
        type = "add";
        process = true;
      }
      if (!process) {
        return;
      }

      const headContent = await HEAD.content();
      const headContentStr = headContent ? new TextDecoder().decode(headContent) : "";

      let diff;
      if (type === "modify" && BASE) {
        const baseContent = await BASE.content();
        const baseContentStr = baseContent ? new TextDecoder().decode(baseContent) : "";
        diff = merge(headContentStr, baseContentStr, baseContentStr);
      } else {
        diff = {
          hunks: [
            {
              newStart: 1,
              newLines: headContentStr.split("\n").length,
            },
          ],
        };
      }

      return {
        path: `/${filepath}`,
        lines: headContentStr.split("\n").length,
        type,
        diff,
      };
    },
  });
}

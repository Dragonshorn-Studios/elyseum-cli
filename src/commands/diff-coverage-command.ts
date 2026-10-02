import fs from "fs/promises";
import git from "isomorphic-git";
import { minimatch } from "minimatch";
import { getCoverageExcludes } from "../utils/config-readers/coverage-config-reader";
import { getCoverageReportersFromArgs } from "../utils/reporters/reporters";
import { Command, CommandMap } from "./command";
import Config, { CustomConfig } from "../config";
import { Logger } from "../utils/logger";
import { Octokit } from "octokit";
import { exec } from "child_process";
import { promisify } from "util";
import { CliError, MissingLcovError } from "../core/errors";
import { LcovRecord, readLcovReport } from "../core/lcov";
import {
  assertGitRepository,
  calculateDiffCoverage,
  getChangedFiles,
} from "../core/git-diff";
import { evaluateQualityGate } from "../core/quality-gate";
import { EXIT_CODES } from "../core/exit-codes";
import fsSync from "fs";

const COVERAGE_INCLUDES = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.vue",
];

export class DiffCoverageCommand implements Command {
  name: string = "diff-coverage";
  config?: CustomConfig = {
    base: {
      help: "The base branch/sha to compare against",
      type: "str",
      required: false,
      default: process.env.GITHUB_BASE_REF
        ? `origin/${process.env.GITHUB_BASE_REF}`
        : "origin/main",
    },
    dynamic: {
      help: "Resolve the base from the GitHub pull request",
      type: "str",
      required: false,
      default: "",
    },
    head: {
      help: "The head branch/sha to compare against",
      type: "str",
      required: false,
      default: process.env.GITHUB_SHA || "HEAD",
    },
    "changed-files": {
      help: "Comma separated list of changed files (skips git)",
      type: "str",
      required: false,
      default: "",
    },
    "lcov-path": {
      help: "Path to the LCOV report",
      type: "str",
      required: false,
      default: "coverage/lcov.info",
    },
  };

  constructor(commands: CommandMap) {
    commands[this.name] = this;
  }

  public async run(args: any): Promise<number> {
    try {
      Logger.debug("Running diff-coverage command");

      const changedFiles = Config.get(this.name, "changed-files", "") as string;
      const lcovPath = Config.getInstance().getFirst(
        ["coverage.lcov-path", "diff-coverage.lcov-path"],
        "coverage/lcov.info",
      ) as string;

      let headSha = "";
      let baseSha = "";

      if (!changedFiles) {
        await assertGitRepository(process.cwd());
        headSha = await git.resolveRef({
          fs: fs as any,
          dir: process.cwd(),
          ref: Config.get(this.name, "head"),
        });
        baseSha = await this.resolveBaseSha(headSha);
        Logger.debug(`head: ${headSha}, base: ${baseSha}`);
      }

      const coverageExcludes = getCoverageExcludes(process.cwd());

      let files: { path: string }[] = [];
      if (changedFiles) {
        files = changedFiles.split(",").map((file) => ({ path: file.trim() }));
      } else {
        files = await getChangedFiles(process.cwd(), headSha, baseSha);
      }

      files = files.filter((file) => {
        const normalized = file.path.replace(/^\//, "");
        return (
          !coverageExcludes.some((exclude) => minimatch(normalized, exclude)) &&
          COVERAGE_INCLUDES.some((include) => minimatch(normalized, include))
        );
      });
      Logger.debug(`Changed files: ${files.map((f) => f.path).join(", ")}`);

      let coverage: LcovRecord[];
      try {
        coverage = await readLcovReport(lcovPath);
      } catch (error) {
        if (error instanceof MissingLcovError) {
          Logger.error(error.message);
          Logger.error(error.actionable);
          return error.exitCode;
        }
        throw error;
      }

      const diffCoverage = calculateDiffCoverage(files, coverage, {
        headSha,
        baseSha,
      });

      for (const reporter of getCoverageReportersFromArgs(args)) {
        reporter.report(diffCoverage as any);
      }

      const gate = evaluateQualityGate(diffCoverage.lines.percent, {
        gate: this.numberOption("reporter.coverage.quality-gate"),
        fail: this.numberOption("reporter.coverage.quality-gate-fail"),
      });

      if (gate === "failed") {
        return EXIT_CODES.QUALITY_GATE_FAILED;
      }

      if (gate === "warning") {
        Logger.warn(
          `Quality gate warning: changed-line coverage ${diffCoverage.lines.percent.toFixed(2)}% is below the gate.`,
        );
      }

      return EXIT_CODES.SUCCESS;
    } catch (error: any) {
      Logger.error(`Error running diff-coverage command: ${error.message}`);
      for (const reporter of getCoverageReportersFromArgs(args)) {
        reporter.error(error.message, error);
      }

      if (error instanceof CliError) {
        Logger.error(error.actionable);
        return error.exitCode;
      }

      return EXIT_CODES.CALCULATION_ERROR;
    }
  }

  private numberOption(key: string): number | undefined {
    const value = Config.getInstance().get(key);
    return typeof value === "number" ? value : undefined;
  }

  private async resolveBaseSha(headSha: string): Promise<string> {
    if (Config.get(this.name, "dynamic") === "gh") {
      const baseSha = await this.baseShaFromGithub(headSha);
      if (baseSha) {
        Logger.debug(`Got base SHA from PR: ${baseSha}`);
        return baseSha;
      }
    }

    const baseSha = await git.resolveRef({
      fs: fs as any,
      dir: process.cwd(),
      ref: Config.get(this.name, "base"),
    });
    Logger.debug(`Got base SHA from config: ${baseSha}`);
    return baseSha;
  }

  private async baseShaFromGithub(headSha: string): Promise<string | null> {
    let token = process.env.GITHUB_TOKEN;
    if (!token) {
      const execPromise = promisify(exec);
      const { stdout } = await execPromise("gh auth token");
      token = stdout.trim();
      if (!token) {
        throw new Error("GITHUB_TOKEN is not set");
      }
    }

    const prNumber = process.env.GITHUB_PR_NUMBER;
    const octokit = new Octokit({ auth: token });
    const branchName = await git.currentBranch({ fs: fs as any, dir: process.cwd() });
    const repoUrl = await git.listRemotes({ fs: fs as any, dir: process.cwd() });
    const [owner, repo] = repoUrl[0].url.replace(/\.git$/, "").split("/").slice(-2);

    let resolved = prNumber;
    if (!resolved) {
      const prs = await octokit.rest.search.issuesAndPullRequests({
        q: `head:${branchName} is:pr is:open`,
      });
      if (prs.data.total_count === 0) {
        Logger.info(`No open PR found for branch ${branchName}, using default base branch`);
        return null;
      }
      resolved = prs.data.items[0].number;
    }

    const pr = await octokit.rest.pulls.get({ owner, repo, pull_number: resolved });
    return pr.data.base.sha;
  }
}


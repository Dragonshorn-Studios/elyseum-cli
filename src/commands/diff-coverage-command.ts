import git from "isomorphic-git";
import fs from "fs/promises";
import { merge } from "diff";
import parse from "lcov-parse";
import { minimatch } from "minimatch";
import { getCoverageExcludes } from "../utils/config-readers/coverage-config-reader";
import { getCoverageReportersFromArgs } from "../utils/reporters/reporters";
import {
  CoverageResult,
  CoverageDetail,
  CoverageFile,
} from "../types/coverage-result";
import { Command, CommandMap } from "./command";
import Config, { CustomConfig } from "../config";
import { Logger } from "../utils/logger";
import { Octokit, App } from "octokit";
import { exec } from "child_process";
import { promisify } from "util";

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
      help: "The head branch/sha to compare against",
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
      help: "Comma separated list of changed files",
      type: "str",
      required: false,
      default: "",
    },
  };
  constructor(commands: CommandMap) {
    commands[this.name] = this;
  }

  public async run(args: any): Promise<void> {
    const gitExists = await fs
      .access(".git")
      .then(() => true)
      .catch(() => false);
    if (!gitExists) {
      return;
    }

    const coverageExcludes = getCoverageExcludes(process.cwd());
    const coverageIncludes = [
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.vue",
    ];

    try {
      Logger.debug("Running diff-coverage command");
      Logger.debug(
        `head branch/sha: ${Config.get(
          this.name,
          "head"
        )}, base branch/sha: ${Config.get(this.name, "base")}`
      );
      let changedFiles = Config.get(this.name, "changed-files", "");
      let headSha = await git.resolveRef({
        fs,
        dir: process.cwd(),
        ref: Config.get(this.name, "head"),
      });
      let baseSha = null;
      if (Config.get(this.name, "dynamic") === "gh") {
        let token = process.env.GITHUB_TOKEN;
        if (!token) {
          const execPromise = promisify(exec);
          const { stdout, stderr } = await execPromise("gh auth token");
          if (stderr) {
            throw new Error(stderr);
          }
          token = stdout.trim();
          if (!token) {
            throw new Error("GITHUB_TOKEN is not set");
          }
        }
        let prNumber = process.env.GITHUB_PR_NUMBER;
        const octokit = new Octokit({ auth: token });
        const branchName = await git.currentBranch({
          fs,
          dir: process.cwd(),
        });
        const repoUrl = await git.listRemotes({
          fs,
          dir: process.cwd(),
        });
        const [owner, repo] = repoUrl[0].url
          .replace(/\.git$/, "")
          .split("/")
          .slice(-2);
        Logger.debug(`Owner: ${owner}, Repo: ${repo}`);
        if (!prNumber) {
          const prs = await octokit.rest.search.issuesAndPullRequests({
            q: `head:${branchName} is:pr is:open`,
          });
          if (prs.data.total_count === 0) {
            Logger.info(
              `No open PR found for branch ${branchName}, using default base branch`
            );
          } else {
            prNumber = prs.data.items[0].number;
          }
        }
        if (prNumber) {
          const pr = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: prNumber,
          });
          baseSha = pr.data.base.sha;
          Logger.debug(`Got base SHA from PR: ${baseSha}`);
        }
      }
      if (!baseSha) {
        baseSha = await git.resolveRef({
          fs,
          dir: process.cwd(),
          ref: Config.get(this.name, "base"),
        });
        Logger.debug(`Got base SHA from config: ${baseSha}`);
      }
      Logger.debug(`Changed files: ${changedFiles}`);
      let files = [];
      if (!changedFiles) {
        files = await this.getChangedFiles(process.cwd(), headSha, baseSha);
      } else {
        files = changedFiles.split(",").map((file: string) => {
          return {
            path: file,
          };
        });
      }

      files = files.filter((file: any) => {
        return (
          !coverageExcludes.some((exclude) => {
            return minimatch(file.path.replace(/^\//, ""), exclude);
          }) &&
          coverageIncludes.some((include) => {
            return minimatch(file.path.replace(/^\//, ""), include);
          })
        );
      });
      Logger.debug(`Files: ${files.map((file: any) => file.path).join(", ")}`);
      // normalize file paths

      let coverage = await this.getCoverageReport("coverage/lcov.info");
      let diffCoverage = await this.calculateDiffCoverage(files, coverage, {
        headSha,
        baseSha,
      });
      for (let reporter of getCoverageReportersFromArgs(args)) {
        reporter.report(diffCoverage);
      }
    } catch (error) {
      console.error(error);
    }
  }

  private async calculateDiffCoverage(
    files: any,
    coverage: any,
    { headSha, baseSha }: any
  ): Promise<CoverageResult> {
    const diffCoverageResult: CoverageResult = {
      headSha,
      baseSha,
      lines: {
        total: 0,
        covered: 0,
        percent: 0,
      },
      functions: {
        total: 0,
        covered: 0,
        percent: 0,
      },
      branches: {
        total: 0,
        covered: 0,
        percent: 0,
      },
      files: [],
    };
    for (let file of files) {
      let normalizedPath = file.path.replace(/^\//, "");
      const coverageData = coverage.find((c: any) => c.file === normalizedPath);
      if (!coverageData) {
        diffCoverageResult.lines.total += file.lines;
        diffCoverageResult.files.push({
          file: normalizedPath,
          lines: {
            total: file.lines,
            covered: 0,
            percent: 0,
          },
          functions: {
            total: 0,
            covered: 0,
            percent: 0,
          },
          branches: {
            total: 0,
            covered: 0,
            percent: 0,
          },
        });
        continue;
      }
      let changedLineNumbers = new Set<number>();
      let changedLineCount = 0;
      for (let hunk of file.diff.hunks) {
        for (
          let line = hunk.newStart;
          line < hunk.newStart + hunk.newLines;
          line++
        ) {
          changedLineNumbers.add(line);
        }
        changedLineCount += hunk.newLines;
      }
      let coveredLines = 0;
      let coveredFunctions = 0;
      let totalFunctions = 0;
      let coveredBranches = 0;
      let totalBranches = 0;

      let functions = [];
      let branches = [];

      for (let line of coverageData.lines.details) {
        if (changedLineNumbers.has(line.line) && line.hit > 0) {
          coveredLines++;
        }
      }
      for (let _function of coverageData.functions.details) {
        if (changedLineNumbers.has(_function.line)) {
          totalFunctions++;
          if (_function.hit > 0) {
            coveredFunctions++;
          }
          functions.push(_function);
        }
      }
      for (let branch of coverageData.branches.details) {
        if (changedLineNumbers.has(branch.line)) {
          totalBranches++;
          if (branch.taken > 0) {
            coveredBranches++;
          }
          branches.push(branch);
        }
      }
      diffCoverageResult.lines.total += changedLineCount;
      diffCoverageResult.lines.covered += coveredLines;
      diffCoverageResult.functions.total += totalFunctions;
      diffCoverageResult.functions.covered += coveredFunctions;
      diffCoverageResult.branches.total += totalBranches;
      diffCoverageResult.branches.covered += coveredBranches;
      diffCoverageResult.files.push({
        file: normalizedPath,
        lines: {
          total: changedLineCount,
          covered: coveredLines,
          percent: (coveredLines / changedLineCount) * 100,
        },
        functions: {
          total: totalFunctions,
          covered: coveredFunctions,
          percent: (coveredFunctions / totalFunctions) * 100,
          details: functions,
        },
        branches: {
          total: totalBranches,
          covered: coveredBranches,
          percent: (coveredBranches / totalBranches) * 100,
          details: branches,
        },
      });
    }
    diffCoverageResult.lines.percent =
      (diffCoverageResult.lines.covered / diffCoverageResult.lines.total) * 100;
    diffCoverageResult.functions.percent =
      (diffCoverageResult.functions.covered /
        diffCoverageResult.functions.total) *
      100;
    diffCoverageResult.branches.percent =
      (diffCoverageResult.branches.covered /
        diffCoverageResult.branches.total) *
      100;

    return diffCoverageResult;
  }

  private async getCoverageReport(file: string) {
    const lcov = await fs.readFile(file, "utf-8");
    Logger.debug(`Coverage report loaded from ${file}`);
    return new Promise((resolve, reject) => {
      parse(lcov, (err, data) => {
        if (err) {
          reject(err);
        }
        resolve(data);
      });
    });
  }

  private async getChangedFiles(dir: string, head: string, base: string) {
    return git.walk({
      fs,
      dir,
      trees: [git.TREE({ ref: head }), git.TREE({ ref: base })],
      map: async function (filepath, [HEAD, BASE]) {
        // ignore directories
        if (filepath === ".") {
          return;
        }
        if (!HEAD) {
          return;
        }
        if (
          (await HEAD.type()) === "tree" ||
          (BASE && (await BASE.type())) === "tree"
        ) {
          return;
        }

        // generate ids
        const Aoid = await HEAD.oid();
        const Boid = BASE ? await BASE.oid() : undefined;

        // determine modification type
        let type = "equal";
        let process = false;
        if (Aoid !== Boid) {
          type = "modify";
          process = true;
        }
        if (Aoid === undefined) {
          type = "remove";
        }
        if (Boid === undefined) {
          type = "add";
          process = true;
        }

        if (!process) {
          return;
        }

        const headContent = await HEAD.content();
        let headContentStr = "";
        if (headContent) {
          headContentStr = new TextDecoder().decode(headContent);
        }

        let diff = null;
        if (type === "modify" && BASE) {
          const baseContent = await BASE.content();
          let baseContentStr = "";
          if (baseContent) {
            baseContentStr = new TextDecoder().decode(baseContent);
          }
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
          type: type,
          diff: diff,
        };
      },
    });
  }
}

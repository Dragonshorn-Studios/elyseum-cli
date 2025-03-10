import { CoverageReporter } from "./coverage-reporter.js";
import { CoverageResult } from "../../../types/coverage-result.js";
import fs from "fs";
import Config, { ConfigElement, CustomConfig } from "../../../config.js";
import { config, title } from "process";
import { Logger } from "../../../utils/logger.js";
import { Octokit } from "octokit";
import path from "path";
class GithubPRCommentCoverageReporter implements CoverageReporter {
  config?: CustomConfig = {
    "comment-name": {
      help: "The name of the comment",
      type: "str",
      default: "coverage/github.pr.coverage.md",
    } as ConfigElement,
    "create-annotations": {
      help: "Create annotations for uncovered line groups, methods and branches",
      action: "store_true",
    } as ConfigElement,
    "quality-gate": {
      help: "The quality gate for coverage",
      type: "int",
      default: 80,
    } as ConfigElement,
  };

  report(diffCoverage: CoverageResult) {
    // check if we have github ci environment variables, and if not, return
    if (!process.env.GITHUB_ACTIONS || !process.env.GITHUB_EVENT_NAME) {
      console.error(
        "Not running in GitHub CI environment, skipping GitHub PR comment coverage reporter"
      );
      return;
    }
    const createAnnotations = Config.getInstance().getFirst(
      ["reporter.coverage.github-pr-comment.create-annotations"],
      false
    );
    const commentName = Config.getInstance().getFirst(
      ["reporter.coverage.github-pr-comment.comment-name"],
      "coverage/github.pr.coverage.md"
    );
    const qualityGate = Config.getInstance().getFirst(
      [
        "reporter.coverage.quality-gate",
        "reporter.coverage.github-pr-comment.quality-gate",
      ],
      80,
      parseInt
    );
    const qualityGateFail = Config.getInstance().getFirst(
      [
        "reporter.coverage.quality-gate-fail",
        "reporter.coverage.github-pr-comment.quality-gate-fail",
      ],
      50,
      parseInt
    );
    let repoName = process.env.GITHUB_REPOSITORY;
    let runId = process.env.GITHUB_RUN_ID;

    let commentFirstLine = `# ${commentName}\n\n`;
    let markdown = commentFirstLine;
    let qualityGateFailed = false;
    let qualityGateWarning = false;

    if (diffCoverage.lines.total) {
      // lines, functions, branches average percentage must be greater than or equal to qualityGate
      qualityGateFailed =
        diffCoverage.lines.percent < qualityGateFail ||
        diffCoverage.functions.percent < qualityGateFail ||
        diffCoverage.branches.percent < qualityGateFail;
      qualityGateWarning =
        diffCoverage.lines.percent < qualityGate ||
        diffCoverage.functions.percent < qualityGate ||
        diffCoverage.branches.percent < qualityGate;

      let coverageQualityText = ``;
      if (qualityGate) {
        if (qualityGateFailed) {
          coverageQualityText += `> [!CAUTION]\n> ### Coverage Quality Gate Failed 🟥\n`;
        } else if (qualityGateWarning) {
          coverageQualityText += `> [!WARNING]\n> ### Coverage Quality Gate Warning 🟡\n`;
        } else {
          coverageQualityText += `> [!TIP]\n> ### Coverage Quality Gate Passed 🟩\n`;
        }
        coverageQualityText += `> ${this.getIcon(
          diffCoverage.lines.percent
        )} Lines: ${diffCoverage.lines.percent.toFixed(
          2
        )}% (baseline: ${qualityGate}%)\n`;
        coverageQualityText += `> ${this.getIcon(
          diffCoverage.functions.percent
        )} Functions: ${diffCoverage.functions.percent.toFixed(
          2
        )}% (baseline: ${qualityGate}%)\n`;
        coverageQualityText += `> ${this.getIcon(
          diffCoverage.branches.percent
        )} Branches: ${diffCoverage.branches.percent.toFixed(
          2
        )}% (baseline: ${qualityGate}%)\n\n`;
      }

      let summary = `| Type      | Total | Covered | Percent |\n`;
      summary += `|-----------|-------|---------|---------|\n`;
      summary += `| Lines     | ${diffCoverage.lines.total} | ${
        diffCoverage.lines.covered
      } | ${this.getIcon(
        diffCoverage.lines.percent
      )} ${diffCoverage.lines.percent.toFixed(2)}% |\n`;
      summary += `| Functions | ${diffCoverage.functions.total} | ${
        diffCoverage.functions.covered
      } | ${this.getIcon(
        diffCoverage.functions.percent
      )} ${diffCoverage.functions.percent.toFixed(2)}% |\n`;
      summary += `| Branches  | ${diffCoverage.branches.total} | ${
        diffCoverage.branches.covered
      } | ${this.getIcon(
        diffCoverage.branches.percent
      )} ${diffCoverage.branches.percent.toFixed(2)}% |\n`;

      markdown += `### Coverage Summary\n\n${summary}`;

      markdown += coverageQualityText;

      let detailsTable = `\n<details>\n<summary>Coverage Details</summary>\n\n`;
      detailsTable += `| File | Lines (%) | Functions (%) | Branches (%) |\n`;
      detailsTable += `|------|-----------|---------------|--------------|\n`;

      for (const file of diffCoverage.files) {
        detailsTable += `| ${file.file} | ${file.lines.covered}/${
          file.lines.total
        } (${file.lines.percent.toFixed(2)}%) | ${file.functions.covered}/${
          file.functions.total
        } (${this.percentOrNA(file.functions.percent)}) | ${
          file.branches.covered
        }/${file.branches.total} (${this.percentOrNA(
          file.branches.percent
        )}) |\n`;
      }

      detailsTable += `\n</details>\n`;
      markdown += detailsTable;
    } else {
      markdown += `> [!CAUTION]\n> ### No coverage information found\n`;
    }

    let reportInfo = `Report for commit ${diffCoverage.headSha}`;
    if (diffCoverage.baseSha) {
      reportInfo += ` against base commit ${diffCoverage.baseSha}`;
    }
    reportInfo += ` (triggering run: <a href="/${repoName}/actions/runs/${runId}">${runId}</a>)`;

    markdown += `\n\n---\n\n${reportInfo}`;

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const prNumber =
      process.env.GITHUB_EVENT_NAME === "pull_request"
        ? process.env.GITHUB_EVENT_NUMBER
        : null;
    if (prNumber) {
      octokit.rest.issues
        .listComments({
          owner: process.env.GITHUB_REPOSITORY_OWNER,
          repo: process.env.GITHUB_REPOSITORY,
          issue_number: parseInt(prNumber),
        })
        .then((response: any) => {
          const comment = response.data.find((comment: any) =>
            comment.body.startsWith(commentFirstLine)
          );
          if (comment) {
            octokit.rest.issues.updateComment({
              owner: process.env.GITHUB_REPOSITORY_OWNER,
              repo: process.env.GITHUB_REPOSITORY,
              comment_id: comment.id,
              body: markdown,
            });
          } else {
            octokit.rest.issues.createComment({
              owner: process.env.GITHUB_REPOSITORY_OWNER,
              repo: process.env.GITHUB_REPOSITORY,
              issue_number: parseInt(prNumber),
              body: markdown,
            });
          }
        });
    }
    let annotations = [];
    if (createAnnotations) {
      for (const file of diffCoverage.files) {
        for (let lineBlock of file.lines.details || []) {
          if (lineBlock.hit === 0) {
            annotations.push({
              path: file.file,
              start_line: lineBlock.start,
              end_line: lineBlock.end,
              annotation_level: "failure",
              title: "Lines not covered",
              message: `Lines not covered`,
            });
          }
        }
        for (let functionDetails of file.functions.details || []) {
          if (functionDetails.hit === 0) {
            annotations.push({
              path: file.file,
              start_line: functionDetails.line,
              end_line: functionDetails.line,
              annotation_level: "failure",
              title: "Function not covered",
              message: `Function ${functionDetails.name} not covered`,
            });
          }
        }
        for (let branchDetails of file.branches.details || []) {
          if (branchDetails.taken === 0) {
            annotations.push({
              path: file.file,
              start_line: branchDetails.line,
              end_line: branchDetails.line,
              annotation_level: "failure",
              title: "Branch not covered",
              message: `Branch not covered`,
            });
          }
        }
      }
    }
    octokit.rest.checks.create({
      owner: process.env.GITHUB_REPOSITORY_OWNER,
      repo: process.env.GITHUB_REPOSITORY,
      name: "Quality Gate",
      head_sha: diffCoverage.headSha,
      status: "completed",
      conclusion: qualityGateFailed
        ? "failure"
        : qualityGateWarning
        ? "neutral"
        : "success",
      output: {
        title: "Coverage Quality Gate",
        summary: `Coverage Quality Gate ${
          qualityGateFailed
            ? "Failed"
            : qualityGateWarning
            ? "Warning"
            : "Passed"
        }`,
        text: markdown,
        annotations: annotations,
      },
    });
  }

  private getIcon(percent: number): string {
    // emoji based
    if (percent >= 80) {
      // green circle
      return "🟢";
    } else if (percent >= 50) {
      return "🟡";
    } else {
      return "🔴";
    }
  }

  percentOrNA(percent: any) {
    return !isNaN(percent) ? percent.toFixed(2) + "%" : "N/A";
  }
}

export { GithubPRCommentCoverageReporter };

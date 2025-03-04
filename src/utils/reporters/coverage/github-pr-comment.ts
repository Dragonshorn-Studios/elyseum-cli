import { CoverageReporter } from "./coverage-reporter.js";
import { CoverageResult } from "../../../types/coverage-result.js";
import fs from "fs";
import Config, { ConfigElement, CustomConfig } from "../../../config.js";
import { config } from "process";
class GithubPRCommentCoverageReporter implements CoverageReporter {
  config?: CustomConfig = {
    "comment-file-path": {
      help: "The file path to write the coverage report to",
      type: "str",
      default: "coverage/github.pr.coverage.md",
    } as ConfigElement,
    "comment-name": {
      help: "The name of the comment",
      type: "str",
      default: "coverage/github.pr.coverage.md",
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
    const reportPath = Config.getInstance().getFirst(
      ["reporter.coverage.github-pr-comment.comment-file-path"],
      "coverage/github.pr.coverage.md"
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
      80
    );
    let repoName = process.env.GITHUB_REPOSITORY;
    let runId = process.env.GITHUB_RUN_ID;

    let markdown = `## ${commentName}\n\n`;

    if (diffCoverage.lines.total) {
      // lines, functions, branches average percentage must be greater than or equal to qualityGate
      const qualityGateFailed =
        diffCoverage.lines.percent < qualityGate ||
        diffCoverage.functions.percent < qualityGate ||
        diffCoverage.branches.percent < qualityGate;

      let coverageQualityText = ``;
      if (qualityGate) {
        if (qualityGateFailed) {
          coverageQualityText += `> [!CAUTION]\n> ### Coverage Quality Gate Failed 🟥\n`;
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
      fs.writeFileSync(reportPath, markdown);
      return;
    }

    let reportInfo = `Report for commit ${diffCoverage.headSha}`;
    if (diffCoverage.baseSha) {
      reportInfo += ` against base commit ${diffCoverage.baseSha}`;
    }
    reportInfo += ` (triggering run: <a href="/${repoName}/actions/runs/${runId}">${runId}</a>)`;

    markdown += `\n\n---\n\n${reportInfo}`;

    fs.mkdirSync(reportPath.substring(0, reportPath.lastIndexOf("/")), {
      recursive: true,
    });
    fs.writeFileSync(reportPath, markdown);
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

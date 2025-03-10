import { CoverageReporter } from "./coverage-reporter";
import { CoverageResult } from "../../../types/coverage-result";
import Config from "../../../config";

class MarkdownTableCoverageReporter implements CoverageReporter {
  report(diffCoverage: CoverageResult) {
    const details = Config.getInstance().getFirst(
      ["reporter.coverage.cli-table.details", "reporter.coverage.details"],
      false
    );
    const qualityGate = Config.getInstance().getFirst(
      ["reporter.coverage.quality-gate"],
      80
    );
    let markdown = `| Type      | Total | Covered | Percent |\n`;
    markdown += `|-----------|-------|---------|---------|\n`;
    markdown += `| Lines     | ${diffCoverage.lines.total} | ${
      diffCoverage.lines.covered
    } | ${diffCoverage.lines.percent.toFixed(2)}% |\n`;
    markdown += `| Functions | ${diffCoverage.functions.total} | ${
      diffCoverage.functions.covered
    } | ${diffCoverage.functions.percent.toFixed(2)}% |\n`;
    markdown += `| Branches  | ${diffCoverage.branches.total} | ${
      diffCoverage.branches.covered
    } | ${diffCoverage.branches.percent.toFixed(2)}% |\n`;

    if (details) {
      markdown += `\n| File | Lines (%) | Functions (%) | Branches (%) |\n`;
      markdown += `|------|-----------|---------------|--------------|\n`;

      for (const file of diffCoverage.files) {
        markdown += `| ${file.file} | ${file.lines.covered}/${
          file.lines.total
        } (${file.lines.percent.toFixed(2)}%) | ${file.functions.covered}/${
          file.functions.total
        } (${this.percentOrNA(file.functions.percent)}) | ${
          file.branches.covered
        }/${file.branches.total} (${this.percentOrNA(
          file.branches.percent
        )}) |\n`;
      }
    }

    console.log(markdown);
  }

  error(message: string, details?: any) {
    console.error(message, details);
  }

  percentOrNA(percent: any) {
    return !isNaN(percent) ? percent.toFixed(2) + "%" : "N/A";
  }
}

export { MarkdownTableCoverageReporter };

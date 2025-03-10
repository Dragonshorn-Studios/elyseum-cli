import { CoverageReporter } from "./coverage-reporter";
import chalk from "chalk";
import Table from "cli-table3";
import { CoverageResult } from "../../../types/coverage-result";
import Config from "../../../config";

class CliTableCoverageReporter implements CoverageReporter {
  report(diffCoverage: CoverageResult) {
    const colors = Config.getInstance().getFirst(
      ["reporter.coverage.cli-table.colors", "reporter.coverage.colors"],
      false
    );
    const details = Config.getInstance().getFirst(
      ["reporter.coverage.cli-table.details", "reporter.coverage.details"],
      false
    );
    const qualityGate = Config.getInstance().getFirst(
      ["reporter.coverage.quality-gate"],
      80
    );
    const summaryTable = new Table({
      head: ["Type", "Total", "Covered", "Percent"],
      colWidths: [20, 20, 20, 20],
    });
    summaryTable.push(
      [
        "Lines",
        diffCoverage.lines.total,
        diffCoverage.lines.covered,
        this.colorizePercentage(diffCoverage.lines.percent.toFixed(2) + "%"),
      ],
      [
        "Functions",
        diffCoverage.functions.total,
        diffCoverage.functions.covered,
        this.colorizePercentage(
          diffCoverage.functions.percent.toFixed(2) + "%"
        ),
      ],
      [
        "Branches",
        diffCoverage.branches.total,
        diffCoverage.branches.covered,
        this.colorizePercentage(diffCoverage.branches.percent.toFixed(2) + "%"),
      ]
    );
    console.log(summaryTable.toString());

    if (qualityGate) {
      const qualityGateFailed =
        diffCoverage.lines.percent < qualityGate ||
        diffCoverage.functions.percent < qualityGate ||
        diffCoverage.branches.percent < qualityGate;
      console.log(
        `Coverage Quality Gate: ${
          qualityGateFailed ? chalk.red("Failed") : chalk.green("Passed")
        } ${diffCoverage.lines.percent.toFixed(2)}% (baseline: ${qualityGate}%)`
      );
    }

    if (!details) {
      return;
    }
    const table = new Table({
      head: ["File", "Lines (%)", "Functions (%)", "Branches (%)"],
      colWidths: [50, 20, 20, 20],
    });

    for (const file of diffCoverage.files) {
      table.push([
        file.file,
        this.colorizePercentage(
          `${file.lines.covered}/${
            file.lines.total
          } (${file.lines.percent.toFixed(2)}%)`
        ),
        this.colorizePercentage(
          `${file.functions.covered}/${
            file.functions.total
          } (${this.percentOrNA(file.functions.percent)})`
        ),
        this.colorizePercentage(
          `${file.branches.covered}/${file.branches.total} (${this.percentOrNA(
            file.branches.percent
          )})`
        ),
      ]);
    }

    console.log(table.toString());
  }

  error(message: string, details?: any) {
    console.error(chalk.red(message));
    if (details) {
      console.error(details.map((detail: any) => chalk.red(detail)).join("\n"));
    }
  }

  private colorizePercentage(text: string): string {
    // get percentage using regex
    const parsed = text.match(/(\d+(\.\d+)?)\%/);
    if (!parsed) {
      return text;
    }
    const percent = parseFloat(parsed[1]);
    if (percent >= 80) {
      return chalk.green(text);
    } else if (percent >= 50) {
      return chalk.yellow(text);
    } else {
      return chalk.red(text);
    }
  }

  percentOrNA(percent: any) {
    return !isNaN(percent) ? percent.toFixed(2) + "%" : "N/A";
  }
}

export { CliTableCoverageReporter };

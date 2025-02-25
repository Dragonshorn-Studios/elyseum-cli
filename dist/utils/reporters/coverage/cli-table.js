import chalk from "chalk";
import Table from "cli-table3";
class CliTableCoverageReporter {
    report(diffCoverage, { details = false } = {}) {
        const summaryTable = new Table({
            head: ["Type", "Total", "Covered", "Percent"],
            colWidths: [20, 20, 20, 20],
        });
        summaryTable.push([
            "Lines",
            diffCoverage.lines.total,
            diffCoverage.lines.covered,
            this.colorizePercentage(diffCoverage.lines.percent.toFixed(2) + "%"),
        ], [
            "Functions",
            diffCoverage.functions.total,
            diffCoverage.functions.covered,
            this.colorizePercentage(diffCoverage.functions.percent.toFixed(2) + "%"),
        ], [
            "Branches",
            diffCoverage.branches.total,
            diffCoverage.branches.covered,
            this.colorizePercentage(diffCoverage.branches.percent.toFixed(2) + "%"),
        ]);
        console.log(summaryTable.toString());
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
                this.colorizePercentage(`${file.lines.covered}/${file.lines.total} (${file.lines.percent.toFixed(2)}%)`),
                this.colorizePercentage(`${file.functions.covered}/${file.functions.total} (${this.percentOrNA(file.functions.percent)})`),
                this.colorizePercentage(`${file.branches.covered}/${file.branches.total} (${this.percentOrNA(file.branches.percent)})`),
            ]);
        }
        console.log(table.toString());
    }
    colorizePercentage(text) {
        // get percentage using regex
        const parsed = text.match(/(\d+(\.\d+)?)\%/);
        if (!parsed) {
            return text;
        }
        const percent = parseFloat(parsed[1]);
        if (percent >= 80) {
            return chalk.green(text);
        }
        else if (percent >= 50) {
            return chalk.yellow(text);
        }
        else {
            return chalk.red(text);
        }
    }
    percentOrNA(percent) {
        return !isNaN(percent) ? percent.toFixed(2) + "%" : "N/A";
    }
}
export { CliTableCoverageReporter };

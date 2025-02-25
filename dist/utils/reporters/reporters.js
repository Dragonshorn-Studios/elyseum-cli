import { CliTableCoverageReporter } from "./coverage/cli-table";
import { MarkdownTableCoverageReporter } from "./coverage/markdown-table";
export const COVERAGE_REPORTERS = {
    "cli-table": new CliTableCoverageReporter(),
    "markdown-table": new MarkdownTableCoverageReporter(),
};
export function getCoverageReportersFromArgs(args) {
    let reporters_coverage = [];
    if (args.reporter_coverage) {
        reporters_coverage = args.reporter_coverage.split(",");
    }
    return reporters_coverage.map((reporter) => {
        if (reporter in COVERAGE_REPORTERS) {
            return COVERAGE_REPORTERS[reporter];
        }
        console.error(`Unknown coverage reporter: ${reporter}`);
        process.exit(1);
    });
}

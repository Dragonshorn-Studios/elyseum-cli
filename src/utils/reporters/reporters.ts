import { CliTableCoverageReporter } from "./coverage/cli-table";
import { CoverageReporter } from "./coverage/coverage-reporter";
import { MarkdownTableCoverageReporter } from "./coverage/markdown-table";

export const COVERAGE_REPORTERS: { [key: string]: CoverageReporter } = {
  "cli-table": new CliTableCoverageReporter(),
  "markdown-table": new MarkdownTableCoverageReporter(),
};

export function getCoverageReportersFromArgs(args: any): CoverageReporter[] {
  let reporters_coverage = [];
  if (args.reporter_coverage) {
    reporters_coverage = args.reporter_coverage.split(",");
  }
  return reporters_coverage.map((reporter: string) => {
    if (reporter in COVERAGE_REPORTERS) {
      return COVERAGE_REPORTERS[reporter as keyof typeof COVERAGE_REPORTERS];
    }
    console.error(`Unknown coverage reporter: ${reporter}`);
    process.exit(1);
  });
}

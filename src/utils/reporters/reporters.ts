import { CliTableCoverageReporter } from "./coverage/cli-table";
import { CoverageReporter } from "./coverage/coverage-reporter";
import { MarkdownTableCoverageReporter } from "./coverage/markdown-table";
import { GithubPRCommentCoverageReporter } from "./coverage/github-pr-comment";

export const COVERAGE_REPORTERS: { [key: string]: CoverageReporter } = {
  "cli-table": new CliTableCoverageReporter(),
  "markdown-table": new MarkdownTableCoverageReporter(),
  "github-pr-comment": new GithubPRCommentCoverageReporter(),
};

export function getCoverageReportersFromArgs(args: any): CoverageReporter[] {
  return args.reporter_coverage.map((reporter: string) => {
    if (reporter in COVERAGE_REPORTERS) {
      return COVERAGE_REPORTERS[reporter as keyof typeof COVERAGE_REPORTERS];
    }
    console.error(`Unknown coverage reporter: ${reporter}`);
    process.exit(1);
  });
}

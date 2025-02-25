#!/usr/bin/env node
import { ArgumentParser } from "argparse";
import { DiffCoverageCommand } from "./commands/diff-coverage-command";
const parser = new ArgumentParser({
    description: "Elyseum CLI",
});
parser.add_argument("-v", "--version", { action: "version", version: "1.0.0" });
const subparsers = parser.add_subparsers({
    title: "Commands",
    dest: "command",
});
const diffCoverageParser = subparsers.add_parser("diff-coverage", {
    help: "Calculate coverage for changed files",
});
diffCoverageParser.add_argument("--reporter.coverage", {
    help: "Coverage reporter",
    choices: ["cli-table", "markdown-table"],
    default: "cli-table",
    dest: "reporter_coverage",
});
const args = parser.parse_args();
switch (args.command) {
    case "diff-coverage":
        await new DiffCoverageCommand().run(args);
        break;
    default:
        parser.print_help();
        break;
}

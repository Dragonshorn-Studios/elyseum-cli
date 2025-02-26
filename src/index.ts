#!/usr/bin/env node

import { ArgumentParser } from "argparse";
import { COVERAGE_REPORTERS } from "./utils/reporters/reporters";
import Config from "./config";
import { CommandFactory } from "./commands/command";

const commandFactory = new CommandFactory();
const parser = new ArgumentParser({
  description: "Elyseum CLI",
});

parser.add_argument("command", {
  help: "Command to run",
  choices: commandFactory.getAvailableCommands(),
  default: "help",
});

parser.add_argument("-v", "--version", { action: "version", version: "1.0.0" });

parser.add_argument("--reporter.coverage", {
  help: "Coverage reporter(s), separated by commas",
  type: (value: string) => {
    const reporters = value.split(",");
    for (const reporter of reporters) {
      if (!Object.keys(COVERAGE_REPORTERS).includes(reporter)) {
        parser.error(
          `Unknown coverage reporter: ${reporter}. Available reporters: ${Object.keys(
            COVERAGE_REPORTERS
          ).join(", ")}`
        );
      }
    }
    return reporters;
  },
  default: ["cli-table"],
  dest: "reporter_coverage",
});

parser.add_argument("--reporter.coverage.colors", {
  help: "Use colors in coverage reporter (if supported)",
  action: "store_true",
  dest: "reporter_coverage_colors",
});

parser.add_argument("--reporter.coverage.details", {
  help: "Show coverage details",
  action: "store_true",
  dest: "reporter_coverage_details",
});

parser.add_argument("--reporter.coverage.quality-gate", {
  help: "Coverage quality gate",
  type: "int",
  dest: "reporter_coverage_quality-gate",
});

for (let reporter of Object.keys(COVERAGE_REPORTERS)) {
  const reporterConfig = COVERAGE_REPORTERS[reporter].config || {};
  for (let key of Object.keys(reporterConfig)) {
    parser.add_argument(`--reporter.coverage.${reporter}.${key}`, {
      help: reporterConfig[key],
      dest: `reporter_coverage_${reporter}_${key}`,
    });
  }
}

commandFactory.addCommandArgs(parser);

const args = parser.parse_args();

const config = Config.getInstance(args);

const selectedCommand = commandFactory.getCommand(args);
if (selectedCommand !== undefined) {
  selectedCommand.run(args);
} else {
  parser.print_help();
}

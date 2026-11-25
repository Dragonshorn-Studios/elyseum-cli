import { CliError } from "../core/errors";
import { LcovRecord, calculateTotalCoverage } from "../core/lcov";
import {
  assertCoverageInputFormat,
  readCoverageReport,
} from "../core/coverage-input";
import { Command, CommandMap } from "./command";
import Config, { CustomConfig } from "../config";
import { getCoverageReportersFromArgs } from "../utils/reporters/reporters";
import { Logger } from "../utils/logger";
import { EXIT_CODES } from "../core/exit-codes";

export class CoverageCommand implements Command {
  name: string = "coverage";
  config?: CustomConfig = {
    "lcov-path": {
      // Null defaults throughout: an argparse default is indistinguishable
      // from a user-supplied value in the merged config, so a real default
      // here would shadow configured keys in the resolution chain.
      // Resolution applies the documented fallback instead.
      help: "Path to the LCOV report",
      type: "str",
      required: false,
      default: null,
    },
    input: {
      help: "Path to the coverage report (any supported format; overrides lcov-path)",
      type: "str",
      required: false,
      default: null,
    },
    format: {
      help: "Coverage report format: lcov | clover",
      type: "str",
      required: false,
      default: null,
    },
  };

  constructor(commands: CommandMap) {
    commands[this.name] = this;
  }

  public async run(args: any): Promise<number> {
    // The explicit input path wins over the historical lcov-path key; an
    // empty string means "not given" and falls through.
    const inputPath = Config.getInstance().getFirst(
      ["coverage.input", "coverage.lcov-path"],
      "coverage/lcov.info",
    ) as string;

    let coverage: LcovRecord[];
    try {
      const format = assertCoverageInputFormat(
        Config.getInstance().getFirst(["coverage.format"], "lcov") as string,
      );
      coverage = await readCoverageReport(inputPath, format);
    } catch (error: any) {
      if (error instanceof CliError) {
        Logger.error(error.message);
        Logger.error(error.actionable);
        return error.exitCode;
      }
      Logger.error(`Error running coverage command: ${(error as any).message}`);
      return EXIT_CODES.CALCULATION_ERROR;
    }

    const coverageResult = calculateTotalCoverage(coverage);
    for (const reporter of getCoverageReportersFromArgs(args)) {
      reporter.report(coverageResult as any);
    }

    return 0;
  }
}

import fs from "fs/promises";
import { MissingLcovError } from "../core/errors";
import { LcovRecord, calculateTotalCoverage, readLcovReport } from "../core/lcov";
import { Command, CommandMap } from "./command";
import Config, { CustomConfig } from "../config";
import { getCoverageReportersFromArgs } from "../utils/reporters/reporters";
import { Logger } from "../utils/logger";
import { EXIT_CODES } from "../core/exit-codes";

export class CoverageCommand implements Command {
  name: string = "coverage";
  config?: CustomConfig = {
    "lcov-path": {
      help: "Path to the LCOV report",
      type: "str",
      required: false,
      default: "coverage/lcov.info",
    },
  };

  constructor(commands: CommandMap) {
    commands[this.name] = this;
  }

  public async run(args: any): Promise<number> {
    const lcovPath = Config.getInstance().get(
      "coverage.lcov-path",
      "coverage/lcov.info",
    ) as string;

    let coverage: LcovRecord[];
    try {
      coverage = await readLcovReport(lcovPath);
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


import git from "isomorphic-git";
import fs from "fs/promises";
import { merge } from "diff";
import parse from "lcov-parse";
import { minimatch } from "minimatch";
import { getCoverageExcludes } from "../utils/config-readers/coverage-config-reader";
import { getCoverageReportersFromArgs } from "../utils/reporters/reporters";
import { CoverageDetail, CoverageResult } from "../types/coverage-result";

export class CoverageCommand {
  constructor() {}

  public async run(args: any): Promise<void> {
    const gitExists = await fs
      .access(".git")
      .then(() => true)
      .catch(() => false);
    if (!gitExists) {
      return;
    }

    try {
      let coverage = await this.getCoverageReport("coverage/lcov.info");
      let coverageResult = await this.calculateCoverage(coverage);
      for (let reporter of getCoverageReportersFromArgs(args)) {
        reporter.report(coverageResult);
      }
    } catch (error) {
      console.error(error);
    }
  }

  private async calculateCoverage(coverage: any): Promise<CoverageResult> {
    const coverageResult: CoverageResult = {
      lines: {
        total: 0,
        covered: 0,
        percent: 0,
      },
      functions: {
        total: 0,
        covered: 0,
        percent: 0,
      },
      branches: {
        total: 0,
        covered: 0,
        percent: 0,
      },
      files: [],
    };

    for (const file of coverage) {
      const lines: CoverageDetail = {
        total: file.lines.found,
        covered: file.lines.hit,
        percent: (file.lines.hit / file.lines.found) * 100,
      };
      const functions: CoverageDetail = {
        total: file.functions.found,
        covered: file.functions.hit,
        percent: (file.functions.hit / file.functions.found) * 100,
      };
      const branches: CoverageDetail = {
        total: file.branches.found,
        covered: file.branches.hit,
        percent: (file.branches.hit / file.branches.found) * 100,
      };
      coverageResult.files.push({
        file: file.file,
        lines,
        functions,
        branches,
      });

      coverageResult.lines.total += lines.total;
      coverageResult.lines.covered += lines.covered;
      coverageResult.functions.total += functions.total;
      coverageResult.functions.covered += functions.covered;
      coverageResult.branches.total += branches.total;
      coverageResult.branches.covered += branches.covered;
    }
    coverageResult.lines.percent =
      (coverageResult.lines.covered / coverageResult.lines.total) * 100;
    coverageResult.functions.percent =
      (coverageResult.functions.covered / coverageResult.functions.total) * 100;
    coverageResult.branches.percent =
      (coverageResult.branches.covered / coverageResult.branches.total) * 100;

    return coverageResult;
  }

  private async getCoverageReport(file: string) {
    const lcov = await fs.readFile(file, "utf-8");
    return new Promise((resolve, reject) => {
      parse(lcov, (err, data) => {
        if (err) {
          reject(err);
        }
        resolve(data);
      });
    });
  }
}

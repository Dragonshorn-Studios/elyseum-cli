import fs from "fs/promises";
import parse from "lcov-parse";
import { getCoverageReportersFromArgs } from "../utils/reporters/reporters";
export class CoverageCommand {
    constructor() { }
    async run(args) {
        const gitExists = await fs
            .access(".git")
            .then(() => true)
            .catch(() => false);
        if (!gitExists) {
            return;
        }
        try {
            let coverage = await this.getCoverageReport("coverage/lcov.info");
            let diffCoverage = await this.calculateCoverage(coverage);
            for (let reporter of getCoverageReportersFromArgs(args)) {
                reporter.report(diffCoverage, { details: true });
            }
        }
        catch (error) {
            console.error(error);
        }
    }
    async calculateCoverage(coverage) {
        const diffCoverageResult = {
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
            files: Array(),
        };
        return diffCoverageResult;
    }
    async getCoverageReport(file) {
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

import fs from "fs/promises";
import git from "isomorphic-git";
import { Command, CommandMap } from "./command";
import Config, { CustomConfig } from "../config";
import { Logger } from "../utils/logger";
import { EXIT_CODES } from "../core/exit-codes";
import { CalculationFailure, MissingLcovError } from "../core/errors";
import packageJson from "../../package.json";
import { calculateTotalCoverage, readLcovReport } from "../core/lcov";
import { resolveCommitFacts, resolveRunIdentity } from "../core/ci-env";
import {
  EnvelopeV1,
  SUPPORTED_SCHEMA_VERSION,
  validateEnvelope,
} from "../core/envelope";

/**
 * Builds the versioned CI result envelope from the facts this CLI can
 * observe (LCOV coverage, git commit, CI environment) and writes it to a
 * file or stdout. The envelope is validated against the pinned v1 schema
 * before it is written — an invalid envelope is a CLI bug, not a user
 * error, so it fails loudly with exit code 5.
 */
export class EmitEnvelopeCommand implements Command {
  name: string = "emit-envelope";
  config?: CustomConfig = {
    "lcov-path": {
      help: "Path to the LCOV report",
      type: "str",
      required: false,
      default: "coverage/lcov.info",
    },
    out: {
      help: "Write the envelope to this file instead of stdout",
      type: "str",
      required: false,
      default: "",
    },
    "run-provider": {
      help: "CI provider identity (overrides environment detection)",
      type: "str",
      required: false,
      default: "",
    },
    "run-id": {
      help: "CI run id (overrides environment detection)",
      type: "str",
      required: false,
      default: "",
    },
    "run-job-id": {
      help: "CI job id (overrides environment detection)",
      type: "str",
      required: false,
      default: "",
    },
    "run-attempt": {
      help: "CI run attempt (overrides environment detection)",
      type: "str",
      required: false,
      default: "",
    },
    "tests-total": {
      help: "Total number of tests, when a test report is available",
      type: "int",
      required: false,
      default: null,
    },
    "tests-passed": { help: "Passed tests", type: "int", required: false, default: null },
    "tests-failed": { help: "Failed tests", type: "int", required: false, default: null },
    "tests-skipped": { help: "Skipped tests", type: "int", required: false, default: null },
    "tests-duration-ms": {
      help: "Total test duration in ms",
      type: "int",
      required: false,
      default: null,
    },
    "quality-gate-conclusion": {
      help: "Quality gate conclusion: passed | failed | unknown",
      type: "str",
      required: false,
      default: "",
    },
  };

  constructor(commands: CommandMap) {
    commands[this.name] = this;
  }

  public async run(args: any): Promise<number> {
    try {
      // The emit command's own option wins; fall back to the shared
      // coverage.lcov-path.
      const lcovPath = Config.getInstance().getFirst(
        ["emit-envelope.lcov-path", "coverage.lcov-path"],
        "coverage/lcov.info",
      ) as string;

      const coverageRecords = await readLcovReport(lcovPath);
      const totals = calculateTotalCoverage(coverageRecords);
      const coveragePercent = totals.lines.percent;

      // Commit facts come from git; the run identity from the CI
      // environment with a documented generic-CI fallback.
      const commitFacts = await resolveCommitFacts(process.cwd(), "HEAD");
      const identity = resolveRunIdentity(process.env, commitFacts.sha);

      const runProvider = this.option(args, "run-provider") ?? identity.provider;
      const runId = this.option(args, "run-id") ?? identity.run_id;
      const runJobId = this.option(args, "run-job-id") ?? identity.job_id;
      const runAttempt = this.intOption(args, "run-attempt") ?? identity.attempt;

      const gateConclusionRaw = this.option(args, "quality-gate-conclusion");
      const qualityGate = gateConclusionRaw
        ? { conclusion: gateConclusionRaw as "passed" | "failed" | "unknown" }
        : undefined;

      const testsTotal = this.intOption(args, "tests-total");
      const hasTests = testsTotal !== undefined;

      const envelope = {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        producer: {
          name: "elyseum-cli",
          version: this.cliVersion(),
        },
        run: {
          provider: runProvider,
          run_id: runId,
          job_id: runJobId,
          attempt: runAttempt,
          url: identity.url,
        },
        commit: {
          sha: commitFacts.sha,
          branch: commitFacts.branch,
          committed_at: commitFacts.committed_at,
        },
        ...(hasTests
          ? {
              tests: {
                total: testsTotal,
                passed: this.intOption(args, "tests-passed") ?? null,
                failed: this.intOption(args, "tests-failed") ?? null,
                skipped: this.intOption(args, "tests-skipped") ?? null,
                duration_ms: this.intOption(args, "tests-duration-ms") ?? null,
              },
            }
          : {}),
        coverage: {
          line_percent: coveragePercent,
          function_percent: totals.functions.percent,
          branch_percent: totals.branches.percent,
        },
        ...(qualityGate ? { quality_gate: qualityGate } : {}),
      };

      const issues = validateEnvelope(envelope as EnvelopeV1);
      if (issues.length > 0) {
        // An invalid envelope is a CLI bug (schema drift), not a user error.
        throw new CalculationFailure(
          `Emitted envelope violates the pinned v1 schema: ${issues
            .map((i) => `${i.pointer}: ${i.message}`)
            .join("; ")}`,
        );
      }

      const body = JSON.stringify(envelope, null, 2);
      const outPath = this.option(args, "out");

      if (outPath) {
        await fs.writeFile(outPath, body + "\n");
        Logger.info(`Envelope written to ${outPath}`);
      } else {
        process.stdout.write(body + "\n");
      }

      return EXIT_CODES.SUCCESS;
    } catch (error: any) {
      if (error instanceof MissingLcovError) {
        Logger.error(error.message);
        Logger.error(error.actionable);
        return error.exitCode;
      }
      Logger.error(`Error running emit-envelope command: ${error.message}`);
      return EXIT_CODES.CALCULATION_ERROR;
    }
  }

  /**
   * Reads an emit-envelope option from the merged config (CLI flag beats
   * .elyseum.yml, which beats the declared default). Null/empty means the
   * option was not given.
   */
  private option<T = string>(args: any, key: string): T | undefined {
    const value = Config.getInstance().get(`emit-envelope.${key}`);
    return value === null || value === undefined || value === ""
      ? undefined
      : (value as T);
  }

  private intOption(args: any, key: string): number | undefined {
    const value = this.option<unknown>(args, key);
    if (value === undefined) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private cliVersion(): string {
    return packageJson.version;
  }
}

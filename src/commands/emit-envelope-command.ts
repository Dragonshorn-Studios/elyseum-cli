import fs from "fs/promises";
import git from "isomorphic-git";
import { Command, CommandMap } from "./command";
import Config, { CustomConfig } from "../config";
import { Logger } from "../utils/logger";
import { EXIT_CODES } from "../core/exit-codes";
import {
  CalculationFailure,
  CliError,
  InvalidConfigError,
  MissingGitError,
  MissingLcovError,
} from "../core/errors";
import packageJson from "../../package.json";
import { calculateTotalCoverage, readLcovReport } from "../core/lcov";
import { resolveCommitFacts, resolveRunIdentity } from "../core/ci-env";
import {
  BOUNDS,
  boundPath,
  CoverageFacts,
  coverageParserFor,
  isCoverageFormat,
  isTestsFormat,
  Provenance,
  TestFacts,
  testsParserFor,
} from "../adapters";
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
      // No declared default: resolution order is this option, then the
      // shared coverage.lcov-path, then the built-in
      // coverage/lcov.info (see run()).
      help: "Path to the LCOV report",
      type: "str",
      required: false,
      default: null,
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
    "tests-format": {
      help: "Test report format: vitest-json | junit | go-test-json",
      type: "str",
      required: false,
      default: "",
    },
    "tests-input": {
      help: "Test report path, or - for stdin",
      type: "str",
      required: false,
      default: "",
    },
    "coverage-format": {
      help: "Coverage report format: lcov | clover | go-coverprofile",
      type: "str",
      required: false,
      default: "",
    },
    "coverage-input": {
      help: "Coverage report path, or - for stdin",
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

      const testsFacts = (await this.collectTestsFacts()) ?? this.testsFromFlags();

      let coverageRecords: any[] = [];
      let coverageAvailable = true;
      // Explicit = the CLI flag, or a config-file path that differs from the
      // declared default (an explicitly configured missing report is a user
      // error, not silent no-coverage).
      const lcovExplicit =
        process.argv.some(
          (a) =>
            a === "--emit-envelope.lcov-path" || a.startsWith("--emit-envelope.lcov-path="),
        ) || lcovPath !== "coverage/lcov.info";
      // Config.get yields null (its default) for absent keys; null means
      // "not given", never a value.
      const coverageFormatRaw = Config.getInstance().get("emit-envelope.coverage-format");
      const adapterCoverage =
        coverageFormatRaw !== null && coverageFormatRaw !== undefined && coverageFormatRaw !== "";

      if (!adapterCoverage) {
        try {
          coverageRecords = await readLcovReport(lcovPath);
        } catch (error) {
          // A missing report at the silent default path degrades to a
          // tests-only envelope — but only when tests facts exist; without
          // them the missing LCOV is the actionable failure (exit 4).
          if (error instanceof MissingLcovError && (lcovExplicit || !testsFacts)) {
            throw error;
          }
          if (error instanceof MissingLcovError) {
            coverageAvailable = false;
          } else {
            throw error;
          }
        }
      } else {
        coverageAvailable = false;
      }
      const totals = calculateTotalCoverage(coverageRecords);
      const coveragePercent = totals.lines.percent;

      // Commit facts come from git; the run identity from the CI
      // environment with a documented generic-CI fallback.
      const commitFacts = await resolveCommitFacts(process.cwd(), "HEAD");
      const identity = resolveRunIdentity(process.env, commitFacts.sha);

      const runProvider = this.option<string>("run-provider") ?? identity.provider;
      const runId = this.option("run-id") ?? identity.run_id;
      const runJobId = this.option("run-job-id") ?? identity.job_id;
      const runAttempt = this.intOption("run-attempt") ?? identity.attempt;
      if (runAttempt < 1) {
        throw new InvalidConfigError("run-attempt must be a positive integer.");
      }

      const gateConclusionRaw = this.option("quality-gate-conclusion");
      if (
        gateConclusionRaw !== undefined &&
        !["passed", "failed", "unknown"].includes(gateConclusionRaw)
      ) {
        throw new InvalidConfigError(
          `quality-gate-conclusion must be passed, failed, or unknown (got "${gateConclusionRaw}").`,
        );
      }
      const qualityGate = gateConclusionRaw
        ? { conclusion: gateConclusionRaw as "passed" | "failed" | "unknown" }
        : undefined;

      const coverageFacts = await this.collectCoverageFacts(
        coverageRecords,
        totals,
        coverageAvailable,
      );

      const testsFormat = Config.getInstance().get("emit-envelope.tests-format");
      const coverageFormat = Config.getInstance().get("emit-envelope.coverage-format");
      const provenance: Provenance | undefined =
        testsFormat || coverageFormat
          ? {
              ...(testsFormat
                ? { tests_format: String(testsFormat).slice(0, BOUNDS.provenance_value) }
                : {}),
              ...(coverageFormat
                ? { coverage_format: String(coverageFormat).slice(0, BOUNDS.provenance_value) }
                : {}),
              tool_versions: { "elyseum-cli": this.cliVersion() },
            }
          : undefined;

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
        ...(testsFacts
          ? {
              tests: {
                total: testsFacts.total,
                passed: testsFacts.passed,
                failed: testsFacts.failed,
                skipped: testsFacts.skipped,
                duration_ms: testsFacts.duration_ms,
                failed_tests: testsFacts.failed_tests,
              },
            }
          : {}),
        ...(coverageFacts
          ? {
              coverage: {
                line_percent:
                  coverageFacts.line_percent === null || coverageFacts.line_percent === undefined
                    ? null
                    : this.r4(coverageFacts.line_percent),
                function_percent:
                  coverageFacts.function_percent === null
                    ? null
                    : this.r4(coverageFacts.function_percent),
                branch_percent:
                  coverageFacts.branch_percent === null
                    ? null
                    : this.r4(coverageFacts.branch_percent),
                ...(coverageFacts.diff_percent !== null &&
                coverageFacts.diff_percent !== undefined
                  ? { diff_percent: this.r4(coverageFacts.diff_percent) }
                  : {}),
                ...(coverageFacts.files.length > 0 ? { files: coverageFacts.files } : {}),
              },
            }
          : {}),
        ...(qualityGate ? { quality_gate: qualityGate } : {}),
        ...(provenance ? { provenance } : {}),
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
      const outPath = this.option("out");

      if (outPath) {
        await fs.writeFile(outPath, body + "\n");
        Logger.info(`Envelope written to ${outPath}`);
      } else {
        process.stdout.write(body + "\n");
      }

      return EXIT_CODES.SUCCESS;
    } catch (error: any) {
      if (error instanceof CliError) {
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
  private option<T = string>(key: string): T | undefined {
    // Config.get yields null for absent keys; null/empty means "not given".
    const value = Config.getInstance().get(`emit-envelope.${key}`);
    return value === null || value === undefined || value === ""
      ? undefined
      : (value as T);
  }

  private intOption(key: string): number | undefined {
    const raw = this.option<unknown>(key);
    if (raw === undefined) {
      return undefined;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new InvalidConfigError(
        `emit-envelope.${key} must be a number (got "${raw}").`,
      );
    }

    return parsed;
  }

  /**
   * Collects normalized test facts from an explicit --tests-format +
   * --tests-input pair. Auto-detection is deliberately not offered: an
   * ambiguous format is a contract violation, not a convenience.
   */
  /**
   * Manual test facts from the --tests-* flags (used when no adapter input
   * is given). All absent means no tests section at all.
   */
  private testsFromFlags(): TestFacts | undefined {
    const total = this.intOption("tests-total");
    const passed = this.intOption("tests-passed");
    const failed = this.intOption("tests-failed");
    const skipped = this.intOption("tests-skipped");
    const durationMs = this.intOption("tests-duration-ms");

    if ([total, passed, failed, skipped, durationMs].every((v) => v === undefined)) {
      return undefined;
    }

    for (const [label, value] of [
      ["tests-total", total],
      ["tests-passed", passed],
      ["tests-failed", failed],
      ["tests-skipped", skipped],
    ] as const) {
      if (value !== undefined && value < 0) {
        throw new InvalidConfigError(`${label} must not be negative.`);
      }
    }

    const resolvedTotal = total ?? (passed ?? 0) + (failed ?? 0) + (skipped ?? 0);

    return {
      total: resolvedTotal,
      passed: passed ?? null,
      failed: failed ?? null,
      skipped: skipped ?? null,
      duration_ms: durationMs ?? null,
      failed_tests: [],
    };
  }

  private async collectTestsFacts(): Promise<TestFacts | undefined> {
    const format = Config.getInstance().get("emit-envelope.tests-format");
    const input = Config.getInstance().get("emit-envelope.tests-input");

    if (!format && !input) {
      return undefined;
    }

    if (!isTestsFormat(String(format))) {
      throw new InvalidConfigError(
        `tests-format must be one of vitest-json, junit, go-test-json (got "${format}").`,
      );
    }
    if (!input) {
      throw new InvalidConfigError("tests-format requires --emit-envelope.tests-input.");
    }

    const raw = await this.readInput(input);
    const facts = testsParserFor(String(format))(raw);

    return {
      ...facts,
      failed_tests: facts.failed_tests.slice(0, BOUNDS.failed_tests),
    };
  }

  /**
   * Collects coverage facts. With --coverage-format, the explicit adapter
   * path applies; otherwise the default LCOV report is used (backwards
   * compatible with the plain coverage/diff-coverage flows).
   */
  private async collectCoverageFacts(
    coverageRecords: any[],
    totals: {
      lines: { percent: number };
      functions: { percent: number };
      branches: { percent: number };
    },
    coverageAvailable: boolean,
  ): Promise<(CoverageFacts & { diff_percent: number | null }) | undefined> {
    const format = Config.getInstance().get("emit-envelope.coverage-format");
    const input = Config.getInstance().get("emit-envelope.coverage-input");

    if (!format && !input) {
      // No coverage source given: omit the section entirely (a tests-only
      // envelope is valid) unless the default report actually exists.
      if (!coverageAvailable) {
        return undefined;
      }
      return {
        line_percent: totals.lines.percent,
        function_percent: totals.functions.percent,
        branch_percent: totals.branches.percent,
        diff_percent: null,
        files: [],
      };
    }

    if (!isCoverageFormat(String(format))) {
      throw new InvalidConfigError(
        `coverage-format must be one of lcov, clover, go-coverprofile (got "${format}").`,
      );
    }
    if (!input) {
      throw new InvalidConfigError("coverage-format requires --emit-envelope.coverage-input.");
    }

    const raw = await this.readInput(input);
    const facts = await coverageParserFor(String(format))(raw);

    return {
      ...facts,
      files: facts.files.slice(0, BOUNDS.coverage_files).map((f) => ({
        ...f,
        path: boundPath(f.path),
      })),
      diff_percent: null,
    };
  }

  private async readInput(input: string): Promise<string> {
    if (input === "-") {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf-8");
    }
    try {
      return await fs.readFile(input, "utf-8");
    } catch {
      throw new CalculationFailure(`Could not read report input at "${input}".`);
    }
  }

  private cliVersion(): string {
    return packageJson.version;
  }

  private r4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}

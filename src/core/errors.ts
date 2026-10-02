import { EXIT_CODES, ExitCode } from "./exit-codes";

/**
 * Base class for every deliberate CLI failure. Commands throw these; the
 * entry point turns them into stderr messages plus the documented exit code.
 */
export abstract class CliError extends Error {
  abstract readonly exitCode: ExitCode;
  abstract readonly actionable: string;
}

export class InvalidConfigError extends CliError {
  readonly exitCode = EXIT_CODES.INVALID_CONFIG;
  readonly actionable: string;

  constructor(validationSummary: string) {
    super(`Invalid configuration: ${validationSummary}`);
    this.actionable = `Fix .elyseum.yml or the offending CLI arguments. Details: ${validationSummary}`;
  }
}

export class MissingGitError extends CliError {
  readonly exitCode = EXIT_CODES.MISSING_GIT;
  readonly actionable: string;

  constructor(dir: string) {
    super(`No git repository found at "${dir}".`);
    this.actionable =
      'Run inside a git checkout, or pass an explicit changed-file list (diff-coverage --diff-coverage.changed-files "a.ts,b.ts") instead of computing the diff from git.';
  }
}

export class MissingLcovError extends CliError {
  readonly exitCode = EXIT_CODES.MISSING_LCOV;
  readonly actionable: string;

  constructor(path: string) {
    super(`LCOV report not found at "${path}".`);
    this.actionable = `Generate the LCOV report first, or point --coverage.lcov-path (or --diff-coverage.lcov-path) at its location (default: coverage/lcov.info).`;
  }
}

export class CalculationFailure extends CliError {
  readonly exitCode = EXIT_CODES.CALCULATION_ERROR;
  readonly actionable: string;

  constructor(message: string) {
    super(message);
    this.actionable = message;
  }
}


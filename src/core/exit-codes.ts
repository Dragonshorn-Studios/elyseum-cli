/**
 * Documented exit-code contract for elyseum-cli. These codes are part of
 * the CLI's public contract (README "Exit codes"); they never change within
 * a major version.
 */
export const EXIT_CODES = {
  /** Success, or a warning-only condition. */
  SUCCESS: 0,
  /** A configured quality gate was not met. */
  QUALITY_GATE_FAILED: 1,
  /** The configuration file (or CLI arguments) are invalid. */
  INVALID_CONFIG: 2,
  /** A git repository is required but was not found. */
  MISSING_GIT: 3,
  /** The LCOV report file was not found. */
  MISSING_LCOV: 4,
  /** Any other calculation or runtime error. */
  CALCULATION_ERROR: 5,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

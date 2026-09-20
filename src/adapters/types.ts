/**
 * Provider-neutral adapter contract (elyseum-cli#7). Adapters translate
 * tool-specific test/coverage outputs into normalized facts consumed by the
 * v1 envelope writer. Parsing is separate from orchestration and upload;
 * adapters never execute project commands and treat all input as untrusted.
 *
 * Normalization semantics (docs/design notes in README):
 * - Missing metrics are null/unknown, never fabricated as zero.
 * - Zero tests, missing coverage, and zero executable lines are separate
 *   states.
 * - Failed-test names/messages and coverage paths are bounded here, before
 *   serialization, so the envelope can never exceed the v1 limits.
 */

export interface NormalizedFailedTest {
  name: string;
  message: string | null;
  file: string | null;
  line: number | null;
}

export interface TestFacts {
  total: number;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  duration_ms: number | null;
  failed_tests: NormalizedFailedTest[];
}

export interface CoverageFacts {
  line_percent: number | null;
  function_percent: number | null;
  branch_percent: number | null;
  files: {
    path: string;
    line_percent: number | null;
    function_percent: number | null;
    branch_percent: number | null;
  }[];
}

/** Bounded provenance metadata (top-level envelope additive field). */
export interface Provenance {
  tests_format?: string;
  coverage_format?: string;
  tool_versions?: Record<string, string>;
}

export const BOUNDS = {
  failed_tests: 500,
  coverage_files: 2000,
  failed_test_name: 512,
  failed_test_message: 2048,
  failed_test_file: 512,
  coverage_path: 1024,
  provenance_value: 64,
} as const;

export const TESTS_FORMATS = ["vitest-json", "junit", "go-test-json"] as const;
export const COVERAGE_FORMATS = ["lcov", "clover", "go-coverprofile"] as const;

export type TestsFormat = (typeof TESTS_FORMATS)[number];
export type CoverageFormat = (typeof COVERAGE_FORMATS)[number];

export function isTestsFormat(value: string): value is TestsFormat {
  return (TESTS_FORMATS as readonly string[]).includes(value);
}

export function isCoverageFormat(value: string): value is CoverageFormat {
  return (COVERAGE_FORMATS as readonly string[]).includes(value);
}

/** Bounds a failed-test name to the documented length. */
export function boundName(name: string): string {
  return name.length > BOUNDS.failed_test_name
    ? `${name.slice(0, BOUNDS.failed_test_name - 1)}…`
    : name;
}

/** Bounds a failure message to the documented length. */
export function boundMessage(message: string | null): string | null {
  if (message === null || message === undefined) {
    return null;
  }
  return message.length > BOUNDS.failed_test_message
    ? `${message.slice(0, BOUNDS.failed_test_message - 1)}…`
    : message;
}

/** Bounds a file path to the documented length. */
export function boundPath(path: string): string {
  return path.length > BOUNDS.failed_test_file
    ? `${path.slice(0, BOUNDS.failed_test_file - 1)}…`
    : path;
}

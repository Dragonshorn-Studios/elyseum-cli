import { boundMessage, boundName, NormalizedFailedTest, TestFacts } from "./types";
import { CalculationFailure } from "../core/errors";

/**
 * Vitest JSON reporter adapter (also consumes Jest-compatible JSON:
 * numTotalTests / testResults[].assertionResults[]).
 *
 * Status mapping: passed → passed; failed → failed; skipped/pending/
 * todo → skipped. Only failed tests carry identity details. Vitest JSON
 * reports no total duration, so duration_ms is null.
 */
export function parseVitestJson(raw: string): TestFacts {
  let doc: any;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new CalculationFailure("Tests input is not valid JSON (vitest-json).");
  }

  if (typeof doc?.numTotalTests !== "number" || !Array.isArray(doc?.testResults)) {
    throw new CalculationFailure(
      "Tests input does not look like vitest/jest JSON (expected numTotalTests and testResults).",
    );
  }

  const failedTests: NormalizedFailedTest[] = [];

  for (const suite of doc.testResults) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status !== "failed") {
        continue;
      }

      const message = Array.isArray(assertion.failureMessages)
        ? assertion.failureMessages.join("\n")
        : null;

      failedTests.push({
        name: boundName(assertion.fullName ?? assertion.title ?? "unknown test"),
        message: boundMessage(message),
        file: suite.name ? boundName(suite.name) : null,
        line: typeof assertion.location?.line === "number" ? assertion.location.line : null,
      });
    }
  }

  return {
    total: doc.numTotalTests,
    passed: doc.numPassedTests ?? null,
    failed: doc.numFailedTests ?? null,
    skipped: doc.numPendingTests ?? null,
    duration_ms: null,
    failed_tests: failedTests,
  };
}

import { boundMessage, boundName, NormalizedFailedTest, TestFacts } from "./types";
import { CalculationFailure } from "../core/errors";

const MAX_PKG_OUTPUT_LINES = 20;

/**
 * Go test JSON adapter (`go test -json ./...`): a newline-delimited stream
 * of events.
 *
 * - Leaf tests (pass/fail/skip) each count once; subtests are their own
 *   leaves. Duration sums only top-level tests (subtest Elapsed would
 *   double count), so duration_ms is approximate.
 * - A package-level failure (panic, setup) becomes one failed identity with
 *   bounded captured output.
 * - Build failures (Action build-fail / build-output) become one failed
 *   identity per package with bounded build output.
 */
export function parseGoTestJson(raw: string): TestFacts {
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  const leafTests = new Map<string, { status: "pass" | "fail" | "skip"; elapsedMs: number }>();
  const failures: NormalizedFailedTest[] = [];
  const packageFailures = new Set<string>();
  const packageOutputs = new Map<string, string[]>();
  const buildFailures = new Set<string>();
  const buildOutputs = new Map<string, string[]>();

  const capture = (bucket: Map<string, string[]>, key: string, text: unknown): void => {
    if (typeof text !== "string") {
      return;
    }
    const linesForPkg = bucket.get(key) ?? [];
    if (linesForPkg.length < MAX_PKG_OUTPUT_LINES) {
      linesForPkg.push(text);
      bucket.set(key, linesForPkg);
    }
  };

  for (const line of lines) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      throw new CalculationFailure(
        "Tests input is not valid go test -json output (a line is not JSON).",
      );
    }

    if (!event || typeof event !== "object" || typeof event.Action !== "string") {
      throw new CalculationFailure(
        'Tests input is not valid go test -json output (event without an "Action").',
      );
    }

    const pkg = typeof event.Package === "string" ? event.Package : "(unknown package)";
    const test = typeof event.Test === "string" ? event.Test : null;

    if (event.Action === "build-output") {
      capture(buildOutputs, pkg, event.Output);
      continue;
    }

    if (event.Action === "build-fail") {
      buildFailures.add(pkg);
      continue;
    }

    if (event.Action === "output" && test === null) {
      capture(packageOutputs, pkg, event.Output);
      continue;
    }

    if (test !== null && ["pass", "fail", "skip"].includes(event.Action)) {
      const elapsed = typeof event.Elapsed === "number" ? event.Elapsed * 1000 : 0;
      // Subtests report their own Elapsed too; only top-level tests
      // contribute duration to avoid double counting.
      const isTopLevel = !test.includes("/");
      leafTests.set(`${pkg}#${test}`, {
        status: event.Action as "pass" | "fail" | "skip",
        elapsedMs: isTopLevel ? elapsed : 0,
      });

      if (event.Action === "fail") {
        failures.push({
          name: boundName(`${pkg}#${test}`),
          message: null,
          file: null,
          line: null,
        });
      }
      continue;
    }

    if (test === null && event.Action === "fail") {
      // Go 1.24+ emits a package-level fail alongside build-fail events;
      // deduplicated below so a build failure is one identity, not two.
      packageFailures.add(pkg);
      continue;
    }
  }

  const totals = { total: 0, passed: 0, failed: 0, skipped: 0 };
  let durationMs = 0;

  for (const [, info] of leafTests) {
    totals.total++;
    if (info.status === "pass") {
      totals.passed++;
    } else if (info.status === "fail") {
      totals.failed++;
    } else {
      totals.skipped++;
    }
    durationMs += info.elapsedMs;
  }

  // A package that both fails and has build-fail events (Go 1.24+ emits a
  // package-level fail for build errors) is ONE failed identity.
  for (const pkg of new Set([...buildFailures, ...packageFailures])) {
    totals.total++;
    totals.failed++;
    const isBuild = buildFailures.has(pkg);
    const message = isBuild
      ? (buildOutputs.get(pkg) ?? []).join("").trim() || null
      : (packageOutputs.get(pkg) ?? []).join("").trim() || null;
    const label = isBuild ? "build failed" : "package failed";
    failures.push({
      name: boundName(`${pkg} (${label})`),
      message: boundMessage(message),
      file: null,
      line: null,
    });
  }

  return {
    total: totals.total,
    passed: totals.passed,
    failed: totals.failed,
    skipped: totals.skipped,
    duration_ms: totals.total > 0 ? Math.round(durationMs) : null,
    failed_tests: failures,
  };
}

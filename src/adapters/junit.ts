import { XMLParser } from "fast-xml-parser";
import { boundMessage, boundName, NormalizedFailedTest, TestFacts } from "./types";
import { CalculationFailure } from "../core/errors";

/**
 * JUnit XML adapter (Pest/PHPUnit `--log-junit`, and JUnit-compatible
 * output from other runners).
 *
 * Semantics: a <failure> child → failed; an <error> child → failed (the
 * distinction is preserved in the message text); a <skipped> child →
 * skipped; otherwise passed. Counts come from the <testcase> elements
 * themselves, so they stay consistent even when suite attributes disagree.
 *
 * XML is parsed with fast-xml-parser, which performs no external entity or
 * DTD resolution — the input is untrusted by contract.
 */
export function parseJunitXml(raw: string): TestFacts {
  let doc: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      isArray: (name) => name === "testcase" || name === "testsuite",
      // nested <testsuite> elements (PHPUnit --log-junit with --order-by
      // groups) are collected recursively below
    });
    doc = parser.parse(raw);
  } catch (error: any) {
    throw new CalculationFailure(`Tests input is not valid JUnit XML: ${error.message}`);
  }

  const suiteList: any[] = [];

  // <testsuite> elements may nest (grouped runs); every suite's testcases
  // and time count toward the totals.
  const collectSuites = (node: any): void => {
    const suites = node?.testsuites?.testsuite ?? node?.testsuite;
    const list: any[] = Array.isArray(suites) ? suites : suites ? [suites] : [];
    for (const suite of list) {
      if (typeof suite !== "object" || suite === null) {
        continue;
      }
      suiteList.push(suite);
      collectSuites(suite);
    }
  };

  collectSuites(doc);

  // fast-xml-parser is lenient: a truncated document can parse into string
  // stubs, so structural validity is checked here.
  if (
    suiteList.length === 0 ||
    suiteList.some((suite) => typeof suite !== "object" || suite === null)
  ) {
    throw new CalculationFailure(
      "Tests input contains no valid JUnit <testsuite> elements (expected <testsuites><testsuite>…).",
    );
  }

  const failedTests: NormalizedFailedTest[] = [];
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;

  for (const suite of suiteList) {
    if (typeof suite["@_time"] === "number") {
      durationMs += Math.round(suite["@_time"] * 1000);
    }

    const testcases: any[] = suite.testcase ?? [];
    for (const testcase of testcases) {
      total++;

      const name = boundName(
        testcase["@_classname"]
          ? `${testcase["@_classname"]}::${testcase["@_name"]}`
          : testcase["@_name"] ?? "unknown test",
      );

      const failure = testcase.failure !== undefined ? testcase.failure : testcase.error;

      if (failure !== undefined) {
        failed++;
        const message =
          typeof failure === "object"
            ? (failure["#text"] ?? failure["@_message"] ?? null)
            : null;
        failedTests.push({
          name,
          message: boundMessage(typeof message === "string" ? message : null),
          file: typeof testcase["@_file"] === "string" ? boundName(testcase["@_file"]) : null,
          line: typeof testcase["@_line"] === "number" ? testcase["@_line"] : null,
        });
      } else if (testcase.skipped !== undefined) {
        skipped++;
      } else {
        passed++;
      }
    }
  }

  return {
    total,
    passed,
    failed,
    skipped,
    duration_ms: durationMs > 0 ? durationMs : null,
    failed_tests: failedTests,
  };
}

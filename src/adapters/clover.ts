import { percent } from "../core/lcov";
import { parseCloverDocument } from "../core/clover";
import { CoverageFacts } from "./types";

/**
 * Clover XML coverage adapter (PHP `--coverage-clover`).
 *
 * Mapping, kept honest to what Clover provides: statements → line
 * coverage, methods → function coverage, conditionals → branch coverage.
 * A file with zero statements reports 100% (nothing to cover), never NaN.
 * PHPUnit's package-nested <file> elements are flattened by the shared
 * parser, so both producer shapes are supported.
 */
export function parseCloverXml(raw: string): CoverageFacts {
  const fileList = parseCloverDocument(raw);

  let totalStatements = 0;
  let coveredStatements = 0;
  let totalMethods = 0;
  let coveredMethods = 0;
  let totalConditionals = 0;
  let coveredConditionals = 0;

  const outFiles: CoverageFacts["files"] = [];

  for (const file of fileList) {
    const metrics = file.metrics;
    const statements = metrics?.statements ?? 0;
    const coveredStmts = metrics?.coveredstatements ?? 0;
    const methods = metrics?.methods ?? 0;
    const coveredMethodsForFile = metrics?.coveredmethods ?? 0;
    const conditionals = metrics?.conditionals ?? 0;
    const coveredConditionalsForFile = metrics?.coveredconditionals ?? 0;

    totalStatements += statements;
    coveredStatements += coveredStmts;
    totalMethods += methods;
    coveredMethods += coveredMethodsForFile;
    totalConditionals += conditionals;
    coveredConditionals += coveredConditionalsForFile;

    outFiles.push({
      path: file.name,
      line_percent: percent(coveredStmts, statements),
      function_percent: methods === 0 ? null : percent(coveredMethodsForFile, methods),
      branch_percent: conditionals === 0 ? null : percent(coveredConditionalsForFile, conditionals),
    });
  }

  return {
    line_percent: percent(coveredStatements, totalStatements),
    function_percent: totalMethods === 0 ? null : percent(coveredMethods, totalMethods),
    branch_percent: totalConditionals === 0 ? null : percent(coveredConditionals, totalConditionals),
    files: outFiles,
  };
}

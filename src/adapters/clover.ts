import { XMLParser } from "fast-xml-parser";
import { CalculationFailure } from "../core/errors";
import { percent } from "../core/lcov";
import { CoverageFacts } from "./types";

/**
 * Clover XML coverage adapter (PHP `--coverage-clover`).
 *
 * Mapping, kept honest to what Clover provides: statements → line
 * coverage, methods → function coverage, conditionals → branch coverage.
 * A file with zero statements reports 100% (nothing to cover), never NaN.
 */
export function parseCloverXml(raw: string): CoverageFacts {
  let doc: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      isArray: (name) => name === "file",
    });
    doc = parser.parse(raw);
  } catch (error: any) {
    throw new CalculationFailure(`Coverage input is not valid Clover XML: ${error.message}`);
  }

  const project = doc?.coverage?.project;
  const files: any[] = project?.file ?? doc?.coverage?.file ?? [];
  const fileList: any[] = Array.isArray(files) ? files : files ? [files] : [];

  if (
    fileList.length === 0 ||
    fileList.some((file) => typeof file !== "object" || file === null)
  ) {
    throw new CalculationFailure(
      "Coverage input contains no valid Clover <file> elements under <project>.",
    );
  }

  let totalStatements = 0;
  let coveredStatements = 0;
  let totalMethods = 0;
  let coveredMethods = 0;
  let totalConditionals = 0;
  let coveredConditionals = 0;

  const outFiles: CoverageFacts["files"] = [];

  for (const file of fileList) {
    const metrics = file.metrics ?? {};
    const statements = Number(metrics["@_statements"] ?? 0);
    const coveredStmts = Number(metrics["@_coveredstatements"] ?? 0);
    const methods = Number(metrics["@_methods"] ?? 0);
    const coveredMethodsForFile = Number(metrics["@_coveredmethods"] ?? 0);
    const conditionals = Number(metrics["@_conditionals"] ?? 0);
    const coveredConditionalsForFile = Number(metrics["@_coveredconditionals"] ?? 0);

    totalStatements += statements;
    coveredStatements += coveredStmts;
    totalMethods += methods;
    coveredMethods += coveredMethodsForFile;
    totalConditionals += conditionals;
    coveredConditionals += coveredConditionalsForFile;

    outFiles.push({
      path: String(file["@_name"] ?? ""),
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

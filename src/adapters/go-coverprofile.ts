import { CalculationFailure } from "../core/errors";
import { percent } from "../core/lcov";
import { CoverageFacts } from "./types";

/**
 * Go coverprofile adapter (`go test -coverprofile=c.out ./...`).
 *
 * Go reports per-block statement sets with a hit count of 0 or 1, which we
 * aggregate honestly: block counts map to statement counts, and coverage
 * percentages are covered blocks / total blocks per file. Go provides no
 * function or branch coverage, so those stay null — never zero.
 *
 * A profile with a `mode:` header and no blocks is an empty profile: the
 * result is zero files with null percentages (unknown), not fabricated
 * coverage.
 */
export function parseGoCoverprofile(raw: string): CoverageFacts {
  const files = new Map<
    string,
    { blocks: number; coveredBlocks: number }
  >();

  for (const line of raw.split("\n")) {
    if (line === "" || line.startsWith("mode:")) {
      continue;
    }

    // name.go:startLine.startCol,endLine.endCol numStmt count
    const match = /^(\S+):(\d+)\.\d+,(\d+)\.\d+\s+(\d+)\s+(\d+)$/.exec(line);
    if (!match) {
      throw new CalculationFailure(
        `Coverage input is not a valid Go coverprofile (unparsable line: "${line.slice(0, 80)}").`,
      );
    }

    const [, file, startLine, , numStmt, count] = match;
    const key = file;
    const bucket = files.get(key) ?? { blocks: 0, coveredBlocks: 0 };
    const statements = Number(numStmt);
    bucket.blocks += Math.max(statements, 1);
    if (Number(count) > 0) {
      bucket.coveredBlocks += Math.max(statements, 1);
    }
    files.set(key, bucket);
  }

  const hasHeader = raw.startsWith("mode:");
  if (files.size === 0 && !hasHeader && raw.trim() !== "") {
    throw new CalculationFailure(
      "Coverage input does not look like a Go coverprofile (missing mode: header).",
    );
  }

  if (files.size === 0) {
    return {
      line_percent: null,
      function_percent: null,
      branch_percent: null,
      files: [],
    };
  }

  let totalBlocks = 0;
  let coveredBlocks = 0;
  const outFiles: CoverageFacts["files"] = [];

  for (const [file, bucket] of files) {
    totalBlocks += bucket.blocks;
    coveredBlocks += bucket.coveredBlocks;
    outFiles.push({
      path: file,
      line_percent: percent(bucket.coveredBlocks, bucket.blocks),
      function_percent: null,
      branch_percent: null,
    });
  }

  return {
    line_percent: percent(coveredBlocks, totalBlocks),
    function_percent: null,
    branch_percent: null,
    files: outFiles,
  };
}

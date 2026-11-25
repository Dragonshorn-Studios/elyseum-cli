import { XMLParser } from "fast-xml-parser";
import { CalculationFailure } from "./errors";

export interface CloverLine {
  num: number;
  type: string;
  count: number;
  name?: string;
}

export interface CloverMetrics {
  statements: number;
  coveredstatements: number;
  methods: number;
  coveredmethods: number;
  conditionals: number;
  coveredconditionals: number;
}

export interface CloverFile {
  name: string;
  /** Null when the file element carries no <metrics> child. */
  metrics: CloverMetrics | null;
  lines: CloverLine[];
}

function metric(metrics: any, key: string): number {
  return Number(metrics?.[`@_${key}`] ?? 0);
}

/**
 * Shared low-level Clover XML parse. PHPUnit nests <file> elements under
 * <package> inside <project>; other producers place them directly under
 * <project>. Both shapes flatten into a single file list here so every
 * consumer (the envelope adapter, the coverage/diff-coverage input reader)
 * sees the same files regardless of the producer's nesting.
 */
export function parseCloverDocument(raw: string): CloverFile[] {
  let doc: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      isArray: (name) => name === "file" || name === "package" || name === "line",
    });
    doc = parser.parse(raw);
  } catch (error: any) {
    throw new CalculationFailure(`Coverage input is not valid Clover XML: ${error.message}`);
  }

  const project = doc?.coverage?.project;
  const directFiles: any[] = project?.file ?? doc?.coverage?.file ?? [];
  const packages: any[] = project?.package ?? [];
  const nestedFiles: any[] = packages.flatMap((pkg: any) => pkg?.file ?? []);
  const fileList = [...directFiles, ...nestedFiles];

  if (
    fileList.length === 0 ||
    fileList.some((file) => typeof file !== "object" || file === null)
  ) {
    throw new CalculationFailure(
      "Coverage input contains no valid Clover <file> elements under <project>.",
    );
  }

  return fileList.map((file): CloverFile => {
    const rawMetrics = file.metrics;
    return {
      name: String(file["@_name"] ?? ""),
      metrics: rawMetrics
        ? {
            statements: metric(rawMetrics, "statements"),
            coveredstatements: metric(rawMetrics, "coveredstatements"),
            methods: metric(rawMetrics, "methods"),
            coveredmethods: metric(rawMetrics, "coveredmethods"),
            conditionals: metric(rawMetrics, "conditionals"),
            coveredconditionals: metric(rawMetrics, "coveredconditionals"),
          }
        : null,
      lines: (file.line ?? []).map((line: any): CloverLine => {
        const element: CloverLine = {
          num: Number(line["@_num"] ?? 0),
          type: String(line["@_type"] ?? ""),
          count: Number(line["@_count"] ?? 0),
        };
        if (line["@_name"] !== undefined) {
          element.name = String(line["@_name"]);
        }
        return element;
      }),
    };
  });
}

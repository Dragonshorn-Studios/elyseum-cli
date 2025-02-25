export interface CoverageDetail {
  total: number;
  covered: number;
  percent: number;
  details?: any[];
}

export interface CoverageFile {
  file: string;
  lines: CoverageDetail;
  functions: CoverageDetail;
  branches: CoverageDetail;
}

export interface CoverageResult {
  lines: CoverageDetail;
  functions: CoverageDetail;
  branches: CoverageDetail;
  files: CoverageFile[];
}

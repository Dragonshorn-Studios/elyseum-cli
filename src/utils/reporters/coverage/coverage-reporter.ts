export interface CoverageReporter {
  report(coverage: any): void;
  config?: any;
}

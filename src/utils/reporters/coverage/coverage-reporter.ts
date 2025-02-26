import { CustomConfig } from "../../../config";

export interface CoverageReporter {
  report(coverage: any): void;
  config?: CustomConfig;
}

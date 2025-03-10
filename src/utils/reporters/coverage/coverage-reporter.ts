import { CustomConfig } from "../../../config";

export interface CoverageReporter {
  report(coverage: any): void;
  error(message: string, details?: any): void;
  config?: CustomConfig;
}

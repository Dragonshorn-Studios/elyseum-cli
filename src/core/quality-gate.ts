export type QualityGateOutcome = "passed" | "warning" | "failed";

export interface QualityGateThresholds {
  /** Warn band ceiling: percent < gate warns; percent >= gate passes.
   *  Undefined means no warn band. */
  gate?: number;
  /** Fail ceiling, inclusive: percent <= fail fails. Undefined disables
   *  the fail path (the gate alone can only warn). */
  fail?: number;
}

/**
 * Pure quality-gate evaluation: the changed-line coverage percentage against
 * the configured thresholds. Absent thresholds mean the gate is disabled.
 */
export function evaluateQualityGate(
  percent: number,
  thresholds: QualityGateThresholds,
): QualityGateOutcome {
  const { gate, fail } = thresholds;

  if (gate === undefined && fail === undefined) {
    return "passed";
  }

  if (fail !== undefined && percent <= fail) {
    return "failed";
  }

  if (gate !== undefined && percent < gate) {
    return "warning";
  }

  return "passed";
}

export type QualityGateOutcome = "passed" | "warning" | "failed";

export interface QualityGateThresholds {
  /** Below this, the gate fails. Undefined disables the gate. */
  gate?: number;
  /** Between fail and gate (inclusive), the gate warns. */
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

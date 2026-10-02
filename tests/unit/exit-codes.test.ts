import { describe, expect, it } from "vitest";
import { EXIT_CODES } from "../../src/core/exit-codes";
import { InvalidConfigError } from "../../src/core/errors";

describe("exit code contract", () => {
  it("exposes the documented codes", () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.QUALITY_GATE_FAILED).toBe(1);
    expect(EXIT_CODES.INVALID_CONFIG).toBe(2);
    expect(EXIT_CODES.MISSING_GIT).toBe(3);
    expect(EXIT_CODES.MISSING_LCOV).toBe(4);
    expect(EXIT_CODES.CALCULATION_ERROR).toBe(5);
  });

  it("gives every error an actionable message", () => {
    const error = new InvalidConfigError("instance.foo is missing");
    expect(error.exitCode).toBe(EXIT_CODES.INVALID_CONFIG);
    expect(error.actionable.length).toBeGreaterThan(0);
  });
});

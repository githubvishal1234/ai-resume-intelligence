import { describe, expect, it } from "vitest";
import { clampScore, scoreLevel } from "./score";

describe("score thresholds", () => {
  it.each([
    [0, "critical"],
    [59.9, "critical"],
    [60, "warning"],
    [79, "warning"],
    [80, "success"],
    [100, "success"],
  ])("%s → %s", (value, level) => {
    expect(scoreLevel(value)).toBe(level);
  });

  it("clamps out-of-range and non-finite values", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

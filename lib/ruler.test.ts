import { describe, expect, it } from "vitest";
import { NICE_INTERVALS_M, pickNiceInterval } from "./ruler";

describe("pickNiceInterval", () => {
  it("picks the smallest interval spaced at least minPixelSpacing apart", () => {
    // At 50 px/m: 0.5m ticks would sit 25px apart, 1m ticks 50px apart.
    expect(pickNiceInterval(50, 40)).toBe(1);
  });

  it("treats the exact minimum spacing as acceptable", () => {
    expect(pickNiceInterval(40, 40)).toBe(1);
  });

  it("uses sub-meter intervals when zoomed far in", () => {
    expect(pickNiceInterval(1000, 40)).toBe(0.1);
    expect(pickNiceInterval(200, 40)).toBe(0.25);
  });

  it("uses coarse intervals when zoomed far out", () => {
    expect(pickNiceInterval(3, 40)).toBe(20);
  });

  it("falls back to the largest interval when nothing is wide enough", () => {
    expect(pickNiceInterval(0.1, 40)).toBe(50);
  });

  it("falls back to the largest interval for degenerate zoom values", () => {
    expect(pickNiceInterval(0, 40)).toBe(50);
    expect(pickNiceInterval(-5, 40)).toBe(50);
    expect(pickNiceInterval(Number.NaN, 40)).toBe(50);
    expect(pickNiceInterval(Number.POSITIVE_INFINITY, 40)).toBe(50);
  });

  it("only ever returns values from the nice-interval set", () => {
    for (const ppm of [0.01, 0.5, 3, 47, 812, 1e6]) {
      expect(NICE_INTERVALS_M).toContain(pickNiceInterval(ppm, 40));
    }
  });
});

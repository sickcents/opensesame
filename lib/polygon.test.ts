import { describe, expect, it } from "vitest";
import { isNearPoint, isSelfIntersecting } from "./polygon";

describe("isSelfIntersecting", () => {
  it("detects a bowtie quad", () => {
    expect(
      isSelfIntersecting([
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ]),
    ).toBe(true);
  });

  it("accepts a simple convex quad", () => {
    expect(
      isSelfIntersecting([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]),
    ).toBe(false);
  });

  it("accepts a concave but simple polygon (L-shape)", () => {
    expect(
      isSelfIntersecting([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 4 },
        { x: 0, y: 4 },
      ]),
    ).toBe(false);
  });

  it("never flags a triangle", () => {
    expect(
      isSelfIntersecting([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 3 },
      ]),
    ).toBe(false);
  });

  it("detects a crossing introduced mid-ring, not just via the closing edge", () => {
    // Edge (4,0)-(4,3) and edge (6,1)-(2,2) cross at (4, 1.5).
    expect(
      isSelfIntersecting([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 6, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe(true);
  });
});

describe("isNearPoint", () => {
  it("is true within the threshold", () => {
    expect(isNearPoint({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, 0.5)).toBe(true);
  });

  it("is false beyond the threshold", () => {
    expect(isNearPoint({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, 0.49)).toBe(false);
  });

  it("measures euclidean distance, not per-axis", () => {
    expect(isNearPoint({ x: 0, y: 0 }, { x: 0.4, y: 0.4 }, 0.4)).toBe(false);
  });
});

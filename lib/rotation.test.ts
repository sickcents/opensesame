import { describe, expect, it } from "vitest";
import {
  normalizeRotation90,
  rotate90,
  rotatedRectCorners,
  svgRotateTransform,
  type MeterPoint,
} from "./rotation";

function expectPointsClose(actual: MeterPoint[], expected: MeterPoint[]) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i].x, 10);
    expect(p.y).toBeCloseTo(expected[i].y, 10);
  });
}

describe("rotatedRectCorners", () => {
  // 4m wide, 2m deep, centered at (10, 20). Corner order is TL, TR, BR, BL
  // (pre-rotation, on the y-down plan).
  const rect = { x: 10, y: 20, widthM: 4, depthM: 2 };

  it("returns the axis-aligned corners at 0 degrees", () => {
    expectPointsClose(rotatedRectCorners({ ...rect, rotationDeg: 0 }), [
      { x: 8, y: 19 },
      { x: 12, y: 19 },
      { x: 12, y: 21 },
      { x: 8, y: 21 },
    ]);
  });

  it("swaps the footprint's width and depth at 90 degrees", () => {
    expectPointsClose(rotatedRectCorners({ ...rect, rotationDeg: 90 }), [
      { x: 11, y: 18 },
      { x: 11, y: 22 },
      { x: 9, y: 22 },
      { x: 9, y: 18 },
    ]);
  });

  it("mirrors the corners through the center at 180 degrees", () => {
    expectPointsClose(rotatedRectCorners({ ...rect, rotationDeg: 180 }), [
      { x: 12, y: 21 },
      { x: 8, y: 21 },
      { x: 8, y: 19 },
      { x: 12, y: 19 },
    ]);
  });

  it("rotates opposite to 90 at 270 degrees", () => {
    expectPointsClose(rotatedRectCorners({ ...rect, rotationDeg: 270 }), [
      { x: 9, y: 22 },
      { x: 9, y: 18 },
      { x: 11, y: 18 },
      { x: 11, y: 22 },
    ]);
  });
});

describe("normalizeRotation90", () => {
  it("passes through in-range multiples of 90", () => {
    expect(normalizeRotation90(0)).toBe(0);
    expect(normalizeRotation90(90)).toBe(90);
    expect(normalizeRotation90(180)).toBe(180);
    expect(normalizeRotation90(270)).toBe(270);
  });

  it("wraps negative values", () => {
    expect(normalizeRotation90(-90)).toBe(270);
    expect(normalizeRotation90(-270)).toBe(90);
    expect(normalizeRotation90(-360)).toBe(0);
  });

  it("wraps values at or beyond 360", () => {
    expect(normalizeRotation90(360)).toBe(0);
    expect(normalizeRotation90(450)).toBe(90);
    expect(normalizeRotation90(810)).toBe(90);
  });

  it("rounds non-multiples of 90 to the nearest step", () => {
    expect(normalizeRotation90(44)).toBe(0);
    expect(normalizeRotation90(45)).toBe(90);
    expect(normalizeRotation90(135)).toBe(180);
    expect(normalizeRotation90(269)).toBe(270);
  });
});

describe("rotate90", () => {
  it("steps clockwise by adding 90", () => {
    expect(rotate90(0, "cw")).toBe(90);
    expect(rotate90(90, "cw")).toBe(180);
    expect(rotate90(180, "cw")).toBe(270);
    expect(rotate90(270, "cw")).toBe(0);
  });

  it("steps counter-clockwise by subtracting 90", () => {
    expect(rotate90(0, "ccw")).toBe(270);
    expect(rotate90(270, "ccw")).toBe(180);
    expect(rotate90(180, "ccw")).toBe(90);
    expect(rotate90(90, "ccw")).toBe(0);
  });

  it("cw then ccw returns to the starting rotation", () => {
    expect(rotate90(rotate90(45, "cw"), "ccw")).toBe(normalizeRotation90(45));
  });
});

describe("svgRotateTransform", () => {
  it("emits an SVG rotate() about the rectangle's center", () => {
    expect(svgRotateTransform({ x: 10, y: 20, rotationDeg: 90 })).toBe("rotate(90, 10, 20)");
    expect(svgRotateTransform({ x: 3.5, y: 7.25, rotationDeg: 0 })).toBe("rotate(0, 3.5, 7.25)");
  });
});

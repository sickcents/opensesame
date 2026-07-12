import { describe, expect, it } from "vitest";
import {
  centerAlignmentLines,
  equipmentEdgeLines,
  polygonEdgeLines,
} from "./snap-candidates";

describe("equipmentEdgeLines", () => {
  it("returns min/max x and y edges of an unrotated footprint", () => {
    const lines = equipmentEdgeLines([
      { x: 5, y: 3, widthM: 2, depthM: 1, rotationDeg: 0 },
    ]);
    expect(lines.xEdges).toEqual([4, 6]);
    expect(lines.yEdges).toEqual([2.5, 3.5]);
  });

  it("uses the rotated bounding box — 90° swaps width and depth", () => {
    const lines = equipmentEdgeLines([
      { x: 5, y: 3, widthM: 2, depthM: 1, rotationDeg: 90 },
    ]);
    expect(lines.xEdges[0]).toBeCloseTo(4.5);
    expect(lines.xEdges[1]).toBeCloseTo(5.5);
    expect(lines.yEdges[0]).toBeCloseTo(2);
    expect(lines.yEdges[1]).toBeCloseTo(4);
  });

  it("widens the AABB for a 45° rotation", () => {
    const half = Math.SQRT2; // 2x2 rect rotated 45°: half-diagonal √2
    const lines = equipmentEdgeLines([
      { x: 5, y: 5, widthM: 2, depthM: 2, rotationDeg: 45 },
    ]);
    expect(lines.xEdges[0]).toBeCloseTo(5 - half);
    expect(lines.xEdges[1]).toBeCloseTo(5 + half);
    expect(lines.yEdges[0]).toBeCloseTo(5 - half);
    expect(lines.yEdges[1]).toBeCloseTo(5 + half);
  });

  it("flattens multiple footprints into one tier", () => {
    const lines = equipmentEdgeLines([
      { x: 1, y: 1, widthM: 2, depthM: 2, rotationDeg: 0 },
      { x: 10, y: 10, widthM: 4, depthM: 2, rotationDeg: 0 },
    ]);
    expect(lines.xEdges).toEqual([0, 2, 8, 12]);
    expect(lines.yEdges).toEqual([0, 2, 9, 11]);
  });
});

describe("centerAlignmentLines", () => {
  it("maps each point onto both axes", () => {
    expect(
      centerAlignmentLines([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toEqual({ xEdges: [1, 3], yEdges: [2, 4] });
  });
});

describe("polygonEdgeLines", () => {
  it("collects every vertex coordinate from every polygon", () => {
    const lines = polygonEdgeLines([
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ],
      [{ x: 10, y: 10 }],
    ]);
    expect(lines.xEdges).toEqual([0, 4, 4, 10]);
    expect(lines.yEdges).toEqual([0, 0, 3, 10]);
  });

  it("returns empty tiers for no polygons", () => {
    expect(polygonEdgeLines([])).toEqual({ xEdges: [], yEdges: [] });
  });
});

import { describe, expect, it } from "vitest";
import { resolveSnap, type SnapLines } from "./snapping";

const none: SnapLines = { xEdges: [], yEdges: [] };

describe("resolveSnap", () => {
  it("prefers an equipment edge over a closer grid line", () => {
    const result = resolveSnap({
      candidate: { x: 5.2, y: 0 },
      thresholdM: 0.4,
      gridSizeM: 0.5, // grid line at 5.0 is 0.2m away — closer than the edge
      equipmentEdges: { xEdges: [5.5], yEdges: [] }, // edge is 0.3m away
      alignmentLines: none,
      polygonEdges: none,
    });
    expect(result.x).toEqual({ value: 5.5, kind: "equipment-edge" });
  });

  it("prefers alignment over a closer polygon edge", () => {
    const result = resolveSnap({
      candidate: { x: 0, y: 1.0 },
      thresholdM: 0.2,
      gridSizeM: 0,
      equipmentEdges: none,
      alignmentLines: { xEdges: [], yEdges: [1.15] },
      polygonEdges: { xEdges: [], yEdges: [1.05] },
    });
    expect(result.y).toEqual({ value: 1.15, kind: "alignment" });
  });

  it("breaks ties by distance within the same tier", () => {
    const result = resolveSnap({
      candidate: { x: 5.2, y: 0 },
      thresholdM: 0.4,
      gridSizeM: 0,
      equipmentEdges: { xEdges: [5.5, 5.3], yEdges: [] },
      alignmentLines: none,
      polygonEdges: none,
    });
    expect(result.x).toEqual({ value: 5.3, kind: "equipment-edge" });
  });

  it("falls back to the grid when nothing else is in range", () => {
    const result = resolveSnap({
      candidate: { x: 3.1, y: 0 },
      thresholdM: 0.2,
      gridSizeM: 1,
      equipmentEdges: { xEdges: [7], yEdges: [] }, // out of range
      alignmentLines: none,
      polygonEdges: none,
    });
    expect(result.x).toEqual({ value: 3, kind: "grid" });
  });

  it("returns null on an axis when even the grid is out of threshold", () => {
    const result = resolveSnap({
      candidate: { x: 3.4, y: 0.5 },
      thresholdM: 0.05,
      gridSizeM: 1,
      equipmentEdges: none,
      alignmentLines: none,
      polygonEdges: none,
    });
    expect(result.x).toBeNull();
  });

  it("snaps each axis independently to different sources", () => {
    const result = resolveSnap({
      candidate: { x: 2.05, y: 7.9 },
      thresholdM: 0.1,
      gridSizeM: 1,
      equipmentEdges: { xEdges: [2], yEdges: [] },
      alignmentLines: none,
      polygonEdges: none,
    });
    expect(result.x).toEqual({ value: 2, kind: "equipment-edge" });
    expect(result.y).toEqual({ value: 8, kind: "grid" });
  });

  it("leaves an axis unsnapped while the other snaps", () => {
    const result = resolveSnap({
      candidate: { x: 2.05, y: 7.4 },
      thresholdM: 0.1,
      gridSizeM: 1,
      equipmentEdges: { xEdges: [2], yEdges: [] },
      alignmentLines: none,
      polygonEdges: none,
    });
    expect(result.x).toEqual({ value: 2, kind: "equipment-edge" });
    expect(result.y).toBeNull();
  });
});

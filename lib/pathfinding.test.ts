import { describe, expect, it } from "vitest";
import { computeWalkingPath, type MeterPoint } from "./pathfinding";

function rect(x0: number, y0: number, x1: number, y1: number): MeterPoint[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Dense samples along every waypoint-to-waypoint segment. */
function samplePath(waypoints: MeterPoint[], step = 0.05): MeterPoint[] {
  const samples: MeterPoint[] = [];
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let s = 0; s <= n; s++) {
      samples.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
    }
  }
  return samples;
}

describe("computeWalkingPath", () => {
  it("detours around an equipment obstacle instead of going straight through", () => {
    const result = computeWalkingPath({
      rooms: [{ points: rect(0, 0, 10, 10) }],
      areas: [],
      obstacles: [{ x: 5, y: 5, widthM: 2, depthM: 2 }],
      start: { x: 1, y: 5 },
      end: { x: 9, y: 5 },
    });
    expect(result).not.toBeNull();
    expect(result!.waypoints.length).toBeGreaterThan(2);
    // Margin absorbs the sampling interval of the simplification pass.
    const clipsObstacle = samplePath(result!.waypoints).some(
      (p) => Math.abs(p.x - 5) < 0.9 && Math.abs(p.y - 5) < 0.9,
    );
    expect(clipsObstacle).toBe(false);
    expect(result!.distanceMeters).toBeGreaterThan(8);
  });

  it("returns null when a restricted Area fully blocks the only route", () => {
    const result = computeWalkingPath({
      rooms: [{ points: rect(0, 0, 10, 10) }],
      areas: [{ id: "keep-out", points: rect(4, -2, 6, 12), kind: "restricted" }],
      obstacles: [],
      start: { x: 1, y: 5 },
      end: { x: 9, y: 5 },
    });
    expect(result).toBeNull();
  });

  it("takes the walkable detour around a restricted Area blocking the direct line", () => {
    const result = computeWalkingPath({
      rooms: [{ points: rect(0, 0, 10, 10) }],
      areas: [{ id: "keep-out", points: rect(4, -2, 6, 8), kind: "restricted" }],
      obstacles: [],
      start: { x: 1, y: 1 },
      end: { x: 9, y: 1 },
    });
    expect(result).not.toBeNull();
    expect(result!.waypoints.length).toBeGreaterThan(2);
    const clipsRestricted = samplePath(result!.waypoints).some(
      (p) => p.x > 4.1 && p.x < 5.9 && p.y > -1.9 && p.y < 7.9,
    );
    expect(clipsRestricted).toBe(false);
  });

  it("routes through a ppe_required Area and flags it, not blocks it", () => {
    const result = computeWalkingPath({
      rooms: [{ points: rect(0, 0, 4, 10) }, { points: rect(6, 0, 10, 10) }],
      areas: [{ id: "ppe1", points: rect(3.5, 3, 6.5, 7), kind: "ppe_required" }],
      obstacles: [],
      start: { x: 2, y: 5 },
      end: { x: 8, y: 5 },
    });
    expect(result).not.toBeNull();
    expect(result!.ppeRequiredAreaIds).toContain("ppe1");
  });

  it("finds a short, roughly-direct path in an empty room", () => {
    const start = { x: 1, y: 1 };
    const end = { x: 9, y: 9 };
    const result = computeWalkingPath({
      rooms: [{ points: rect(0, 0, 10, 10) }],
      areas: [],
      obstacles: [],
      start,
      end,
    });
    expect(result).not.toBeNull();
    expect(result!.waypoints.length).toBeLessThanOrEqual(4);
    const straightLine = Math.hypot(end.x - start.x, end.y - start.y);
    expect(result!.distanceMeters).toBeGreaterThanOrEqual(straightLine * 0.99);
    expect(result!.distanceMeters).toBeLessThanOrEqual(straightLine * 1.2);
  });
});

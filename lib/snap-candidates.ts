// Flattens scene geometry (all meters) into the per-axis snap-line tiers
// lib/snapping's resolveSnap consumes. Pure — callers pre-filter out hidden
// items and whatever is currently being dragged (nothing snaps to itself).

import { rotatedRectCorners } from "./rotation";
import type { MeterPoint, SnapLines } from "./snapping";

export type EquipmentFootprint = {
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  rotationDeg: number;
};

/**
 * Tier-1 lines: each Equipment footprint's axis-aligned bounding-box edges.
 * For rotated Equipment the AABB of the rotated corners stands in for its
 * true edges — edge-to-edge-at-an-angle snapping is out of scope for v1.
 */
export function equipmentEdgeLines(footprints: EquipmentFootprint[]): SnapLines {
  const xEdges: number[] = [];
  const yEdges: number[] = [];
  for (const f of footprints) {
    const corners = rotatedRectCorners(f);
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    xEdges.push(Math.min(...xs), Math.max(...xs));
    yEdges.push(Math.min(...ys), Math.max(...ys));
  }
  return { xEdges, yEdges };
}

/** Tier-2 lines: center alignment with Equipment/Safety Equipment points. */
export function centerAlignmentLines(centers: MeterPoint[]): SnapLines {
  return { xEdges: centers.map((p) => p.x), yEdges: centers.map((p) => p.y) };
}

/**
 * Tier-3 lines: every Room/Area polygon vertex's x/y. Vertex coordinates
 * proxy for edges — exact for axis-aligned walls, close enough for v1.
 */
export function polygonEdgeLines(polygons: MeterPoint[][]): SnapLines {
  const xEdges: number[] = [];
  const yEdges: number[] = [];
  for (const poly of polygons) {
    for (const p of poly) {
      xEdges.push(p.x);
      yEdges.push(p.y);
    }
  }
  return { xEdges, yEdges };
}

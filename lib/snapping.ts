// Snap-candidate resolution for the Floor Plan Editor. Pure math, entirely
// in meters — converting a screen-pixel tolerance to thresholdM is the UI
// layer's job. Callers pre-flatten scene geometry into per-axis snap-line
// coordinates (this module never sees Equipment rects or Room polygons),
// grouped into priority tiers: (1) equipment edge-to-edge abutment,
// (2) center/edge alignment with other Equipment/Safety Equipment points,
// (3) Room/Area polygon edges, (4) grid fallback. The first tier with any
// line within thresholdM wins the axis outright; distance only breaks ties
// within a tier — never across tiers.

export type MeterPoint = { x: number; y: number };

export type SnapKind = "equipment-edge" | "alignment" | "polygon-edge" | "grid";

/** Per-axis snap result: the snapped coordinate and which tier produced it. */
export type AxisSnap = { value: number; kind: SnapKind };

/** Candidate snap-line coordinates from one source, per axis. */
export type SnapLines = { xEdges: number[]; yEdges: number[] };

/** Nearest line within thresholdM, or null. */
function nearestWithin(value: number, lines: number[], thresholdM: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const line of lines) {
    const dist = Math.abs(line - value);
    if (dist <= thresholdM && dist < bestDist) {
      best = line;
      bestDist = dist;
    }
  }
  return best;
}

function resolveAxis(
  value: number,
  tiers: { lines: number[]; kind: SnapKind }[],
  gridSizeM: number,
  thresholdM: number,
): AxisSnap | null {
  for (const tier of tiers) {
    const hit = nearestWithin(value, tier.lines, thresholdM);
    if (hit !== null) return { value: hit, kind: tier.kind };
  }
  if (gridSizeM > 0) {
    const grid = Math.round(value / gridSizeM) * gridSizeM;
    if (Math.abs(grid - value) <= thresholdM) return { value: grid, kind: "grid" };
  }
  return null;
}

/**
 * Best snap for a candidate position, resolved independently per axis (x and
 * y can snap to different sources), or null on an axis when nothing —
 * including the nearest grid line — is within thresholdM.
 */
export function resolveSnap(input: {
  candidate: MeterPoint;
  thresholdM: number;
  gridSizeM: number;
  equipmentEdges: SnapLines;
  alignmentLines: SnapLines;
  polygonEdges: SnapLines;
}): { x: AxisSnap | null; y: AxisSnap | null } {
  const { candidate, thresholdM, gridSizeM, equipmentEdges, alignmentLines, polygonEdges } = input;
  const xTiers = [
    { lines: equipmentEdges.xEdges, kind: "equipment-edge" as const },
    { lines: alignmentLines.xEdges, kind: "alignment" as const },
    { lines: polygonEdges.xEdges, kind: "polygon-edge" as const },
  ];
  const yTiers = [
    { lines: equipmentEdges.yEdges, kind: "equipment-edge" as const },
    { lines: alignmentLines.yEdges, kind: "alignment" as const },
    { lines: polygonEdges.yEdges, kind: "polygon-edge" as const },
  ];
  return {
    x: resolveAxis(candidate.x, xTiers, gridSizeM, thresholdM),
    y: resolveAxis(candidate.y, yTiers, gridSizeM, thresholdM),
  };
}

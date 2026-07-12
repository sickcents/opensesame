// Polygon-draft validation for Room/Area drawing. Pure module: plain
// geometry in meters, no DB/DOM.

export type MeterPoint = { x: number; y: number };

const EPS = 1e-9;

/** Sign of the cross product (b - a) x (c - a): 1 left turn, -1 right, 0 collinear. */
function orientation(a: MeterPoint, b: MeterPoint, c: MeterPoint): number {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (cross > EPS) return 1;
  if (cross < -EPS) return -1;
  return 0;
}

/** Assumes p is collinear with segment ab; true if p lies within its bounds. */
function onSegment(a: MeterPoint, b: MeterPoint, p: MeterPoint): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

function segmentsIntersect(
  a: MeterPoint,
  b: MeterPoint,
  c: MeterPoint,
  d: MeterPoint,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  // Collinear cases: an endpoint of one segment lies on the other.
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/**
 * True if any two non-adjacent edges of the (implicitly closed) ring cross.
 * Used to block closing a Room/Area polygon draft into an invalid shape —
 * PostGIS rejects/mishandles self-intersecting polygons.
 */
export function isSelfIntersecting(points: MeterPoint[]): boolean {
  const n = points.length;
  if (n < 4) return false; // a triangle can't self-intersect
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges — they share a vertex by construction. The
      // closing edge (n-1 -> 0) is adjacent to both the first and last edges.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (
        segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True if `point` is within `thresholdM` of `target` — the "click the first
 * vertex to close" check. Threshold is in meters; converting a screen-pixel
 * tolerance to meters is the caller's job.
 */
export function isNearPoint(point: MeterPoint, target: MeterPoint, thresholdM: number): boolean {
  return Math.hypot(point.x - target.x, point.y - target.y) <= thresholdM;
}

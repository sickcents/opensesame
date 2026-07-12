// Grid-rasterized A* over a Floor's walkable region. A visibility graph gives
// smoother paths but needs robust polygon-offsetting math that's easy to get
// subtly wrong — a grid is simple, testable, and good enough for v1
// facility-scale distances. Pure module: no DB/PostGIS, plain geometry in.

import { rotatePointAround, rotatedRectCorners } from "./rotation";

export type MeterPoint = { x: number; y: number };
export type WalkablePolygon = { points: MeterPoint[] }; // Room interiors — always walkable
export type AreaPolygon = {
  id: string;
  points: MeterPoint[];
  kind: "walkway" | "ppe_required" | "restricted";
};
// Equipment footprint centered at (x, y). rotationDeg (optional, default 0)
// rotates it about that center per lib/rotation.ts's CCW convention — the
// two modules must keep the same rotation direction if either changes.
export type ObstacleRect = {
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  rotationDeg?: number;
};

export type PathResult = {
  waypoints: MeterPoint[];
  distanceMeters: number;
  ppeRequiredAreaIds: string[];
} | null; // null = unreachable

const SNAP_RADIUS_CELLS = 20;

/** Ray-casting point-in-polygon (odd-even rule). */
function pointInPolygon(p: MeterPoint, polygon: MeterPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInRect(p: MeterPoint, r: ObstacleRect): boolean {
  // Undo the rectangle's rotation so the containment check stays axis-aligned.
  const local = r.rotationDeg ? rotatePointAround(p, r, -r.rotationDeg) : p;
  return Math.abs(local.x - r.x) <= r.widthM / 2 && Math.abs(local.y - r.y) <= r.depthM / 2;
}

/** Array-backed binary min-heap over node indices, keyed by f-score. */
class MinHeap {
  private nodes: number[] = [];
  private scores: number[] = [];

  get size() {
    return this.nodes.length;
  }

  push(node: number, score: number) {
    this.nodes.push(node);
    this.scores.push(score);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && this.scores[left] < this.scores[smallest]) smallest = left;
        if (right < this.nodes.length && this.scores[right] < this.scores[smallest]) {
          smallest = right;
        }
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(i: number, j: number) {
    [this.nodes[i], this.nodes[j]] = [this.nodes[j], this.nodes[i]];
    [this.scores[i], this.scores[j]] = [this.scores[j], this.scores[i]];
  }
}

export function computeWalkingPath(input: {
  rooms: WalkablePolygon[];
  areas: AreaPolygon[];
  obstacles: ObstacleRect[];
  start: MeterPoint;
  end: MeterPoint;
}): PathResult {
  const { rooms, areas, obstacles, start, end } = input;

  const walkablePolys = [
    ...rooms.map((r) => r.points),
    ...areas.filter((a) => a.kind !== "restricted").map((a) => a.points),
  ];
  const restrictedPolys = areas.filter((a) => a.kind === "restricted").map((a) => a.points);

  // Restricted-area and obstacle exclusion both override walkable inclusion.
  const isWalkable = (p: MeterPoint): boolean =>
    walkablePolys.some((poly) => pointInPolygon(p, poly)) &&
    !restrictedPolys.some((poly) => pointInPolygon(p, poly)) &&
    !obstacles.some((r) => pointInRect(p, r));

  let minX = Math.min(start.x, end.x);
  let maxX = Math.max(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxY = Math.max(start.y, end.y);
  for (const poly of [...rooms.map((r) => r.points), ...areas.map((a) => a.points)]) {
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  for (const r of obstacles) {
    // Corners, not width/depth extents — a rotated footprint's bounding box
    // can exceed the unrotated one.
    for (const c of rotatedRectCorners({ ...r, rotationDeg: r.rotationDeg ?? 0 })) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
  }
  minX -= 1;
  minY -= 1;
  maxX += 1;
  maxY += 1;

  // Fine resolution for small fixtures, coarser (still sub-meter under ~100m
  // across) for real floors — caps the grid at roughly 40k cells.
  const diagonalMeters = Math.hypot(maxX - minX, maxY - minY);
  const resolution = Math.max(0.15, diagonalMeters / 150);
  const cols = Math.max(1, Math.ceil((maxX - minX) / resolution));
  const rows = Math.max(1, Math.ceil((maxY - minY) / resolution));

  const cellCenter = (idx: number): MeterPoint => ({
    x: minX + ((idx % cols) + 0.5) * resolution,
    y: minY + (Math.floor(idx / cols) + 0.5) * resolution,
  });

  const walkable = new Uint8Array(cols * rows);
  for (let idx = 0; idx < walkable.length; idx++) {
    walkable[idx] = isWalkable(cellCenter(idx)) ? 1 : 0;
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const cellIndexOf = (p: MeterPoint) => {
    const col = clamp(Math.floor((p.x - minX) / resolution), 0, cols - 1);
    const row = clamp(Math.floor((p.y - minY) / resolution), 0, rows - 1);
    return row * cols + col;
  };

  // Snap to the nearest walkable cell in expanding rings — needed when a
  // start/end lands inside an obstacle footprint or off the walkable region.
  const snapToWalkable = (p: MeterPoint): number | null => {
    const col0 = cellIndexOf(p) % cols;
    const row0 = Math.floor(cellIndexOf(p) / cols);
    for (let radius = 0; radius <= SNAP_RADIUS_CELLS; radius++) {
      let best = -1;
      let bestDist = Infinity;
      for (let row = row0 - radius; row <= row0 + radius; row++) {
        for (let col = col0 - radius; col <= col0 + radius; col++) {
          if (Math.max(Math.abs(row - row0), Math.abs(col - col0)) !== radius) continue;
          if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
          const idx = row * cols + col;
          if (!walkable[idx]) continue;
          const c = cellCenter(idx);
          const dist = Math.hypot(c.x - p.x, c.y - p.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = idx;
          }
        }
      }
      if (best >= 0) return best;
    }
    return null;
  };

  const startIdx = snapToWalkable(start);
  const endIdx = snapToWalkable(end);
  if (startIdx === null || endIdx === null) return null;

  const endCenter = cellCenter(endIdx);
  const heuristic = (idx: number) => {
    const c = cellCenter(idx);
    return Math.hypot(c.x - endCenter.x, c.y - endCenter.y);
  };

  const g = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const open = new MinHeap();
  g[startIdx] = 0;
  open.push(startIdx, heuristic(startIdx));

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === endIdx) break;

    const row = Math.floor(current / cols);
    const col = current % cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const nIdx = nr * cols + nc;
        if (!walkable[nIdx] || closed[nIdx]) continue;
        const diagonal = dr !== 0 && dc !== 0;
        // Corner-cutting: a diagonal step needs at least one adjacent
        // orthogonal cell open, or the path clips through an obstacle corner.
        if (diagonal && !walkable[row * cols + nc] && !walkable[nr * cols + col]) continue;
        const tentative = g[current] + (diagonal ? resolution * Math.SQRT2 : resolution);
        if (tentative < g[nIdx]) {
          g[nIdx] = tentative;
          cameFrom[nIdx] = current;
          open.push(nIdx, tentative + heuristic(nIdx));
        }
      }
    }
  }

  if (!closed[endIdx]) return null;

  const rawPath: MeterPoint[] = [];
  for (let idx = endIdx; idx !== -1; idx = cameFrom[idx]) {
    rawPath.push(cellCenter(idx));
  }
  rawPath.reverse();

  const segmentWalkable = (a: MeterPoint, b: MeterPoint): boolean => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (resolution / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!isWalkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  };

  // String pulling: keep only turning points so distance isn't inflated by
  // grid jaggedness and the drawn route isn't stair-stepped.
  const waypoints: MeterPoint[] = [rawPath[0]];
  let i = 0;
  while (i < rawPath.length - 1) {
    let j = rawPath.length - 1;
    while (j > i + 1 && !segmentWalkable(rawPath[i], rawPath[j])) j--;
    waypoints.push(rawPath[j]);
    i = j;
  }

  // Best-effort: swap grid-snapped endpoints back to the true start/end when
  // the resulting first/last segment stays walkable.
  if (waypoints.length >= 2) {
    if (segmentWalkable(start, waypoints[1])) waypoints[0] = start;
    if (segmentWalkable(end, waypoints[waypoints.length - 2])) {
      waypoints[waypoints.length - 1] = end;
    }
  }

  let distanceMeters = 0;
  for (let k = 1; k < waypoints.length; k++) {
    distanceMeters += Math.hypot(
      waypoints[k].x - waypoints[k - 1].x,
      waypoints[k].y - waypoints[k - 1].y,
    );
  }

  const ppeRequiredAreaIds: string[] = [];
  for (const area of areas) {
    if (area.kind !== "ppe_required") continue;
    let crossed = false;
    for (let k = 1; k < waypoints.length && !crossed; k++) {
      const a = waypoints[k - 1];
      const b = waypoints[k];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (resolution / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        if (pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, area.points)) {
          crossed = true;
          break;
        }
      }
    }
    if (crossed) ppeRequiredAreaIds.push(area.id);
  }

  return { waypoints, distanceMeters, ppeRequiredAreaIds };
}

export type MeterPoint = { x: number; y: number };

/** Build a closed WKT POLYGON from an open ring of real-world meter points. */
export function pointsToWktPolygon(points: MeterPoint[]): string {
  const ring = [...points, points[0]];
  const coords = ring.map((p) => `${p.x} ${p.y}`).join(", ");
  return `POLYGON((${coords}))`;
}

/** Parse a WKT POLYGON string (as returned by ST_AsText) into meter points. */
export function wktPolygonToPoints(wkt: string): MeterPoint[] {
  const match = wkt.match(/POLYGON\s*\(\((.+)\)\)/i);
  if (!match) return [];
  const pairs = match[1].split(",").map((s) => s.trim());
  const points = pairs.map((pair) => {
    const [x, y] = pair.split(/\s+/).map(Number);
    return { x, y };
  });
  // Drop the closing point that duplicates the first.
  if (
    points.length > 1 &&
    points[0].x === points[points.length - 1].x &&
    points[0].y === points[points.length - 1].y
  ) {
    points.pop();
  }
  return points;
}

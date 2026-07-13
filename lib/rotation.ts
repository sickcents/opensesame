// Rotation math for Equipment footprints (a center point plus the type's
// widthM/depthM, rotated rotationDeg about that center). Plan coordinates are
// y-down (SVG convention), so "CCW" here is the standard y-up mathematical
// direction — exactly SVG rotate()'s direction on a y-down canvas, letting
// svgRotateTransform pass the angle through unchanged. lib/pathfinding.ts
// undoes rotation through rotatePointAround for obstacle containment; the
// sign convention in both files must stay identical if either changes.

export type MeterPoint = { x: number; y: number };

/** Rotate `p` about `center` by `deg` degrees CCW. */
export function rotatePointAround(p: MeterPoint, center: MeterPoint, deg: number): MeterPoint {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/**
 * The 4 corners of a widthM x depthM rectangle centered at (x, y), rotated
 * rotationDeg degrees CCW about its own center. Order: top-left pre-rotation,
 * then clockwise as drawn on the y-down plan (TL, TR, BR, BL).
 */
export function rotatedRectCorners(input: {
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  rotationDeg: number;
}): MeterPoint[] {
  const { x, y, widthM, depthM, rotationDeg } = input;
  const center = { x, y };
  const hw = widthM / 2;
  const hd = depthM / 2;
  return [
    { x: x - hw, y: y - hd },
    { x: x + hw, y: y - hd },
    { x: x + hw, y: y + hd },
    { x: x - hw, y: y + hd },
  ].map((corner) => rotatePointAround(corner, center, rotationDeg));
}

/**
 * Normalizes any rotation input to one of {0, 90, 180, 270}: rounds to the
 * nearest multiple of 90, then wraps negative/over-360 values into range
 * (e.g. -90 -> 270, 450 -> 90). Used both for snapping a rotate-by-90 action
 * and for validating a value before persisting.
 */
export function normalizeRotation90(deg: number): 0 | 90 | 180 | 270 {
  const snapped = Math.round(deg / 90) * 90;
  return ((((snapped % 360) + 360) % 360) as 0 | 90 | 180 | 270);
}

export type RotationDirection = "cw" | "ccw";

/**
 * Steps `current` by one 90° increment in `direction`, snapping to
 * {0, 90, 180, 270}. Increasing rotationDeg is a clockwise turn on screen
 * (this module's rotation formula matches SVG rotate()'s direction on a
 * y-down canvas — see the file header), so "cw" adds 90 and "ccw" subtracts.
 */
export function rotate90(current: number, direction: RotationDirection): 0 | 90 | 180 | 270 {
  return normalizeRotation90(current + (direction === "cw" ? 90 : -90));
}

/**
 * SVG `transform` value for an <rect> drawn unrotated at its top-left
 * (x - widthM/2, y - depthM/2): SVG's rotate() matches this module's rotation
 * direction on a y-down canvas, so the angle passes through as-is. (x, y) is
 * the rectangle's center. 2D rendering needs only this — rotatedRectCorners
 * is for math consumers (pathfinding obstacles, hit-testing).
 */
export function svgRotateTransform(input: { x: number; y: number; rotationDeg: number }): string {
  return `rotate(${input.rotationDeg}, ${input.x}, ${input.y})`;
}

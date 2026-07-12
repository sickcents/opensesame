// Tick spacing for the Edit-mode edge rulers and scale bar. Pure so the
// zoomed-far-in/far-out edge cases are unit-testable without a DOM.

/** "Nice" real-world tick intervals the ruler may use, ascending. */
export const NICE_INTERVALS_M: readonly number[] = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50];

/**
 * Smallest nice interval whose on-screen tick spacing is at least
 * minPixelSpacing at the current zoom. Falls back to the largest interval
 * when even that renders tighter than the minimum (extreme zoom-out) and for
 * degenerate inputs (non-positive or non-finite pixelsPerMeter).
 */
export function pickNiceInterval(pixelsPerMeter: number, minPixelSpacing: number): number {
  const largest = NICE_INTERVALS_M[NICE_INTERVALS_M.length - 1];
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return largest;
  for (const interval of NICE_INTERVALS_M) {
    if (interval * pixelsPerMeter >= minPixelSpacing) return interval;
  }
  return largest;
}

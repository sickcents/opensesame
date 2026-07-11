"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { setScaleCalibration } from "./actions";

type Point = { x: number; y: number };

export function FloorPlanCanvas({
  floorId,
  floorName,
  svgMarkup,
  viewBoxWidth,
  viewBoxHeight,
  scaleMetersPerSvgUnit,
}: {
  floorId: string;
  floorName: string;
  svgMarkup: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  scaleMetersPerSvgUnit: number | null;
}) {
  const [calibrating, setCalibrating] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const svgDistance =
    points.length === 2
      ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      : null;

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    if (!calibrating || points.length >= 2) return;
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    setPoints((p) => [...p, { x: svgPt.x, y: svgPt.y }]);
  }

  function startCalibration() {
    setCalibrating(true);
    setPoints([]);
    setDistance("");
    setError(null);
  }

  function cancelCalibration() {
    setCalibrating(false);
    setPoints([]);
    setDistance("");
    setError(null);
  }

  function save() {
    const meters = Number.parseFloat(distance);
    if (!svgDistance || Number.isNaN(meters) || meters <= 0) {
      setError("Enter a real-world distance greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setScaleCalibration(floorId, svgDistance, meters);
        setCalibrating(false);
        setPoints([]);
        setDistance("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the calibration.");
      }
    });
  }

  const markerRadius = viewBoxWidth / 150;

  return (
    <div className="relative w-full max-w-4xl rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4 shadow-sm">
      <CornerMarks />

      <div className="relative">
        <div
          className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[70vh] [&_svg]:w-full [&_svg_path]:!stroke-[var(--color-ink)]"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          onClick={handleClick}
          className={`absolute inset-0 mx-auto h-auto max-h-[70vh] w-full ${
            calibrating ? "cursor-crosshair" : "pointer-events-none"
          }`}
        >
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={markerRadius}
              fill="var(--color-signal)"
            />
          ))}
          {points.length === 2 && (
            <line
              x1={points[0].x}
              y1={points[0].y}
              x2={points[1].x}
              y2={points[1].y}
              stroke="var(--color-signal)"
              strokeWidth={viewBoxWidth / 400}
              strokeDasharray="4 3"
            />
          )}
        </svg>
      </div>

      {calibrating ? (
        <div className="mt-4 space-y-2 border-t border-[var(--color-grid)] pt-3">
          <p className="font-mono text-xs text-[var(--color-ink-soft)]">
            {points.length < 2
              ? `Click two points on the plan (${points.length}/2 picked).`
              : "Enter the real-world distance between the two points."}
          </p>
          {points.length === 2 && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="meters"
                className="w-28 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
              />
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="rounded-sm bg-[var(--color-ink)] px-3 py-1 font-mono text-xs text-[var(--color-paper)] disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Save scale"}
              </button>
              <button
                type="button"
                onClick={cancelCalibration}
                className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                Cancel
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--color-signal)]">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-grid)] pt-3 font-mono text-xs text-[var(--color-ink-soft)]">
          <span>
            {scaleMetersPerSvgUnit
              ? `scale — 1 unit = ${scaleMetersPerSvgUnit.toFixed(4)} m`
              : "scale — not calibrated"}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={startCalibration}
              className="text-[var(--color-ink)] hover:text-[var(--color-signal)]"
            >
              {scaleMetersPerSvgUnit ? "Recalibrate" : "Calibrate scale"}
            </button>
            <span>{floorName}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CornerMarks() {
  const base =
    "absolute h-3 w-3 border-[var(--color-ink-soft)] pointer-events-none";
  return (
    <>
      <span aria-hidden className={`${base} left-1 top-1 border-t border-l`} />
      <span aria-hidden className={`${base} right-1 top-1 border-t border-r`} />
      <span aria-hidden className={`${base} bottom-1 left-1 border-b border-l`} />
      <span aria-hidden className={`${base} right-1 bottom-1 border-b border-r`} />
    </>
  );
}

"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import { setScaleCalibration, placeEquipment } from "./actions";

type Point = { x: number; y: number };

type EquipmentType = {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
};

type PlacedEquipment = {
  id: string;
  xMeters: number;
  yMeters: number;
  typeName: string;
  widthM: number;
  depthM: number;
};

type Mode = "idle" | "calibrate" | "equipment";

export function FloorPlanCanvas({
  floorId,
  floorName,
  svgMarkup,
  viewBoxWidth,
  viewBoxHeight,
  scaleMetersPerSvgUnit,
  equipmentTypes,
  placedEquipment,
}: {
  floorId: string;
  floorName: string;
  svgMarkup: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  scaleMetersPerSvgUnit: number | null;
  equipmentTypes: EquipmentType[];
  placedEquipment: PlacedEquipment[];
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState("");
  const [armedTypeId, setArmedTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const svgDistance =
    points.length === 2
      ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      : null;

  function svgPointFromClick(e: MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ctm.inverse());
  }

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    if (mode === "calibrate") {
      if (points.length >= 2) return;
      const p = svgPointFromClick(e);
      if (!p) return;
      setPoints((pts) => [...pts, { x: p.x, y: p.y }]);
      return;
    }
    if (mode === "equipment") {
      if (!armedTypeId || !scaleMetersPerSvgUnit) return;
      const p = svgPointFromClick(e);
      if (!p) return;
      const xMeters = p.x * scaleMetersPerSvgUnit;
      const yMeters = p.y * scaleMetersPerSvgUnit;
      startTransition(async () => {
        try {
          await placeEquipment(floorId, armedTypeId, xMeters, yMeters);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't place equipment.");
        }
      });
    }
  }

  function startCalibration() {
    setMode("calibrate");
    setArmedTypeId(null);
    setPoints([]);
    setDistance("");
    setError(null);
  }

  function cancelCalibration() {
    setMode("idle");
    setPoints([]);
    setDistance("");
    setError(null);
  }

  function saveCalibration() {
    const meters = Number.parseFloat(distance);
    if (!svgDistance || Number.isNaN(meters) || meters <= 0) {
      setError("Enter a real-world distance greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setScaleCalibration(floorId, svgDistance, meters);
        setMode("idle");
        setPoints([]);
        setDistance("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the calibration.");
      }
    });
  }

  function toggleArmedType(typeId: string) {
    if (mode === "equipment" && armedTypeId === typeId) {
      setMode("idle");
      setArmedTypeId(null);
    } else {
      setMode("equipment");
      setArmedTypeId(typeId);
      setError(null);
    }
  }

  const markerRadius = viewBoxWidth / 150;

  const equipmentRects = useMemo(() => {
    if (!scaleMetersPerSvgUnit) return [];
    return placedEquipment.map((eq) => {
      const wSvg = eq.widthM / scaleMetersPerSvgUnit;
      const dSvg = eq.depthM / scaleMetersPerSvgUnit;
      const cx = eq.xMeters / scaleMetersPerSvgUnit;
      const cy = eq.yMeters / scaleMetersPerSvgUnit;
      return {
        id: eq.id,
        x: cx - wSvg / 2,
        y: cy - dSvg / 2,
        width: wSvg,
        height: dSvg,
        label: eq.typeName,
        cx,
        cy,
      };
    });
  }, [placedEquipment, scaleMetersPerSvgUnit]);

  return (
    <div className="w-full max-w-4xl">
      {equipmentTypes.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {equipmentTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!scaleMetersPerSvgUnit}
              onClick={() => toggleArmedType(t.id)}
              title={
                scaleMetersPerSvgUnit
                  ? `${t.widthM}m x ${t.depthM}m x ${t.heightM}m`
                  : "Calibrate the Floor's scale first"
              }
              className={`rounded-sm border px-2.5 py-1 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === "equipment" && armedTypeId === t.id
                  ? "border-[var(--color-signal)] bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
                  : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
              }`}
            >
              + {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4 shadow-sm">
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
              mode !== "idle" ? "cursor-crosshair" : "pointer-events-none"
            }`}
          >
            {equipmentRects.map((r) => (
              <g key={r.id}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  fill="var(--color-ink-soft)"
                  fillOpacity={0.15}
                  stroke="var(--color-ink-soft)"
                  strokeWidth={viewBoxWidth / 500}
                />
                <text
                  x={r.cx}
                  y={r.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={viewBoxWidth / 60}
                  fill="var(--color-ink-soft)"
                  className="select-none font-mono"
                >
                  {r.label}
                </text>
              </g>
            ))}

            {mode === "calibrate" && (
              <>
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={markerRadius} fill="var(--color-signal)" />
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
              </>
            )}
          </svg>
        </div>

        {mode === "calibrate" ? (
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
                  onClick={saveCalibration}
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
              {mode === "equipment" && (
                <span className="ml-3 text-[var(--color-signal)]">
                  click the plan to place
                </span>
              )}
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
        {mode !== "calibrate" && error && (
          <p role="alert" className="mt-2 text-sm text-[var(--color-signal)]">
            {error}
          </p>
        )}
      </div>
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

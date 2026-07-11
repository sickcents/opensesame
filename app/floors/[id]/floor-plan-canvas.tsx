"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import {
  setScaleCalibration,
  placeEquipment,
  createSpace,
  placeSafetyEquipment,
  reportIssue,
  type SafetyEquipmentKind,
  type IssueSubjectType,
  type Department,
} from "./actions";

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

type Space = {
  id: string;
  name: string;
  points: Point[]; // meters
};

type SafetyEquipmentItem = {
  id: string;
  kind: string;
  xMeters: number;
  yMeters: number;
};

type ReportTarget = { type: IssueSubjectType; id: string; label: string };

const SAFETY_KINDS: { kind: SafetyEquipmentKind; label: string; code: string }[] = [
  { kind: "exit", label: "Exit", code: "EX" },
  { kind: "fire_extinguisher", label: "Fire Extinguisher", code: "FE" },
  { kind: "first_aid", label: "First Aid", code: "FA" },
  { kind: "emergency_shower", label: "Emergency Shower", code: "ES" },
];

const DEPARTMENTS: Department[] = ["IT", "Facilities", "Safety", "Security", "Operations"];

type Mode = "idle" | "calibrate" | "equipment" | "room" | "area" | "safety";

export function FloorPlanCanvas({
  floorId,
  floorName,
  svgMarkup,
  viewBoxWidth,
  viewBoxHeight,
  scaleMetersPerSvgUnit,
  equipmentTypes,
  placedEquipment,
  rooms,
  areas,
  safetyEquipment,
}: {
  floorId: string;
  floorName: string;
  svgMarkup: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  scaleMetersPerSvgUnit: number | null;
  equipmentTypes: EquipmentType[];
  placedEquipment: PlacedEquipment[];
  rooms: Space[];
  areas: Space[];
  safetyEquipment: SafetyEquipmentItem[];
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState("");
  const [armedTypeId, setArmedTypeId] = useState<string | null>(null);
  const [armedKind, setArmedKind] = useState<SafetyEquipmentKind | null>(null);
  const [spaceStep, setSpaceStep] = useState<"drawing" | "naming">("drawing");
  const [spaceName, setSpaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reporterName, setReporterName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [department, setDepartment] = useState<Department>("Facilities");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReporting, startReportTransition] = useTransition();

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
      return;
    }
    if (mode === "safety") {
      if (!armedKind || !scaleMetersPerSvgUnit) return;
      const p = svgPointFromClick(e);
      if (!p) return;
      const xMeters = p.x * scaleMetersPerSvgUnit;
      const yMeters = p.y * scaleMetersPerSvgUnit;
      startTransition(async () => {
        try {
          await placeSafetyEquipment(floorId, armedKind, xMeters, yMeters);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't place Safety Equipment.");
        }
      });
      return;
    }
    if (mode === "room" || mode === "area") {
      if (spaceStep !== "drawing") return;
      const p = svgPointFromClick(e);
      if (!p) return;
      setPoints((pts) => [...pts, { x: p.x, y: p.y }]);
    }
  }

  function openReport(type: IssueSubjectType, id: string, label: string) {
    setReportTarget({ type, id, label });
    setReporterName("");
    setReportDescription("");
    setDepartment("Facilities");
    setReportError(null);
  }

  function closeReport() {
    setReportTarget(null);
  }

  function submitReport() {
    if (!reportTarget) return;
    if (!reporterName.trim()) {
      setReportError("Enter your name.");
      return;
    }
    if (!reportDescription.trim()) {
      setReportError("Describe the issue.");
      return;
    }
    setReportError(null);
    startReportTransition(async () => {
      try {
        await reportIssue(
          floorId,
          reportTarget.type,
          reportTarget.id,
          reporterName,
          reportDescription,
          department,
        );
        setReportTarget(null);
      } catch (err) {
        setReportError(err instanceof Error ? err.message : "Couldn't submit the report.");
      }
    });
  }

  function subjectClickProps(type: IssueSubjectType, id: string, label: string) {
    if (mode !== "idle") return {};
    return {
      style: { pointerEvents: "auto" as const, cursor: "pointer" },
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        openReport(type, id, label);
      },
    };
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

  function toggleArmedKind(kind: SafetyEquipmentKind) {
    if (mode === "safety" && armedKind === kind) {
      setMode("idle");
      setArmedKind(null);
    } else {
      setMode("safety");
      setArmedKind(kind);
      setError(null);
    }
  }

  function startDrawingSpace(kind: "room" | "area") {
    setMode(kind);
    setPoints([]);
    setSpaceStep("drawing");
    setSpaceName("");
    setError(null);
  }

  function cancelSpace() {
    setMode("idle");
    setPoints([]);
    setSpaceStep("drawing");
    setSpaceName("");
    setError(null);
  }

  function undoSpacePoint() {
    setPoints((pts) => pts.slice(0, -1));
  }

  function finishSpaceDrawing() {
    if (points.length < 3) {
      setError("A polygon needs at least 3 points.");
      return;
    }
    setError(null);
    setSpaceStep("naming");
  }

  function saveSpace() {
    if (!scaleMetersPerSvgUnit || (mode !== "room" && mode !== "area")) return;
    if (!spaceName.trim()) {
      setError("Name the space before saving.");
      return;
    }
    const meterPoints = points.map((p) => ({
      x: p.x * scaleMetersPerSvgUnit,
      y: p.y * scaleMetersPerSvgUnit,
    }));
    setError(null);
    startTransition(async () => {
      try {
        await createSpace(floorId, mode as "room" | "area", spaceName, meterPoints);
        cancelSpace();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the space.");
      }
    });
  }

  const markerRadius = viewBoxWidth / 150;
  const safetyRadius = viewBoxWidth / 130;

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

  const safetyMarkers = useMemo(() => {
    if (!scaleMetersPerSvgUnit) return [];
    return safetyEquipment.map((s) => {
      const info = SAFETY_KINDS.find((k) => k.kind === s.kind);
      return {
        id: s.id,
        cx: s.xMeters / scaleMetersPerSvgUnit,
        cy: s.yMeters / scaleMetersPerSvgUnit,
        code: info?.code ?? "?",
        label: info?.label ?? s.kind,
      };
    });
  }, [safetyEquipment, scaleMetersPerSvgUnit]);

  function toSvgPoints(space: Space) {
    if (!scaleMetersPerSvgUnit) return { poly: "", cx: 0, cy: 0 };
    const svgPts = space.points.map((p) => ({
      x: p.x / scaleMetersPerSvgUnit,
      y: p.y / scaleMetersPerSvgUnit,
    }));
    const cx = svgPts.reduce((s, p) => s + p.x, 0) / svgPts.length;
    const cy = svgPts.reduce((s, p) => s + p.y, 0) / svgPts.length;
    return { poly: svgPts.map((p) => `${p.x},${p.y}`).join(" "), cx, cy };
  }

  const isDrawingSpace = mode === "room" || mode === "area";
  const spaceLabel = mode === "room" ? "Room" : "Area";

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
          <span className="mx-1 text-[var(--color-grid)]">|</span>
          {(["room", "area"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={!scaleMetersPerSvgUnit}
              onClick={() => startDrawingSpace(kind)}
              className={`rounded-sm border px-2.5 py-1 font-mono text-xs capitalize disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === kind
                  ? "border-[var(--color-signal)] bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
                  : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
              }`}
            >
              ▱ Draw {kind}
            </button>
          ))}
          <span className="mx-1 text-[var(--color-grid)]">|</span>
          {SAFETY_KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              disabled={!scaleMetersPerSvgUnit}
              onClick={() => toggleArmedKind(kind)}
              className={`rounded-sm border px-2.5 py-1 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === "safety" && armedKind === kind
                  ? "border-[var(--color-signal)] bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
                  : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
              }`}
            >
              ● {label}
            </button>
          ))}
        </div>
      )}

      <div className="relative rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4 shadow-sm">
        <CornerMarks />

        {mode === "idle" && (
          <p className="mb-2 font-mono text-xs text-[var(--color-ink-soft)]">
            Click a Room, Area, Equipment, or Safety Equipment marker to report an issue.
          </p>
        )}

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
            {rooms.map((r) => {
              const { poly, cx, cy } = toSvgPoints(r);
              return (
                <g key={r.id} {...subjectClickProps("room", r.id, r.name)}>
                  <polygon
                    points={poly}
                    fill="var(--color-ink)"
                    fillOpacity={0.06}
                    stroke="var(--color-ink)"
                    strokeWidth={viewBoxWidth / 500}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={viewBoxWidth / 55}
                    fill="var(--color-ink)"
                    className="select-none font-mono"
                  >
                    {r.name}
                  </text>
                </g>
              );
            })}
            {areas.map((a) => {
              const { poly, cx, cy } = toSvgPoints(a);
              return (
                <g key={a.id} {...subjectClickProps("area", a.id, a.name)}>
                  <polygon
                    points={poly}
                    fill="var(--color-ink-soft)"
                    fillOpacity={0.08}
                    stroke="var(--color-ink-soft)"
                    strokeWidth={viewBoxWidth / 500}
                    strokeDasharray={`${viewBoxWidth / 150} ${viewBoxWidth / 250}`}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={viewBoxWidth / 55}
                    fill="var(--color-ink-soft)"
                    className="select-none font-mono"
                  >
                    {a.name}
                  </text>
                </g>
              );
            })}

            {equipmentRects.map((r) => (
              <g key={r.id} {...subjectClickProps("equipment", r.id, r.label)}>
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

            {safetyMarkers.map((s) => (
              <g key={s.id} {...subjectClickProps("safety_equipment", s.id, s.label)}>
                <circle
                  cx={s.cx}
                  cy={s.cy}
                  r={safetyRadius}
                  fill="var(--color-panel)"
                  stroke="var(--color-signal)"
                  strokeWidth={viewBoxWidth / 400}
                />
                <text
                  x={s.cx}
                  y={s.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={viewBoxWidth / 110}
                  fill="var(--color-signal)"
                  className="select-none font-mono font-bold"
                >
                  {s.code}
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

            {isDrawingSpace && spaceStep === "drawing" && points.length > 0 && (
              <>
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="var(--color-signal)"
                  strokeWidth={viewBoxWidth / 400}
                />
                {points.length >= 3 && (
                  <line
                    x1={points[points.length - 1].x}
                    y1={points[points.length - 1].y}
                    x2={points[0].x}
                    y2={points[0].y}
                    stroke="var(--color-signal)"
                    strokeWidth={viewBoxWidth / 400}
                    strokeDasharray="4 3"
                  />
                )}
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={markerRadius} fill="var(--color-signal)" />
                ))}
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
        ) : isDrawingSpace ? (
          <div className="mt-4 space-y-2 border-t border-[var(--color-grid)] pt-3">
            {spaceStep === "drawing" ? (
              <>
                <p className="font-mono text-xs text-[var(--color-ink-soft)]">
                  Click points to outline the {spaceLabel.toLowerCase()} ({points.length} picked).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={finishSpaceDrawing}
                    disabled={points.length < 3}
                    className="rounded-sm bg-[var(--color-ink)] px-3 py-1 font-mono text-xs text-[var(--color-paper)] disabled:opacity-40"
                  >
                    Finish
                  </button>
                  <button
                    type="button"
                    onClick={undoSpacePoint}
                    disabled={points.length === 0}
                    className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-40"
                  >
                    Undo point
                  </button>
                  <button
                    type="button"
                    onClick={cancelSpace}
                    className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-mono text-xs text-[var(--color-ink-soft)]">
                  Name this {spaceLabel.toLowerCase()}.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    placeholder={mode === "room" ? "Room 101" : "Loading dock walkway"}
                    className="w-56 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveSpace}
                    disabled={isPending}
                    className="rounded-sm bg-[var(--color-ink)] px-3 py-1 font-mono text-xs text-[var(--color-paper)] disabled:opacity-60"
                  >
                    {isPending ? "Saving…" : `Save ${spaceLabel}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpaceStep("drawing")}
                    className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={cancelSpace}
                    className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                  >
                    Cancel
                  </button>
                </div>
              </>
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
              {(mode === "equipment" || mode === "safety") && (
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
        {(mode === "equipment" || mode === "safety") && error && (
          <p role="alert" className="mt-2 text-sm text-[var(--color-signal)]">
            {error}
          </p>
        )}
      </div>

      {reportTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]/30 px-6"
          onClick={closeReport}
        >
          <div
            className="w-full max-w-sm rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-[family-name:var(--font-display)] text-base font-medium text-[var(--color-ink)]">
              Report an issue
            </h3>
            <p className="mt-1 font-mono text-xs text-[var(--color-ink-soft)]">
              {reportTarget.label}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Your name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Jordan"
                  className="mt-1 w-full rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  What&apos;s wrong
                </label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the issue"
                  className="mt-1 w-full rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as Department)}
                  className="mt-1 w-full rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {reportError && (
                <p role="alert" className="text-sm text-[var(--color-signal)]">
                  {reportError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={isReporting}
                  className="rounded-sm bg-[var(--color-ink)] px-3 py-1.5 font-mono text-xs text-[var(--color-paper)] disabled:opacity-60"
                >
                  {isReporting ? "Submitting…" : "Submit report"}
                </button>
                <button
                  type="button"
                  onClick={closeReport}
                  className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  Cancel
                </button>
              </div>
            </div>
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

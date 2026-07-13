"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { FloorPicker, type FloorPickerFloor } from "@/app/components/floor-picker";
import { EXIT_GREEN } from "@/lib/color-palette";
import {
  normalizeRotation90,
  rotate90,
  rotatePointAround,
  rotatedRectCorners,
  svgRotateTransform,
  type RotationDirection,
} from "@/lib/rotation";
import { pickNiceInterval } from "@/lib/ruler";
import { isNearPoint, isSelfIntersecting } from "@/lib/polygon";
import { resolveSnap } from "@/lib/snapping";
import {
  centerAlignmentLines,
  equipmentEdgeLines,
  polygonEdgeLines,
} from "@/lib/snap-candidates";
import {
  setScaleCalibration,
  placeEquipment,
  createSpace,
  placeSafetyEquipment,
  reportIssue,
  rotateEquipment,
  moveItem,
  moveSpace,
  deleteItem,
  renameItem,
  setItemColor,
  type SafetyEquipmentKind,
  type IssueSubjectType,
  type Department,
  type AreaKind,
} from "./actions";
import { FloatingToolbar, type SelectedItem } from "./floating-toolbar";
import { LayerPanel, itemKey, type ItemRef } from "./layer-panel";

type Point = { x: number; y: number };

type EquipmentType = {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
};

// color arrives fully resolved (floor-view-switcher runs effectiveColor once
// for both the 2D and 3D views) — never null here. rawColor keeps the
// persisted value (null = default) for undo capture.
type PlacedEquipment = {
  id: string;
  typeId: string;
  xMeters: number;
  yMeters: number;
  rotationDeg: number;
  label: string | null;
  color: string;
  rawColor: string | null;
  typeName: string;
  widthM: number;
  depthM: number;
};

type Space = {
  id: string;
  name: string;
  points: Point[]; // meters
  color: string;
  rawColor: string | null;
  kind?: AreaKind; // areas only
};

type SafetyEquipmentItem = {
  id: string;
  kind: string;
  xMeters: number;
  yMeters: number;
  label: string | null;
};

type ReportTarget = { type: IssueSubjectType; id: string; label: string };

const SAFETY_KINDS: { kind: SafetyEquipmentKind; label: string; code: string }[] = [
  { kind: "exit", label: "Exit", code: "EX" },
  { kind: "fire_extinguisher", label: "Fire Extinguisher", code: "FE" },
  { kind: "first_aid", label: "First Aid", code: "FA" },
  { kind: "emergency_shower", label: "Emergency Shower", code: "ES" },
];

const DEPARTMENTS: Department[] = ["IT", "Facilities", "Safety", "Security", "Operations"];

const AREA_KINDS: { kind: AreaKind; label: string }[] = [
  { kind: "walkway", label: "Walkway" },
  { kind: "ppe_required", label: "PPE Required" },
  { kind: "restricted", label: "Restricted" },
];

type CanvasState = "view" | "edit";
type Tool = "select" | "calibrate" | "equipment" | "room" | "area" | "safety";

// Deliberately not the signal orange (#e2572b) or any COLOR_PALETTE hue —
// selection must never read as safety/error UI or as an item's own color.
const SELECTION_COLOR = "#2563eb";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const DRAG_THRESHOLD_PX = 3;
const RULER_MIN_TICK_PX = 40;
const RULER_SIZE_PX = 18;
// Snap tolerances are screen-space (constant feel at any zoom) and converted
// to meters per gesture via screenPxToMeters.
const SNAP_THRESHOLD_PX = 8;
const CLOSE_SNAP_PX = 10;
const SNAP_GRID_M = 0.1;
const UNDO_CAP = 50;

// Inverse-action closures over captured before/after values — no serialized
// action registry needed since this component can call any server action.
type UndoEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

// Everything needed to rebuild an item after Delete. Undo-of-delete restores
// an EQUIVALENT item, not the original row (create actions mint fresh ids).
type DeleteSnapshot =
  | {
      type: "equipment";
      typeId: string;
      x: number;
      y: number;
      rotationDeg: 0 | 90 | 180 | 270;
      label: string | null;
      color: string | null;
    }
  | {
      type: "safety_equipment";
      kind: SafetyEquipmentKind;
      x: number;
      y: number;
      label: string | null;
    }
  | {
      type: "room" | "area";
      name: string;
      kind?: AreaKind;
      points: Point[]; // meters
      color: string | null;
    };

function sameRef(a: ItemRef, b: ItemRef) {
  return a.type === b.type && a.id === b.id;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function bboxOf(pts: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function FloorPlanCanvas({
  floorId,
  floorName,
  floors,
  svgMarkup,
  viewBoxWidth,
  viewBoxHeight,
  scaleMetersPerSvgUnit,
  equipmentTypes,
  placedEquipment,
  rooms,
  areas,
  safetyEquipment,
  routeWaypoints,
  routePpeAreas,
  hiddenIds,
  onHiddenIdsChange,
  highlightRef = null,
}: {
  floorId: string;
  floorName: string;
  floors: FloorPickerFloor[];
  svgMarkup: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  scaleMetersPerSvgUnit: number | null;
  equipmentTypes: EquipmentType[];
  placedEquipment: PlacedEquipment[];
  rooms: Space[];
  areas: Space[];
  safetyEquipment: SafetyEquipmentItem[];
  routeWaypoints: Point[] | null;
  routePpeAreas: string[];
  // Session-only visibility, owned by FloorViewSwitcher so the 3D view reads
  // the same set. Keyed by layer-panel itemKey (`${type}:${id}`).
  hiddenIds: ReadonlySet<string>;
  onHiddenIdsChange: (next: Set<string>) => void;
  // Issue-subject highlight from the Issues panel (owned by FloorWorkspace).
  // Deliberately separate from the edit-mode `selection` state: it renders in
  // every canvas state and drives no edit interactions.
  highlightRef?: ItemRef | null;
}) {
  const [canvasState, setCanvasState] = useState<CanvasState>("view");
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<ItemRef[]>([]);
  // Pan/zoom for Edit mode, CSS-transform applied to the wrapper holding both
  // stacked SVGs. Phase 3's ruler reads this state for tick spacing and
  // screen-px-to-meters conversion.
  const [viewTransform, setViewTransform] = useState({ zoom: 1, panX: 0, panY: 0 });
  // Live drag preview: items being moved and their offset in SVG units. Kept
  // set after pointerup until the move persists, so items don't snap back.
  const [activeMove, setActiveMove] = useState<{ items: ItemRef[]; offset: Point } | null>(
    null,
  );
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ left: number; top: number } | null>(null);
  // Screen-space mapping for the edge rulers/scale bar: measured from the
  // overlay's CTM after each pan/zoom commit, in viewport-local pixels.
  const [rulerMap, setRulerMap] = useState<{
    pxPerSvgUnit: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null>(null);

  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState("");
  const [armedTypeId, setArmedTypeId] = useState<string | null>(null);
  const [armedKind, setArmedKind] = useState<SafetyEquipmentKind | null>(null);
  const [spaceStep, setSpaceStep] = useState<"drawing" | "naming">("drawing");
  const [spaceName, setSpaceName] = useState("");
  const [spaceKind, setSpaceKind] = useState<AreaKind>("walkway");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Dashed guide lines (SVG units) while a drag-snap is engaged on an axis.
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null } | null>(
    null,
  );
  // Cursor is hovering the draft's first vertex (close-the-ring affordance).
  const [firstVertexHot, setFirstVertexHot] = useState(false);
  // Session-only undo/redo of successful mutations. A fresh push clears redo.
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  const hasUnsavedDraft =
    canvasState === "edit" &&
    (tool === "room" || tool === "area") &&
    spaceStep === "drawing" &&
    points.length > 0;

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reporterName, setReporterName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [department, setDepartment] = useState<Department>("Facilities");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReporting, startReportTransition] = useTransition();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const panDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX0: number;
    panY0: number;
  } | null>(null);
  const selectGestureRef = useRef<
    | {
        kind: "move";
        pointerId: number;
        start: Point;
        startClient: Point;
        item: ItemRef;
        dragSet: ItemRef[];
        moved: boolean;
      }
    | { kind: "marquee"; pointerId: number; start: Point; startClient: Point; moved: boolean }
    | null
  >(null);

  const svgDistance =
    points.length === 2
      ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      : null;

  function svgPointFromClient(clientX: number, clientY: number) {
    const svg = overlayRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
  }

  function svgPointFromClick(e: MouseEvent<SVGSVGElement>) {
    return svgPointFromClient(e.clientX, e.clientY);
  }

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    if (canvasState !== "edit") return;
    if (tool === "calibrate") {
      if (points.length >= 2) return;
      const p = svgPointFromClick(e);
      if (!p) return;
      setPoints((pts) => [...pts, { x: p.x, y: p.y }]);
      return;
    }
    if (tool === "equipment") {
      if (!armedTypeId || !scaleMetersPerSvgUnit) return;
      const p = svgPointFromClick(e);
      if (!p) return;
      const typeId = armedTypeId;
      const xMeters = p.x * scaleMetersPerSvgUnit;
      const yMeters = p.y * scaleMetersPerSvgUnit;
      startTransition(async () => {
        try {
          let id = await placeEquipment(floorId, typeId, xMeters, yMeters);
          pushUndo({
            label: "place Equipment",
            undo: async () => {
              await deleteItem(floorId, "equipment", id);
            },
            // Redo re-inserts under a fresh id — adopt it so the next undo
            // deletes the right row.
            redo: async () => {
              id = await placeEquipment(floorId, typeId, xMeters, yMeters);
            },
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't place equipment.");
        }
      });
      return;
    }
    if (tool === "safety") {
      if (!armedKind || !scaleMetersPerSvgUnit) return;
      const p = svgPointFromClick(e);
      if (!p) return;
      const kind = armedKind;
      const xMeters = p.x * scaleMetersPerSvgUnit;
      const yMeters = p.y * scaleMetersPerSvgUnit;
      startTransition(async () => {
        try {
          let id = await placeSafetyEquipment(floorId, kind, xMeters, yMeters);
          pushUndo({
            label: "place Safety Equipment",
            undo: async () => {
              await deleteItem(floorId, "safety_equipment", id);
            },
            redo: async () => {
              id = await placeSafetyEquipment(floorId, kind, xMeters, yMeters);
            },
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't place Safety Equipment.");
        }
      });
      return;
    }
    if (tool === "room" || tool === "area") {
      if (spaceStep !== "drawing") return;
      const p = svgPointFromClick(e);
      if (!p) return;
      // Clicking the first vertex (once the ring has ≥3 points) closes the
      // draft instead of appending — same path as the Finish button.
      if (isNearFirstVertex(p)) {
        finishSpaceDrawing();
        return;
      }
      const snapped = snapDraftPoint(p);
      setPoints((pts) => [...pts, snapped]);
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
    if (canvasState !== "view") return {};
    return {
      style: { pointerEvents: "auto" as const, cursor: "pointer" },
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        openReport(type, id, label);
      },
    };
  }

  // ── Edit mode state machine ────────────────────────────────────────────

  function resetToolState() {
    setTool("select");
    setArmedTypeId(null);
    setArmedKind(null);
    setPoints([]);
    setDistance("");
    setSpaceStep("drawing");
    setSpaceName("");
    setSpaceKind("walkway");
    setError(null);
  }

  function enterEditMode() {
    setCanvasState("edit");
    setTool("select");
  }

  // True when it's safe to discard tool state — no in-progress Room/Area
  // draft, or the user explicitly confirmed losing it.
  function confirmDiscardDraft(): boolean {
    if (!hasUnsavedDraft) return true;
    return window.confirm("Discard this in-progress shape?");
  }

  function exitEditMode() {
    if (!confirmDiscardDraft()) return;
    resetToolState();
    setSelection([]);
    setMarquee(null);
    setActiveMove(null);
    setSnapGuides(null);
    selectGestureRef.current = null;
    setViewTransform({ zoom: 1, panX: 0, panY: 0 });
    setCanvasState("view");
  }

  // Esc is three-stage: cancel the in-progress tool/draft, else deselect,
  // else exit to View. One stage per press.
  function handleEscape() {
    if (canvasState !== "edit") return;
    if (tool !== "select") {
      if (!confirmDiscardDraft()) return;
      resetToolState();
      return;
    }
    if (selection.length > 0) {
      setSelection([]);
      return;
    }
    exitEditMode();
  }

  function startCalibration() {
    if (!confirmDiscardDraft()) return;
    setTool("calibrate");
    setArmedTypeId(null);
    setArmedKind(null);
    setPoints([]);
    setDistance("");
    setError(null);
  }

  function cancelCalibration() {
    resetToolState();
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
        resetToolState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the calibration.");
      }
    });
  }

  function toggleArmedType(typeId: string) {
    if (!confirmDiscardDraft()) return;
    if (tool === "equipment" && armedTypeId === typeId) {
      resetToolState();
    } else {
      setTool("equipment");
      setArmedTypeId(typeId);
      setArmedKind(null);
      setError(null);
    }
  }

  function toggleArmedKind(kind: SafetyEquipmentKind) {
    if (!confirmDiscardDraft()) return;
    if (tool === "safety" && armedKind === kind) {
      resetToolState();
    } else {
      setTool("safety");
      setArmedKind(kind);
      setArmedTypeId(null);
      setError(null);
    }
  }

  function startDrawingSpace(kind: "room" | "area") {
    if (!confirmDiscardDraft()) return;
    setTool(kind);
    setArmedTypeId(null);
    setArmedKind(null);
    setPoints([]);
    setSpaceStep("drawing");
    setSpaceName("");
    setSpaceKind("walkway");
    setError(null);
  }

  function cancelSpace() {
    if (!confirmDiscardDraft()) return;
    resetToolState();
  }

  function undoSpacePoint() {
    setPoints((pts) => pts.slice(0, -1));
  }

  function finishSpaceDrawing() {
    if (points.length < 3) {
      setError("A polygon needs at least 3 points.");
      return;
    }
    // PostGIS rejects/mishandles self-intersecting rings — block before naming.
    if (isSelfIntersecting(points)) {
      setError("This shape crosses itself — adjust the points before saving.");
      return;
    }
    setError(null);
    setSpaceStep("naming");
  }

  function saveSpace() {
    if (!scaleMetersPerSvgUnit || (tool !== "room" && tool !== "area")) return;
    if (!spaceName.trim()) {
      setError("Name the space before saving.");
      return;
    }
    const kind = tool;
    const name = spaceName;
    const areaKind = kind === "area" ? spaceKind : undefined;
    const meterPoints = points.map((p) => ({
      x: p.x * scaleMetersPerSvgUnit,
      y: p.y * scaleMetersPerSvgUnit,
    }));
    setError(null);
    startTransition(async () => {
      try {
        let id = await createSpace(floorId, kind, name, meterPoints, areaKind);
        pushUndo({
          label: `create ${kind}`,
          undo: async () => {
            await deleteItem(floorId, kind, id);
          },
          redo: async () => {
            id = await createSpace(floorId, kind, name, meterPoints, areaKind);
          },
        });
        resetToolState();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the space.");
      }
    });
  }

  // ── Derived shapes in SVG units ────────────────────────────────────────

  const markerRadius = viewBoxWidth / 150;
  const safetyRadius = viewBoxWidth / 130;

  const allEquipmentShapes = useMemo(() => {
    if (!scaleMetersPerSvgUnit) return [];
    return placedEquipment.map((eq) => {
      const width = eq.widthM / scaleMetersPerSvgUnit;
      const height = eq.depthM / scaleMetersPerSvgUnit;
      const cx = eq.xMeters / scaleMetersPerSvgUnit;
      const cy = eq.yMeters / scaleMetersPerSvgUnit;
      return {
        id: eq.id,
        x: cx - width / 2,
        y: cy - height / 2,
        width,
        height,
        cx,
        cy,
        rotationDeg: eq.rotationDeg,
        label: eq.label ?? eq.typeName,
        color: eq.color,
      };
    });
  }, [placedEquipment, scaleMetersPerSvgUnit]);

  const allSafetyShapes = useMemo(() => {
    if (!scaleMetersPerSvgUnit) return [];
    return safetyEquipment.map((s) => {
      const info = SAFETY_KINDS.find((k) => k.kind === s.kind);
      return {
        id: s.id,
        kind: s.kind,
        cx: s.xMeters / scaleMetersPerSvgUnit,
        cy: s.yMeters / scaleMetersPerSvgUnit,
        code: info?.code ?? "?",
        label: s.label ?? info?.label ?? s.kind,
      };
    });
  }, [safetyEquipment, scaleMetersPerSvgUnit]);

  function spaceToShape(space: Space, color: string) {
    const scale = scaleMetersPerSvgUnit as number;
    const pts = space.points.map((p) => ({ x: p.x / scale, y: p.y / scale }));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return {
      id: space.id,
      name: space.name,
      pts,
      poly: pts.map((p) => `${p.x},${p.y}`).join(" "),
      cx,
      cy,
      color,
    };
  }

  const allRoomShapes = useMemo(() => {
    if (!scaleMetersPerSvgUnit) return [];
    return rooms.map((r) => spaceToShape(r, r.color));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, scaleMetersPerSvgUnit]);

  const allAreaShapes = useMemo(() => {
    if (!scaleMetersPerSvgUnit) return [];
    return areas.map((a) => spaceToShape(a, a.color));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, scaleMetersPerSvgUnit]);

  // Hidden-filtered views — every downstream consumer (render, hitTestAt,
  // marquee) reads these; the all* arrays exist for the layer panel, selection
  // bounds, and centering, which must keep seeing hidden items.
  const notHidden = (type: ItemRef["type"]) => (s: { id: string }) =>
    !hiddenIds.has(itemKey({ type, id: s.id }));
  const roomShapes = useMemo(
    () => allRoomShapes.filter(notHidden("room")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRoomShapes, hiddenIds],
  );
  const areaShapes = useMemo(
    () => allAreaShapes.filter(notHidden("area")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAreaShapes, hiddenIds],
  );
  const equipmentShapes = useMemo(
    () => allEquipmentShapes.filter(notHidden("equipment")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEquipmentShapes, hiddenIds],
  );
  const safetyShapes = useMemo(
    () => allSafetyShapes.filter(notHidden("safety_equipment")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSafetyShapes, hiddenIds],
  );

  const routeSvgPoints = useMemo(() => {
    if (!scaleMetersPerSvgUnit || !routeWaypoints || routeWaypoints.length < 2) return null;
    return routeWaypoints
      .map((p) => `${p.x / scaleMetersPerSvgUnit},${p.y / scaleMetersPerSvgUnit}`)
      .join(" ");
  }, [routeWaypoints, scaleMetersPerSvgUnit]);

  // ── Magnetic snapping (Edit mode) ──────────────────────────────────────

  // Screen px → meters at the current zoom: px ÷ (screen px per SVG unit)
  // gives SVG units, × scale gives meters. rulerMap already tracks the CTM
  // through every pan/zoom, so the tolerance stays a constant apparent size.
  function screenPxToMeters(px: number): number | null {
    if (!scaleMetersPerSvgUnit || !rulerMap || rulerMap.pxPerSvgUnit <= 0) return null;
    return (px / rulerMap.pxPerSvgUnit) * scaleMetersPerSvgUnit;
  }

  /** Saved Room/Area rings (meters), minus hidden items and skipKeys. */
  function visibleSpacePolygons(skipKeys?: ReadonlySet<string>): Point[][] {
    const keep = (type: ItemRef["type"]) => (s: { id: string }) => {
      const key = itemKey({ type, id: s.id });
      return !hiddenIds.has(key) && !skipKeys?.has(key);
    };
    return [
      ...rooms.filter(keep("room")).map((r) => r.points),
      ...areas.filter(keep("area")).map((a) => a.points),
    ];
  }

  function dragAnchorMeters(ref: ItemRef): Point | null {
    if (ref.type === "equipment") {
      const eq = placedEquipment.find((e) => e.id === ref.id);
      return eq ? { x: eq.xMeters, y: eq.yMeters } : null;
    }
    if (ref.type === "safety_equipment") {
      const s = safetyEquipment.find((m) => m.id === ref.id);
      return s ? { x: s.xMeters, y: s.yMeters } : null;
    }
    // Polygons translate as a unit: the first vertex stands in as the snap
    // candidate and its snapped delta then applies to every vertex (v1 — no
    // per-vertex edge-to-edge resolution).
    const space = (ref.type === "room" ? rooms : areas).find((s) => s.id === ref.id);
    return space?.points[0] ?? null;
  }

  /**
   * The single snap-resolution path for drag-moves: BOTH the live preview
   * (handleOverlayPointerMove) and the persist (commitMove) call this with
   * the same inputs, so what's previewed is exactly what commits. Returns
   * the (possibly snapped) offset in SVG units plus per-axis guide-line
   * positions, or the raw offset untouched when Alt is held / not snappable.
   */
  function resolveSnappedOffset(
    dragSet: ItemRef[],
    anchorRef: ItemRef,
    rawOffset: Point,
    snapDisabled: boolean,
  ): { offset: Point; guides: { x: number | null; y: number | null } | null } {
    const thresholdM = screenPxToMeters(SNAP_THRESHOLD_PX);
    if (snapDisabled || thresholdM === null || !scaleMetersPerSvgUnit) {
      return { offset: rawOffset, guides: null };
    }
    const anchor = dragAnchorMeters(anchorRef);
    if (!anchor) return { offset: rawOffset, guides: null };
    const dragged = new Set(dragSet.map(itemKey));
    const included = (type: ItemRef["type"]) => (s: { id: string }) => {
      const key = itemKey({ type, id: s.id });
      return !dragged.has(key) && !hiddenIds.has(key);
    };
    const snap = resolveSnap({
      candidate: {
        x: anchor.x + rawOffset.x * scaleMetersPerSvgUnit,
        y: anchor.y + rawOffset.y * scaleMetersPerSvgUnit,
      },
      thresholdM,
      gridSizeM: SNAP_GRID_M,
      equipmentEdges: equipmentEdgeLines(
        placedEquipment.filter(included("equipment")).map((e) => ({
          x: e.xMeters,
          y: e.yMeters,
          widthM: e.widthM,
          depthM: e.depthM,
          rotationDeg: e.rotationDeg,
        })),
      ),
      alignmentLines: centerAlignmentLines([
        ...placedEquipment
          .filter(included("equipment"))
          .map((e) => ({ x: e.xMeters, y: e.yMeters })),
        ...safetyEquipment
          .filter(included("safety_equipment"))
          .map((s) => ({ x: s.xMeters, y: s.yMeters })),
      ]),
      polygonEdges: polygonEdgeLines(visibleSpacePolygons(dragged)),
    });
    if (!snap.x && !snap.y) return { offset: rawOffset, guides: null };
    return {
      offset: {
        x: snap.x ? (snap.x.value - anchor.x) / scaleMetersPerSvgUnit : rawOffset.x,
        y: snap.y ? (snap.y.value - anchor.y) / scaleMetersPerSvgUnit : rawOffset.y,
      },
      guides: {
        x: snap.x ? snap.x.value / scaleMetersPerSvgUnit : null,
        y: snap.y ? snap.y.value / scaleMetersPerSvgUnit : null,
      },
    };
  }

  /** Snap a draft Room/Area vertex (SVG units) to saved polygon vertices/grid. */
  function snapDraftPoint(p: Point): Point {
    const thresholdM = screenPxToMeters(SNAP_THRESHOLD_PX);
    if (thresholdM === null || !scaleMetersPerSvgUnit) return p;
    const snap = resolveSnap({
      candidate: { x: p.x * scaleMetersPerSvgUnit, y: p.y * scaleMetersPerSvgUnit },
      thresholdM,
      gridSizeM: SNAP_GRID_M,
      equipmentEdges: { xEdges: [], yEdges: [] },
      alignmentLines: { xEdges: [], yEdges: [] },
      polygonEdges: polygonEdgeLines(visibleSpacePolygons()),
    });
    return {
      x: snap.x ? snap.x.value / scaleMetersPerSvgUnit : p.x,
      y: snap.y ? snap.y.value / scaleMetersPerSvgUnit : p.y,
    };
  }

  /** Cursor/click (SVG units) within CLOSE_SNAP_PX of the draft's first vertex. */
  function isNearFirstVertex(p: Point): boolean {
    if (points.length < 3 || !scaleMetersPerSvgUnit) return false;
    const thresholdM = screenPxToMeters(CLOSE_SNAP_PX);
    if (thresholdM === null) return false;
    const scale = scaleMetersPerSvgUnit;
    return isNearPoint(
      { x: p.x * scale, y: p.y * scale },
      { x: points[0].x * scale, y: points[0].y * scale },
      thresholdM,
    );
  }

  // Drives only the first-vertex hover highlight; closing stays in handleClick.
  function handleOverlayMouseMove(e: MouseEvent<SVGSVGElement>) {
    if (
      canvasState !== "edit" ||
      (tool !== "room" && tool !== "area") ||
      spaceStep !== "drawing"
    ) {
      setFirstVertexHot(false);
      return;
    }
    const p = svgPointFromClick(e);
    setFirstVertexHot(p !== null && isNearFirstVertex(p));
  }

  // ── Undo stack (session-only) ──────────────────────────────────────────

  function pushUndo(entry: UndoEntry) {
    setUndoStack((s) => [...s, entry].slice(-UNDO_CAP));
    setRedoStack([]);
  }

  function undoLast() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry || isPending) return;
    setUndoStack((s) => s.slice(0, -1));
    startTransition(async () => {
      try {
        await entry.undo();
        setRedoStack((s) => [...s, entry]);
      } catch (err) {
        setUndoStack((s) => [...s, entry]); // failed — keep it retryable
        setError(err instanceof Error ? err.message : `Couldn't undo ${entry.label}.`);
      }
    });
  }

  function redoLast() {
    const entry = redoStack[redoStack.length - 1];
    if (!entry || isPending) return;
    setRedoStack((s) => s.slice(0, -1));
    startTransition(async () => {
      try {
        await entry.redo();
        setUndoStack((s) => [...s, entry].slice(-UNDO_CAP));
      } catch (err) {
        setRedoStack((s) => [...s, entry]);
        setError(err instanceof Error ? err.message : `Couldn't redo ${entry.label}.`);
      }
    });
  }

  /** Persisted (pre-resolution) label; "" means "clear back to type default". */
  function rawLabelOf(ref: ItemRef): string | undefined {
    if (ref.type === "room") return rooms.find((r) => r.id === ref.id)?.name;
    if (ref.type === "area") return areas.find((a) => a.id === ref.id)?.name;
    if (ref.type === "equipment") {
      const eq = placedEquipment.find((e) => e.id === ref.id);
      return eq ? (eq.label ?? "") : undefined;
    }
    const s = safetyEquipment.find((m) => m.id === ref.id);
    return s ? (s.label ?? "") : undefined;
  }

  /** Persisted color-or-null (null = default), not the resolved hex. */
  function rawColorOf(type: "room" | "area" | "equipment", id: string) {
    const list = type === "room" ? rooms : type === "area" ? areas : placedEquipment;
    const item = list.find((x) => x.id === id);
    return item ? item.rawColor : undefined;
  }

  function pushRotateUndo(id: string, before: number, after: number) {
    pushUndo({
      label: "rotate",
      undo: () => rotateEquipment(floorId, id, before),
      redo: () => rotateEquipment(floorId, id, after),
    });
  }

  function pushRenameUndo(ref: ItemRef, before: string, after: string) {
    pushUndo({
      label: "rename",
      undo: () => renameItem(floorId, ref.type, ref.id, before),
      redo: () => renameItem(floorId, ref.type, ref.id, after),
    });
  }

  function pushColorUndo(
    type: "room" | "area" | "equipment",
    id: string,
    before: string | null,
    after: string | null,
  ) {
    pushUndo({
      label: "recolor",
      undo: () => setItemColor(floorId, type, id, before),
      redo: () => setItemColor(floorId, type, id, after),
    });
  }

  function snapshotOf(ref: ItemRef): DeleteSnapshot | null {
    if (ref.type === "equipment") {
      const eq = placedEquipment.find((e) => e.id === ref.id);
      return eq
        ? {
            type: "equipment",
            typeId: eq.typeId,
            x: eq.xMeters,
            y: eq.yMeters,
            rotationDeg: normalizeRotation90(eq.rotationDeg),
            label: eq.label,
            color: eq.rawColor,
          }
        : null;
    }
    if (ref.type === "safety_equipment") {
      const s = safetyEquipment.find((m) => m.id === ref.id);
      return s
        ? {
            type: "safety_equipment",
            kind: s.kind as SafetyEquipmentKind,
            x: s.xMeters,
            y: s.yMeters,
            label: s.label,
          }
        : null;
    }
    const space = (ref.type === "room" ? rooms : areas).find((s) => s.id === ref.id);
    return space
      ? {
          type: ref.type,
          name: space.name,
          kind: space.kind,
          points: space.points,
          color: space.rawColor,
        }
      : null;
  }

  // Rebuilds an EQUIVALENT item — not the original row. Create actions mint a
  // fresh UUID, so the caller must adopt the returned id (accepted v1 tradeoff).
  async function recreateFromSnapshot(s: DeleteSnapshot): Promise<string> {
    if (s.type === "equipment") {
      const id = await placeEquipment(floorId, s.typeId, s.x, s.y);
      if (s.rotationDeg !== 0) await rotateEquipment(floorId, id, s.rotationDeg);
      if (s.label) await renameItem(floorId, "equipment", id, s.label);
      if (s.color) await setItemColor(floorId, "equipment", id, s.color);
      return id;
    }
    if (s.type === "safety_equipment") {
      const id = await placeSafetyEquipment(floorId, s.kind, s.x, s.y);
      if (s.label) await renameItem(floorId, "safety_equipment", id, s.label);
      return id;
    }
    const id = await createSpace(
      floorId,
      s.type,
      s.name,
      s.points,
      s.type === "area" ? s.kind : undefined,
    );
    if (s.color) await setItemColor(floorId, s.type, id, s.color);
    return id;
  }

  function pushDeleteUndo(refs: ItemRef[]) {
    const snapshots = refs
      .map(snapshotOf)
      .filter((s): s is DeleteSnapshot => s !== null);
    if (snapshots.length === 0) return;
    // Mutable on purpose: undo recreates under fresh ids, and redo must
    // delete the rows that undo actually created.
    let liveIds: { type: ItemRef["type"]; id: string }[] = refs.map((r) => ({
      type: r.type,
      id: r.id,
    }));
    pushUndo({
      label: "delete",
      undo: async () => {
        liveIds = await Promise.all(
          snapshots.map(async (s) => ({ type: s.type, id: await recreateFromSnapshot(s) })),
        );
      },
      redo: async () => {
        await Promise.all(liveIds.map((l) => deleteItem(floorId, l.type, l.id)));
      },
    });
  }

  // ── Selection model ────────────────────────────────────────────────────

  // Hit-test priority when items overlap: safety point → equipment rect →
  // area polygon → room polygon. Later-drawn items win within a type.
  function hitTestAt(p: Point): ItemRef | null {
    for (let i = safetyShapes.length - 1; i >= 0; i--) {
      const s = safetyShapes[i];
      if (Math.hypot(p.x - s.cx, p.y - s.cy) <= safetyRadius) {
        return { type: "safety_equipment", id: s.id };
      }
    }
    for (let i = equipmentShapes.length - 1; i >= 0; i--) {
      const r = equipmentShapes[i];
      const local = rotatePointAround(p, { x: r.cx, y: r.cy }, -r.rotationDeg);
      if (
        Math.abs(local.x - r.cx) <= r.width / 2 &&
        Math.abs(local.y - r.cy) <= r.height / 2
      ) {
        return { type: "equipment", id: r.id };
      }
    }
    for (let i = areaShapes.length - 1; i >= 0; i--) {
      if (pointInPolygon(p, areaShapes[i].pts)) return { type: "area", id: areaShapes[i].id };
    }
    for (let i = roomShapes.length - 1; i >= 0; i--) {
      if (pointInPolygon(p, roomShapes[i].pts)) return { type: "room", id: roomShapes[i].id };
    }
    return null;
  }

  /**
   * Outline/bbox points; safety markers are padded to their drawn circle.
   * Reads the unfiltered shapes so hidden items keep valid bounds (panel
   * select/center still works on them).
   */
  function itemBoundsPoints(ref: ItemRef): Point[] {
    if (ref.type === "equipment") {
      const r = allEquipmentShapes.find((s) => s.id === ref.id);
      if (!r) return [];
      return rotatedRectCorners({
        x: r.cx,
        y: r.cy,
        widthM: r.width,
        depthM: r.height,
        rotationDeg: r.rotationDeg,
      });
    }
    if (ref.type === "safety_equipment") {
      const s = allSafetyShapes.find((m) => m.id === ref.id);
      if (!s) return [];
      return [
        { x: s.cx - safetyRadius, y: s.cy - safetyRadius },
        { x: s.cx + safetyRadius, y: s.cy + safetyRadius },
      ];
    }
    const shape = (ref.type === "room" ? allRoomShapes : allAreaShapes).find(
      (s) => s.id === ref.id,
    );
    return shape ? shape.pts : [];
  }

  // Marquee selects only fully-enclosed items: every rotated Equipment corner,
  // every polygon vertex, the Safety Equipment point itself.
  function itemsFullyInside(rect: { minX: number; minY: number; maxX: number; maxY: number }) {
    const inside = (pts: Point[]) =>
      pts.length > 0 &&
      pts.every(
        (p) => p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY,
      );
    const out: ItemRef[] = [];
    for (const s of safetyShapes) {
      if (inside([{ x: s.cx, y: s.cy }])) out.push({ type: "safety_equipment", id: s.id });
    }
    for (const r of equipmentShapes) {
      const corners = rotatedRectCorners({
        x: r.cx,
        y: r.cy,
        widthM: r.width,
        depthM: r.height,
        rotationDeg: r.rotationDeg,
      });
      if (inside(corners)) out.push({ type: "equipment", id: r.id });
    }
    for (const a of areaShapes) {
      if (inside(a.pts)) out.push({ type: "area", id: a.id });
    }
    for (const r of roomShapes) {
      if (inside(r.pts)) out.push({ type: "room", id: r.id });
    }
    return out;
  }

  const selectedItems: SelectedItem[] = useMemo(() => {
    return selection.flatMap((ref): SelectedItem[] => {
      if (ref.type === "equipment") {
        const s = allEquipmentShapes.find((e) => e.id === ref.id);
        return s
          ? [{ type: ref.type, id: ref.id, label: s.label, rotationDeg: s.rotationDeg }]
          : [];
      }
      if (ref.type === "safety_equipment") {
        const s = allSafetyShapes.find((m) => m.id === ref.id);
        return s ? [{ type: ref.type, id: ref.id, label: s.label }] : [];
      }
      const shape = (ref.type === "room" ? allRoomShapes : allAreaShapes).find(
        (s) => s.id === ref.id,
      );
      return shape ? [{ type: ref.type, id: ref.id, label: shape.name }] : [];
    });
  }, [selection, allEquipmentShapes, allSafetyShapes, allRoomShapes, allAreaShapes]);

  // ── Layer panel (Edit mode) ────────────────────────────────────────────

  // Unfiltered on purpose: the panel is the UI for toggling visibility, so
  // hidden items must not disappear from it. Labels resolve exactly as the
  // canvas draws them (item label if set, else type/kind default).
  const layerRows = useMemo(
    () => ({
      rooms: rooms.map((r) => ({ id: r.id, label: r.name })),
      areas: areas.map((a) => ({ id: a.id, label: a.name })),
      equipment: placedEquipment.map((e) => ({ id: e.id, label: e.label ?? e.typeName })),
      safety: safetyEquipment.map((s) => ({
        id: s.id,
        label: s.label ?? SAFETY_KINDS.find((k) => k.kind === s.kind)?.label ?? s.kind,
      })),
    }),
    [rooms, areas, placedEquipment, safetyEquipment],
  );

  function centerViewOn(ref: ItemRef) {
    const pts = itemBoundsPoints(ref);
    const svg = overlayRef.current;
    const vp = viewportRef.current;
    if (pts.length === 0 || !svg || !vp) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const box = bboxOf(pts);
    const pt = svg.createSVGPoint();
    pt.x = (box.minX + box.maxX) / 2;
    pt.y = (box.minY + box.maxY) / 2;
    const screen = pt.matrixTransform(ctm);
    const rect = vp.getBoundingClientRect();
    // Pan by the screen-space delta that puts the item center mid-viewport.
    setViewTransform((v) => ({
      ...v,
      panX: v.panX + (rect.left + rect.width / 2 - screen.x),
      panY: v.panY + (rect.top + rect.height / 2 - screen.y),
    }));
  }

  function selectFromPanel(ref: ItemRef, centerOnCanvas: boolean) {
    setSelection([ref]);
    if (centerOnCanvas) centerViewOn(ref);
  }

  function renameFromPanel(ref: ItemRef, newLabel: string) {
    const before = rawLabelOf(ref);
    startTransition(async () => {
      try {
        await renameItem(floorId, ref.type, ref.id, newLabel);
        if (before !== undefined) pushRenameUndo(ref, before, newLabel);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't rename the item.");
      }
    });
  }

  function toggleItemVisibility(ref: ItemRef) {
    const key = itemKey(ref);
    const next = new Set(hiddenIds);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      // A freshly-hidden item shouldn't linger in the selection.
      setSelection((sel) => sel.filter((s) => !sameRef(s, ref)));
    }
    onHiddenIdsChange(next);
  }

  function toggleFolderVisibility(type: ItemRef["type"]) {
    const rows =
      type === "room"
        ? layerRows.rooms
        : type === "area"
          ? layerRows.areas
          : type === "equipment"
            ? layerRows.equipment
            : layerRows.safety;
    const keys = rows.map((row) => itemKey({ type, id: row.id }));
    const next = new Set(hiddenIds);
    const allHidden = keys.length > 0 && keys.every((k) => next.has(k));
    if (allHidden) {
      for (const k of keys) next.delete(k);
    } else {
      for (const k of keys) next.add(k);
      setSelection((sel) => sel.filter((s) => s.type !== type));
    }
    onHiddenIdsChange(next);
  }

  function moveOffsetFor(ref: ItemRef): Point | null {
    if (!activeMove) return null;
    return activeMove.items.some((i) => sameRef(i, ref)) ? activeMove.offset : null;
  }

  function moveTransformFor(ref: ItemRef): string | undefined {
    const o = moveOffsetFor(ref);
    return o ? `translate(${o.x} ${o.y})` : undefined;
  }

  // ── Select tool gestures (click / shift+click / drag-move / marquee) ───

  function handleOverlayPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (canvasState !== "edit" || tool !== "select" || e.button !== 0) return;
    const p = svgPointFromClient(e.clientX, e.clientY);
    if (!p) return;
    const hit = hitTestAt(p);
    if (hit && e.shiftKey) {
      setSelection((sel) =>
        sel.some((s) => sameRef(s, hit)) ? sel.filter((s) => !sameRef(s, hit)) : [...sel, hit],
      );
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const startClient = { x: e.clientX, y: e.clientY };
    if (hit) {
      const inSelection = selection.some((s) => sameRef(s, hit));
      const dragSet = inSelection ? selection : [hit];
      if (!inSelection) setSelection([hit]);
      selectGestureRef.current = {
        kind: "move",
        pointerId: e.pointerId,
        start: p,
        startClient,
        item: hit,
        dragSet,
        moved: false,
      };
    } else {
      selectGestureRef.current = {
        kind: "marquee",
        pointerId: e.pointerId,
        start: p,
        startClient,
        moved: false,
      };
    }
  }

  function handleOverlayPointerMove(e: PointerEvent<SVGSVGElement>) {
    const g = selectGestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    if (
      !g.moved &&
      Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    g.moved = true;
    const p = svgPointFromClient(e.clientX, e.clientY);
    if (!p) return;
    if (g.kind === "move") {
      // Alt = free move; otherwise the offset runs through the same
      // resolveSnappedOffset that commitMove uses.
      const { offset, guides } = resolveSnappedOffset(
        g.dragSet,
        g.item,
        { x: p.x - g.start.x, y: p.y - g.start.y },
        e.altKey,
      );
      setActiveMove({ items: g.dragSet, offset });
      setSnapGuides(guides);
    } else {
      setMarquee({ start: g.start, end: p });
    }
  }

  function handleOverlayPointerUp(e: PointerEvent<SVGSVGElement>) {
    const g = selectGestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    selectGestureRef.current = null;
    const p = svgPointFromClient(e.clientX, e.clientY);
    if (g.kind === "move") {
      setSnapGuides(null);
      if (g.moved && p) {
        commitMove(g.dragSet, g.item, { x: p.x - g.start.x, y: p.y - g.start.y }, e.altKey);
      } else {
        setActiveMove(null);
        // Plain click on an already-multi-selected item collapses to it.
        setSelection([g.item]);
      }
      return;
    }
    setMarquee(null);
    if (!g.moved || !p) {
      setSelection([]);
      return;
    }
    const rect = bboxOf([g.start, p]);
    setSelection(itemsFullyInside(rect));
  }

  function handleOverlayPointerCancel() {
    selectGestureRef.current = null;
    setActiveMove(null);
    setMarquee(null);
    setSnapGuides(null);
  }

  // Re-resolves the snap from the final pointer position via the shared
  // resolveSnappedOffset (never trusts the last preview frame), persists, and
  // records before/after for undo. moveItem/moveSpace stay snap-agnostic.
  function commitMove(
    items: ItemRef[],
    anchorRef: ItemRef,
    rawOffset: Point,
    snapDisabled: boolean,
  ) {
    if (!scaleMetersPerSvgUnit) {
      setActiveMove(null);
      return;
    }
    const { offset } = resolveSnappedOffset(items, anchorRef, rawOffset, snapDisabled);
    setActiveMove({ items, offset });
    const dxM = offset.x * scaleMetersPerSvgUnit;
    const dyM = offset.y * scaleMetersPerSvgUnit;
    const pointMoves: {
      type: "equipment" | "safety_equipment";
      id: string;
      before: Point;
      after: Point;
    }[] = [];
    const spaceMoves: {
      type: "room" | "area";
      id: string;
      before: Point[];
      after: Point[];
    }[] = [];
    for (const ref of items) {
      if (ref.type === "equipment" || ref.type === "safety_equipment") {
        const item =
          ref.type === "equipment"
            ? placedEquipment.find((x) => x.id === ref.id)
            : safetyEquipment.find((x) => x.id === ref.id);
        if (item) {
          pointMoves.push({
            type: ref.type,
            id: ref.id,
            before: { x: item.xMeters, y: item.yMeters },
            after: { x: item.xMeters + dxM, y: item.yMeters + dyM },
          });
        }
      } else {
        const space = (ref.type === "room" ? rooms : areas).find((x) => x.id === ref.id);
        if (space) {
          spaceMoves.push({
            type: ref.type,
            id: ref.id,
            before: space.points,
            after: space.points.map((pt) => ({ x: pt.x + dxM, y: pt.y + dyM })),
          });
        }
      }
    }
    const apply = (which: "before" | "after") =>
      Promise.all([
        ...pointMoves.map((m) => moveItem(floorId, m.type, m.id, m[which].x, m[which].y)),
        ...spaceMoves.map((m) => moveSpace(floorId, m.type, m.id, m[which])),
      ]);
    startTransition(async () => {
      try {
        await apply("after");
        if (pointMoves.length + spaceMoves.length > 0) {
          pushUndo({
            label: "move",
            undo: async () => {
              await apply("before");
            },
            redo: async () => {
              await apply("after");
            },
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't move the selection.");
      } finally {
        setActiveMove(null);
      }
    });
  }

  function rotateSelectedEquipment(direction: RotationDirection = "cw") {
    const item =
      selectedItems.length === 1 && selectedItems[0].type === "equipment"
        ? selectedItems[0]
        : null;
    if (!item) return;
    const before = normalizeRotation90(item.rotationDeg ?? 0);
    const next = rotate90(before, direction);
    startTransition(async () => {
      try {
        await rotateEquipment(floorId, item.id, next);
        pushRotateUndo(item.id, before, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't rotate the Equipment.");
      }
    });
  }

  function deleteSelection() {
    if (selectedItems.length === 0) return;
    const refs: ItemRef[] = selectedItems.map((i) => ({ type: i.type, id: i.id }));
    startTransition(async () => {
      try {
        await Promise.all(refs.map((r) => deleteItem(floorId, r.type, r.id)));
        pushDeleteUndo(refs);
        setSelection([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete the selection.");
      }
    });
  }

  // ── Pan/zoom (Edit mode only) ──────────────────────────────────────────

  function handleViewportPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (canvasState !== "edit" || e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    panDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX0: viewTransform.panX,
      panY0: viewTransform.panY,
    };
  }

  function handleViewportPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = panDragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    setViewTransform((v) => ({
      ...v,
      panX: d.panX0 + (e.clientX - d.startX),
      panY: d.panY0 + (e.clientY - d.startY),
    }));
  }

  function handleViewportPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (panDragRef.current?.pointerId === e.pointerId) panDragRef.current = null;
  }

  // Wheel-to-zoom-at-cursor. Native listener because React registers wheel
  // as passive, which blocks preventDefault (needed to stop page scroll).
  useEffect(() => {
    if (canvasState !== "edit") return;
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setViewTransform((v) => {
        const zoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, v.zoom * Math.exp(-e.deltaY * 0.0015)),
        );
        // Keep the plan point under the cursor stationary through the zoom.
        const cx = (sx - v.panX) / v.zoom;
        const cy = (sy - v.panY) / v.zoom;
        return { zoom, panX: sx - cx * zoom, panY: sy - cy * zoom };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canvasState]);

  function handleOverlayDoubleClick(e: MouseEvent<SVGSVGElement>) {
    if (canvasState !== "edit" || tool !== "select") return;
    const p = svgPointFromClick(e);
    if (!p || hitTestAt(p)) return;
    // Identity transform == fit-to-plan-bounds (the un-zoomed CSS layout).
    setViewTransform({ zoom: 1, panX: 0, panY: 0 });
  }

  // ── Keyboard shortcuts (Edit mode) ─────────────────────────────────────

  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleEscape();
        return;
      }
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redoLast();
        else undoLast();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redoLast();
        return;
      }
      if (e.key === "r" || e.key === "R") {
        if (selectedItems.length === 1 && selectedItems[0].type === "equipment") {
          e.preventDefault();
          // e.key is uppercase whenever Shift is held, regardless of Caps
          // Lock, so check e.shiftKey directly to tell R from Shift+R.
          rotateSelectedEquipment(e.shiftKey ? "ccw" : "cw");
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedItems.length > 0) {
          e.preventDefault();
          deleteSelection();
        }
      }
    };
  });

  useEffect(() => {
    if (canvasState !== "edit") return;
    const fn = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [canvasState]);

  // Native "leave site?" prompt while a Room/Area draft is in progress.
  useEffect(() => {
    if (!hasUnsavedDraft) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedDraft]);

  // ── Ruler mapping (Edit mode, tracks pan/zoom and window resizes) ──────

  useEffect(() => {
    if (canvasState !== "edit") {
      setRulerMap(null);
      return;
    }
    const measure = () => {
      const svg = overlayRef.current;
      const vp = viewportRef.current;
      if (!svg || !vp) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const rect = vp.getBoundingClientRect();
      // ctm.a = screen px per SVG unit; ctm.e/f = client position of SVG (0,0).
      setRulerMap({
        pxPerSvgUnit: ctm.a,
        originX: ctm.e - rect.left,
        originY: ctm.f - rect.top,
        width: rect.width,
        height: rect.height,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [canvasState, viewTransform]);

  // ── Floating toolbar position (screen coords, tracks pan/zoom) ─────────

  useEffect(() => {
    if (
      canvasState !== "edit" ||
      selectedItems.length === 0 ||
      marquee !== null ||
      activeMove !== null
    ) {
      setToolbarPos(null);
      return;
    }
    const svg = overlayRef.current;
    const vp = viewportRef.current;
    if (!svg || !vp) {
      setToolbarPos(null);
      return;
    }
    const allPts = selectedItems.flatMap((item) =>
      itemBoundsPoints({ type: item.type, id: item.id }),
    );
    if (allPts.length === 0) {
      setToolbarPos(null);
      return;
    }
    const box = bboxOf(allPts);
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = (box.minX + box.maxX) / 2;
    pt.y = box.minY;
    const screen = pt.matrixTransform(ctm);
    const rect = vp.getBoundingClientRect();
    setToolbarPos({ left: screen.x - rect.left, top: screen.y - rect.top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasState, selectedItems, marquee, activeMove, viewTransform]);

  // ── Render ─────────────────────────────────────────────────────────────

  const isCalibrating = canvasState === "edit" && tool === "calibrate";
  const isDrawingSpace = canvasState === "edit" && (tool === "room" || tool === "area");
  const spaceLabel = tool === "room" ? "Room" : "Area";

  const zoom = viewTransform.zoom;
  const selectionStroke = viewBoxWidth / 450 / zoom;
  const handleSize = viewBoxWidth / 110 / zoom;

  const toolButtonClass = (active: boolean) =>
    `rounded-sm border px-2.5 py-1 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
      active
        ? "border-[var(--color-signal)] bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
        : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
    }`;

  return (
    <div className="w-full max-w-4xl">
      {canvasState === "view" ? (
        <div className="mb-3 flex justify-end">
          {/* A future auth gate hides just this button (ADR-0007: no auth yet). */}
          <button
            type="button"
            onClick={enterEditMode}
            className={toolButtonClass(false)}
          >
            Edit floor plan
          </button>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirmDiscardDraft()) resetToolState();
            }}
            className={toolButtonClass(tool === "select")}
          >
            Select
          </button>
          <span className="mx-1 text-[var(--color-grid)]">|</span>
          {equipmentTypes.length > 0 && (
            <ToolbarGroupMenu
              label="Equipment"
              active={tool === "equipment"}
              disabled={!scaleMetersPerSvgUnit}
              buttonClassName={toolButtonClass}
            >
              {(close) =>
                equipmentTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!scaleMetersPerSvgUnit}
                    onClick={() => {
                      toggleArmedType(t.id);
                      close();
                    }}
                    title={
                      scaleMetersPerSvgUnit
                        ? `${t.widthM}m x ${t.depthM}m x ${t.heightM}m`
                        : "Calibrate the Floor's scale first"
                    }
                    className={toolButtonClass(tool === "equipment" && armedTypeId === t.id)}
                  >
                    + {t.name}
                  </button>
                ))
              }
            </ToolbarGroupMenu>
          )}
          <ToolbarGroupMenu
            label="Draw"
            active={tool === "room" || tool === "area"}
            disabled={!scaleMetersPerSvgUnit}
            buttonClassName={toolButtonClass}
          >
            {(close) =>
              (["room", "area"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!scaleMetersPerSvgUnit}
                  onClick={() => {
                    startDrawingSpace(kind);
                    close();
                  }}
                  className={`${toolButtonClass(tool === kind)} w-full text-left capitalize`}
                >
                  ▱ Draw {kind}
                </button>
              ))
            }
          </ToolbarGroupMenu>
          <ToolbarGroupMenu
            label="Safety"
            active={tool === "safety"}
            disabled={!scaleMetersPerSvgUnit}
            buttonClassName={toolButtonClass}
          >
            {(close) =>
              SAFETY_KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!scaleMetersPerSvgUnit}
                  onClick={() => {
                    toggleArmedKind(kind);
                    close();
                  }}
                  className={`${toolButtonClass(tool === "safety" && armedKind === kind)} w-full text-left`}
                >
                  {kind === "exit" ? (
                    <span
                      className="mr-1.5 inline-block rounded-[2px] px-1 py-0.5 align-middle text-[9px] font-bold text-white"
                      style={{ backgroundColor: EXIT_GREEN }}
                    >
                      EXIT
                    </span>
                  ) : (
                    "● "
                  )}
                  {label}
                </button>
              ))
            }
          </ToolbarGroupMenu>
          <span className="mx-1 text-[var(--color-grid)]">|</span>
          <button
            type="button"
            onClick={startCalibration}
            className={toolButtonClass(tool === "calibrate")}
          >
            {scaleMetersPerSvgUnit ? "Recalibrate" : "Calibrate scale"}
          </button>
          <button
            type="button"
            onClick={undoLast}
            disabled={undoStack.length === 0 || isPending}
            title="Undo (Ctrl+Z)"
            className={`${toolButtonClass(false)} ml-auto`}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redoLast}
            disabled={redoStack.length === 0 || isPending}
            title="Redo (Ctrl+Shift+Z)"
            className={toolButtonClass(false)}
          >
            Redo
          </button>
          <button
            type="button"
            onClick={exitEditMode}
            className="rounded-sm bg-[var(--color-ink)] px-3 py-1 font-mono text-xs text-[var(--color-paper)]"
          >
            Done
          </button>
        </div>
      )}

      <div className="relative rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4 shadow-sm">
        <CornerMarks />

        {canvasState === "view" && (
          <p className="mb-2 font-mono text-xs text-[var(--color-ink-soft)]">
            Click a Room, Area, Equipment, or Safety Equipment marker to report an issue.
          </p>
        )}

        {routePpeAreas.length > 0 && (
          <p className="mb-2 font-mono text-xs text-[var(--color-signal)]">
            PPE required: {routePpeAreas.join(", ")}
          </p>
        )}

        <div className="flex items-start gap-3">
        {canvasState === "edit" && (
          <LayerPanel
            rooms={layerRows.rooms}
            areas={layerRows.areas}
            equipment={layerRows.equipment}
            safetyEquipment={layerRows.safety}
            selection={selection}
            hiddenIds={hiddenIds}
            onSelect={selectFromPanel}
            onRename={renameFromPanel}
            onToggleVisibility={toggleItemVisibility}
            onToggleFolderVisibility={toggleFolderVisibility}
          />
        )}
        <div
          ref={viewportRef}
          className={`relative min-w-0 flex-1 overflow-hidden ${canvasState === "edit" ? "touch-none" : ""}`}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={handleViewportPointerUp}
          onMouseDown={(e) => {
            // Middle-click autoscroll fires on mousedown; pointerdown can't stop it.
            if (canvasState === "edit" && e.button === 1) e.preventDefault();
          }}
        >
          <div
            style={{
              transform: `translate(${viewTransform.panX}px, ${viewTransform.panY}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <div
              className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[70vh] [&_svg]:w-full [&_svg_path]:!stroke-[var(--color-ink)]"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
            <svg
              ref={overlayRef}
              viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
              onClick={handleClick}
              onDoubleClick={handleOverlayDoubleClick}
              onMouseMove={handleOverlayMouseMove}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              onPointerCancel={handleOverlayPointerCancel}
              className={`absolute inset-0 mx-auto h-auto max-h-[70vh] w-full ${
                canvasState === "edit"
                  ? tool === "select"
                    ? ""
                    : "cursor-crosshair"
                  : "pointer-events-none"
              }`}
            >
              {roomShapes.map((r) => (
                <g
                  key={r.id}
                  transform={moveTransformFor({ type: "room", id: r.id })}
                  {...subjectClickProps("room", r.id, r.name)}
                >
                  <polygon
                    points={r.poly}
                    fill={r.color}
                    fillOpacity={0.12}
                    stroke={r.color}
                    strokeWidth={viewBoxWidth / 500}
                  />
                  <text
                    x={r.cx}
                    y={r.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={viewBoxWidth / 55}
                    fill="var(--color-ink)"
                    className="select-none font-mono"
                  >
                    {r.name}
                  </text>
                </g>
              ))}
              {areaShapes.map((a) => (
                <g
                  key={a.id}
                  transform={moveTransformFor({ type: "area", id: a.id })}
                  {...subjectClickProps("area", a.id, a.name)}
                >
                  <polygon
                    points={a.poly}
                    fill={a.color}
                    fillOpacity={0.12}
                    stroke={a.color}
                    strokeWidth={viewBoxWidth / 500}
                    strokeDasharray={`${viewBoxWidth / 150} ${viewBoxWidth / 250}`}
                  />
                  <text
                    x={a.cx}
                    y={a.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={viewBoxWidth / 55}
                    fill="var(--color-ink-soft)"
                    className="select-none font-mono"
                  >
                    {a.name}
                  </text>
                </g>
              ))}

              {equipmentShapes.map((r) => (
                <g
                  key={r.id}
                  transform={moveTransformFor({ type: "equipment", id: r.id })}
                  {...subjectClickProps("equipment", r.id, r.label)}
                >
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    transform={svgRotateTransform({
                      x: r.cx,
                      y: r.cy,
                      rotationDeg: r.rotationDeg,
                    })}
                    fill={r.color}
                    fillOpacity={0.2}
                    stroke={r.color}
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

              {safetyShapes.map((s) =>
                s.kind === "exit" ? (
                  <g
                    key={s.id}
                    transform={moveTransformFor({ type: "safety_equipment", id: s.id })}
                    {...subjectClickProps("safety_equipment", s.id, s.label)}
                  >
                    <rect
                      x={s.cx - safetyRadius * 1.6}
                      y={s.cy - safetyRadius * 0.9}
                      width={safetyRadius * 3.2}
                      height={safetyRadius * 1.8}
                      rx={viewBoxWidth / 700}
                      fill={EXIT_GREEN}
                    />
                    <text
                      x={s.cx}
                      y={s.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={viewBoxWidth / 190}
                      fill="#ffffff"
                      className="select-none font-mono font-bold"
                    >
                      EXIT
                    </text>
                  </g>
                ) : (
                  <g
                    key={s.id}
                    transform={moveTransformFor({ type: "safety_equipment", id: s.id })}
                    {...subjectClickProps("safety_equipment", s.id, s.label)}
                  >
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
                ),
              )}

              {routeSvgPoints && (
                <polyline
                  points={routeSvgPoints}
                  fill="none"
                  stroke="#0891b2"
                  strokeWidth={viewBoxWidth / 300}
                  strokeDasharray={`${viewBoxWidth / 100} ${viewBoxWidth / 200}`}
                />
              )}

              {isCalibrating && (
                <>
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
                  {points.map((p, i) => {
                    // First vertex grows/recolors when the cursor is close
                    // enough that a click would close the ring.
                    const closeTarget = i === 0 && points.length >= 3 && firstVertexHot;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={closeTarget ? markerRadius * 1.6 : markerRadius}
                        fill={closeTarget ? SELECTION_COLOR : "var(--color-signal)"}
                      />
                    );
                  })}
                </>
              )}

              {canvasState === "edit" &&
                selection.map((ref) => {
                  const pts = itemBoundsPoints(ref);
                  if (pts.length === 0) return null;
                  const box = bboxOf(pts);
                  const corners: [number, number][] = [
                    [box.minX, box.minY],
                    [box.maxX, box.minY],
                    [box.maxX, box.maxY],
                    [box.minX, box.maxY],
                  ];
                  return (
                    <g
                      key={`sel-${ref.type}-${ref.id}`}
                      pointerEvents="none"
                      transform={moveTransformFor(ref)}
                    >
                      <rect
                        x={box.minX}
                        y={box.minY}
                        width={box.maxX - box.minX}
                        height={box.maxY - box.minY}
                        fill="none"
                        stroke={SELECTION_COLOR}
                        strokeWidth={selectionStroke}
                      />
                      {/* Corner handles are visual-only in v1 — no vertex/resize drag. */}
                      {corners.map(([hx, hy], i) => (
                        <rect
                          key={i}
                          x={hx - handleSize / 2}
                          y={hy - handleSize / 2}
                          width={handleSize}
                          height={handleSize}
                          fill="var(--color-panel)"
                          stroke={SELECTION_COLOR}
                          strokeWidth={selectionStroke}
                        />
                      ))}
                    </g>
                  );
                })}

              {/* Issue-subject highlight (from the Issues panel). Always
                  visible regardless of canvasState; same visual approach as
                  the edit selection outline but read-only — no corner
                  handles, never feeds edit interactions. */}
              {highlightRef &&
                (() => {
                  const pts = itemBoundsPoints(highlightRef);
                  if (pts.length === 0) return null;
                  const box = bboxOf(pts);
                  return (
                    <rect
                      x={box.minX}
                      y={box.minY}
                      width={box.maxX - box.minX}
                      height={box.maxY - box.minY}
                      fill="none"
                      stroke={SELECTION_COLOR}
                      strokeWidth={selectionStroke}
                      pointerEvents="none"
                    />
                  );
                })()}

              {marquee && (
                <rect
                  x={Math.min(marquee.start.x, marquee.end.x)}
                  y={Math.min(marquee.start.y, marquee.end.y)}
                  width={Math.abs(marquee.end.x - marquee.start.x)}
                  height={Math.abs(marquee.end.y - marquee.start.y)}
                  fill={SELECTION_COLOR}
                  fillOpacity={0.08}
                  stroke={SELECTION_COLOR}
                  strokeWidth={selectionStroke}
                  strokeDasharray="4 3"
                  pointerEvents="none"
                />
              )}

              {/* Per-axis guide lines while a drag-snap is engaged. */}
              {snapGuides?.x != null && (
                <line
                  x1={snapGuides.x}
                  y1={0}
                  x2={snapGuides.x}
                  y2={viewBoxHeight}
                  stroke={SELECTION_COLOR}
                  strokeWidth={selectionStroke}
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
              )}
              {snapGuides?.y != null && (
                <line
                  x1={0}
                  y1={snapGuides.y}
                  x2={viewBoxWidth}
                  y2={snapGuides.y}
                  stroke={SELECTION_COLOR}
                  strokeWidth={selectionStroke}
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>
          {canvasState === "edit" && (
            <RulerOverlay
              map={rulerMap}
              scaleMetersPerSvgUnit={scaleMetersPerSvgUnit}
              onCalibrate={startCalibration}
            />
          )}
          <FloorPicker floors={floors} currentFloorId={floorId} />
          {toolbarPos && selectedItems.length > 0 && (
            <FloatingToolbar
              floorId={floorId}
              items={selectedItems}
              position={toolbarPos}
              onDeleted={() => {
                // Callback closures see pre-mutation props, so snapshots for
                // undo-of-delete still resolve here.
                pushDeleteUndo(selection);
                setSelection([]);
              }}
              onError={setError}
              onRotated={(item, nextDeg) =>
                pushRotateUndo(item.id, normalizeRotation90(item.rotationDeg ?? 0), nextDeg)
              }
              onRenamed={(item, value) => {
                const ref: ItemRef = { type: item.type, id: item.id };
                const before = rawLabelOf(ref);
                if (before !== undefined) pushRenameUndo(ref, before, value);
              }}
              onColorApplied={(item, color) => {
                if (item.type === "safety_equipment") return;
                const before = rawColorOf(item.type, item.id);
                if (before !== undefined) pushColorUndo(item.type, item.id, before, color);
              }}
            />
          )}
        </div>
        </div>

        {isCalibrating ? (
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
                  {points.length >= 3 && " Click the first point to close."}
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
                    placeholder={tool === "room" ? "Room 101" : "Loading dock walkway"}
                    className="w-56 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                  />
                  {tool === "area" && (
                    <select
                      value={spaceKind}
                      onChange={(e) => setSpaceKind(e.target.value as AreaKind)}
                      className="rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                    >
                      {AREA_KINDS.map(({ kind, label }) => (
                        <option key={kind} value={kind}>
                          {label}
                        </option>
                      ))}
                    </select>
                  )}
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
              {canvasState === "edit" && (tool === "equipment" || tool === "safety") && (
                <span className="ml-3 text-[var(--color-signal)]">
                  click the plan to place
                </span>
              )}
            </span>
            <span>{floorName}</span>
          </div>
        )}
        {canvasState === "edit" &&
          (tool === "equipment" || tool === "safety" || tool === "select") &&
          error && (
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

function formatMeters(m: number) {
  // toFixed then Number strips float noise (0.30000000000000004 → 0.3).
  return `${Number(m.toFixed(2))}`;
}

/**
 * Edit-mode graduated edge rulers (top/left) plus a map-style scale bar,
 * driven by pickNiceInterval at the current zoom. When the floor isn't
 * calibrated, both degrade to clickable "Not calibrated" indicators that
 * start the calibrate tool.
 */
function RulerOverlay({
  map,
  scaleMetersPerSvgUnit,
  onCalibrate,
}: {
  map: {
    pxPerSvgUnit: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null;
  scaleMetersPerSvgUnit: number | null;
  onCalibrate: () => void;
}) {
  const badge =
    "pointer-events-auto rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)]/90 " +
    "px-2 py-0.5 font-mono text-xs text-[var(--color-signal)] hover:border-[var(--color-signal)]";

  if (!scaleMetersPerSvgUnit) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 font-mono text-xs">
        <button type="button" onClick={onCalibrate} className={`${badge} absolute left-2 top-2`}>
          Not calibrated — set scale
        </button>
        <button
          type="button"
          onClick={onCalibrate}
          className={`${badge} absolute bottom-2 left-2`}
        >
          Not calibrated
        </button>
      </div>
    );
  }
  if (!map) return null;

  const pxPerMeter = map.pxPerSvgUnit / scaleMetersPerSvgUnit;
  if (!Number.isFinite(pxPerMeter) || pxPerMeter <= 0) return null;
  const interval = pickNiceInterval(pxPerMeter, RULER_MIN_TICK_PX);
  const stepPx = interval * pxPerMeter;
  if (stepPx < 8) return null; // extreme zoom-out fallback: skip unreadable ticks

  const ticks = (originPx: number, sizePx: number) => {
    const out: { pos: number; meters: number }[] = [];
    const first = Math.ceil((RULER_SIZE_PX - originPx) / stepPx);
    const last = Math.floor((sizePx - originPx) / stepPx);
    for (let k = first; k <= last; k++) {
      out.push({ pos: originPx + k * stepPx, meters: k * interval });
    }
    return out;
  };
  const topTicks = ticks(map.originX, map.width);
  const leftTicks = ticks(map.originY, map.height);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 select-none font-mono text-xs text-[var(--color-ink-soft)]"
    >
      <div
        className="absolute inset-x-0 top-0 border-b border-[var(--color-grid)] bg-[var(--color-panel)]/80"
        style={{ height: RULER_SIZE_PX }}
      />
      <div
        className="absolute left-0 border-r border-[var(--color-grid)] bg-[var(--color-panel)]/80"
        style={{ top: RULER_SIZE_PX, bottom: 0, width: RULER_SIZE_PX }}
      />
      {topTicks.map((t) => (
        <span key={`x${t.meters}`}>
          <span
            className="absolute w-px bg-[var(--color-grid)]"
            style={{ left: t.pos, top: RULER_SIZE_PX - 6, height: 6 }}
          />
          <span
            className="absolute text-[9px] leading-none"
            style={{ left: t.pos + 3, top: 3 }}
          >
            {formatMeters(t.meters)}
          </span>
        </span>
      ))}
      {leftTicks.map((t) => (
        <span key={`y${t.meters}`}>
          <span
            className="absolute h-px bg-[var(--color-grid)]"
            style={{ top: t.pos, left: RULER_SIZE_PX - 6, width: 6 }}
          />
          <span
            className="absolute origin-top-left -rotate-90 text-[9px] leading-none"
            style={{ left: 3, top: t.pos - 3 }}
          >
            {formatMeters(t.meters)}
          </span>
        </span>
      ))}
      {/* Scale bar: one picked-interval length, live with zoom. */}
      <div className="absolute bottom-2 flex flex-col gap-0.5" style={{ left: RULER_SIZE_PX + 8 }}>
        <span className="text-[10px] leading-none">{formatMeters(interval)} m</span>
        <span
          className="h-1.5 border-x-2 border-b-2 border-[var(--color-ink-soft)]"
          style={{ width: stepPx }}
        />
      </div>
    </div>
  );
}

/**
 * A single toolbar entry that reveals a group of related actions on click —
 * keeps the top strip shallow (strip -> group -> item, 2 clicks to any
 * grouped action) instead of one button per item.
 */
function ToolbarGroupMenu({
  label,
  active,
  disabled,
  buttonClassName,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  buttonClassName: (active: boolean) => string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        // Above the backdrop (z-30) so re-clicking the trigger toggles the
        // menu closed instead of the backdrop swallowing the click.
        className={`relative z-40 ${buttonClassName(active || open)}`}
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 flex flex-col items-start gap-1 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-2 whitespace-nowrap shadow-sm">
            {children(() => setOpen(false))}
          </div>
        </>
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

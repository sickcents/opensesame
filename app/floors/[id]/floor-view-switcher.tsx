"use client";

import { useMemo, useState } from "react";
import type { FloorPickerFloor } from "@/app/components/floor-picker";
import { effectiveColor, EQUIPMENT_DEFAULT_COLOR } from "@/lib/color-palette";
import type { AreaKind } from "./actions";
import { FloorPlanCanvas } from "./floor-plan-canvas";
import Floor3DView from "./floor-3d-view-loader";
import type { ItemRef } from "./layer-panel";

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
  typeId: string;
  xMeters: number;
  yMeters: number;
  rotationDeg: number;
  label: string | null;
  color: string | null;
  typeName: string;
  widthM: number;
  depthM: number;
  heightM: number;
};

type Space = {
  id: string;
  name: string;
  points: Point[];
  color: string | null;
  kind?: AreaKind; // areas only
};
type SafetyEquipmentItem = {
  id: string;
  kind: string;
  xMeters: number;
  yMeters: number;
  label: string | null;
};

export function FloorViewSwitcher(props: {
  floorId: string;
  floorName: string;
  floors: FloorPickerFloor[];
  svgMarkup: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  scaleMetersPerSvgUnit: number | null;
  floorWidthM: number | null;
  floorHeightM: number | null;
  equipmentTypes: EquipmentType[];
  placedEquipment: PlacedEquipment[];
  rooms: Space[];
  areas: Space[];
  safetyEquipment: SafetyEquipmentItem[];
  routeWaypoints: Point[] | null;
  routePpeAreas: string[];
  // Issue-subject highlight owned by FloorWorkspace; read-only for both views.
  highlightRef?: ItemRef | null;
}) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  // Session-only visibility, keyed `${type}:${id}` (layer-panel itemKey).
  // Lives here — the one place both views branch from — so 2D and 3D can
  // never disagree about what's hidden.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const { floorWidthM, floorHeightM, highlightRef, ...rest } = props;
  const canShow3D = !!floorWidthM && !!floorHeightM;

  // Single effectiveColor resolution point: both views receive final hex
  // strings, never raw color-or-null, so 2D and 3D fills can't diverge.
  // rawColor keeps the persisted value (null = default) alongside — the
  // Edit-mode undo stack restores that, not the resolved hex.
  const resolvedRooms = useMemo(
    // Array index = creation order (page.tsx orders rooms by created_at ASC).
    () =>
      props.rooms.map((r, i) => ({
        ...r,
        rawColor: r.color,
        color: effectiveColor({ kind: "room", color: r.color, createdIndex: i }),
      })),
    [props.rooms],
  );
  const resolvedAreas = useMemo(
    () =>
      props.areas.map((a) => ({
        ...a,
        rawColor: a.color,
        color: effectiveColor({ kind: "area", color: a.color }),
      })),
    [props.areas],
  );
  const resolvedEquipment = useMemo(
    () =>
      props.placedEquipment.map((e) => ({
        ...e,
        rawColor: e.color,
        color: effectiveColor({
          kind: "equipment",
          color: e.color,
          typeDefaultColor: EQUIPMENT_DEFAULT_COLOR,
        }),
      })),
    [props.placedEquipment],
  );

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-3 flex justify-end gap-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setView("2d")}
          className={`rounded-sm border px-2.5 py-1 ${
            view === "2d"
              ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
              : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)]"
          }`}
        >
          2D
        </button>
        <button
          type="button"
          onClick={() => canShow3D && setView("3d")}
          disabled={!canShow3D}
          title={canShow3D ? undefined : "Calibrate the Floor's scale first"}
          className={`rounded-sm border px-2.5 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${
            view === "3d"
              ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
              : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)]"
          }`}
        >
          3D
        </button>
      </div>

      {view === "2d" || !canShow3D ? (
        <FloorPlanCanvas
          {...rest}
          rooms={resolvedRooms}
          areas={resolvedAreas}
          placedEquipment={resolvedEquipment}
          hiddenIds={hiddenIds}
          onHiddenIdsChange={setHiddenIds}
          highlightRef={highlightRef ?? null}
        />
      ) : (
        <Floor3DView
          highlightRef={highlightRef ?? null}
          floorWidthM={floorWidthM}
          floorHeightM={floorHeightM}
          equipment={resolvedEquipment}
          rooms={resolvedRooms}
          areas={resolvedAreas}
          safetyEquipment={rest.safetyEquipment}
          hiddenIds={hiddenIds}
          floors={rest.floors}
          currentFloorId={rest.floorId}
          routeWaypoints={rest.routeWaypoints}
          routePpeAreas={rest.routePpeAreas}
        />
      )}
    </div>
  );
}

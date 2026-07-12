"use client";

import { useState } from "react";
import type { FloorPickerFloor } from "@/app/components/floor-picker";
import { FloorPlanCanvas } from "./floor-plan-canvas";
import Floor3DView from "./floor-3d-view-loader";

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
  heightM: number;
};

type Space = { id: string; name: string; points: Point[] };
type SafetyEquipmentItem = { id: string; kind: string; xMeters: number; yMeters: number };

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
}) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const { floorWidthM, floorHeightM, ...rest } = props;
  const canShow3D = !!floorWidthM && !!floorHeightM;

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
        <FloorPlanCanvas {...rest} />
      ) : (
        <Floor3DView
          floorWidthM={floorWidthM}
          floorHeightM={floorHeightM}
          equipment={rest.placedEquipment}
          rooms={rest.rooms}
          areas={rest.areas}
          safetyEquipment={rest.safetyEquipment}
          floors={rest.floors}
          currentFloorId={rest.floorId}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Polyline,
  CircleMarker,
  AttributionControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { floorPlanFootprint, computeFitBounds, type FitBoundsResult } from "@/lib/geo";
import { FloorPicker, type FloorPickerFloor } from "@/app/components/floor-picker";
import {
  setGeoAnchor,
  setOsmReference,
  setOccupiedPortion,
  clearOccupiedPortion,
} from "./actions";

const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#e2572b;border:2px solid #fff;box-shadow:0 0 0 1px #1b4b6b;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const OSM_OUTLINE_STYLE = { color: "#6b7280", weight: 2, dashArray: "6 4", fillOpacity: 0 };
const OCCUPIED_STYLE = { color: "#c026d3", weight: 2, fillColor: "#c026d3", fillOpacity: 0.25 };

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitBoundsController({ editing, fit }: { editing: boolean; fit: FitBoundsResult }) {
  const map = useMap();
  // Ref so the effect fires only when edit mode is entered, not on every
  // pin/draw change while already editing.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (!editing) return;
    const f = fitRef.current;
    if (f.kind === "bounds") {
      map.fitBounds(f.points, { padding: [40, 40] });
    } else {
      map.setView(f.center, f.zoom);
    }
  }, [editing, map]);
  return null;
}

function polygonLatLngs(geojson: string | null): [number, number][] | null {
  if (!geojson) return null;
  try {
    const ring: unknown = JSON.parse(geojson)?.coordinates?.[0];
    if (!Array.isArray(ring)) return null;
    return ring.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
}

export function GeoAnchorMap({
  facilityId,
  initialLat,
  initialLng,
  initialRotationDeg,
  footprintInput,
  floors,
  osmWayId,
  osmOutlineGeojson,
  occupiedPortionGeojson,
}: {
  facilityId: string;
  initialLat: number | null;
  initialLng: number | null;
  initialRotationDeg: number | null;
  footprintInput: {
    svgWidth: number;
    svgHeight: number;
    metersPerSvgUnit: number;
  } | null;
  floors: FloorPickerFloor[];
  osmWayId: string | null;
  osmOutlineGeojson: string | null;
  occupiedPortionGeojson: string | null;
}) {
  const isAnchored = initialLat != null && initialLng != null;
  const [editing, setEditing] = useState(!isAnchored);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    isAnchored ? { lat: initialLat!, lng: initialLng! } : null,
  );
  const [rotationDeg, setRotationDeg] = useState(initialRotationDeg ?? 0);
  const [wayInput, setWayInput] = useState(osmWayId ?? "");
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isOsmPending, startOsmTransition] = useTransition();

  const footprint = useMemo(() => {
    if (!pin || !footprintInput) return null;
    return floorPlanFootprint({
      lat: pin.lat,
      lng: pin.lng,
      rotationDeg,
      ...footprintInput,
    }).map((p) => [p.lat, p.lng] as [number, number]);
  }, [pin, rotationDeg, footprintInput]);

  const osmOutline = useMemo(() => polygonLatLngs(osmOutlineGeojson), [osmOutlineGeojson]);
  const occupiedPortion = useMemo(
    () => polygonLatLngs(occupiedPortionGeojson),
    [occupiedPortionGeojson],
  );

  const center: [number, number] = pin ? [pin.lat, pin.lng] : [20, 0];
  const zoom = pin ? 18 : 2;

  function save() {
    if (!pin) {
      setError("Click the map to drop a pin first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setGeoAnchor(facilityId, pin.lat, pin.lng, rotationDeg);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the Geo-Anchor.");
      }
    });
  }

  function attachOsmWay() {
    if (!wayInput.trim()) {
      setError("Paste an OSM way URL or a numeric way ID.");
      return;
    }
    setError(null);
    startOsmTransition(async () => {
      try {
        await setOsmReference(facilityId, wayInput);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't fetch the OSM outline.");
      }
    });
  }

  function startDrawingOccupied() {
    setDrawing(true);
    setDrawPoints([]);
    setError(null);
  }

  function cancelDrawing() {
    setDrawing(false);
    setDrawPoints([]);
    setError(null);
  }

  function finishOccupiedPortion() {
    if (drawPoints.length < 3) {
      setError("A polygon needs at least 3 points.");
      return;
    }
    setError(null);
    const ring = drawPoints.map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]);
    startTransition(async () => {
      try {
        await setOccupiedPortion(facilityId, { type: "Polygon", coordinates: [ring] });
        setDrawing(false);
        setDrawPoints([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the occupied portion.");
      }
    });
  }

  function clearOccupied() {
    setError(null);
    startTransition(async () => {
      try {
        await clearOccupiedPortion(facilityId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't clear the occupied portion.");
      }
    });
  }

  return (
    <div className="w-full">
      <div className="relative h-[420px] w-full overflow-hidden rounded-sm border border-[var(--color-grid)]">
        <MapContainer
          key={isAnchored ? "anchored" : "unanchored"}
          center={center}
          zoom={zoom}
          className="h-full w-full"
          attributionControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <AttributionControl position="bottomleft" />
          <FitBoundsController
            editing={editing}
            fit={computeFitBounds({
              occupiedPortion,
              osmOutline,
              floorPlanFootprint: footprint,
              pin,
            })}
          />
          {editing && (
            <ClickHandler
              onPick={(lat, lng) => {
                if (drawing) {
                  setDrawPoints((pts) => [...pts, [lat, lng]]);
                } else {
                  setPin({ lat, lng });
                }
              }}
            />
          )}
          {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon} />}
          {osmOutline && <Polygon positions={osmOutline} pathOptions={OSM_OUTLINE_STYLE} />}
          {occupiedPortion && (
            <Polygon positions={occupiedPortion} pathOptions={OCCUPIED_STYLE} />
          )}
          {footprint && (
            <Polygon
              positions={footprint}
              pathOptions={{ color: "#e2572b", weight: 2, fillOpacity: 0.15 }}
            />
          )}
          {drawing && drawPoints.length > 0 && (
            <>
              <Polyline
                positions={drawPoints}
                pathOptions={{ color: "#c026d3", weight: 2 }}
              />
              {drawPoints.length >= 3 && (
                <Polyline
                  positions={[drawPoints[drawPoints.length - 1], drawPoints[0]]}
                  pathOptions={{ color: "#c026d3", weight: 2, dashArray: "4 3" }}
                />
              )}
              {drawPoints.map((p, i) => (
                <CircleMarker
                  key={i}
                  center={p}
                  radius={4}
                  pathOptions={{ color: "#c026d3", fillColor: "#c026d3", fillOpacity: 1 }}
                />
              ))}
            </>
          )}
        </MapContainer>
        <FloorPicker floors={floors} />
      </div>

      <div className="mt-4 space-y-3 border-t border-[var(--color-grid)] pt-3">
        {editing ? (
          <>
            <p className="font-mono text-xs text-[var(--color-ink-soft)]">
              {drawing
                ? `Click the map to outline the occupied portion (${drawPoints.length} picked).`
                : pin
                  ? `pin — ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
                  : "Click the map to drop a pin at the Facility's real-world location."}
            </p>
            <div className="flex items-center gap-3">
              <label htmlFor="rotation" className="font-mono text-xs text-[var(--color-ink-soft)]">
                rotation
              </label>
              <input
                id="rotation"
                type="range"
                min={0}
                max={359}
                value={rotationDeg}
                onChange={(e) => setRotationDeg(Number(e.target.value))}
                className="flex-1 accent-[var(--color-ink)]"
              />
              <span className="w-12 text-right font-mono text-xs text-[var(--color-ink)]">
                {rotationDeg}°
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="osm-way" className="font-mono text-xs text-[var(--color-ink-soft)]">
                OSM way
              </label>
              <input
                id="osm-way"
                type="text"
                value={wayInput}
                onChange={(e) => setWayInput(e.target.value)}
                placeholder="https://www.openstreetmap.org/way/198458289"
                className="flex-1 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
              />
              <button
                type="button"
                onClick={attachOsmWay}
                disabled={isOsmPending}
                className="rounded-sm bg-[var(--color-ink)] px-3 py-1 font-mono text-xs text-[var(--color-paper)] disabled:opacity-60"
              >
                {isOsmPending ? "Fetching…" : osmWayId ? "Update outline" : "Attach outline"}
              </button>
            </div>
            {drawing ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={finishOccupiedPortion}
                  disabled={drawPoints.length < 3 || isPending}
                  className="rounded-sm bg-[var(--color-ink)] px-3 py-1 font-mono text-xs text-[var(--color-paper)] disabled:opacity-40"
                >
                  {isPending ? "Saving…" : "Finish"}
                </button>
                <button
                  type="button"
                  onClick={() => setDrawPoints((pts) => pts.slice(0, -1))}
                  disabled={drawPoints.length === 0}
                  className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-40"
                >
                  Undo point
                </button>
                <button
                  type="button"
                  onClick={cancelDrawing}
                  className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={startDrawingOccupied}
                  className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  Draw occupied portion
                </button>
                {occupiedPortion && (
                  <button
                    type="button"
                    onClick={clearOccupied}
                    disabled={isPending}
                    className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-40"
                  >
                    Clear occupied portion
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="rounded-sm bg-[var(--color-ink)] px-3 py-1.5 font-mono text-xs text-[var(--color-paper)] disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Save Geo-Anchor"}
              </button>
              {isAnchored && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setPin({ lat: initialLat!, lng: initialLng! });
                    setRotationDeg(initialRotationDeg ?? 0);
                    setDrawing(false);
                    setDrawPoints([]);
                    setError(null);
                  }}
                  className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                >
                  Cancel
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--color-signal)]">
                {error}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between font-mono text-xs text-[var(--color-ink-soft)]">
            <span>
              anchored — {pin!.lat.toFixed(5)}, {pin!.lng.toFixed(5)} · rotation{" "}
              {rotationDeg}°
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[var(--color-ink)] hover:text-[var(--color-signal)]"
            >
              Re-anchor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

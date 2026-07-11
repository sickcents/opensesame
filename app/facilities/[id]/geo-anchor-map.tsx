"use client";

import { useMemo, useState, useTransition } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  AttributionControl,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { floorPlanFootprint } from "@/lib/geo";
import { FloorPicker, type FloorPickerFloor } from "@/app/components/floor-picker";
import { setGeoAnchor } from "./actions";

const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#e2572b;border:2px solid #fff;box-shadow:0 0 0 1px #1b4b6b;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function GeoAnchorMap({
  facilityId,
  initialLat,
  initialLng,
  initialRotationDeg,
  footprintInput,
  floors,
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
}) {
  const isAnchored = initialLat != null && initialLng != null;
  const [editing, setEditing] = useState(!isAnchored);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    isAnchored ? { lat: initialLat!, lng: initialLng! } : null,
  );
  const [rotationDeg, setRotationDeg] = useState(initialRotationDeg ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const footprint = useMemo(() => {
    if (!pin || !footprintInput) return null;
    return floorPlanFootprint({
      lat: pin.lat,
      lng: pin.lng,
      rotationDeg,
      ...footprintInput,
    }).map((p) => [p.lat, p.lng] as [number, number]);
  }, [pin, rotationDeg, footprintInput]);

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
          {editing && <ClickHandler onPick={(lat, lng) => setPin({ lat, lng })} />}
          {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon} />}
          {footprint && (
            <Polygon
              positions={footprint}
              pathOptions={{ color: "#e2572b", weight: 2, fillOpacity: 0.15 }}
            />
          )}
        </MapContainer>
        <FloorPicker floors={floors} />
      </div>

      <div className="mt-4 space-y-3 border-t border-[var(--color-grid)] pt-3">
        {editing ? (
          <>
            <p className="font-mono text-xs text-[var(--color-ink-soft)]">
              {pin
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

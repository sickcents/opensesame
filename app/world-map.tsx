"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#1b4b6b;border:2px solid #fff;box-shadow:0 0 0 1px #e2572b;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type FacilityPin = { id: string; name: string; lat: number; lng: number };

export function WorldMap({ facilities }: { facilities: FacilityPin[] }) {
  const router = useRouter();

  const center = useMemo((): [number, number] => {
    if (facilities.length === 0) return [20, 0];
    const lat = facilities.reduce((s, f) => s + f.lat, 0) / facilities.length;
    const lng = facilities.reduce((s, f) => s + f.lng, 0) / facilities.length;
    return [lat, lng];
  }, [facilities]);

  const zoom = facilities.length === 1 ? 14 : facilities.length > 1 ? 4 : 2;

  return (
    <div className="h-[360px] w-full overflow-hidden rounded-sm border border-[var(--color-grid)]">
      <MapContainer center={center} zoom={zoom} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {facilities.map((f) => (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={pinIcon}
            eventHandlers={{ click: () => router.push(`/facilities/${f.id}`) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}

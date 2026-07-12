const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

const WAY_URL_RE = /openstreetmap\.org\/way\/(\d+)/;

export function parseOsmWayId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(WAY_URL_RE);
  return match ? match[1] : null;
}

export function buildOverpassQuery(wayId: string) {
  return `[out:json];way(${wayId});out geom;`;
}

export type OverpassResponse = {
  elements?: {
    type?: string;
    geometry?: { lat: number; lon: number }[];
  }[];
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export function overpassWayToPolygon(response: OverpassResponse): GeoJsonPolygon {
  const way = response.elements?.find((e) => e.type === "way");
  if (!way || !way.geometry || way.geometry.length < 3) {
    throw new Error("OSM way not found or has no outline geometry.");
  }
  const ring: [number, number][] = way.geometry.map(({ lat, lon }) => [lon, lat]);
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

export async function fetchOsmWayOutline(wayId: string): Promise<GeoJsonPolygon> {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    body: `data=${encodeURIComponent(buildOverpassQuery(wayId))}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) {
    throw new Error(`Couldn't reach the Overpass API (HTTP ${res.status}).`);
  }
  let json: OverpassResponse;
  try {
    json = await res.json();
  } catch {
    throw new Error("The Overpass API returned an unreadable response.");
  }
  return overpassWayToPolygon(json);
}

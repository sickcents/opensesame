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

/** Nearest building way within `radiusMeters` of a point, closest match first. */
export function buildNearestBuildingQuery(lat: number, lng: number, radiusMeters = 50) {
  return `[out:json];way(around:${radiusMeters},${lat},${lng})["building"];out geom;`;
}

export type OverpassResponse = {
  elements?: {
    type?: string;
    id?: number;
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

async function postOverpassQuery(query: string): Promise<OverpassResponse> {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "OpenSesame Facility Mapper (https://github.com/sickcents/opensesame)",
    },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const detail = bodyText.trim().slice(0, 200);
    throw new Error(
      `Couldn't reach the Overpass API (HTTP ${res.status}).${detail ? ` ${detail}` : ""}`,
    );
  }
  try {
    return await res.json();
  } catch {
    throw new Error("The Overpass API returned an unreadable response.");
  }
}

export async function fetchOsmWayOutline(wayId: string): Promise<GeoJsonPolygon> {
  const json = await postOverpassQuery(buildOverpassQuery(wayId));
  return overpassWayToPolygon(json);
}

function ringCentroid(geometry: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const sum = geometry.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }),
    { lat: 0, lon: 0 },
  );
  return { lat: sum.lat / geometry.length, lon: sum.lon / geometry.length };
}

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Finds the OSM building way whose centroid is closest to (lat, lng),
 * searching within a small radius. Returns null rather than throwing when
 * no building is nearby, since that's an expected, non-error outcome.
 */
export async function fetchNearestBuildingWay(
  lat: number,
  lng: number,
): Promise<{ wayId: string; outline: GeoJsonPolygon } | null> {
  const json = await postOverpassQuery(buildNearestBuildingQuery(lat, lng));
  const ways = (json.elements ?? []).filter(
    (e): e is { type: string; id: number; geometry: { lat: number; lon: number }[] } =>
      e.type === "way" && e.id != null && !!e.geometry && e.geometry.length >= 3,
  );
  if (ways.length === 0) return null;

  const click = { lat, lon: lng };
  let nearest = ways[0];
  let nearestDistance = haversineMeters(click, ringCentroid(nearest.geometry));
  for (const way of ways.slice(1)) {
    const distance = haversineMeters(click, ringCentroid(way.geometry));
    if (distance < nearestDistance) {
      nearest = way;
      nearestDistance = distance;
    }
  }

  return {
    wayId: String(nearest.id),
    outline: overpassWayToPolygon({ elements: [nearest] }),
  };
}

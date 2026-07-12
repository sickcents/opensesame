const METERS_PER_DEG_LAT = 111_320;

/** Offset a lat/lng origin by east/north meters (equirectangular approximation). */
export function metersOffsetToLatLng(
  originLat: number,
  originLng: number,
  eastMeters: number,
  northMeters: number,
) {
  const dLat = northMeters / METERS_PER_DEG_LAT;
  const dLng =
    eastMeters / (METERS_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180));
  return { lat: originLat + dLat, lng: originLng + dLng };
}

/**
 * Rotate an (east, north) meter offset clockwise by a compass bearing in
 * degrees (0 = no rotation, 90 = what was east now points south).
 */
export function rotateEastNorth(east: number, north: number, bearingDeg: number) {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    east: east * Math.cos(rad) + north * Math.sin(rad),
    north: -east * Math.sin(rad) + north * Math.cos(rad),
  };
}

/**
 * Footprint corners (lat/lng) of a Floor Plan anchored at (lat, lng) with
 * its SVG (0,0) origin pinned there. SVG +x maps to east, SVG +y maps to
 * south, before the compass rotation is applied.
 */
export type FitBoundsResult =
  | { kind: "bounds"; points: [number, number][] }
  | { kind: "view"; center: [number, number]; zoom: number };

/**
 * Points ([lat, lng]) to fit the Geo-Anchor map to, taking the
 * highest-priority reference geometry available: occupied portion, then
 * OSM outline, then Floor-Plan footprint. Falls back to a fixed view on
 * the pin (zoom 18) or the world (zoom 2) when no geometry exists.
 */
export function computeFitBounds({
  occupiedPortion,
  osmOutline,
  floorPlanFootprint,
  pin,
}: {
  occupiedPortion: [number, number][] | null;
  osmOutline: [number, number][] | null;
  floorPlanFootprint: [number, number][] | null;
  pin: { lat: number; lng: number } | null;
}): FitBoundsResult {
  for (const points of [occupiedPortion, osmOutline, floorPlanFootprint]) {
    if (points && points.length > 0) return { kind: "bounds", points };
  }
  if (pin) return { kind: "view", center: [pin.lat, pin.lng], zoom: 18 };
  return { kind: "view", center: [20, 0], zoom: 2 };
}

export function floorPlanFootprint({
  lat,
  lng,
  rotationDeg,
  svgWidth,
  svgHeight,
  metersPerSvgUnit,
}: {
  lat: number;
  lng: number;
  rotationDeg: number;
  svgWidth: number;
  svgHeight: number;
  metersPerSvgUnit: number;
}) {
  const corners = [
    { x: 0, y: 0 },
    { x: svgWidth, y: 0 },
    { x: svgWidth, y: svgHeight },
    { x: 0, y: svgHeight },
  ];
  return corners.map(({ x, y }) => {
    const eastM = x * metersPerSvgUnit;
    const southM = y * metersPerSvgUnit;
    const { east, north } = rotateEastNorth(eastM, -southM, rotationDeg);
    return metersOffsetToLatLng(lat, lng, east, north);
  });
}

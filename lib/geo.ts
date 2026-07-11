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

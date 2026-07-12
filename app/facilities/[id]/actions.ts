"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { facilities } from "@/db/schema";
import { parseOsmWayId, fetchOsmWayOutline } from "@/lib/osm";

export async function setGeoAnchor(
  facilityId: string,
  lat: number,
  lng: number,
  rotationDeg: number,
) {
  if (!(lat >= -90 && lat <= 90)) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (!(lng >= -180 && lng <= 180)) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  const normalizedRotation = ((rotationDeg % 360) + 360) % 360;

  await db
    .update(facilities)
    .set({
      geoAnchorLat: lat,
      geoAnchorLng: lng,
      geoAnchorRotationDeg: normalizedRotation,
    })
    .where(eq(facilities.id, facilityId));

  revalidatePath(`/facilities/${facilityId}`);

  return { lat, lng, rotationDeg: normalizedRotation };
}

export async function setOsmReference(facilityId: string, osmWayId: string) {
  const wayId = parseOsmWayId(osmWayId);
  if (!wayId) {
    throw new Error("Paste an OSM way URL or a numeric way ID.");
  }
  const outline = await fetchOsmWayOutline(wayId);

  await db
    .update(facilities)
    .set({
      osmWayId: wayId,
      osmOutlineGeojson: JSON.stringify(outline),
    })
    .where(eq(facilities.id, facilityId));

  revalidatePath(`/facilities/${facilityId}`);

  return { wayId };
}

export async function setOccupiedPortion(facilityId: string, geojson: object) {
  await db
    .update(facilities)
    .set({ occupiedPortionGeojson: JSON.stringify(geojson) })
    .where(eq(facilities.id, facilityId));

  revalidatePath(`/facilities/${facilityId}`);
}

export async function clearOccupiedPortion(facilityId: string) {
  await db
    .update(facilities)
    .set({ occupiedPortionGeojson: null })
    .where(eq(facilities.id, facilityId));

  revalidatePath(`/facilities/${facilityId}`);
}

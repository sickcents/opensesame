"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { facilities } from "@/db/schema";

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

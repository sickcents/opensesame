"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { floors } from "@/db/schema";

export async function setScaleCalibration(
  floorId: string,
  svgDistanceUnits: number,
  realWorldMeters: number,
) {
  if (!(svgDistanceUnits > 0)) {
    throw new Error("The two points must be at different locations.");
  }
  if (!(realWorldMeters > 0)) {
    throw new Error("Enter a real-world distance greater than zero.");
  }

  const scale = realWorldMeters / svgDistanceUnits;

  await db
    .update(floors)
    .set({ scaleMetersPerSvgUnit: scale })
    .where(eq(floors.id, floorId));

  revalidatePath(`/floors/${floorId}`);

  return { scale };
}

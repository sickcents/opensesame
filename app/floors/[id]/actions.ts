"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { floors, equipment } from "@/db/schema";
import { pointsToWktPolygon, type MeterPoint } from "@/lib/wkt";

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

export async function placeEquipment(
  floorId: string,
  equipmentTypeId: string,
  xMeters: number,
  yMeters: number,
) {
  await db.insert(equipment).values({ floorId, equipmentTypeId, xMeters, yMeters });
  revalidatePath(`/floors/${floorId}`);
}

export async function createSpace(
  floorId: string,
  kind: "room" | "area",
  name: string,
  pointsMeters: MeterPoint[],
) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Name the space before saving.");
  }
  if (pointsMeters.length < 3) {
    throw new Error("A polygon needs at least 3 points.");
  }

  const wkt = pointsToWktPolygon(pointsMeters);

  if (kind === "room") {
    await db.execute(sql`
      INSERT INTO rooms (floor_id, name, geom)
      VALUES (${floorId}, ${trimmedName}, ST_GeomFromText(${wkt}, 0))
    `);
  } else {
    await db.execute(sql`
      INSERT INTO areas (floor_id, name, geom)
      VALUES (${floorId}, ${trimmedName}, ST_GeomFromText(${wkt}, 0))
    `);
  }

  revalidatePath(`/floors/${floorId}`);
}

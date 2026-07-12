"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { floors } from "@/db/schema";
import { pointsToWktPolygon, type MeterPoint } from "@/lib/wkt";

const SAFETY_EQUIPMENT_KINDS = [
  "exit",
  "fire_extinguisher",
  "first_aid",
  "emergency_shower",
] as const;
export type SafetyEquipmentKind = (typeof SAFETY_EQUIPMENT_KINDS)[number];

const ISSUE_SUBJECT_TYPES = ["room", "area", "equipment", "safety_equipment"] as const;
export type IssueSubjectType = (typeof ISSUE_SUBJECT_TYPES)[number];

const DEPARTMENTS = ["IT", "Facilities", "Safety", "Security", "Operations"] as const;
export type Department = (typeof DEPARTMENTS)[number];

const AREA_KINDS = ["walkway", "ppe_required", "restricted"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

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

// Create actions return the new row's id so the Edit-mode undo stack can
// target it (undo-of-create deletes exactly what was inserted).
export async function placeEquipment(
  floorId: string,
  equipmentTypeId: string,
  xMeters: number,
  yMeters: number,
): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO equipment (floor_id, equipment_type_id, geom)
    VALUES (${floorId}, ${equipmentTypeId}, ST_MakePoint(${xMeters}, ${yMeters}))
    RETURNING id
  `);
  revalidatePath(`/floors/${floorId}`);
  return rows[0].id;
}

export async function placeSafetyEquipment(
  floorId: string,
  kind: SafetyEquipmentKind,
  xMeters: number,
  yMeters: number,
): Promise<string> {
  if (!SAFETY_EQUIPMENT_KINDS.includes(kind)) {
    throw new Error("Unknown Safety Equipment kind.");
  }
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO safety_equipment (floor_id, kind, geom)
    VALUES (${floorId}, ${kind}, ST_MakePoint(${xMeters}, ${yMeters}))
    RETURNING id
  `);
  revalidatePath(`/floors/${floorId}`);
  return rows[0].id;
}

export async function createSpace(
  floorId: string,
  kind: "room" | "area",
  name: string,
  pointsMeters: MeterPoint[],
  areaKind?: AreaKind,
): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Name the space before saving.");
  }
  if (pointsMeters.length < 3) {
    throw new Error("A polygon needs at least 3 points.");
  }
  if (areaKind !== undefined && !AREA_KINDS.includes(areaKind)) {
    throw new Error("Unknown Area kind.");
  }

  const wkt = pointsToWktPolygon(pointsMeters);

  const rows =
    kind === "room"
      ? await db.execute<{ id: string }>(sql`
          INSERT INTO rooms (floor_id, name, geom)
          VALUES (${floorId}, ${trimmedName}, ST_GeomFromText(${wkt}, 0))
          RETURNING id
        `)
      : await db.execute<{ id: string }>(sql`
          INSERT INTO areas (floor_id, name, kind, geom)
          VALUES (${floorId}, ${trimmedName}, ${areaKind ?? "walkway"}, ST_GeomFromText(${wkt}, 0))
          RETURNING id
        `);

  revalidatePath(`/floors/${floorId}`);
  return rows[0].id;
}

export async function reportIssue(
  floorId: string,
  subjectType: IssueSubjectType,
  subjectId: string,
  reporterName: string,
  description: string,
  department: Department,
) {
  const trimmedReporter = reporterName.trim();
  const trimmedDescription = description.trim();
  if (!trimmedReporter) {
    throw new Error("Enter your name.");
  }
  if (!trimmedDescription) {
    throw new Error("Describe the issue.");
  }
  if (!ISSUE_SUBJECT_TYPES.includes(subjectType)) {
    throw new Error("Unknown subject type.");
  }
  if (!DEPARTMENTS.includes(department)) {
    throw new Error("Unknown Department.");
  }

  await db.execute(sql`
    INSERT INTO issues (subject_type, subject_id, reporter_name, description, department)
    VALUES (${subjectType}, ${subjectId}, ${trimmedReporter}, ${trimmedDescription}, ${department})
  `);

  revalidatePath(`/floors/${floorId}`);
}

export async function resolveIssue(floorId: string, issueId: string) {
  await db.execute(sql`
    UPDATE issues SET status = 'resolved', resolved_at = now() WHERE id = ${issueId}
  `);
  revalidatePath(`/floors/${floorId}`);
}

const ITEM_TYPES = ["room", "area", "equipment", "safety_equipment"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

const ROTATIONS = [0, 90, 180, 270];

export async function rotateEquipment(
  floorId: string,
  equipmentId: string,
  rotationDeg: number,
) {
  // The UI only sends exact multiples of 90 — anything else is a bug worth surfacing.
  if (!ROTATIONS.includes(rotationDeg)) {
    throw new Error("Rotation must be 0, 90, 180, or 270 degrees.");
  }
  await db.execute(sql`
    UPDATE equipment SET rotation_deg = ${rotationDeg} WHERE id = ${equipmentId}
  `);
  revalidatePath(`/floors/${floorId}`);
}

// Persists whatever position it's given — snapping (Phase 4) resolves upstream
// in the drag gesture, never here.
export async function moveItem(
  floorId: string,
  type: "equipment" | "safety_equipment",
  id: string,
  xMeters: number,
  yMeters: number,
) {
  if (type === "equipment") {
    await db.execute(sql`
      UPDATE equipment SET geom = ST_MakePoint(${xMeters}, ${yMeters}) WHERE id = ${id}
    `);
  } else {
    await db.execute(sql`
      UPDATE safety_equipment SET geom = ST_MakePoint(${xMeters}, ${yMeters}) WHERE id = ${id}
    `);
  }
  revalidatePath(`/floors/${floorId}`);
}

export async function moveSpace(
  floorId: string,
  kind: "room" | "area",
  id: string,
  pointsMeters: MeterPoint[],
) {
  if (pointsMeters.length < 3) {
    throw new Error("A polygon needs at least 3 points.");
  }
  const wkt = pointsToWktPolygon(pointsMeters);
  if (kind === "room") {
    await db.execute(sql`
      UPDATE rooms SET geom = ST_GeomFromText(${wkt}, 0) WHERE id = ${id}
    `);
  } else {
    await db.execute(sql`
      UPDATE areas SET geom = ST_GeomFromText(${wkt}, 0) WHERE id = ${id}
    `);
  }
  revalidatePath(`/floors/${floorId}`);
}

export async function renameItem(floorId: string, type: ItemType, id: string, label: string) {
  if (!ITEM_TYPES.includes(type)) {
    throw new Error("Unknown item type.");
  }
  const trimmed = label.trim();
  if (type === "room" || type === "area") {
    if (!trimmed) {
      throw new Error("Enter a name.");
    }
    if (type === "room") {
      await db.execute(sql`UPDATE rooms SET name = ${trimmed} WHERE id = ${id}`);
    } else {
      await db.execute(sql`UPDATE areas SET name = ${trimmed} WHERE id = ${id}`);
    }
  } else {
    // Empty clears the per-instance label back to the type/kind default.
    const value = trimmed || null;
    if (type === "equipment") {
      await db.execute(sql`UPDATE equipment SET label = ${value} WHERE id = ${id}`);
    } else {
      await db.execute(sql`UPDATE safety_equipment SET label = ${value} WHERE id = ${id}`);
    }
  }
  revalidatePath(`/floors/${floorId}`);
}

export async function deleteItem(floorId: string, type: ItemType, id: string) {
  if (!ITEM_TYPES.includes(type)) {
    throw new Error("Unknown item type.");
  }
  // Known gap: open Issues referencing this item are orphaned — issues has no
  // FK across the four subject tables (see db/schema.ts).
  if (type === "room") {
    await db.execute(sql`DELETE FROM rooms WHERE id = ${id}`);
  } else if (type === "area") {
    await db.execute(sql`DELETE FROM areas WHERE id = ${id}`);
  } else if (type === "equipment") {
    await db.execute(sql`DELETE FROM equipment WHERE id = ${id}`);
  } else {
    await db.execute(sql`DELETE FROM safety_equipment WHERE id = ${id}`);
  }
  revalidatePath(`/floors/${floorId}`);
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function setItemColor(
  floorId: string,
  type: "room" | "area" | "equipment",
  id: string,
  color: string | null,
) {
  if (color !== null && !HEX_COLOR_RE.test(color)) {
    throw new Error("Color must be a hex value like #6f9490.");
  }
  if (type === "room") {
    await db.execute(sql`UPDATE rooms SET color = ${color} WHERE id = ${id}`);
  } else if (type === "area") {
    await db.execute(sql`UPDATE areas SET color = ${color} WHERE id = ${id}`);
  } else {
    await db.execute(sql`UPDATE equipment SET color = ${color} WHERE id = ${id}`);
  }
  revalidatePath(`/floors/${floorId}`);
}

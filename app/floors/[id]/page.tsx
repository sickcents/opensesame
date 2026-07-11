import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { floors, facilities, equipmentTypes } from "@/db/schema";
import { wktPolygonToPoints } from "@/lib/wkt";
import { FloorPlanCanvas } from "./floor-plan-canvas";

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;

type SpaceRow = { id: string; name: string; wkt: string };
type EquipmentRow = {
  id: string;
  x: number;
  y: number;
  typeName: string;
  widthM: number;
  depthM: number;
};
type SafetyEquipmentRow = { id: string; kind: string; x: number; y: number };

export default async function FloorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db
    .select({
      floorId: floors.id,
      floorName: floors.name,
      floorPlanSvg: floors.floorPlanSvg,
      scaleMetersPerSvgUnit: floors.scaleMetersPerSvgUnit,
      facilityId: facilities.id,
      facilityName: facilities.name,
    })
    .from(floors)
    .innerJoin(facilities, eq(floors.facilityId, facilities.id))
    .where(eq(floors.id, id))
    .limit(1);

  if (!row) notFound();

  const [allEquipmentTypes, equipmentRows, roomRows, areaRows, safetyRows] =
    await Promise.all([
      db.select().from(equipmentTypes),
      db.execute<EquipmentRow>(sql`
        SELECT e.id, ST_X(e.geom) as x, ST_Y(e.geom) as y,
               t.name as "typeName", t.width_m as "widthM", t.depth_m as "depthM"
        FROM equipment e
        JOIN equipment_types t ON t.id = e.equipment_type_id
        WHERE e.floor_id = ${id}
      `),
      db.execute<SpaceRow>(
        sql`SELECT id, name, ST_AsText(geom) as wkt FROM rooms WHERE floor_id = ${id}`,
      ),
      db.execute<SpaceRow>(
        sql`SELECT id, name, ST_AsText(geom) as wkt FROM areas WHERE floor_id = ${id}`,
      ),
      db.execute<SafetyEquipmentRow>(sql`
        SELECT id, kind, ST_X(geom) as x, ST_Y(geom) as y
        FROM safety_equipment
        WHERE floor_id = ${id}
      `),
    ]);

  const placedEquipment = equipmentRows.map((r) => ({
    id: r.id,
    xMeters: r.x,
    yMeters: r.y,
    typeName: r.typeName,
    widthM: r.widthM,
    depthM: r.depthM,
  }));
  const rooms = roomRows.map((r) => ({
    id: r.id,
    name: r.name,
    points: wktPolygonToPoints(r.wkt),
  }));
  const areas = areaRows.map((r) => ({
    id: r.id,
    name: r.name,
    points: wktPolygonToPoints(r.wkt),
  }));
  const safetyEquipment = safetyRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    xMeters: r.x,
    yMeters: r.y,
  }));

  const viewBoxMatch = row.floorPlanSvg?.match(VIEWBOX_RE);
  const viewBoxWidth = viewBoxMatch ? Number(viewBoxMatch[1]) : 100;
  const viewBoxHeight = viewBoxMatch ? Number(viewBoxMatch[2]) : 100;

  return (
    <main className="blueprint-grid relative min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--color-grid)] bg-[var(--color-paper)]/90 px-6 py-4 backdrop-blur-sm">
        <Link
          href="/"
          className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-soft)] uppercase hover:text-[var(--color-ink)]"
        >
          opensesame
        </Link>
        <span className="font-mono text-xs text-[var(--color-ink-soft)]">
          <Link href={`/facilities/${row.facilityId}`} className="hover:text-[var(--color-ink)]">
            {row.facilityName}
          </Link>{" "}
          <span className="text-[var(--color-grid)]">/</span> {row.floorName}
        </span>
      </header>

      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6 py-10">
        {row.floorPlanSvg ? (
          <FloorPlanCanvas
            floorId={row.floorId}
            floorName={row.floorName}
            svgMarkup={row.floorPlanSvg}
            viewBoxWidth={viewBoxWidth}
            viewBoxHeight={viewBoxHeight}
            scaleMetersPerSvgUnit={row.scaleMetersPerSvgUnit}
            equipmentTypes={allEquipmentTypes}
            placedEquipment={placedEquipment}
            rooms={rooms}
            areas={areas}
            safetyEquipment={safetyEquipment}
          />
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            This Floor has no Floor Plan yet.
          </p>
        )}
      </div>
    </main>
  );
}

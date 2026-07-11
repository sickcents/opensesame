import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { floors, facilities, equipmentTypes } from "@/db/schema";
import { wktPolygonToPoints } from "@/lib/wkt";
import { FloorViewSwitcher } from "./floor-view-switcher";
import { IssuesPanel } from "./issues-panel";

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;

type SpaceRow = { id: string; name: string; wkt: string };
type EquipmentRow = {
  id: string;
  x: number;
  y: number;
  typeName: string;
  widthM: number;
  depthM: number;
  heightM: number;
};
type SafetyEquipmentRow = { id: string; kind: string; x: number; y: number };
type IssueRow = {
  id: string;
  subjectType: string;
  subjectLabel: string;
  reporterName: string;
  description: string;
  department: string;
  status: string;
  createdAt: string;
};

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

  const [
    siblingFloors,
    allEquipmentTypes,
    equipmentRows,
    roomRows,
    areaRows,
    safetyRows,
    issueRows,
  ] =
    await Promise.all([
      db
        .select({ id: floors.id, name: floors.name })
        .from(floors)
        .where(eq(floors.facilityId, row.facilityId))
        .orderBy(asc(floors.createdAt)),
      db.select().from(equipmentTypes),
      db.execute<EquipmentRow>(sql`
        SELECT e.id, ST_X(e.geom) as x, ST_Y(e.geom) as y,
               t.name as "typeName", t.width_m as "widthM", t.depth_m as "depthM",
               t.height_m as "heightM"
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
      db.execute<IssueRow>(sql`
        SELECT i.id, i.subject_type as "subjectType", r.name as "subjectLabel",
               i.reporter_name as "reporterName", i.description, i.department, i.status,
               i.created_at as "createdAt"
        FROM issues i JOIN rooms r ON i.subject_type = 'room' AND i.subject_id = r.id
        WHERE r.floor_id = ${id}
        UNION ALL
        SELECT i.id, i.subject_type, a.name, i.reporter_name, i.description, i.department,
               i.status, i.created_at
        FROM issues i JOIN areas a ON i.subject_type = 'area' AND i.subject_id = a.id
        WHERE a.floor_id = ${id}
        UNION ALL
        SELECT i.id, i.subject_type, t.name, i.reporter_name, i.description, i.department,
               i.status, i.created_at
        FROM issues i
        JOIN equipment e ON i.subject_type = 'equipment' AND i.subject_id = e.id
        JOIN equipment_types t ON t.id = e.equipment_type_id
        WHERE e.floor_id = ${id}
        UNION ALL
        SELECT i.id, i.subject_type, s.kind::text, i.reporter_name, i.description, i.department,
               i.status, i.created_at
        FROM issues i JOIN safety_equipment s ON i.subject_type = 'safety_equipment' AND i.subject_id = s.id
        WHERE s.floor_id = ${id}
        ORDER BY "createdAt" DESC
      `),
    ]);

  const placedEquipment = equipmentRows.map((r) => ({
    id: r.id,
    xMeters: r.x,
    yMeters: r.y,
    typeName: r.typeName,
    widthM: r.widthM,
    depthM: r.depthM,
    heightM: r.heightM,
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
  const floorWidthM = row.scaleMetersPerSvgUnit ? viewBoxWidth * row.scaleMetersPerSvgUnit : null;
  const floorHeightM = row.scaleMetersPerSvgUnit
    ? viewBoxHeight * row.scaleMetersPerSvgUnit
    : null;

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

      <div className="flex min-h-[calc(100vh-57px)] flex-col items-center gap-8 px-6 py-10">
        {row.floorPlanSvg ? (
          <>
            <FloorViewSwitcher
              floorId={row.floorId}
              floorName={row.floorName}
              floors={siblingFloors}
              svgMarkup={row.floorPlanSvg}
              viewBoxWidth={viewBoxWidth}
              viewBoxHeight={viewBoxHeight}
              scaleMetersPerSvgUnit={row.scaleMetersPerSvgUnit}
              floorWidthM={floorWidthM}
              floorHeightM={floorHeightM}
              equipmentTypes={allEquipmentTypes}
              placedEquipment={placedEquipment}
              rooms={rooms}
              areas={areas}
              safetyEquipment={safetyEquipment}
            />
            <IssuesPanel floorId={row.floorId} issues={issueRows} />
          </>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            This Floor has no Floor Plan yet.
          </p>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { floors, facilities, equipment, equipmentTypes } from "@/db/schema";
import { FloorPlanCanvas } from "./floor-plan-canvas";

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;

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

  const [allEquipmentTypes, placedEquipment] = await Promise.all([
    db.select().from(equipmentTypes),
    db
      .select({
        id: equipment.id,
        xMeters: equipment.xMeters,
        yMeters: equipment.yMeters,
        typeName: equipmentTypes.name,
        widthM: equipmentTypes.widthM,
        depthM: equipmentTypes.depthM,
      })
      .from(equipment)
      .innerJoin(equipmentTypes, eq(equipment.equipmentTypeId, equipmentTypes.id))
      .where(eq(equipment.floorId, id)),
  ]);

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

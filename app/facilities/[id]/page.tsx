import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { facilities, floors } from "@/db/schema";
import GeoAnchorMap from "./geo-anchor-map-loader";

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;

export default async function FacilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [facility] = await db
    .select()
    .from(facilities)
    .where(eq(facilities.id, id))
    .limit(1);

  if (!facility) notFound();

  const facilityFloors = await db
    .select()
    .from(floors)
    .where(eq(floors.facilityId, id));

  const firstFloor = facilityFloors[0];
  const viewBoxMatch = firstFloor?.floorPlanSvg?.match(VIEWBOX_RE);
  const footprintInput =
    viewBoxMatch && firstFloor?.scaleMetersPerSvgUnit
      ? {
          svgWidth: Number(viewBoxMatch[1]),
          svgHeight: Number(viewBoxMatch[2]),
          metersPerSvgUnit: firstFloor.scaleMetersPerSvgUnit,
        }
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
          {facility.name}
        </span>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium text-[var(--color-ink)]">
          {facility.name}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          Drop a pin at this Facility&apos;s real-world location and rotate
          its Floor Plan to match true orientation. This is set once and
          shared across every Floor.
        </p>
        {!footprintInput && (
          <p className="mt-2 font-mono text-xs text-[var(--color-signal)]">
            Calibrate the first Floor&apos;s scale before anchoring to preview
            its footprint on the map.
          </p>
        )}

        <div className="mt-6 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4 shadow-sm">
          <GeoAnchorMap
            facilityId={facility.id}
            initialLat={facility.geoAnchorLat}
            initialLng={facility.geoAnchorLng}
            initialRotationDeg={facility.geoAnchorRotationDeg}
            footprintInput={footprintInput}
          />
        </div>

        {facilityFloors.length > 0 && (
          <div className="mt-6">
            <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              Floors
            </h2>
            <ul className="mt-2 divide-y divide-[var(--color-grid)] border-t border-[var(--color-grid)]">
              {facilityFloors.map((f) => (
                <li key={f.id} className="py-2.5">
                  <Link
                    href={`/floors/${f.id}`}
                    className="text-sm text-[var(--color-ink)] hover:text-[var(--color-signal)]"
                  >
                    {f.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

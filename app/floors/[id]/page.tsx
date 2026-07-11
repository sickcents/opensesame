import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { floors, facilities } from "@/db/schema";

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
      facilityId: facilities.id,
      facilityName: facilities.name,
    })
    .from(floors)
    .innerJoin(facilities, eq(floors.facilityId, facilities.id))
    .where(eq(floors.id, id))
    .limit(1);

  if (!row) notFound();

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
          {row.facilityName} <span className="text-[var(--color-grid)]">/</span>{" "}
          {row.floorName}
        </span>
      </header>

      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6 py-10">
        {row.floorPlanSvg ? (
          <div className="relative w-full max-w-4xl rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-4 shadow-sm">
            <CornerMarks />
            <div
              className="[&_svg]:h-auto [&_svg]:max-h-[70vh] [&_svg]:w-full [&_svg]:mx-auto [&_svg_path]:!stroke-[var(--color-ink)]"
              dangerouslySetInnerHTML={{ __html: row.floorPlanSvg }}
            />
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-grid)] pt-3 font-mono text-xs text-[var(--color-ink-soft)]">
              <span>scale — not calibrated</span>
              <span>{row.floorName}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            This Floor has no Floor Plan yet.
          </p>
        )}
      </div>
    </main>
  );
}

function CornerMarks() {
  const base =
    "absolute h-3 w-3 border-[var(--color-ink-soft)] pointer-events-none";
  return (
    <>
      <span aria-hidden className={`${base} left-1 top-1 border-t border-l`} />
      <span aria-hidden className={`${base} right-1 top-1 border-t border-r`} />
      <span aria-hidden className={`${base} bottom-1 left-1 border-b border-l`} />
      <span aria-hidden className={`${base} right-1 bottom-1 border-b border-r`} />
    </>
  );
}

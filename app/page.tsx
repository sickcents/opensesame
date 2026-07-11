import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, facilities } from "@/db/schema";
import WorldMap from "./world-map-loader";

type FirstFloorRow = { facility_id: string; id: string };

async function getOverview() {
  try {
    const [org] = await db.select().from(organizations).limit(1);
    if (!org) return { org: null, facilityRows: [], connected: true as const };

    const orgFacilities = await db
      .select()
      .from(facilities)
      .where(eq(facilities.organizationId, org.id));

    const firstFloors = await db.execute<FirstFloorRow>(sql`
      SELECT DISTINCT ON (facility_id) facility_id, id
      FROM floors
      ORDER BY facility_id, created_at ASC
    `);
    const firstFloorByFacility = new Map(firstFloors.map((r) => [r.facility_id, r.id]));

    const facilityRows = orgFacilities.map((f) => ({
      id: f.id,
      name: f.name,
      firstFloorId: firstFloorByFacility.get(f.id) ?? null,
      lat: f.geoAnchorLat,
      lng: f.geoAnchorLng,
    }));

    return { org, facilityRows, connected: true as const };
  } catch {
    return { org: null, facilityRows: [], connected: false as const };
  }
}

export default async function Home() {
  const { org, facilityRows, connected } = await getOverview();

  const facilityCount = facilityRows.length;
  const anchoredFacilities = facilityRows.flatMap((f) =>
    f.lat != null && f.lng != null
      ? [{ id: f.id, name: f.name, lat: f.lat, lng: f.lng }]
      : [],
  );

  return (
    <main className="blueprint-grid relative min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--color-grid)] bg-[var(--color-paper)]/90 px-6 py-4 backdrop-blur-sm">
        <span className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-soft)] uppercase">
          opensesame
        </span>
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink-soft)]">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-600" : "bg-[var(--color-signal)]"}`}
          />
          {connected ? "connected" : "no database"}
          <span className="text-[var(--color-grid)]">·</span>
          {org?.name ?? "—"}
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-8 shadow-sm">
          <svg
            aria-hidden
            width="28"
            height="28"
            viewBox="0 0 28 28"
            className="mb-6 text-[var(--color-ink-soft)]"
          >
            <path
              d="M2 10 V2 H10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>

          <h1 className="font-[family-name:var(--font-display)] text-xl font-medium text-[var(--color-ink)]">
            {facilityCount === 0
              ? "No Facilities yet"
              : `${facilityCount} ${facilityCount === 1 ? "Facility" : "Facilities"}`}
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            {connected
              ? "A Facility is created by uploading a PDF for its first Floor."
              : "This build step scaffolds the schema only — connect DATABASE_URL to see live Organization and Facility data here."}
          </p>

          {anchoredFacilities.length > 0 && (
            <div className="mt-5">
              <WorldMap facilities={anchoredFacilities} />
            </div>
          )}

          {facilityRows.length > 0 && (
            <ul className="mt-5 divide-y divide-[var(--color-grid)] border-t border-[var(--color-grid)]">
              {facilityRows.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2.5">
                  <Link
                    href={`/facilities/${f.id}`}
                    className="text-sm text-[var(--color-ink)] hover:text-[var(--color-signal)]"
                  >
                    {f.name}
                  </Link>
                  {f.firstFloorId && (
                    <Link
                      href={`/floors/${f.firstFloorId}`}
                      className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                    >
                      view floor →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          {connected && (
            <Link
              href="/facilities/new"
              className="mt-6 block w-full rounded-sm bg-[var(--color-ink)] px-4 py-2.5 text-center font-mono text-sm font-medium text-[var(--color-paper)] transition-opacity hover:opacity-90"
            >
              Add a Facility
            </Link>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--color-grid)] pt-4 font-mono text-xs text-[var(--color-ink-soft)]">
            <div>
              <dt className="uppercase tracking-wide">Organization</dt>
              <dd className="mt-1 text-[var(--color-ink)]">
                {org?.name ?? "not seeded"}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Facilities</dt>
              <dd className="mt-1 text-[var(--color-ink)]">{facilityCount}</dd>
            </div>
          </dl>
        </div>
      </div>
    </main>
  );
}

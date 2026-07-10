import { db } from "@/db/client";
import { organizations, facilities } from "@/db/schema";

async function getOverview() {
  try {
    const [org] = await db.select().from(organizations).limit(1);
    const facilityCount = org
      ? (await db.select().from(facilities)).length
      : 0;
    return { org, facilityCount, connected: true as const };
  } catch {
    return { org: null, facilityCount: 0, connected: false as const };
  }
}

export default async function Home() {
  const { org, facilityCount, connected } = await getOverview();

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

      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-8 shadow-sm">
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
              ? "A Facility is created by uploading a PDF for its first Floor. That upload flow lands in a later build step."
              : "This build step scaffolds the schema only — connect DATABASE_URL to see live Organization and Facility data here."}
          </p>

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

import Link from "next/link";
import { NewFacilityForm } from "./form";

export default function NewFacilityPage() {
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
          new facility
        </span>
      </header>

      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium text-[var(--color-ink)]">
            Add a Facility
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            A Facility is created from the floor plan of its first Floor.
            Upload a PDF export and we&apos;ll trace its walls and boundaries.
          </p>

          <div className="mt-6 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-6 shadow-sm">
            <NewFacilityForm />
          </div>
        </div>
      </div>
    </main>
  );
}

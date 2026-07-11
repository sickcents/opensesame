"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createFacilityFromPdf, type CreateFacilityState } from "./actions";

const initialState: CreateFacilityState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="relative w-full overflow-hidden rounded-sm bg-[var(--color-ink)] px-4 py-2.5 text-sm font-medium text-[var(--color-paper)] transition-colors disabled:cursor-not-allowed disabled:opacity-90"
    >
      {pending && (
        <span
          aria-hidden
          className="absolute inset-0 -translate-x-full animate-[scan_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
      )}
      <span className="relative font-mono">
        {pending ? "Tracing floor plan…" : "Create Facility"}
      </span>
    </button>
  );
}

export function NewFacilityForm() {
  const [state, formAction] = useActionState(createFacilityFromPdf, initialState);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label
          htmlFor="name"
          className="block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]"
        >
          Facility name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Riverside Distribution Center"
          className="mt-1.5 w-full rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)]/60 focus:border-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)]/20"
        />
      </div>

      <div>
        <label
          htmlFor="pdf"
          className="block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]"
        >
          First floor plan (PDF)
        </label>
        <label
          htmlFor="pdf"
          className="mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--color-grid)] bg-[var(--color-paper)] px-3 py-6 text-center transition-colors hover:border-[var(--color-ink-soft)]"
        >
          <span className="text-sm text-[var(--color-ink)]">
            {fileName ?? "Choose a PDF"}
          </span>
          <span className="font-mono text-xs text-[var(--color-ink-soft)]">
            walls and boundaries only — text is stripped automatically
          </span>
        </label>
        <input
          id="pdf"
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-sm border border-[var(--color-signal)]/30 bg-[var(--color-signal)]/10 px-3 py-2 text-sm text-[var(--color-signal)]"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

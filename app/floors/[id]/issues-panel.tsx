"use client";

import { useState, useTransition } from "react";
import { resolveIssue } from "./actions";

type Issue = {
  id: string;
  subjectType: string;
  subjectLabel: string;
  reporterName: string;
  description: string;
  department: string;
  status: string;
  createdAt: string;
};

export function IssuesPanel({ floorId, issues }: { floorId: string; issues: Issue[] }) {
  const [showResolved, setShowResolved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const openIssues = issues.filter((i) => i.status === "open");
  const visible = showResolved ? issues : openIssues;

  function resolve(issueId: string) {
    setPendingId(issueId);
    startTransition(async () => {
      await resolveIssue(floorId, issueId);
      setPendingId(null);
    });
  }

  if (issues.length === 0) return null;

  return (
    <div className="w-full max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
          Issues ({openIssues.length} open)
        </h2>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-2 font-mono text-xs text-[var(--color-ink-soft)]">
          No open Issues on this Floor.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--color-grid)] border-t border-[var(--color-grid)]">
          {visible.map((issue) => (
            <li key={issue.id} className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="text-sm text-[var(--color-ink)]">{issue.description}</p>
                <p className="mt-1 font-mono text-xs text-[var(--color-ink-soft)]">
                  {issue.subjectLabel} · {issue.department} · reported by {issue.reporterName}
                  {issue.status === "resolved" && (
                    <span className="text-emerald-700"> · resolved</span>
                  )}
                </p>
              </div>
              {issue.status === "open" && (
                <button
                  type="button"
                  onClick={() => resolve(issue.id)}
                  disabled={isPending && pendingId === issue.id}
                  className="shrink-0 rounded-sm border border-[var(--color-grid)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink)] hover:border-[var(--color-ink-soft)] disabled:opacity-50"
                >
                  {isPending && pendingId === issue.id ? "Resolving…" : "Resolve"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

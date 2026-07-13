"use client";

import { useMemo, useState, useTransition } from "react";
import { paletteColorForIndex } from "@/lib/color-palette";
import { formatRelativeTime } from "@/lib/relative-time";
import { resolveIssue, type Department } from "./actions";
import type { ItemRef } from "./layer-panel";

// actions.ts is a "use server" module — only its *types* may be imported on
// the client, so the Department values live in a local array (same pattern
// as floor-plan-canvas.tsx). The fixed index in this array doubles as the
// Department's palette-color index, so pills are stable across renders.
const DEPARTMENTS: Department[] = ["IT", "Facilities", "Safety", "Security", "Operations"];

function departmentColor(department: string): string {
  const index = DEPARTMENTS.indexOf(department as Department);
  return paletteColorForIndex(index === -1 ? 0 : index);
}

// Open Issues older than this get the aging left-border accent.
const AGING_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
// Above this many open Issues the header grows an "oldest open" summary line.
const MANY_OPEN_THRESHOLD = 5;

export type Issue = {
  id: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  reporterName: string;
  description: string;
  department: string;
  status: string;
  createdAt: string;
};

type SortMode = "newest" | "department";

export function IssuesPanel({
  floorId,
  issues,
  onFocusSubject,
}: {
  floorId: string;
  issues: Issue[];
  // Owned by FloorWorkspace: clicking a card highlights its subject on the
  // Floor Plan. Optional so the panel still renders standalone (tests).
  onFocusSubject?: (ref: ItemRef) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const [filter, setFilter] = useState<"All" | Department>("All");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // One clock per mount keeps relative times and aging accents stable across
  // re-renders instead of drifting mid-interaction.
  const [now] = useState(() => new Date());

  const openIssues = useMemo(() => issues.filter((i) => i.status === "open"), [issues]);
  const allResolved = openIssues.length === 0; // issues.length === 0 returns null below

  // Chips: "All" + every Department present in the current issue set, in the
  // fixed Department order. Badge counts are open Issues only.
  const departmentsPresent = useMemo(
    () => DEPARTMENTS.filter((d) => issues.some((i) => i.department === d)),
    [issues],
  );
  const openCountFor = (department: string) =>
    openIssues.filter((i) => i.department === department).length;

  const sorted = useMemo(() => {
    const statusVisible = showResolved ? issues : openIssues;
    const filtered =
      filter === "All" ? statusVisible : statusVisible.filter((i) => i.department === filter);
    // Newest-first is both the default sort and the within-group order.
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [issues, openIssues, showResolved, filter]);

  const groups = useMemo(() => {
    if (sortMode !== "department") return null;
    return DEPARTMENTS.map(
      (d) => [d, sorted.filter((i) => i.department === d)] as const,
    ).filter(([, items]) => items.length > 0);
  }, [sortMode, sorted]);

  const oldestOpen = useMemo(
    () =>
      openIssues.reduce<Issue | null>(
        (oldest, i) =>
          !oldest || new Date(i.createdAt).getTime() < new Date(oldest.createdAt).getTime()
            ? i
            : oldest,
        null,
      ),
    [openIssues],
  );

  function resolve(issueId: string) {
    setPendingId(issueId);
    startTransition(async () => {
      await resolveIssue(floorId, issueId);
      setPendingId(null);
    });
  }

  if (issues.length === 0) return null;

  function renderCard(issue: Issue) {
    const isOpen = issue.status === "open";
    const isAging =
      isOpen && now.getTime() - new Date(issue.createdAt).getTime() > AGING_THRESHOLD_MS;
    const color = departmentColor(issue.department);
    const resolving = isPending && pendingId === issue.id;

    return (
      <article
        key={issue.id}
        className={`rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] ${
          isAging ? "border-l-2 border-l-[var(--color-signal)]" : ""
        } ${isOpen ? "" : "opacity-55"}`}
      >
        <button
          type="button"
          onClick={() =>
            onFocusSubject?.({ type: issue.subjectType as ItemRef["type"], id: issue.subjectId })
          }
          aria-label={`Locate ${issue.subjectLabel} on the Floor Plan`}
          className="block w-full px-3 pt-2.5 text-left"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-xs tracking-wide text-[var(--color-ink-soft)] uppercase">
              {issue.subjectLabel}
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink)]"
              style={{ borderColor: color, backgroundColor: `${color}26` }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {issue.department}
            </span>
          </span>
          <span className="mt-1.5 block text-sm text-[var(--color-ink)]">
            {issue.description}
          </span>
        </button>
        <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-2.5 font-mono text-xs text-[var(--color-ink-soft)]">
          <span>
            {formatRelativeTime(issue.createdAt, now)} · {issue.reporterName}
            {!isOpen && <span className="text-emerald-700"> · resolved</span>}
          </span>
          {isOpen && (
            <button
              type="button"
              onClick={() => resolve(issue.id)}
              disabled={resolving}
              aria-label={`Resolve: ${issue.description}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink)] hover:border-[var(--color-ink-soft)] disabled:opacity-50"
            >
              {/* No icon library in this repo — glyph stands in for the icon. */}
              <span aria-hidden>✓</span>
              {resolving ? "Resolving…" : "Resolve"}
            </button>
          )}
        </div>
      </article>
    );
  }

  function renderGroupHeading(department: Department, count: number) {
    const color = departmentColor(department);
    return (
      <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-[var(--color-ink-soft)] uppercase">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {department} ({count})
      </h3>
    );
  }

  return (
    <div className="w-full max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs tracking-wide text-[var(--color-ink-soft)] uppercase">
          Issues{" "}
          <span className="ml-1 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[var(--color-ink)]">
            {openIssues.length} open
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-soft)] hover:border-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
      </div>

      {/* Many-open summary: a quick severity read before scrolling the list. */}
      {openIssues.length > MANY_OPEN_THRESHOLD && oldestOpen && (
        <p className="mt-2 font-mono text-xs text-[var(--color-ink-soft)]">
          {openIssues.length} open Issues — oldest reported{" "}
          {formatRelativeTime(oldestOpen.createdAt, now)}.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          {(["All", ...departmentsPresent] as const).map((d) => {
            const active = filter === d;
            const count = d === "All" ? openIssues.length : openCountFor(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setFilter(d)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 ${
                  active
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                    : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
                }`}
              >
                {d}
                <span
                  className={`rounded-sm px-1 text-[10px] ${
                    active
                      ? "bg-[var(--color-paper)]/20"
                      : "border border-[var(--color-grid)] text-[var(--color-ink-soft)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-[var(--color-ink-soft)]">sort</span>
          {(
            [
              ["newest", "Newest"],
              ["department", "Department"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              aria-pressed={sortMode === mode}
              className={`rounded-sm border px-2 py-0.5 ${
                sortMode === mode
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                  : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* All-resolved state: distinct from "no Issues at all" (panel absent). */}
      {allResolved && (
        <div className="mt-3 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-3 py-2.5 font-mono text-xs text-[var(--color-ink-soft)]">
          <span aria-hidden className="text-emerald-700">
            ✓
          </span>{" "}
          All Issues resolved ({issues.length} total).
        </div>
      )}

      {sorted.length > 0 ? (
        <div className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {groups
            ? groups.map(([department, items]) => (
                <section key={department}>
                  {renderGroupHeading(department, items.length)}
                  <div className="space-y-2">{items.map(renderCard)}</div>
                </section>
              ))
            : sorted.map(renderCard)}
        </div>
      ) : (
        !(allResolved && filter === "All") && (
          <p className="mt-3 font-mono text-xs text-[var(--color-ink-soft)]">
            No {filter === "All" ? "" : `${filter} `}Issues to show.
          </p>
        )
      )}
    </div>
  );
}

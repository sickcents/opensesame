"use client";

import Link from "next/link";

export type FloorPickerFloor = { id: string; name: string };

export function FloorPicker({
  floors,
  currentFloorId,
}: {
  floors: FloorPickerFloor[];
  currentFloorId?: string;
}) {
  if (floors.length === 0) return null;

  return (
    <nav
      aria-label="Floors"
      className="absolute right-3 bottom-3 z-[400] max-h-[228px] w-fit max-w-28 min-w-12 overflow-y-auto rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)]/95 p-1 shadow-sm backdrop-blur-sm"
    >
      <ul className="flex flex-col gap-1">
        {floors.map((floor) => {
          const isCurrent = floor.id === currentFloorId;
          return (
            <li key={floor.id}>
              <Link
                href={`/floors/${floor.id}`}
                aria-current={isCurrent ? "page" : undefined}
                title={floor.name}
                className={`block truncate rounded-sm border px-2.5 py-1.5 text-center font-mono text-xs whitespace-nowrap ${
                  isCurrent
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                    : "border-[var(--color-grid)] bg-[var(--color-panel)] text-[var(--color-ink)] hover:border-[var(--color-ink-soft)]"
                }`}
              >
                {floor.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

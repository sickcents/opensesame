"use client";

import { useState, useTransition } from "react";
import { normalizeRotation90 } from "@/lib/rotation";
import { deleteItem, renameItem, rotateEquipment } from "./actions";
import { ColorPickerPopover } from "./color-picker-popover";

export type SelectedItem = {
  type: "room" | "area" | "equipment" | "safety_equipment";
  id: string;
  label: string;
  rotationDeg?: number;
};

const BTN =
  "rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-2 py-0.5 " +
  "text-[var(--color-ink)] hover:border-[var(--color-ink-soft)] disabled:opacity-50";

export function FloatingToolbar({
  floorId,
  items,
  position,
  onDeleted,
  onError,
  onRotated,
  onRenamed,
  onColorApplied,
}: {
  floorId: string;
  items: SelectedItem[];
  position: { left: number; top: number };
  onDeleted: () => void;
  onError: (message: string) => void;
  // Post-success notifications — the canvas records undo entries from these.
  onRotated?: (item: SelectedItem, nextDeg: number) => void;
  onRenamed?: (item: SelectedItem, value: string) => void;
  onColorApplied?: (item: SelectedItem, color: string | null) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const single = items.length === 1 ? items[0] : null;
  if (items.length === 0) return null;

  function fail(err: unknown, fallback: string) {
    onError(err instanceof Error ? err.message : fallback);
  }

  function rotate() {
    if (!single || single.type !== "equipment") return;
    const item = single;
    const next = normalizeRotation90((item.rotationDeg ?? 0) + 90);
    startTransition(async () => {
      try {
        await rotateEquipment(floorId, item.id, next);
        onRotated?.(item, next);
      } catch (err) {
        fail(err, "Couldn't rotate the Equipment.");
      }
    });
  }

  function commitRename() {
    if (!single) return;
    setRenaming(false);
    if (draft.trim() === single.label) return;
    const item = single;
    const value = draft;
    startTransition(async () => {
      try {
        await renameItem(floorId, item.type, item.id, value);
        onRenamed?.(item, value);
      } catch (err) {
        fail(err, "Couldn't rename the item.");
      }
    });
  }

  function removeSelection() {
    const toDelete = items;
    startTransition(async () => {
      try {
        await Promise.all(toDelete.map((i) => deleteItem(floorId, i.type, i.id)));
        onDeleted();
      } catch (err) {
        fail(err, "Couldn't delete the selection.");
      }
    });
  }

  return (
    <div
      className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)]/95 px-1.5 py-1 font-mono text-xs shadow-sm backdrop-blur-sm"
      style={{ left: position.left, top: position.top - 8 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {renaming && single ? (
        <input
          autoFocus
          value={draft}
          aria-label="Item name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="w-32 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-1.5 py-0.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
        />
      ) : (
        <span className="max-w-40 truncate px-1 text-[var(--color-ink)]">
          {single ? single.label : `${items.length} selected`}
        </span>
      )}

      {single?.type === "equipment" && (
        <button type="button" disabled={isPending} onClick={rotate} className={BTN}>
          Rotate 90°
        </button>
      )}
      {single && single.type !== "safety_equipment" && (
        <span className="relative">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setColorOpen((open) => !open)}
            className={BTN}
          >
            Color
          </button>
          {colorOpen && (
            <ColorPickerPopover
              floorId={floorId}
              itemType={single.type}
              itemId={single.id}
              onClose={() => setColorOpen(false)}
              onError={onError}
              onApplied={(color) => onColorApplied?.(single, color)}
            />
          )}
        </span>
      )}
      {single && !renaming && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setDraft(single.label);
            setRenaming(true);
          }}
          className={BTN}
        >
          Rename
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={removeSelection}
        className={`${BTN} text-[var(--color-signal)]`}
      >
        Delete
      </button>
    </div>
  );
}

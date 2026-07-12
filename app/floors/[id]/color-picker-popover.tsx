"use client";

import { useState, useTransition } from "react";
import { COLOR_PALETTE } from "@/lib/color-palette";
import { setItemColor } from "./actions";

// Mirrors the server's HEX_COLOR_RE (actions.ts setItemColor) so bad input
// fails before the round-trip.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorPickerPopover({
  floorId,
  itemType,
  itemId,
  onClose,
  onError,
  onApplied,
}: {
  floorId: string;
  itemType: "room" | "area" | "equipment";
  itemId: string;
  onClose: () => void;
  onError: (message: string) => void;
  // Fires after a successful save — the canvas records the undo entry.
  onApplied?: (color: string | null) => void;
}) {
  const [hexDraft, setHexDraft] = useState("");
  const [hexError, setHexError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(color: string | null) {
    startTransition(async () => {
      try {
        await setItemColor(floorId, itemType, itemId, color);
        onApplied?.(color);
        onClose();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Couldn't set the color.");
      }
    });
  }

  function submitHex() {
    const value = hexDraft.trim();
    if (!HEX_COLOR_RE.test(value)) {
      setHexError("Use a hex value like #6f9490.");
      return;
    }
    setHexError(null);
    apply(value);
  }

  return (
    <>
      {/* Invisible click-outside backdrop — a lighter take on the report-issue
          modal's fixed-overlay pattern; the popover sits above it. */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 top-full z-40 mt-1 w-44 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] p-2 shadow-sm">
        <div className="grid grid-cols-6 gap-1">
          {COLOR_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              disabled={isPending}
              onClick={() => apply(hex)}
              style={{ backgroundColor: hex }}
              className="h-5 w-5 rounded-sm border border-[var(--color-grid)] hover:border-[var(--color-ink)] disabled:opacity-50"
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <input
            type="text"
            value={hexDraft}
            aria-label="Hex color"
            placeholder="#6f9490"
            onChange={(e) => setHexDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") submitHex();
              if (e.key === "Escape") onClose();
            }}
            className="w-full min-w-0 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-1.5 py-0.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={submitHex}
            className="rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[var(--color-ink)] hover:border-[var(--color-ink-soft)] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
        {hexError && (
          <p role="alert" className="mt-1 text-[10px] text-[var(--color-signal)]">
            {hexError}
          </p>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => apply(null)}
          className="mt-2 w-full rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[var(--color-ink-soft)] hover:border-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-50"
        >
          Reset to default
        </button>
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export type ItemRef = { type: "room" | "area" | "equipment" | "safety_equipment"; id: string };

/** Stable key into the session-only hidden-item set shared by 2D and 3D. */
export function itemKey(ref: ItemRef): string {
  return `${ref.type}:${ref.id}`;
}

export type LayerRow = { id: string; label: string };

const FOLDERS: { type: ItemRef["type"]; name: string }[] = [
  { type: "room", name: "Rooms" },
  { type: "area", name: "Areas" },
  { type: "equipment", name: "Equipment" },
  { type: "safety_equipment", name: "Safety Equipment" },
];

// No icon library in this repo — visibility is a filled/hollow dot toggle.
const VISIBLE_GLYPH = "◉";
const HIDDEN_GLYPH = "○";

export function LayerPanel({
  rooms,
  areas,
  equipment,
  safetyEquipment,
  selection,
  hiddenIds,
  onSelect,
  onRename,
  onToggleVisibility,
  onToggleFolderVisibility,
}: {
  rooms: LayerRow[];
  areas: LayerRow[];
  equipment: LayerRow[];
  safetyEquipment: LayerRow[];
  selection: ItemRef[];
  hiddenIds: ReadonlySet<string>;
  onSelect: (ref: ItemRef, centerOnCanvas: boolean) => void;
  onRename: (ref: ItemRef, newLabel: string) => void;
  onToggleVisibility: (ref: ItemRef) => void;
  onToggleFolderVisibility: (folderType: ItemRef["type"]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // Canvas → panel sync: reveal the row for the most recent selection.
  useEffect(() => {
    const last = selection[selection.length - 1];
    if (!last) return;
    rowRefs.current.get(itemKey(last))?.scrollIntoView?.({ block: "nearest" });
  }, [selection]);

  const rowsByType: Record<ItemRef["type"], LayerRow[]> = {
    room: rooms,
    area: areas,
    equipment,
    safety_equipment: safetyEquipment,
  };

  function toggleFolderOpen(type: ItemRef["type"]) {
    setClosedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function commitRename(ref: ItemRef, currentLabel: string) {
    setRenamingKey(null);
    if (draft.trim() === currentLabel) return;
    onRename(ref, draft);
  }

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Expand layer panel"
        onClick={() => setCollapsed(false)}
        className="h-fit shrink-0 rounded-sm border border-[var(--color-grid)] bg-[var(--color-panel)] px-1.5 py-1 font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
      >
        Layers ▸
      </button>
    );
  }

  return (
    <aside className="max-h-[70vh] w-52 shrink-0 overflow-y-auto rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] font-mono text-xs">
      <div className="flex items-center justify-between border-b border-[var(--color-grid)] px-2 py-1">
        <span className="uppercase tracking-wide text-[var(--color-ink-soft)]">Layers</span>
        <button
          type="button"
          aria-label="Collapse layer panel"
          onClick={() => setCollapsed(true)}
          className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          ◂
        </button>
      </div>

      {FOLDERS.map(({ type, name }) => {
        const rows = rowsByType[type];
        const open = !closedFolders.has(type);
        const allHidden =
          rows.length > 0 && rows.every((r) => hiddenIds.has(itemKey({ type, id: r.id })));
        return (
          <section key={type} className="border-b border-[var(--color-grid)] last:border-b-0">
            <div className="flex items-center justify-between px-2 py-1">
              <button
                type="button"
                onClick={() => toggleFolderOpen(type)}
                className="flex-1 truncate text-left text-[var(--color-ink)]"
              >
                <span aria-hidden className="mr-1 text-[var(--color-ink-soft)]">
                  {open ? "▾" : "▸"}
                </span>
                {name} ({rows.length})
              </button>
              <button
                type="button"
                aria-label={allHidden ? `Show all ${name}` : `Hide all ${name}`}
                onClick={() => onToggleFolderVisibility(type)}
                className="ml-1 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                {allHidden ? HIDDEN_GLYPH : VISIBLE_GLYPH}
              </button>
            </div>

            {open && rows.length > 0 && (
              <ul>
                {rows.map((row) => {
                  const ref: ItemRef = { type, id: row.id };
                  const key = itemKey(ref);
                  const hidden = hiddenIds.has(key);
                  const selected = selection.some((s) => s.type === type && s.id === row.id);
                  return (
                    <li
                      key={row.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(key, el);
                        else rowRefs.current.delete(key);
                      }}
                      className={`flex items-center gap-1 py-0.5 pl-5 pr-2 ${
                        selected ? "bg-[#2563eb]/10" : ""
                      }`}
                    >
                      {renamingKey === key ? (
                        <input
                          autoFocus
                          value={draft}
                          aria-label="Item name"
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commitRename(ref, row.label)}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") commitRename(ref, row.label);
                            if (e.key === "Escape") setRenamingKey(null);
                          }}
                          className="w-full min-w-0 rounded-sm border border-[var(--color-grid)] bg-[var(--color-paper)] px-1 py-0 text-xs text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelect(ref, true)}
                          onDoubleClick={() => {
                            setDraft(row.label);
                            setRenamingKey(key);
                          }}
                          className={`flex-1 truncate text-left ${
                            hidden
                              ? "text-[var(--color-ink-soft)] opacity-50"
                              : "text-[var(--color-ink)]"
                          }`}
                        >
                          {row.label}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`${hidden ? "Show" : "Hide"} ${row.label}`}
                        onClick={() => onToggleVisibility(ref)}
                        className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                      >
                        {hidden ? HIDDEN_GLYPH : VISIBLE_GLYPH}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </aside>
  );
}

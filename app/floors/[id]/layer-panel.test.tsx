import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerPanel, itemKey, type ItemRef, type LayerRow } from "./layer-panel";

const rooms: LayerRow[] = [
  { id: "r1", label: "Room 101" },
  { id: "r2", label: "Assembly" },
];
const areas: LayerRow[] = [{ id: "a1", label: "Loading dock walkway" }];
const equipment: LayerRow[] = [{ id: "e1", label: "Lathe" }];

function renderPanel(overrides: Partial<Parameters<typeof LayerPanel>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onToggleVisibility: vi.fn(),
    onToggleFolderVisibility: vi.fn(),
  };
  render(
    <LayerPanel
      rooms={rooms}
      areas={areas}
      equipment={equipment}
      safetyEquipment={[]}
      selection={[]}
      hiddenIds={new Set()}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("LayerPanel", () => {
  it("renders the four fixed folders with item counts", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Rooms (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Areas (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Equipment (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Safety Equipment (0)" })).toBeInTheDocument();
  });

  it("selects and centers an item when its row is clicked", () => {
    const { onSelect } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Room 101" }));
    expect(onSelect).toHaveBeenCalledWith({ type: "room", id: "r1" }, true);
  });

  it("toggles a single item's visibility", () => {
    const { onToggleVisibility } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Lathe" }));
    expect(onToggleVisibility).toHaveBeenCalledWith({ type: "equipment", id: "e1" });
  });

  it("labels a hidden item's toggle as Show", () => {
    const ref: ItemRef = { type: "room", id: "r1" };
    const { onToggleVisibility } = renderPanel({ hiddenIds: new Set([itemKey(ref)]) });
    fireEvent.click(screen.getByRole("button", { name: "Show Room 101" }));
    expect(onToggleVisibility).toHaveBeenCalledWith(ref);
  });

  it("toggles a whole folder's visibility in one action", () => {
    const { onToggleFolderVisibility } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide all Rooms" }));
    expect(onToggleFolderVisibility).toHaveBeenCalledWith("room");
  });

  it("renames via double-click, inline input, and Enter", () => {
    const { onRename } = renderPanel();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Assembly" }));
    const input = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.change(input, { target: { value: "Paint shop" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith({ type: "room", id: "r2" }, "Paint shop");
  });

  it("does not rename when the label is unchanged", () => {
    const { onRename } = renderPanel();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Assembly" }));
    const input = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
  });

  it("collapses a folder without losing the others", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Rooms (2)" }));
    expect(screen.queryByRole("button", { name: "Room 101" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lathe" })).toBeInTheDocument();
  });
});

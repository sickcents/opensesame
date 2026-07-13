import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FloatingToolbar, type SelectedItem } from "./floating-toolbar";
import { deleteItem, renameItem, rotateEquipment } from "./actions";

vi.mock("./actions", () => ({
  rotateEquipment: vi.fn(async () => {}),
  renameItem: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
}));

const position = { left: 120, top: 60 };

function renderToolbar(items: SelectedItem[], onDeleted = vi.fn(), onError = vi.fn()) {
  render(
    <FloatingToolbar
      floorId="floor-1"
      items={items}
      position={position}
      onDeleted={onDeleted}
      onError={onError}
    />,
  );
  return { onDeleted, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FloatingToolbar", () => {
  it("rotates a single selected Equipment clockwise by +90°", async () => {
    renderToolbar([{ type: "equipment", id: "eq-1", label: "Lathe", rotationDeg: 180 }]);
    fireEvent.click(screen.getByRole("button", { name: "Rotate clockwise" }));
    await waitFor(() =>
      expect(rotateEquipment).toHaveBeenCalledWith("floor-1", "eq-1", 270),
    );
  });

  it("wraps clockwise rotation from 270° back to 0°", async () => {
    renderToolbar([{ type: "equipment", id: "eq-1", label: "Lathe", rotationDeg: 270 }]);
    fireEvent.click(screen.getByRole("button", { name: "Rotate clockwise" }));
    await waitFor(() =>
      expect(rotateEquipment).toHaveBeenCalledWith("floor-1", "eq-1", 0),
    );
  });

  it("rotates a single selected Equipment counter-clockwise by -90°", async () => {
    renderToolbar([{ type: "equipment", id: "eq-1", label: "Lathe", rotationDeg: 180 }]);
    fireEvent.click(screen.getByRole("button", { name: "Rotate counter-clockwise" }));
    await waitFor(() =>
      expect(rotateEquipment).toHaveBeenCalledWith("floor-1", "eq-1", 90),
    );
  });

  it("wraps counter-clockwise rotation from 0° back to 270°", async () => {
    renderToolbar([{ type: "equipment", id: "eq-1", label: "Lathe", rotationDeg: 0 }]);
    fireEvent.click(screen.getByRole("button", { name: "Rotate counter-clockwise" }));
    await waitFor(() =>
      expect(rotateEquipment).toHaveBeenCalledWith("floor-1", "eq-1", 270),
    );
  });

  it("hides Rotate and Color for non-Equipment selections", () => {
    renderToolbar([{ type: "safety_equipment", id: "s-1", label: "Exit" }]);
    expect(screen.queryByRole("button", { name: "Rotate clockwise" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rotate counter-clockwise" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Color" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
  });

  it("deletes every selected item and reports back", async () => {
    const { onDeleted } = renderToolbar([
      { type: "equipment", id: "eq-1", label: "Lathe", rotationDeg: 0 },
      { type: "room", id: "r-1", label: "Room 101" },
    ]);
    // Multi-select: only Delete is offered.
    expect(screen.queryByRole("button", { name: "Rotate clockwise" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleteItem).toHaveBeenCalledWith("floor-1", "equipment", "eq-1");
      expect(deleteItem).toHaveBeenCalledWith("floor-1", "room", "r-1");
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it("renames via the inline input on Enter", async () => {
    renderToolbar([{ type: "room", id: "r-1", label: "Room 101" }]);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.change(input, { target: { value: "Assembly" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(renameItem).toHaveBeenCalledWith("floor-1", "room", "r-1", "Assembly"),
    );
  });

  it("surfaces server action errors through onError", async () => {
    vi.mocked(rotateEquipment).mockRejectedValueOnce(new Error("nope"));
    const { onError } = renderToolbar([
      { type: "equipment", id: "eq-1", label: "Lathe", rotationDeg: 0 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Rotate clockwise" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("nope"));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ColorPickerPopover } from "./color-picker-popover";
import { setItemColor } from "./actions";

vi.mock("./actions", () => ({
  setItemColor: vi.fn(async () => {}),
}));

function renderPopover() {
  const onClose = vi.fn();
  const onError = vi.fn();
  render(
    <ColorPickerPopover
      floorId="floor-1"
      itemType="room"
      itemId="r-1"
      onClose={onClose}
      onError={onError}
    />,
  );
  return { onClose, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ColorPickerPopover", () => {
  it("applies a palette swatch and closes", async () => {
    const { onClose } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "#6f9490" }));
    await waitFor(() => {
      expect(setItemColor).toHaveBeenCalledWith("floor-1", "room", "r-1", "#6f9490");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("rejects an invalid hex value before the round-trip", () => {
    renderPopover();
    fireEvent.change(screen.getByRole("textbox", { name: "Hex color" }), {
      target: { value: "red" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(setItemColor).not.toHaveBeenCalled();
  });

  it("applies a valid free hex value", async () => {
    renderPopover();
    fireEvent.change(screen.getByRole("textbox", { name: "Hex color" }), {
      target: { value: "#a1b2c3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(setItemColor).toHaveBeenCalledWith("floor-1", "room", "r-1", "#a1b2c3"),
    );
  });

  it("resets to the default color with null", async () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() =>
      expect(setItemColor).toHaveBeenCalledWith("floor-1", "room", "r-1", null),
    );
  });

  it("surfaces server errors through onError", async () => {
    vi.mocked(setItemColor).mockRejectedValueOnce(new Error("nope"));
    const { onError, onClose } = renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "#b07a5e" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("nope"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

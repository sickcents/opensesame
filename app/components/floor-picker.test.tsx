import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloorPicker } from "./floor-picker";

const floors = [
  { id: "f1", name: "Ground" },
  { id: "f2", name: "1" },
  { id: "f3", name: "B1" },
];

describe("FloorPicker", () => {
  it("renders one control per floor with the floor's name", () => {
    render(<FloorPicker floors={floors} currentFloorId="f1" />);
    expect(screen.getByRole("link", { name: "Ground" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B1" })).toBeInTheDocument();
  });

  it("links each Floor button to /floors/[id]", () => {
    render(<FloorPicker floors={floors} currentFloorId="f1" />);
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute(
      "href",
      "/floors/f2",
    );
  });

  it("marks the current Floor for assistive tech", () => {
    render(<FloorPicker floors={floors} currentFloorId="f2" />);
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Ground" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders nothing when there are no Floors", () => {
    const { container } = render(<FloorPicker floors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

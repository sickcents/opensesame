import { describe, expect, it } from "vitest";
import {
  AREA_DEFAULT_COLOR,
  COLOR_PALETTE,
  effectiveColor,
  paletteColorForIndex,
} from "./color-palette";

describe("COLOR_PALETTE", () => {
  it("holds distinct 7-char hex values, none of them a reserved accent", () => {
    const reserved = ["#e2572b", "#1b4b6b", "#4c7191"];
    expect(new Set(COLOR_PALETTE).size).toBe(COLOR_PALETTE.length);
    for (const color of COLOR_PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(reserved).not.toContain(color);
    }
    expect(COLOR_PALETTE).not.toContain(AREA_DEFAULT_COLOR);
  });
});

describe("paletteColorForIndex", () => {
  it("cycles past the palette length", () => {
    expect(paletteColorForIndex(COLOR_PALETTE.length)).toBe(paletteColorForIndex(0));
    expect(paletteColorForIndex(COLOR_PALETTE.length + 3)).toBe(paletteColorForIndex(3));
  });

  it("gives adjacent indices different colors", () => {
    expect(paletteColorForIndex(0)).not.toBe(paletteColorForIndex(1));
  });
});

describe("effectiveColor", () => {
  it("returns the override when set, for every kind", () => {
    expect(effectiveColor({ kind: "room", color: "#123456", createdIndex: 2 })).toBe("#123456");
    expect(effectiveColor({ kind: "area", color: "#123456" })).toBe("#123456");
    expect(
      effectiveColor({ kind: "equipment", color: "#123456", typeDefaultColor: "#4c7191" }),
    ).toBe("#123456");
  });

  it("defaults a Room to its creation-order palette color", () => {
    expect(effectiveColor({ kind: "room", color: null, createdIndex: 5 })).toBe(
      paletteColorForIndex(5),
    );
  });

  it("defaults an Area to the neutral hatch-gray", () => {
    expect(effectiveColor({ kind: "area", color: null })).toBe(AREA_DEFAULT_COLOR);
  });

  it("defaults Equipment to its type's default color", () => {
    expect(effectiveColor({ kind: "equipment", color: null, typeDefaultColor: "#4c7191" })).toBe(
      "#4c7191",
    );
  });
});

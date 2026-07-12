import { describe, expect, it } from "vitest";
import { computeFitBounds } from "./geo";

const occupied: [number, number][] = [
  [51.0, 4.0],
  [51.0, 4.0005],
  [51.0005, 4.0005],
];
const outline: [number, number][] = [
  [51.0, 4.0],
  [51.0, 4.001],
  [51.001, 4.001],
  [51.001, 4.0],
];
const footprint: [number, number][] = [
  [40.0, -74.0],
  [40.0, -73.999],
  [40.001, -73.999],
  [40.001, -74.0],
];
const pin = { lat: 48.8584, lng: 2.2945 };

describe("computeFitBounds", () => {
  it("falls back to zoom 18 on the pin when only a pin exists", () => {
    expect(
      computeFitBounds({
        occupiedPortion: null,
        osmOutline: null,
        floorPlanFootprint: null,
        pin,
      }),
    ).toEqual({ kind: "view", center: [48.8584, 2.2945], zoom: 18 });
  });

  it("falls back to a world view when nothing exists", () => {
    expect(
      computeFitBounds({
        occupiedPortion: null,
        osmOutline: null,
        floorPlanFootprint: null,
        pin: null,
      }),
    ).toEqual({ kind: "view", center: [20, 0], zoom: 2 });
  });

  it("returns bounds covering the floor-plan footprint corners", () => {
    expect(
      computeFitBounds({
        occupiedPortion: null,
        osmOutline: null,
        floorPlanFootprint: footprint,
        pin,
      }),
    ).toEqual({ kind: "bounds", points: footprint });
  });

  it("prefers the OSM outline over the footprint and pin", () => {
    expect(
      computeFitBounds({
        occupiedPortion: null,
        osmOutline: outline,
        floorPlanFootprint: footprint,
        pin,
      }),
    ).toEqual({ kind: "bounds", points: outline });
  });

  it("prefers the occupied portion over everything else", () => {
    expect(
      computeFitBounds({
        occupiedPortion: occupied,
        osmOutline: outline,
        floorPlanFootprint: footprint,
        pin,
      }),
    ).toEqual({ kind: "bounds", points: occupied });
  });

  it("skips empty point arrays when picking the highest-priority geometry", () => {
    expect(
      computeFitBounds({
        occupiedPortion: [],
        osmOutline: null,
        floorPlanFootprint: footprint,
        pin: null,
      }),
    ).toEqual({ kind: "bounds", points: footprint });
  });
});

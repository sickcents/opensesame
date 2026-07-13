// User-customizable colors for Rooms/Areas/Equipment on the Floor Plan.
// Muted, architectural-plan hues, deliberately distant from the app's
// reserved accents (#e2572b signal, #1b4b6b ink-blue, #4c7191 muted blue)
// so a custom fill never reads as selection, routing, or safety UI.
export const COLOR_PALETTE: readonly string[] = [
  "#6f9490", // dusty teal
  "#b07a5e", // clay
  "#8a9b6e", // sage
  "#8b7f9e", // muted violet
  "#c2a25c", // ochre
  "#b58a8a", // dusty rose
  "#4e6e58", // pine
  "#96687c", // plum
  "#c7b299", // sand
  "#7e6a5a", // umber
  "#5c6b73", // gunmetal
  "#a4b494", // celadon
];

/**
 * Deterministic palette color for the Nth newly-created item, cycling
 * through COLOR_PALETTE by creation order so adjacent items differ without
 * manual action.
 */
export function paletteColorForIndex(index: number): string {
  const n = COLOR_PALETTE.length;
  return COLOR_PALETTE[((index % n) + n) % n];
}

// Neutral hatch-gray for Areas, intentionally not a COLOR_PALETTE entry.
export const AREA_DEFAULT_COLOR = "#9aa0a6";

// Default Equipment fill until equipment_types grow a per-type color column.
export const EQUIPMENT_DEFAULT_COLOR = "#4c7191";

// Exit safety-equipment marker fill (2D + 3D). Deliberately saturated —
// standard "exit sign" green — so it reads clearly against both the muted
// COLOR_PALETTE hues above and the orange --color-signal safety/selection
// accent used elsewhere, rather than blending in with either.
export const EXIT_GREEN = "#15803d";

/**
 * item.color if set, else the type-appropriate default. Single shared
 * resolver so 2D SVG fill/stroke and 3D material color can never disagree:
 * Rooms default to their creation-order palette color, Areas to the neutral
 * hatch-gray, Equipment to its type's default.
 */
export function effectiveColor(
  input:
    | { kind: "room"; color: string | null; createdIndex: number }
    | { kind: "area"; color: string | null }
    | { kind: "equipment"; color: string | null; typeDefaultColor: string },
): string {
  if (input.color) return input.color;
  switch (input.kind) {
    case "room":
      return paletteColorForIndex(input.createdIndex);
    case "area":
      return AREA_DEFAULT_COLOR;
    case "equipment":
      return input.typeDefaultColor;
  }
}

import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  pgEnum,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["editor", "member"]);

// Top-level tenant. All other data is scoped to exactly one Organization.
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Role is documented but not enforced in this build (ADR-0007: no auth) —
// the column exists so a future auth addition gates existing actions
// instead of inventing the boundary from scratch.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A Facility's Geo-Anchor (lat/lng + rotation) is set once, shared across
// all its Floors (ADR-0002). Null until issue #4 (Geo-Anchoring) is done.
export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  geoAnchorLat: doublePrecision("geo_anchor_lat"),
  geoAnchorLng: doublePrecision("geo_anchor_lng"),
  geoAnchorRotationDeg: doublePrecision("geo_anchor_rotation_deg"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// pdfUrl/floorPlanSvg are populated by issue #2 (extraction), scale factor
// by issue #3 (Scale Calibration). Null until those land.
export const floors = pgTable("floors", {
  id: uuid("id").primaryKey().defaultRandom(),
  facilityId: uuid("facility_id")
    .notNull()
    .references(() => facilities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pdfUrl: text("pdf_url"),
  floorPlanSvg: text("floor_plan_svg"),
  scaleMetersPerSvgUnit: doublePrecision("scale_meters_per_svg_unit"),
  floorToFloorHeightM: doublePrecision("floor_to_floor_height_m"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Catalog entry defining a display name and default real-world footprint.
// Adding a new type is a data change, not a schema change (no per-instance
// resizing or free-form equipment in v1 — every Equipment inherits its
// type's footprint as-is).
export const equipmentTypes = pgTable("equipment_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  widthM: doublePrecision("width_m").notNull(),
  depthM: doublePrecision("depth_m").notNull(),
  heightM: doublePrecision("height_m").notNull(),
});

// An instance of an Equipment Type placed on a Floor Plan. Position is the
// rectangle's center, in real-world meters (via the Floor's Scale
// Calibration) — never raw SVG coordinates.
export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  floorId: uuid("floor_id")
    .notNull()
    .references(() => floors.id, { onDelete: "cascade" }),
  equipmentTypeId: uuid("equipment_type_id")
    .notNull()
    .references(() => equipmentTypes.id, { onDelete: "restrict" }),
  xMeters: doublePrecision("x_meters").notNull(),
  yMeters: doublePrecision("y_meters").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

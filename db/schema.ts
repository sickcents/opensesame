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

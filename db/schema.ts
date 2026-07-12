import {
  pgTable,
  uuid,
  text,
  timestamp,
  doublePrecision,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";

// PostGIS polygon geometry, stored in a Floor's local real-world meters
// (SRID 0 — a planar local coordinate system, not lat/lng). Drizzle has no
// built-in geometry type; reads/writes for this column go through raw SQL
// (ST_GeomFromText / ST_AsText) rather than the typed query builder — see
// lib/wkt.ts and the room/area actions.
const geometryPolygon = customType<{ data: string }>({
  dataType() {
    return "geometry(Polygon, 0)";
  },
});

const geometryPoint = customType<{ data: string }>({
  dataType() {
    return "geometry(Point, 0)";
  },
});

export const safetyEquipmentKindEnum = pgEnum("safety_equipment_kind", [
  "exit",
  "fire_extinguisher",
  "first_aid",
  "emergency_shower",
]);

export const issueSubjectTypeEnum = pgEnum("issue_subject_type", [
  "room",
  "area",
  "equipment",
  "safety_equipment",
]);

export const departmentEnum = pgEnum("department", [
  "IT",
  "Facilities",
  "Safety",
  "Security",
  "Operations",
]);

export const issueStatusEnum = pgEnum("issue_status", ["open", "resolved"]);

// Routing classification for Areas (issue #14). "restricted" covers both
// "not accessible" and "obstruction" — the router treats them identically.
// Existing Areas default to "walkway" so no backfill is needed. Rooms get no
// kind — Room interiors are always walkable in v1.
export const areaKindEnum = pgEnum("area_kind", ["walkway", "ppe_required", "restricted"]);

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
// The OSM reference outline and occupied-portion polygon are lat/lng map
// annotations for the Geo-Anchor view only — stored as GeoJSON text, not
// PostGIS geometry, because they aren't the real-world-meters spatial data
// ADR-0006 governs and nothing queries them spatially. The outline is
// cached so re-renders don't re-hit Overpass.
export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  geoAnchorLat: doublePrecision("geo_anchor_lat"),
  geoAnchorLng: doublePrecision("geo_anchor_lng"),
  geoAnchorRotationDeg: doublePrecision("geo_anchor_rotation_deg"),
  osmWayId: text("osm_way_id"),
  osmOutlineGeojson: text("osm_outline_geojson"),
  occupiedPortionGeojson: text("occupied_portion_geojson"),
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
// rectangle's center, a PostGIS point in real-world meters (via the Floor's
// Scale Calibration) — never raw SVG coordinates (ADR-0006).
export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  floorId: uuid("floor_id")
    .notNull()
    .references(() => floors.id, { onDelete: "cascade" }),
  equipmentTypeId: uuid("equipment_type_id")
    .notNull()
    .references(() => equipmentTypes.id, { onDelete: "restrict" }),
  geom: geometryPoint("geom").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A point marker for a life-safety item (exit, fire extinguisher, ...).
// Unlike Equipment, it has no footprint — a location, not a placed object
// with real-world size. Same PostGIS point storage as Equipment.
export const safetyEquipment = pgTable("safety_equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  floorId: uuid("floor_id")
    .notNull()
    .references(() => floors.id, { onDelete: "cascade" }),
  kind: safetyEquipmentKindEnum("kind").notNull(),
  geom: geometryPoint("geom").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A polymorphic problem report referencing exactly one Room, Area, Equipment,
// or Safety Equipment instance (subjectType + subjectId). No login: reporter
// is a free-text name (ADR-0007). Department routes the report but does not
// gate who can resolve it — there's no access control in this build. Postgres
// can't FK a single column across four different subject tables, so subjectId
// is validated at the application layer instead.
export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: issueSubjectTypeEnum("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  reporterName: text("reporter_name").notNull(),
  description: text("description").notNull(),
  department: departmentEnum("department").notNull(),
  status: issueStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// An enclosed space, arbitrary polygon, mapped against the Floor Plan's
// real-world coordinates (ADR-0006: PostGIS geometry, not JSON).
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  floorId: uuid("floor_id")
    .notNull()
    .references(() => floors.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  geom: geometryPolygon("geom").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A polygon region that isn't an enclosed Room (walkway, PPE zone, ...).
// Same geometry as Room, distinguished by not representing a walled space.
export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  floorId: uuid("floor_id")
    .notNull()
    .references(() => floors.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: areaKindEnum("kind").notNull().default("walkway"),
  geom: geometryPolygon("geom").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

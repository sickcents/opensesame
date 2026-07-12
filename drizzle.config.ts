import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Without this, drizzle-kit treats PostGIS's own system tables (e.g.
  // spatial_ref_sys, absent from schema.ts) as orphaned and proposes
  // dropping them on every push.
  extensionsFilters: ["postgis"],
});

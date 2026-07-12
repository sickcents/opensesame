import postgres from "postgres";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { organizations, equipmentTypes, facilities } from "./schema";

const DEFAULT_EQUIPMENT_TYPES = [
  { name: "Server Rack", widthM: 0.6, depthM: 1.0, heightM: 2.0 },
  { name: "Network Rack", widthM: 0.6, depthM: 0.8, heightM: 2.0 },
  { name: "UPS Rack", widthM: 0.6, depthM: 1.0, heightM: 1.8 },
  { name: "Security Rack", widthM: 0.6, depthM: 0.8, heightM: 1.6 },
];

async function main() {
  const raw = postgres(process.env.DATABASE_URL!, { max: 1 });
  await raw`CREATE EXTENSION IF NOT EXISTS postgis`;
  await raw.end();

  const existing = await db.select().from(organizations).limit(1);
  if (existing.length === 0) {
    await db.insert(organizations).values({ name: "Demo Organization" });
    console.log("Seeded Demo Organization");
  } else {
    console.log("Organization already seeded, skipping");
  }

  const existingTypes = await db.select().from(equipmentTypes).limit(1);
  if (existingTypes.length === 0) {
    await db.insert(equipmentTypes).values(DEFAULT_EQUIPMENT_TYPES);
    console.log("Seeded Equipment Type catalog");
  } else {
    console.log("Equipment Type catalog already seeded, skipping");
  }

  const existingHub = await db
    .select()
    .from(facilities)
    .where(eq(facilities.name, "HUB1"))
    .limit(1);
  if (existingHub.length === 0) {
    const [org] = await db.select().from(organizations).limit(1);
    // Left unanchored on purpose — Geo-Anchoring is a manual Editor step.
    await db.insert(facilities).values({
      organizationId: org.id,
      name: "HUB1",
      osmWayId: "198458289",
    });
    console.log("Seeded HUB1 facility");
  } else {
    console.log("HUB1 facility already seeded, skipping");
  }
}

main().then(() => process.exit(0));

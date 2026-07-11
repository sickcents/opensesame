import postgres from "postgres";
import { db } from "./client";
import { organizations, equipmentTypes } from "./schema";

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
}

main().then(() => process.exit(0));

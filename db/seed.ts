import postgres from "postgres";
import { db } from "./client";
import { organizations } from "./schema";

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
}

main().then(() => process.exit(0));

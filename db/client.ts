import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy: a missing/invalid DATABASE_URL should surface as a query-time error
// that callers can catch, not a build-time crash (e.g. static generation
// before a database is provisioned).
const client = postgres(process.env.DATABASE_URL ?? "postgres://unset", {
  max: 1,
});

export const db = drizzle(client, { schema });

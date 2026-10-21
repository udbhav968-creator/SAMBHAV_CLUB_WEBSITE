import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type DB = NodePgDatabase<typeof schema>;
export function createDb(url: string, max = 10): { db: DB; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
  return { db: drizzle(pool, { schema }), pool };
}

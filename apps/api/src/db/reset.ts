import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.js";

/** Drops everything in a throwaway database. Refuses unless the database name ends in _test or _e2e. */
export async function resetDatabase(url: string) {
  const name = new URL(url).pathname.slice(1);
  if (!/_(test|e2e)$/.test(name)) throw new Error(`Refusing to reset "${name}": only *_test or *_e2e databases can be reset`);
  const { db, pool } = createDb(url, 1);
  try { await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`); } finally { await pool.end(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  resetDatabase(process.env.DATABASE_URL!).then(() => console.log("database reset"), (e) => { console.error(e.message); process.exit(1); });
}

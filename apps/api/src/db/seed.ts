import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, or } from "drizzle-orm";
import { createDb, type DB } from "./client.js";
import { modules, questions, users, type Outcome, type Lesson } from "./schema.js";

type Level = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
interface Q { order: number; level: Level; lo: string; prompt: string; options: string[] | null; answerIndex: number | null; explanation: string | null; open: boolean; rubric: string[] | null; model: string | null }
interface M { id: string; code: string; title: string; short: string; hours: number; order: number; game: string; outcomes: Outcome[]; lessons: Lesson[]; questions: Q[] }

/** Idempotent: curriculum (6 modules, 36 Bloom-tagged items) and the first admin account. */
export interface AdminSeed { email?: string; username?: string; password?: string; phone?: string }
export async function seed(db: DB, admin?: AdminSeed) {
  const data = JSON.parse(readFileSync(fileURLToPath(new URL("./curriculum.json", import.meta.url)), "utf8")) as M[];
  for (const { questions: qs, ...m } of data) {
    await db.insert(modules).values(m).onConflictDoUpdate({ target: modules.id, set: m });
    for (const q of qs) await db.insert(questions).values({ ...q, moduleId: m.id }).onConflictDoUpdate({ target: [questions.moduleId, questions.order], set: q });
  }
  // The attendance administrator: created once; later runs only fill in a missing username/phone.
  if (admin?.password && (admin.email || admin.username)) {
    const email = (admin.email ?? `${admin.username}@sambhav.local`).toLowerCase(), username = admin.username?.toLowerCase() ?? null;
    const existing = await db.query.users.findFirst({ where: or(eq(users.email, email), username ? eq(users.username, username) : undefined) });
    if (!existing) await db.insert(users).values({ email, username, phone: admin.phone ?? null, name: username ? username[0].toUpperCase() + username.slice(1) : "Sambhav Admin", role: "ADMIN", passwordHash: await bcrypt.hash(admin.password, 12) });
    else await db.update(users).set({ username: existing.username ?? username, phone: existing.phone ?? admin.phone ?? null, role: "ADMIN" }).where(eq(users.id, existing.id));
  }
  return data.length;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { db, pool } = createDb(process.env.DATABASE_URL!, 1);
  seed(db, { email: process.env.ADMIN_EMAIL, username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, phone: process.env.ADMIN_PHONE })
    .then((n) => console.log(`Seeded ${n} modules`)).finally(() => pool.end());
}

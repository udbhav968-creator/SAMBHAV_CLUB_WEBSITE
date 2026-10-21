import type { DB } from "../db/client.js";
import { auditLog } from "../db/schema.js";
export async function audit(db: DB, actorId: string | null, action: string, entity: string, entityId?: string, meta?: unknown) {
  await db.insert(auditLog).values({ actorId, action, entity, entityId, meta: meta ?? null });
}

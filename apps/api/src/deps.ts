import type { DB } from "./db/client.js";
import type { KV } from "./lib/kv.js";
import type { Config } from "./config.js";
import type { SmsSender } from "./lib/sms.js";
import type { LlmPort } from "./lib/llm.js";

/** Realtime fan-out port; implemented by Socket.IO in server.ts, no-op in tests. */
export interface Broadcaster { to(room: string, event: string, payload: unknown): void }
/** `llm` is null when no ANTHROPIC_API_KEY is configured — Vihaan then runs in offline mode. */
export interface Deps { db: DB; kv: KV; config: Config; bus: Broadcaster; sms: SmsSender; llm: LlmPort | null }
export const nullBus: Broadcaster = { to() {} };

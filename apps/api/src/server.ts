import { createServer } from "node:http";
import { config } from "./config.js";
import { createDb } from "./db/client.js";
import { createKV } from "./lib/kv.js";
import { createSms } from "./lib/sms.js";
import { createLlm } from "./lib/llm.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime/socket.js";
import { purgeAiLogs } from "./modules/ai.js";
import type { Broadcaster, Deps } from "./deps.js";

const kv = createKV(config.REDIS_URL);
const { db, pool } = createDb(config.DATABASE_URL);
// The broadcaster is late-bound: the HTTP server must exist before Socket.IO can attach.
let bus: Broadcaster = { to() {} };
const deps: Deps = { db, kv, config, sms: createSms(config), llm: createLlm(config), bus: { to: (r, e, p) => bus.to(r, e, p) } };
const http = createServer(createApp(deps));
bus = attachRealtime(http, deps).bus;

http.listen(config.PORT, () => logger.info(`Sambhav API listening on :${config.PORT}`));

// LLMOps data retention: purge old Vihaan transcripts at start-up and every 6 hours.
const purge = () => purgeAiLogs(deps).then((n) => n && logger.info({ purged: n }, "ai logs purged"), (err) => logger.warn({ err }, "ai log purge failed"));
void purge(); const purgeTimer = setInterval(purge, 6 * 3600_000); purgeTimer.unref();

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  http.close();
  await Promise.allSettled([pool.end(), kv.close()]);
  process.exit(0);
}
// A transient dependency failure (e.g. Redis restarting) must not take the API down.
process.on("unhandledRejection", (err) => logger.error({ err }, "unhandled rejection"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

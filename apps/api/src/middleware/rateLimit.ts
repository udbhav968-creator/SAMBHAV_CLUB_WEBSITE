import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { KV } from "../lib/kv.js";
import { RedisKV } from "../lib/kv.js";

/** Token-bucket style limits shared across API replicas when Redis is available. */
export function limiter(kv: KV, opts: Partial<Options> & { prefix: string }) {
  const store = kv instanceof RedisKV
    ? new RedisStore({ prefix: `rl:${opts.prefix}:`, sendCommand: (...args: string[]) => kv.client.call(args[0], ...args.slice(1)) as never })
    : undefined;
  return rateLimit({
    windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false, store,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? "anon",
    message: { error: { code: "rate_limited", message: "Too many requests — slow down and try again shortly" } },
    ...opts,
  });
}

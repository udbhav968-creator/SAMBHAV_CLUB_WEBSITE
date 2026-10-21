import { Redis } from "ioredis";
import { logger } from "./logger.js";

/**
 * Minimal key-value port used for ephemeral state: game rounds, rate-limit counters,
 * leaderboard cache. Redis in production; an in-process map for tests / single-node dev.
 */
export interface KV {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomically increment; sets TTL when the key is created. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class RedisKV implements KV {
  constructor(public readonly client: Redis) {
    // Log and keep serving: /readyz reports kv:false and callers see rejected promises instead of a crashed process.
    client.on("error", (e) => logger.warn({ err: e.message }, "redis error"));
  }
  async get<T>(key: string) { const v = await this.client.get(key); return v == null ? null : (JSON.parse(v) as T); }
  async set(key: string, value: unknown, ttl: number) { await this.client.set(key, JSON.stringify(value), "EX", ttl); }
  async del(key: string) { await this.client.del(key); }
  async incr(key: string, ttl: number) {
    const [[, n]] = (await this.client.multi().incr(key).expire(key, ttl, "NX").exec()) as [[unknown, number]];
    return n;
  }
  async ping() { try { return (await this.client.ping()) === "PONG"; } catch { return false; } }
  async close() { await this.client.quit(); }
}

export class MemoryKV implements KV {
  private m = new Map<string, { v: string; exp: number }>();
  private live(key: string) { const e = this.m.get(key); if (!e) return null; if (e.exp < Date.now()) { this.m.delete(key); return null; } return e; }
  async get<T>(key: string) { const e = this.live(key); return e ? (JSON.parse(e.v) as T) : null; }
  async set(key: string, value: unknown, ttl: number) { this.m.set(key, { v: JSON.stringify(value), exp: Date.now() + ttl * 1000 }); }
  async del(key: string) { this.m.delete(key); }
  async incr(key: string, ttl: number) { const e = this.live(key); const n = (e ? Number(JSON.parse(e.v)) : 0) + 1; this.m.set(key, { v: String(n), exp: e?.exp ?? Date.now() + ttl * 1000 }); return n; }
  async ping() { return true; }
  async close() { this.m.clear(); }
}

export function createKV(url?: string): KV {
  return url ? new RedisKV(new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false })) : new MemoryKV();
}

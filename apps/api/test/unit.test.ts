import { describe, it, expect } from "vitest";
import { totp, verifyTotp } from "../src/lib/totp.js";
import { encrypt, decrypt } from "../src/lib/crypto.js";
import { MemoryKV } from "../src/lib/kv.js";

describe("TOTP (RFC 6238)", () => {
  const secret = Buffer.from("12345678901234567890").toString("hex");
  it("matches the RFC 6238 SHA-1 test vectors (6-digit truncation)", () => {
    expect(totp(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totp(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totp(secret, Math.floor(1234567890 / 30))).toBe("005924");
  });
  it("accepts the current and previous step only", () => {
    const now = 1_700_000_000_000, step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totp(secret, step), 30, now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, step - 1), 30, now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, step - 2), 30, now)).toBe(false);
    expect(verifyTotp(secret, totp(secret, step + 1), 30, now)).toBe(false);
    expect(verifyTotp(secret, "12345", 30, now)).toBe(false);
  });
});

describe("AES-256-GCM secrets at rest", () => {
  const key = "11".repeat(32);
  it("round-trips and detects tampering", () => {
    const blob = encrypt("hello", key); expect(decrypt(blob, key)).toBe("hello");
    const [iv, tag, ct] = blob.split(":"); const bad = [iv, tag, (ct[0] === "0" ? "1" : "0") + ct.slice(1)].join(":");
    expect(() => decrypt(bad, key)).toThrow();
  });
});

describe("MemoryKV", () => {
  it("incr and ttl expiry", async () => {
    const kv = new MemoryKV(); expect(await kv.incr("a", 60)).toBe(1); expect(await kv.incr("a", 60)).toBe(2);
    await kv.set("b", { x: 1 }, -1); expect(await kv.get("b")).toBeNull();
  });
});

/**
 * Provably-fair outcome generation (commit–reveal).
 *  1. Server picks a random serverSeed and publishes sha256(serverSeed) before play.
 *  2. Each outcome = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`), mapped to [0, n)
 *     by rejection sampling over 32-bit words (no modulo bias).
 *  3. When the seed is rotated, serverSeed is revealed and every past outcome is verifiable.
 */
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export const toHex = (buf: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await subtle().digest("SHA-256", enc.encode(input)));
}

export async function hmacSha256(key: string, msg: string): Promise<Uint8Array> {
  const k = await subtle().importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, enc.encode(msg)));
}

/** Outcome in [0, n). Uses successive 4-byte words; extends with a counter if all are rejected. */
export async function fairRoll(serverSeed: string, clientSeed: string, nonce: number, n: number): Promise<number> {
  if (!Number.isInteger(n) || n < 2) throw new RangeError("n must be an integer ≥ 2");
  const limit = Math.floor(4294967296 / n) * n;
  for (let round = 0; round < 16; round++) {
    const h = await hmacSha256(serverSeed, `${clientSeed}:${nonce}${round ? ":" + round : ""}`);
    for (let i = 0; i + 4 <= h.length; i += 4) {
      const v = ((h[i] << 24) >>> 0) + (h[i + 1] << 16) + (h[i + 2] << 8) + h[i + 3];
      if (v < limit) return v % n;
    }
  }
  throw new Error("fairRoll: exhausted entropy (statistically impossible)");
}

export function newServerSeed(): string {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return toHex(b);
}

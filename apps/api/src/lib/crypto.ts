import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** AES-256-GCM for secrets at rest (TOTP seeds). Output: iv:tag:ciphertext (hex). */
export function encrypt(plain: string, keyHex: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("hex"), c.getAuthTag().toString("hex"), ct.toString("hex")].join(":");
}
export function decrypt(blob: string, keyHex: string): string {
  const [iv, tag, ct] = blob.split(":");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(ct, "hex")), d.final()]).toString("utf8");
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 48) => randomBytes(bytes).toString("base64url");
export const randomHex = (bytes = 20) => randomBytes(bytes).toString("hex");
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

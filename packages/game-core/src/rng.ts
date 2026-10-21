/** A source of uniform numbers in [0, 1). Engines never call Math.random directly. */
export type Rng = () => number;

/** Deterministic PRNG (mulberry32) for tests and simulations. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cryptographically secure RNG (Web Crypto — available in Node ≥ 19 and browsers). */
export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 4294967296;
};

/** Uniform integer in [0, n). */
export const randInt = (rng: Rng, n: number): number => Math.floor(rng() * n);
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Seeded PRNG (mulberry32) so every local deal is reproducible. Online deals use `cryptoRng` instead. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unpredictable random numbers from Web Crypto (browsers, Workers, Node 19+). Used for online deals. */
export function cryptoRng(): Rng {
  const c = (globalThis as unknown as { crypto?: { getRandomValues(a: Uint32Array): Uint32Array } }).crypto;
  if (!c) throw new Error('Web Crypto is not available');
  const buf = new Uint32Array(1);
  return () => c.getRandomValues(buf)[0]! / 4294967296;
}

/** Fisher-Yates, returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

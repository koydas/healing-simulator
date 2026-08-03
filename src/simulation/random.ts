/**
 * Pure pseudo-random generator (mulberry32).
 *
 * No function here uses `Math.random()`: the generator state is a plain integer
 * carried inside the `GameState`. Given the same seed and the same sequence of
 * calls, the produced values are always identical.
 */

export interface RandomResult {
  /** Value in [0, 1). */
  value: number;
  /** New generator state, to be stored back into the state. */
  seed: number;
}

/** Normalises any number into an unsigned 32-bit seed. */
export function normalizeSeed(input: number): number {
  if (!Number.isFinite(input)) return 1;
  const normalized = Math.floor(Math.abs(input)) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

/** Draws the next value and returns the new generator state. */
export function nextRandom(seed: number): RandomResult {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let x = nextSeed;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, seed: nextSeed };
}

/** Draws a uniform value in [min, max). */
export function nextRange(seed: number, min: number, max: number): RandomResult {
  const { value, seed: nextSeed } = nextRandom(seed);
  return { value: min + value * (max - min), seed: nextSeed };
}

/** Draws a uniform integer in [0, boundExclusive). */
export function nextInt(seed: number, boundExclusive: number): RandomResult {
  if (boundExclusive <= 0) return { value: 0, seed };
  const { value, seed: nextSeed } = nextRandom(seed);
  const index = Math.min(boundExclusive - 1, Math.floor(value * boundExclusive));
  return { value: index, seed: nextSeed };
}

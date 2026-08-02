/**
 * Générateur pseudo-aléatoire pur (mulberry32).
 *
 * Aucune fonction de ce module n'utilise `Math.random()` : l'état du
 * générateur est une simple valeur entière transportée dans le `GameState`.
 * À seed identique et séquence d'appels identique, les valeurs produites sont
 * toujours les mêmes.
 */

export interface RandomResult {
  /** Valeur dans [0, 1). */
  value: number;
  /** Nouvel état du générateur, à replacer dans le state. */
  seed: number;
}

/** Normalise une valeur quelconque en seed entière non signée sur 32 bits. */
export function normalizeSeed(input: number): number {
  if (!Number.isFinite(input)) return 1;
  const normalized = Math.floor(Math.abs(input)) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

/** Tire la valeur suivante et renvoie le nouvel état du générateur. */
export function nextRandom(seed: number): RandomResult {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let x = nextSeed;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, seed: nextSeed };
}

/** Tire une valeur uniforme dans [min, max). */
export function nextRange(seed: number, min: number, max: number): RandomResult {
  const { value, seed: nextSeed } = nextRandom(seed);
  return { value: min + value * (max - min), seed: nextSeed };
}

/** Tire un entier uniforme dans [0, boundExclusive). */
export function nextInt(seed: number, boundExclusive: number): RandomResult {
  if (boundExclusive <= 0) return { value: 0, seed };
  const { value, seed: nextSeed } = nextRandom(seed);
  const index = Math.min(boundExclusive - 1, Math.floor(value * boundExclusive));
  return { value: index, seed: nextSeed };
}

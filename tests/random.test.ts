import { describe, expect, it } from 'vitest';
import { nextInt, nextRandom, nextRange, normalizeSeed } from '../src/simulation/random';

describe('générateur pseudo-aléatoire', () => {
  it('est pur : la même seed produit toujours la même valeur', () => {
    const a = nextRandom(42);
    const b = nextRandom(42);
    expect(a.value).toBe(b.value);
    expect(a.seed).toBe(b.seed);
  });

  it('produit des valeurs dans [0, 1)', () => {
    let seed = 12345;
    for (let index = 0; index < 500; index += 1) {
      const result = nextRandom(seed);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(1);
      seed = result.seed;
    }
  });

  it('fait progresser l’état du générateur', () => {
    const first = nextRandom(7);
    const second = nextRandom(first.seed);
    expect(second.seed).not.toBe(first.seed);
    expect(second.value).not.toBe(first.value);
  });

  it('borne nextRange dans l’intervalle demandé', () => {
    let seed = 99;
    for (let index = 0; index < 500; index += 1) {
      const result = nextRange(seed, 6000, 10_000);
      expect(result.value).toBeGreaterThanOrEqual(6000);
      expect(result.value).toBeLessThan(10_000);
      seed = result.seed;
    }
  });

  it('borne nextInt dans [0, bound)', () => {
    let seed = 3;
    const seen = new Set<number>();
    for (let index = 0; index < 500; index += 1) {
      const result = nextInt(seed, 4);
      expect(Number.isInteger(result.value)).toBe(true);
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(4);
      seen.add(result.value);
      seed = result.seed;
    }
    expect(seen.size).toBe(4);
  });

  it('renvoie 0 pour une borne nulle ou négative sans consommer la seed', () => {
    const result = nextInt(11, 0);
    expect(result.value).toBe(0);
    expect(result.seed).toBe(11);
  });

  it('normalise les seeds invalides', () => {
    expect(normalizeSeed(0)).toBe(1);
    expect(normalizeSeed(Number.NaN)).toBe(1);
    expect(normalizeSeed(-42)).toBe(42);
    expect(normalizeSeed(12.9)).toBe(12);
  });
});

import { describe, expect, it } from 'vitest';

import { nextRng, randomHash, rngValue, seedRng } from '../../lib/viz/sim/rng';

function canonicalMulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe('seeded simulation RNG', () => {
  it('normalizes finite seeds to unsigned 32-bit states', () => {
    expect(seedRng(-1)).toBe(0xffffffff);
    expect(seedRng(Number.NaN)).toBe(0);
    expect(seedRng(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('matches canonical mulberry32 for 1,000 draws', () => {
    const canonical = canonicalMulberry32(12345);
    let state = seedRng(12345);

    for (let draw = 0; draw < 1000; draw++) {
      state = nextRng(state);
      expect(rngValue(state)).toBe(canonical());
    }
  });

  it('provides stable render jitter without consuming stream state', () => {
    const state = seedRng(7);
    const value = randomHash(41, 12);

    expect(value).toBe(randomHash(41, 12));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(state).toBe(seedRng(7));
  });
});

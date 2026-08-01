/**
 * @description Normalizes a seed to an unsigned 32-bit RNG state.
 * @param seed Seed supplied by a caller.
 * @returns A finite unsigned integer state, or zero for non-finite values.
 */
export function seedRng(seed: number): number {
  return Number.isFinite(seed) ? seed >>> 0 : 0;
}

/**
 * @description Advances a mulberry32 state without mutating caller-owned state.
 * @param rngState Current unsigned 32-bit state.
 * @returns The next unsigned 32-bit state.
 */
export function nextRng(rngState: number): number {
  return (rngState + 0x6d2b79f5) >>> 0;
}

/**
 * @description Maps one mulberry32 state to a deterministic value in [0, 1).
 * @param rngState Current unsigned 32-bit state.
 * @returns A deterministic pseudo-random fraction.
 */
export function rngValue(rngState: number): number {
  let value = rngState >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

/**
 * @description Returns stable render jitter without consuming the simulation stream.
 * @param a First deterministic input.
 * @param b Second deterministic input.
 * @returns A deterministic pseudo-random fraction.
 */
export function randomHash(a: number, b: number): number {
  let hash =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x165667b1, 0xc2b2ae35);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}

/**
 * Contribution level binning.
 *
 * Log2 doubling bands, not quantiles. Quantile binning provably fails on this
 * dataset: 156 days sit at exactly 1 contribution, a mass point that swallows
 * 3-4 bins and leaves them empty (measured, docs/research/2026-07-31-measured-findings.md).
 *
 * Level 0 is "no contributions". Levels 1..9 are 1, 2-3, 4-7, 8-15, 16-31,
 * 32-63, 64-127, 128-255, 256+.
 */
export const CONTRIB_LEVELS = 10 as const

export type ContribLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Bin a day's combined contribution count onto the 0..9 ramp. */
export function contribLevel(count: number): ContribLevel {
  if (!Number.isFinite(count) || count <= 0) return 0
  // 1 -> 1, 2..3 -> 2, 4..7 -> 3, ... 256+ -> 9
  const level = Math.floor(Math.log2(count)) + 1
  return Math.min(level, CONTRIB_LEVELS - 1) as ContribLevel
}

/**
 * The 10-stop ramp, anchored on real gruvbox tokens rather than a synthetic
 * sweep: level 6 is --green-d (#98971a) and level 7 is --green (#b8bb26), so a
 * token change propagates instead of drifting.
 */
export const CONTRIB_RAMP = [
  '#3c3836', // 0 — --bg-1, the empty cell
  '#404a2b',
  '#4d5b21',
  '#5e6a1f',
  '#70791d',
  '#83881b',
  '#98971a', // 6 — --green-d
  '#b8bb26', // 7 — --green
  '#d9d34a',
  '#faeb77', // 9 — the 256+ outlier
] as const

export function contribColor(count: number): string {
  return CONTRIB_RAMP[contribLevel(count)]!
}

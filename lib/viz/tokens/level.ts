/** Ramp index shared by contribution bands and colour ramps. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Inclusive lower bound of each log2-doubling contribution band. */
export const BAND_LOWER_BOUNDS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] as const

/** Human-readable contribution band labels. */
export const BAND_LABELS = [
  '0', '1', '2–3', '4–7', '8–15', '16–31', '32–63', '64–127', '128–255', '256+',
] as const

/** Maps a contribution count to its log2-doubling ramp level. */
export function level(count: number): Level {
  if (Number.isNaN(count) || count <= 0) return 0
  const n = Math.floor(count)
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n <= 3) return 2
  if (n <= 7) return 3
  if (n <= 15) return 4
  if (n <= 31) return 5
  if (n <= 63) return 6
  if (n <= 127) return 7
  if (n <= 255) return 8
  return 9
}

/** Returns the text equivalent of a ramp level. */
export function bandLabel(value: Level): string {
  return BAND_LABELS[value]
}

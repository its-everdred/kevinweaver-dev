import { describe, expect, it } from 'vitest'
import {
  CONTRIB_LEVELS,
  CONTRIB_RAMP,
  contribColor,
  contribLevel,
} from './contrib-scale'

describe('contribLevel', () => {
  it('maps zero and non-positive counts to level 0', () => {
    expect(contribLevel(0)).toBe(0)
    expect(contribLevel(-5)).toBe(0)
  })

  it('maps each log2 doubling band to its own level', () => {
    // band boundaries, from the measured distribution
    const bands: Array<[number, number]> = [
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
      [7, 3],
      [8, 4],
      [15, 4],
      [16, 5],
      [31, 5],
      [32, 6],
      [63, 6],
      [64, 7],
      [127, 7],
      [128, 8],
      [255, 8],
      [256, 9],
    ]
    for (const [count, level] of bands) {
      expect(contribLevel(count), `count ${count}`).toBe(level)
    }
  })

  it('saturates at the top level for the busiest measured day', () => {
    // 284 contributions on 2026-05-17 is the measured maximum
    expect(contribLevel(284)).toBe(9)
    expect(contribLevel(100_000)).toBe(9)
  })

  it('never returns a level outside the ramp', () => {
    for (let n = 0; n < 2000; n++) {
      const level = contribLevel(n)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThan(CONTRIB_LEVELS)
    }
  })

  it('is monotonic', () => {
    let prev = contribLevel(0)
    for (let n = 1; n < 2000; n++) {
      const level = contribLevel(n)
      expect(level).toBeGreaterThanOrEqual(prev)
      prev = level
    }
  })

  it('tolerates non-finite input rather than throwing', () => {
    expect(contribLevel(Number.NaN)).toBe(0)
    expect(contribLevel(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('CONTRIB_RAMP', () => {
  it('has one colour per level', () => {
    expect(CONTRIB_RAMP).toHaveLength(CONTRIB_LEVELS)
  })

  it('is anchored on the real gruvbox tokens', () => {
    expect(CONTRIB_RAMP[0]).toBe('#3c3836') // --bg-1
    expect(CONTRIB_RAMP[6]).toBe('#98971a') // --green-d
    expect(CONTRIB_RAMP[7]).toBe('#b8bb26') // --green
  })

  it('has no duplicate stops', () => {
    expect(new Set(CONTRIB_RAMP).size).toBe(CONTRIB_LEVELS)
  })

  it('increases in luminance monotonically', () => {
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    for (let i = 1; i < CONTRIB_RAMP.length; i++) {
      expect(
        luminance(CONTRIB_RAMP[i]!),
        `stop ${i} vs ${i - 1}`
      ).toBeGreaterThan(luminance(CONTRIB_RAMP[i - 1]!))
    }
  })
})

describe('contribColor', () => {
  it('returns the ramp entry for the binned level', () => {
    expect(contribColor(0)).toBe(CONTRIB_RAMP[0])
    expect(contribColor(1)).toBe(CONTRIB_RAMP[1])
    expect(contribColor(284)).toBe(CONTRIB_RAMP[9])
  })
})

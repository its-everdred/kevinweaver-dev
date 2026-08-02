import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BAND_LABELS,
  BAND_LOWER_BOUNDS,
  bandLabel,
  level,
} from '../../lib/viz/tokens/level'
import {
  AG,
  AG_SEMANTIC_MAX,
  LV,
  PANE_SURFACE,
} from '../../lib/viz/tokens/ramp'
import { ciede2000, ciede2000Lab, contrastRatio } from './contrast-fixture'

const DS_TOKENS =
  'docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css'
const VENDORED_TOKENS = 'styles/ds/tokens/colors.css'

function at<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) throw new Error(`Missing value at ${index}`)
  return value
}

function readTokens(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of readFileSync(file, 'utf8').matchAll(
    /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g
  )) {
    const [, name, hex] = match
    if (name && hex) out[name] = hex.toLowerCase()
  }
  return out
}

describe('contribution ramp', () => {
  it('matches Sharma CIEDE2000 reference vectors', () => {
    expect(ciede2000Lab([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(
      2.0425,
      4
    )
    expect(
      ciede2000Lab([50, -1.3802, -84.2814], [50, 0, -82.7485])
    ).toBeCloseTo(1, 4)
    expect(
      ciede2000Lab([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])
    ).toBeCloseTo(1.2644, 4)
  })

  it('keeps ramp shape, anchors, and characterization values', () => {
    expect(LV).toHaveLength(10)
    expect(AG).toHaveLength(10)
    expect(BAND_LABELS).toHaveLength(10)
    expect(BAND_LOWER_BOUNDS).toHaveLength(10)
    expect([...LV, ...AG].every((v) => /^#[0-9a-f]{6}$/.test(v))).toBe(true)
    expect(new Set(LV).size).toBe(10)
    const tokens = readTokens(DS_TOKENS)
    expect(LV[0]).toBe(tokens.bg1)
    expect(LV[6]).toBe(tokens['green-d'])
    expect(LV[7]).toBe(tokens.green)
    expect(PANE_SURFACE).toBe(tokens['bg-h'])
    const contrasts = LV.map((v) => contrastRatio(v, PANE_SURFACE))
    const steps = LV.slice(1).map((v, i) => ciede2000(at(LV, i), v))
    expect(contrasts).toEqual(
      [1.41, 1.74, 2.21, 2.78, 3.47, 4.3, 5.29, 7.94, 10.44, 13.44].map((v) =>
        expect.closeTo(v, 2)
      )
    )
    expect(steps).toEqual(
      [16.61, 8.45, 6.25, 6.43, 6.49, 6.06, 10.58, 6.85, 6.68].map((v) =>
        expect.closeTo(v, 2)
      )
    )
    for (let i = 0; i < 9; i++) expect(at(steps, i)).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 10; i++)
      for (let j = i + 2; j < 10; j++)
        expect(ciede2000(at(LV, i), at(LV, j))).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 9; i++)
      expect(at(contrasts, i + 1)).toBeGreaterThan(at(contrasts, i))
    for (let i = 0; i < 9; i++)
      expect(ciede2000(at(AG, i), at(AG, i + 1))).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < 10; i++)
      expect(ciede2000(at(LV, i), at(AG, i))).toBeGreaterThanOrEqual(10)
    expect(
      ciede2000(at(LV, 9), tokens.fg0 ?? '#fbf1c7')
    ).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(tokens.bg4 ?? '', PANE_SURFACE)).toBeLessThan(4.5)
    if (existsSync(VENDORED_TOKENS)) {
      const vendored = readTokens(VENDORED_TOKENS)
      for (const key of ['bg-h', 'bg1', 'green', 'green-d'])
        expect(vendored[key]).toBe(tokens[key])
    }
  })

  it('maps every boundary and defensive input without floating arithmetic', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
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
      [1_000_000, 9],
    ]
    for (const [count, expected] of cases) expect(level(count)).toBe(expected)
    expect(level(NaN)).toBe(0)
    expect(level(-5)).toBe(0)
    expect(level(0.5)).toBe(0)
    expect(level(Infinity)).toBe(9)
    for (let value = 0; value < 10; value++) {
      expect(level(at(BAND_LOWER_BOUNDS, value))).toBe(value)
      if (value < 9)
        expect(level(at(BAND_LOWER_BOUNDS, value + 1) - 1)).toBe(value)
    }
    for (let n = 1; n <= 1000; n++)
      expect(level(n)).toBe(Math.min(9, 1 + Math.floor(Math.log2(n))))
    expect(bandLabel(2)).toBe('2–3')
    expect(bandLabel(9)).toBe('256+')
    expect('2–3'.charCodeAt(1)).toBe(0x2013)
    expect(AG_SEMANTIC_MAX).toBe(6)
  })
})

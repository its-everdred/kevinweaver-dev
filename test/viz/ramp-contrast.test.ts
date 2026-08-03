import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BAND_LABELS, BAND_LOWER_BOUNDS, bandLabel, level } from '../../lib/viz/tokens/level'
import { AG, AG_SEMANTIC_MAX, LV, PANE_SURFACE } from '../../lib/viz/tokens/ramp'
import { contrastRatio } from './contrast-fixture'

type Lab = [number, number, number]
const DS_TOKENS = 'docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css'
const VENDORED_TOKENS = 'styles/ds/tokens/colors.css'

function at<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) throw new Error(`Missing value at ${index}`)
  return value
}

function lab(hex: string): Lab {
  const channels = hex.slice(1).match(/../g)?.map((v) => Number.parseInt(v, 16) / 255)
  if (!channels || channels.length !== 3) throw new Error(`Invalid colour: ${hex}`)
  const linear = channels.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const r = at(linear, 0); const g = at(linear, 1); const b = at(linear, 2)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883
  const f = (v: number) => v > (6 / 29) ** 3 ? Math.cbrt(v) : v / (3 * (6 / 29) ** 2) + 4 / 29
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** CIEDE2000 distance for two CIELab colours. */
export function ciede2000Lab(L1: number, a1: number, b1: number, L2: number, a2: number, b2: number): number {
  const C1 = Math.hypot(a1, b1); const C2 = Math.hypot(a2, b2); const C = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)))
  const ap1 = (1 + G) * a1; const ap2 = (1 + G) * a2
  const cp1 = Math.hypot(ap1, b1); const cp2 = Math.hypot(ap2, b2)
  const hp = (a: number, b: number) => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
  const h1 = hp(ap1, b1); const h2 = hp(ap2, b2)
  const dL = L2 - L1; const dC = cp2 - cp1
  const dh = Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 <= h1 ? h2 - h1 + 360 : h2 - h1 - 360
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(dh * Math.PI / 360)
  const L = (L1 + L2) / 2; const c = (cp1 + cp2) / 2
  const h = cp1 * cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2
  const T = 1 - 0.17 * Math.cos((h - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * h * Math.PI / 180) + 0.32 * Math.cos((3 * h + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * h - 63) * Math.PI / 180)
  const sl = 1 + 0.015 * (L - 50) ** 2 / Math.sqrt(20 + (L - 50) ** 2)
  const sc = 1 + 0.045 * c; const sh = 1 + 0.015 * c * T
  const rt = -2 * Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((h - 275) / 25) ** 2)) * Math.PI / 180)
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh))
}

function distance(a: string, b: string): number { const [L1, a1, b1] = lab(a); const [L2, a2, b2] = lab(b); return ciede2000Lab(L1, a1, b1, L2, a2, b2) }
function readTokens(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of readFileSync(file, 'utf8').matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    const [, name, hex] = match
    if (name && hex) out[name] = hex.toLowerCase()
  }
  return out
}

describe('contribution ramp', () => {
  it('matches Sharma CIEDE2000 reference vectors', () => {
    expect(ciede2000Lab(50, 2.6772, -79.7751, 50, 0, -82.7485)).toBeCloseTo(2.0425, 4)
    expect(ciede2000Lab(50, -1.3802, -84.2814, 50, 0, -82.7485)).toBeCloseTo(1, 4)
    expect(ciede2000Lab(60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387)).toBeCloseTo(1.2644, 4)
  })

  it('keeps ramp shape, anchors, and characterization values', () => {
    expect(LV).toHaveLength(10); expect(AG).toHaveLength(10); expect(BAND_LABELS).toHaveLength(10); expect(BAND_LOWER_BOUNDS).toHaveLength(10)
    expect([...LV, ...AG].every((v) => /^#[0-9a-f]{6}$/.test(v))).toBe(true)
    expect(new Set(LV).size).toBe(10)
    const tokens = readTokens(DS_TOKENS)
    expect(LV[0]).toBe(tokens.bg1); expect(LV[6]).toBe(tokens['green-d']); expect(LV[7]).toBe(tokens.green); expect(PANE_SURFACE).toBe(tokens['bg-h'])
    const contrasts = LV.map((v) => contrastRatio(v, PANE_SURFACE))
    const steps = LV.slice(1).map((v, i) => distance(at(LV, i), v))
    expect(contrasts).toEqual([1.41, 1.74, 2.21, 2.78, 3.47, 4.3, 5.29, 7.94, 10.44, 13.44].map((v) => expect.closeTo(v, 2)))
    expect(steps).toEqual([16.61, 8.45, 6.25, 6.43, 6.49, 6.06, 10.58, 6.85, 6.68].map((v) => expect.closeTo(v, 2)))
    for (let i = 0; i < 9; i++) expect(at(steps, i)).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 10; i++) for (let j = i + 2; j < 10; j++) expect(distance(at(LV, i), at(LV, j))).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 9; i++) expect(at(contrasts, i + 1)).toBeGreaterThan(at(contrasts, i))
    for (let i = 0; i < 9; i++) expect(distance(at(AG, i), at(AG, i + 1))).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < 10; i++) expect(distance(at(LV, i), at(AG, i))).toBeGreaterThanOrEqual(10)
    expect(distance(at(LV, 9), tokens.fg0 ?? '#fbf1c7')).toBeGreaterThanOrEqual(3)
    if (existsSync(VENDORED_TOKENS)) { const vendored = readTokens(VENDORED_TOKENS); for (const key of ['bg-h', 'bg1', 'green', 'green-d']) expect(vendored[key]).toBe(tokens[key]) }
  })

  it('maps every boundary and defensive input without floating arithmetic', () => {
    const cases: Array<[number, number]> = [[0, 0], [1, 1], [2, 2], [3, 2], [4, 3], [7, 3], [8, 4], [15, 4], [16, 5], [31, 5], [32, 6], [63, 6], [64, 7], [127, 7], [128, 8], [255, 8], [256, 9], [1_000_000, 9]]
    for (const [count, expected] of cases) expect(level(count)).toBe(expected)
    expect(level(NaN)).toBe(0); expect(level(-5)).toBe(0); expect(level(0.5)).toBe(0); expect(level(Infinity)).toBe(9)
    for (let value = 0; value < 10; value++) { expect(level(at(BAND_LOWER_BOUNDS, value))).toBe(value); if (value < 9) expect(level(at(BAND_LOWER_BOUNDS, value + 1) - 1)).toBe(value) }
    for (let n = 1; n <= 1000; n++) expect(level(n)).toBe(Math.min(9, 1 + Math.floor(Math.log2(n))))
    expect(bandLabel(2)).toBe('2–3'); expect(bandLabel(9)).toBe('256+'); expect('2–3'.charCodeAt(1)).toBe(0x2013); expect(AG_SEMANTIC_MAX).toBe(6)
  })
})

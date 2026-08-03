import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AG, LV, PANE_SURFACE } from './ramp'

/**
 * Canvas-painted text contrast gate (Invariant 3 + Executor requirement 6).
 *
 * `ctx.fillText` glyphs carry no computed CSS, so axe's `color-contrast`
 * cannot see them. This unit test pins the WCAG 2.x relative-luminance
 * formula, the permitted canvas-text colour pairs against the pane surface
 * (`--bg-h #1d2021`), and — crucially — the ACTUAL ramp values the renderer
 * paints its text with, both clean and under the measured scanline
 * darkening (`design-comp-spec` §9.2).
 *
 * NOTE (post-merge finding): KW-022/#110's `test/viz/render-text-contrast.browser.test.ts`
 * builds its fixture theme from the gruvbox `TOKEN_HEXES` map (fg4 = #a89984)
 * rather than the runtime `surface-view.ts` `SURFACE_TOKEN` (fg4 = LV[5] =
 * #83881b), so it reports a false green. The renderer's real text fills use
 * `theme.token.fg4` = #83881b, which is 4.296:1 on the pane surface — below
 * AA. The assertions below inspect the actual ramp values and FAIL until the
 * renderer's text fills are repaired.
 */

const AA_NORMAL = 4.5
const AA_LARGE = 3
/** design-comp-spec §9.2, measured: rgba(0,0,0,.16) at opacity .35, mix-blend-mode multiply. */
const SCANLINE_MULTIPLIER = 1 - 0.16 * 0.35 // 0.944
/** Bisected this session: 0.6189 clean, 0.6555 under the scanline. 0.66 clears both. */
const MIN_LABEL_ALPHA = 0.66

const channel = (hex: string, i: number): number =>
  Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0')
function linear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export function relativeLuminance(hex: string): number {
  return (
    0.2126 * linear(channel(hex, 0)) +
    0.7152 * linear(channel(hex, 1)) +
    0.0722 * linear(channel(hex, 2))
  )
}
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
/** Per-channel darkening by the .35 scanline multiplier, rejoined as '#rrggbb'. */
function underScanline(hex: string): string {
  return `#${[0, 1, 2]
    .map((i) => hex2(channel(hex, i) * SCANLINE_MULTIPLIER))
    .join('')}`
}
/** Alpha-blend fg over bg, per channel. */
function composite(fg: string, alpha: number, bg: string): string {
  return `#${[0, 1, 2]
    .map((i) => hex2(channel(fg, i) * alpha + channel(bg, i) * (1 - alpha)))
    .join('')}`
}

interface CanvasTextPair {
  readonly id: string
  readonly fg: string
  readonly bg: string
  readonly px: number
  readonly bold: boolean
  readonly where: string
}
/** WCAG large text: >= 24px, or >= 18.66px bold. Everything else is 4.5:1. */
const threshold = (p: CanvasTextPair): number =>
  p.px >= 24 || (p.bold && p.px >= 18.66) ? AA_LARGE : AA_NORMAL

const FORBIDDEN_FILLS = ['#928374', '#7c6f64', '#b16286'] as const

/** The gource file label fades `rgba(213,196,161,α)`; clamp at MIN_LABEL_ALPHA. */
const FILE_LABEL_FG = composite('#d5c4a1', MIN_LABEL_ALPHA, PANE_SURFACE)

/** The 13 rows of Invariant 3, recomputed this session. */
const CANVAS_TEXT: readonly CanvasTextPair[] = [
  {
    id: 'overview-year',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 9,
    bold: true,
    where: 'overview year marker',
  },
  {
    id: 'ribbon-weekday',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 9,
    bold: true,
    where: 'ribbon weekday header',
  },
  {
    id: 'ribbon-month',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 9,
    bold: true,
    where: 'ribbon month header',
  },
  {
    id: 'ribbon-agent-marker',
    fg: '#d3869b',
    bg: PANE_SURFACE,
    px: 9,
    bold: true,
    where: 'ribbon agent pulse marker',
  },
  {
    id: 'gource-file-label',
    fg: FILE_LABEL_FG,
    bg: PANE_SURFACE,
    px: 9,
    bold: true,
    where: 'gource file label at MIN_LABEL_ALPHA',
  },
  {
    id: 'gource-repo-label',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 11,
    bold: true,
    where: 'gource repo label',
  },
  {
    id: 'gource-repo-label-focus',
    fg: '#fbf1c7',
    bg: PANE_SURFACE,
    px: 13,
    bold: true,
    where: 'gource repo label focused',
  },
  {
    id: 'gource-repo-label-private',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 11,
    bold: true,
    where: 'gource private repo label',
  },
  {
    id: 'gource-star-count',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 9,
    bold: true,
    where: 'gource star count',
  },
  {
    id: 'actor-disc-human',
    fg: PANE_SURFACE,
    bg: '#689d6a',
    px: 9,
    bold: true,
    where: 'human actor disc text',
  },
  {
    id: 'actor-disc-agent',
    fg: PANE_SURFACE,
    bg: '#d3869b',
    px: 9,
    bold: true,
    where: 'agent actor disc text',
  },
  {
    id: 'agent-init-banner',
    fg: '#d3869b',
    bg: PANE_SURFACE,
    px: 20,
    bold: true,
    where: 'agent init banner',
  },
  {
    id: 'agent-init-subline',
    fg: '#a89984',
    bg: PANE_SURFACE,
    px: 11,
    bold: true,
    where: 'agent init subline',
  },
]

describe('the renderer’s actual text fills (what the canvas paints)', () => {
  /** Mirrors lib/viz/surface-view.ts SURFACE_TOKEN for the text-fill tokens. */
  const TOKEN: Readonly<Record<string, string>> = {
    fg4: LV[5],
    fg2: LV[7],
    fg0: LV[9],
    purple: AG[7],
    aqua: AG[8],
    bgH: PANE_SURFACE,
  }

  // Audited post-KW-022/#120 fillText sites: these are the tokens the
  // renderer paints normal-size (9-13px) text with on the pane surface.
  const RENDER_TEXT_ON_PANE: readonly { id: string; token: string }[] = [
    {
      id: 'fg4 — year / weekday / month / star / ghost-repo / birth-sublabel / cluster',
      token: 'fg4',
    },
    { id: 'fg2 — file + live repo labels', token: 'fg2' },
    { id: 'purple — agent markers + init banner', token: 'purple' },
  ]
  const RENDER_DISC_TEXT: readonly { id: string; disc: string }[] = [
    { id: 'bgH on aqua — human actor disc', disc: 'aqua' },
    { id: 'bgH on purple — agent actor disc', disc: 'purple' },
  ]

  it.each(RENDER_TEXT_ON_PANE)(
    '$id clears AA on the pane surface',
    ({ token }) => {
      expect(
        contrastRatio(TOKEN[token]!, PANE_SURFACE),
        `${token} = ${TOKEN[token]}`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  )

  it.each(RENDER_TEXT_ON_PANE)(
    '$id clears AA under the scanline',
    ({ token }) => {
      expect(
        contrastRatio(
          underScanline(TOKEN[token]!),
          underScanline(PANE_SURFACE)
        ),
        `${token} = ${TOKEN[token]}`
      ).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  )

  it.each(RENDER_DISC_TEXT)('$id clears AA', ({ disc }) => {
    expect(
      contrastRatio(PANE_SURFACE, TOKEN[disc]!),
      `bgH on ${disc} = ${TOKEN[disc]}`
    ).toBeGreaterThanOrEqual(AA_NORMAL)
  })
})

describe('canvas text contrast (axe cannot see any of this)', () => {
  it.each(CANVAS_TEXT)(
    '$id clears its WCAG threshold on a clean surface',
    (p) => {
      expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(threshold(p))
    }
  )

  it.each(CANVAS_TEXT)('$id still clears under the .35 scanline', (p) => {
    expect(
      contrastRatio(underScanline(p.fg), underScanline(p.bg))
    ).toBeGreaterThanOrEqual(threshold(p))
  })

  it.each([
    ['--gray on the pane surface', '#928374', PANE_SURFACE, 4.467],
    ['--bg4 on the pane surface', '#7c6f64', PANE_SURFACE, 3.369],
    ['pane-surface text on --purple-d', PANE_SURFACE, '#b16286', 3.873],
  ] as const)(
    '%s is below AA and is therefore forbidden',
    (name, fg, bg, expected) => {
      void name
      expect(contrastRatio(fg, bg)).toBeCloseTo(expected, 3)
      expect(contrastRatio(fg, bg)).toBeLessThan(AA_NORMAL)
    }
  )

  it('pins the formula itself', () => {
    expect(contrastRatio('#a89984', '#1d2021')).toBeCloseTo(5.898, 3)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(PANE_SURFACE).toBe('#1d2021')
  })

  it('the fading gource file label is clamped above the threshold', () => {
    expect(
      contrastRatio(
        composite('#d5c4a1', MIN_LABEL_ALPHA, PANE_SURFACE),
        PANE_SURFACE
      )
    ).toBeGreaterThanOrEqual(AA_NORMAL)
    expect(
      contrastRatio(
        underScanline(composite('#d5c4a1', MIN_LABEL_ALPHA, PANE_SURFACE)),
        underScanline(PANE_SURFACE)
      )
    ).toBeGreaterThanOrEqual(AA_NORMAL)
    expect(
      contrastRatio(composite('#d5c4a1', 0.5, PANE_SURFACE), PANE_SURFACE)
    ).toBeLessThan(AA_NORMAL)
  })

  it('no forbidden fill appears anywhere in lib/viz/render', () => {
    const dir = join(process.cwd(), 'lib/viz/render')
    const sources = readdirSync(dir).filter((file) => file.endsWith('.ts'))
    expect(sources.length).toBeGreaterThan(0)
    for (const file of sources) {
      const source = readFileSync(join(dir, file), 'utf8').toLowerCase()
      for (const fill of FORBIDDEN_FILLS) {
        expect(source, `${file} paints with ${fill}`).not.toContain(fill)
      }
    }
  })
})

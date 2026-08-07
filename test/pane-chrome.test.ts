import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AA_NORMAL_TEXT_RATIO,
  PANE_SURFACE,
  TOKEN_HEXES,
  contrastRatio,
  scanlineDarkened,
} from './viz/contrast-fixture'

/**
 * Page-chrome gates for the two systemic changes to `styles/kw.css`: fragment
 * targets that clear the sticky header, and panes that are frosted glass —
 * translucent, blurred, shadowed — without moving any text below AA.
 *
 * The contrast half is the merge gate. axe composites a translucent background
 * against what is actually behind it, so the numbers below are computed the
 * same way: the pane surface at the declared alpha over the page field, not the
 * opaque token the text used to sit on.
 */

const KW_CSS = readFileSync(join(process.cwd(), 'styles/kw.css'), 'utf8')
const CAREER_LOG = readFileSync(
  join(process.cwd(), 'app/regions/CareerLog.tsx'),
  'utf8'
)

/** The field behind every pane: `.kw-root`/`body` paint `--bg0`. */
const PAGE_FIELD = TOKEN_HEXES.bg0

/** Alpha-blend `hex` at `alpha` over `under`, per sRGB channel. */
function compositeOver(hex: string, alpha: number, under: string): string {
  const channel = (value: string, index: number): number =>
    Number.parseInt(value.slice(1 + index * 2, 3 + index * 2), 16)
  return `#${[0, 1, 2]
    .map((index) =>
      Math.round(
        channel(hex, index) * alpha + channel(under, index) * (1 - alpha)
      )
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/**
 * The declared glass alpha and the surface it composites to, read from the
 * token rather than restated here, so a future opacity change re-runs the math.
 */
function glass(): { readonly alpha: number; readonly composited: string } {
  const match = KW_CSS.match(
    /--surface-pane-glass:\s*color-mix\(\s*in srgb,\s*var\(--surface-pane\)\s*([\d.]+)%/
  )
  expect(
    match,
    '--surface-pane-glass is not a color-mix of --surface-pane'
  ).not.toBeNull()
  const alpha = Number(match?.[1]) / 100
  return { alpha, composited: compositeOver(PANE_SURFACE, alpha, PAGE_FIELD) }
}

/** Everything the design system paints text with inside a pane body. */
const PANE_TEXT_TOKENS = [
  ['--text-strong', TOKEN_HEXES.fg0],
  ['--text-body', TOKEN_HEXES.fg1],
  ['--text-muted', TOKEN_HEXES.fg2],
  ['--text-dim / --text-faint', TOKEN_HEXES.fg3],
  ['--text-comment', TOKEN_HEXES.fg4],
] as const

describe('fragment targets', () => {
  it('offsets every anchor target by the sticky header', () => {
    const rule = KW_CSS.match(/\.kw-anchor\s*\{([^}]*)\}/)
    expect(rule, '.kw-anchor carries no rule').not.toBeNull()
    const body = rule?.[1] ?? ''
    expect(body).toMatch(/scroll-margin-top:/)
    // Derived from the header token, not the 44px magic number it replaces.
    expect(body).toMatch(/var\(--bar-h\)/)
  })

  it('drops the per-region scroll offset in favour of the shared class', () => {
    expect(CAREER_LOG).not.toMatch(/scrollMarginTop/)
  })

  it('rings a focused pane without reshaping its corners', () => {
    // The shared control ring also sets `--r-chip`; a pane keeps `--r-pane`.
    expect(KW_CSS).toMatch(
      /\.pane:focus-visible,\s*\n\s*\.pane:focus\s*\{[^}]*border-radius:\s*var\(--r-pane\)/
    )
  })

  it('smooth-scrolls only when motion is welcome', () => {
    const welcome = KW_CSS.match(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n\}/
    )
    expect(welcome, 'no no-preference block').not.toBeNull()
    expect(welcome?.[1]).toMatch(/scroll-behavior:\s*smooth/)
    // The only `smooth` in the sheet is the guarded one.
    expect(KW_CSS.match(/scroll-behavior:\s*smooth/g)).toHaveLength(1)
    // And the reduce block still forces it back off.
    const reduce = KW_CSS.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/
    )
    expect(reduce?.[1]).toMatch(/scroll-behavior:\s*auto\s*!important/)
  })
})

describe('frosted panes', () => {
  it('blurs the backdrop behind a translucent surface', () => {
    expect(KW_CSS).toMatch(/backdrop-filter:\s*var\(--pane-blur\)/)
    expect(KW_CSS).toMatch(/-webkit-backdrop-filter:\s*var\(--pane-blur\)/)
    expect(KW_CSS).toMatch(/--pane-blur:\s*blur\(/)
    expect(KW_CSS).toMatch(/background:\s*var\(--surface-pane-glass\)/)
  })

  it('falls back to the solid surface where backdrop-filter is ignored', () => {
    const guard = KW_CSS.search(/@supports[^{]*backdrop-filter/)
    expect(guard, 'the glass is not behind an @supports guard').toBeGreaterThan(
      -1
    )
    const condition = KW_CSS.slice(guard, KW_CSS.indexOf('{', guard))
    expect(condition).toMatch(/backdrop-filter/)
    expect(condition).toMatch(/-webkit-backdrop-filter/)
    // color-mix builds the translucent token, so the guard must probe it too or
    // an unsupporting engine resolves the background to nothing.
    expect(condition).toMatch(/color-mix/)
    // The solid surface is declared unguarded, before the glass.
    expect(KW_CSS.slice(0, guard)).toMatch(
      /background:\s*var\(--surface-pane\)/
    )
  })

  it('drops a shadow under every pane', () => {
    expect(KW_CSS).toMatch(/--shadow-pane:/)
    expect(KW_CSS).toMatch(/box-shadow:\s*var\(--shadow-pane\)/)
  })

  it('keeps the blur off the live canvases', () => {
    // The galaxy body paints its own opaque field; no backdrop pass under it.
    expect(KW_CSS).toMatch(
      /\.pane:has\(>\s*\.kw-graph\)[\s\S]*?backdrop-filter:\s*none/
    )
    expect(KW_CSS).toMatch(/\.kw-graph\s*\{[^}]*background:\s*var\(--bg-h\)/)
  })

  it('adds no box-model width, so 320px cannot start scrolling', () => {
    // A shadow is ink overflow, never scrollable overflow; a border or margin
    // on the same rule would be neither.
    const paneRules = [...KW_CSS.matchAll(/\.pane[^{]*\{([^}]*)\}/g)].map(
      (match) => match[1] ?? ''
    )
    expect(paneRules.length).toBeGreaterThan(0)
    for (const rule of paneRules) {
      expect(rule).not.toMatch(/(^|[\s;])(width|min-width|margin|border):/)
    }
    expect(KW_CSS).toMatch(/overflow-x:\s*clip/)
  })
})

describe('pane text contrast against the composited surface', () => {
  it('composites to a measured surface', () => {
    const { alpha, composited } = glass()
    expect(alpha).toBeGreaterThan(0.5)
    expect(alpha).toBeLessThan(1)
    expect(composited).toBe('#1f2122')
  })

  it.each(PANE_TEXT_TOKENS)('%s clears AA on the glass', (_name, hex) => {
    expect(contrastRatio(hex, glass().composited)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_RATIO
    )
  })

  it.each(PANE_TEXT_TOKENS)(
    '%s still clears AA on the glass under the scanline',
    (_name, hex) => {
      expect(
        contrastRatio(
          scanlineDarkened(hex),
          scanlineDarkened(glass().composited)
        )
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_RATIO)
    }
  )

  it('keeps the canvas text tokens above AA on the glass', () => {
    // The ribbon canvas only clears its bitmap, so its glyphs land on whatever
    // the pane paints. `--fg4` is the faintest fill the renderer uses.
    const { composited } = glass()
    expect(contrastRatio(TOKEN_HEXES.fg4, composited)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT_RATIO
    )
    // Negative control: the forbidden fill is still forbidden on the glass.
    expect(contrastRatio(TOKEN_HEXES.gray, composited)).toBeLessThan(
      AA_NORMAL_TEXT_RATIO
    )
  })
})

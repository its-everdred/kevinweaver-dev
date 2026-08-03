/**
 * DOM-free WCAG contrast oracle shared by the ramp characterization test and
 * the native-render text-contrast regression.
 *
 * This module must stay free of browser and node built-ins: the node project
 * (ramp-contrast.test.ts) and the browser canvas project
 * (render-text-contrast.browser.test.ts) both import it.
 */
import type { TokenName } from '../../lib/viz/render/budget'

/** The pane surface every instrument canvas paints its text on (`--bg-h`). */
export const PANE_SURFACE = '#1d2021' as const

/**
 * Measured scanline darkening: the always-on overlay is
 * `rgba(0,0,0,.16)` at `opacity:.35` with `mix-blend-mode:multiply`,
 * striped 1px on / 2px off. Effective multiplier on the *on* rows is
 * `1 − 0.16·0.35 = 0.944` (design-comp §9.2). A glyph row in that state has
 * both the text and the pane surface darkened, which compresses the ratio.
 */
export const SCANLINE_MULTIPLIER = 1 - 0.16 * 0.35

/** WCAG AA normal-text threshold. */
export const AA_NORMAL_TEXT_RATIO = 4.5

/** Authoritative gruvbox dark medium token hexes (colors.css). */
export const TOKEN_HEXES: Readonly<Record<TokenName, string>> = {
  bgH: '#1d2021',
  bg0: '#282828',
  bg1: '#3c3836',
  bg2: '#504945',
  bg3: '#665c54',
  bg4: '#7c6f64',
  gray: '#928374',
  fg0: '#fbf1c7',
  fg1: '#ebdbb2',
  fg2: '#d5c4a1',
  fg3: '#bdae93',
  fg4: '#a89984',
  green: '#b8bb26',
  greenD: '#98971a',
  aqua: '#8ec07c',
  aquaD: '#689d6a',
  purple: '#d3869b',
  purpleD: '#b16286',
  yellow: '#fabd2d',
  yellowD: '#d79921',
  red: '#fb4934',
  blue: '#83a598',
} as const

type Hex = string

/** WCAG 2.x relative luminance for a #rrggbb colour. */
export function relativeLuminance(hex: Hex): number {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((value) => Number.parseInt(value, 16) / 255)
  if (!channels || channels.length !== 3)
    throw new Error(`Invalid colour: ${hex}`)
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  )
  const [r, g, b] = linear
  if (r === undefined || g === undefined || b === undefined)
    throw new Error(`Invalid colour: ${hex}`)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two opaque colours, `max:min` ordered. */
export function contrastRatio(left: Hex, right: Hex): number {
  const x = relativeLuminance(left)
  const y = relativeLuminance(right)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Applies the measured scanline multiplier to every sRGB channel. */
export function scanlineDarkened(hex: Hex): Hex {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((value) =>
      Math.round(Number.parseInt(value, 16) * SCANLINE_MULTIPLIER)
        .toString(16)
        .padStart(2, '0')
    )
  if (!channels || channels.length !== 3)
    throw new Error(`Invalid colour: ${hex}`)
  return `#${channels.join('')}`
}

/**
 * Worst-case text contrast against the pane surface: both the glyph and the
 * background sit on a scanline *on* row, so each is darkened before the ratio.
 */
export function worstCaseTextContrast(hex: Hex): number {
  return contrastRatio(scanlineDarkened(hex), scanlineDarkened(PANE_SURFACE))
}

/** True only for a foreground that clears AA normal text even on a scanline row. */
export function isApprovedTextColor(hex: Hex): boolean {
  return worstCaseTextContrast(hex) >= AA_NORMAL_TEXT_RATIO
}

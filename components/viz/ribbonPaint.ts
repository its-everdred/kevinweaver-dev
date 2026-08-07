import { formatDayISO } from '@/lib/viz/driver'
import {
  RIBBON_WEEKS,
  ribbonCell,
  type RibbonLayout,
  type RibbonWindow,
} from './ribbonWindow'

/** The slice of the 2D API the ribbon paints through. */
export interface RibbonCtx {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  clearRect(x: number, y: number, width: number, height: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  strokeRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
}

/** Everything one ribbon frame is a pure function of. */
export interface RibbonPaintOptions {
  readonly grid: {
    readonly level: ArrayLike<number>
    readonly dayCount: number
  }
  readonly window: RibbonWindow
  readonly layout: RibbonLayout
  readonly widthPx: number
  readonly heightPx: number
  readonly dpr: number
  /** Current day index from the shared galaxy timeline. */
  readonly step: number
  /** ISO date of payload day 0. */
  readonly windowStartISO: string
}

/**
 * Contribution density bands, green like GitHub's contribution graph, over the
 * empty-day slab. Concrete hex, never CSS tokens: the canvas 2D API does not
 * resolve `var()`, it just paints the fallback black.
 */
const LEVEL_COLORS = [
  '#504945',
  '#0e4429',
  '#006d32',
  '#26a641',
  '#39d353',
] as const
/** Year label and boundary rule: 5.898:1 on the #1d2021 pane surface. */
const MARKER_COLOR = '#a89984'
/** The current day's ring, over a dark separator that keeps it off #39d353. */
const CURRENT_RING = '#fbf1c7'
const CURRENT_SEPARATOR = '#1d2021'

/**
 * @description Paints one frame of the contribution grid: a year of density
 * squares, the year boundaries along the strip, and a ring on the current day
 * when anything landed on it.
 * @param ctx Destination 2D context.
 * @param options The window, lattice, and clock position to paint.
 *
 * Deterministic by construction — no clock, no randomness, integer lattice —
 * because the e2e suite screenshots this surface and asserts that two renders
 * of the same step are byte-identical.
 */
export function paintRibbon(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  ctx.clearRect(0, 0, options.widthPx, options.heightPx)
  paintCells(ctx, options)
  paintYearMarkers(ctx, options)
  paintCurrentDay(ctx, options)
}

function paintCells(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  const { grid, layout } = options
  for (let column = 0; column < RIBBON_WEEKS; column += 1) {
    const x = layout.originXPx + column * layout.stepPx
    for (let row = 0; row < 7; row += 1) {
      const day = options.window.start + column * 7 + row
      // Days outside the payload stay empty canvas rather than reading as a
      // zero-contribution day that never existed.
      if (day < 0 || day >= grid.dayCount) continue
      const level = Math.max(0, Math.min(4, grid.level[day] ?? 0))
      ctx.fillStyle = LEVEL_COLORS[level] ?? LEVEL_COLORS[0]
      ctx.fillRect(
        x,
        layout.originYPx + row * layout.stepPx,
        layout.cellPx,
        layout.cellPx
      )
    }
  }
}

function paintYearMarkers(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  const { layout, window: visible } = options
  const scale = Math.max(1, options.dpr)
  const fontPx = Math.max(9, Math.round(10 * scale))
  const ruleWidthPx = Math.max(1, Math.round(scale))
  // Four monospace digits, plus slack, so a label never runs off the canvas or
  // collides with the one before it.
  const labelWidthPx = Math.round(fontPx * 2.6)
  const maxXPx = options.widthPx - labelWidthPx
  const baselineYPx = Math.max(fontPx, layout.originYPx - ruleWidthPx * 3)
  ctx.font = `${fontPx}px monospace`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  let previousYear = ''
  let lastLabelXPx = Number.NEGATIVE_INFINITY
  for (let column = 0; column < RIBBON_WEEKS; column += 1) {
    const day = visible.start + column * 7
    const year = formatDayISO(options.windowStartISO, day).slice(0, 4)
    if (year === previousYear) continue
    const x = layout.originXPx + column * layout.stepPx
    if (previousYear !== '') {
      // The rule sits in the gutter between two weeks, never over a cell.
      ctx.fillStyle = MARKER_COLOR
      ctx.fillRect(
        x - layout.gapPx,
        layout.originYPx,
        ruleWidthPx,
        layout.gridHeightPx
      )
    }
    previousYear = year
    if (x - lastLabelXPx < labelWidthPx + fontPx) continue
    ctx.fillStyle = MARKER_COLOR
    ctx.fillText(year, Math.min(x, maxXPx), baselineYPx)
    lastLabelXPx = x
  }
}

function paintCurrentDay(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  const { layout, step } = options
  if (step < 0 || step >= options.grid.dayCount) return
  // A day nothing landed on carries no highlight: the ring says "this is the
  // day being played", and ringing an empty square reads as a false positive.
  // Level 0 is exactly zero contributions — band 1's lower bound is 1 — so the
  // level already on hand answers the question without a second series.
  if ((options.grid.level[step] ?? 0) <= 0) return
  const cell = ribbonCell(options.window, step)
  if (!cell) return
  const x = layout.originXPx + cell.column * layout.stepPx
  const y = layout.originYPx + cell.row * layout.stepPx
  const ringPx = Math.max(1, Math.round(Math.max(1, options.dpr)))
  ctx.lineWidth = ringPx
  // Two rings: a dark separator hugging the cell so the bright ring still
  // reads on #39d353, then the bright ring itself in the gutter.
  ctx.strokeStyle = CURRENT_SEPARATOR
  ctx.strokeRect(
    x - ringPx / 2,
    y - ringPx / 2,
    layout.cellPx + ringPx,
    layout.cellPx + ringPx
  )
  ctx.strokeStyle = CURRENT_RING
  ctx.strokeRect(
    x - ringPx * 1.5,
    y - ringPx * 1.5,
    layout.cellPx + ringPx * 3,
    layout.cellPx + ringPx * 3
  )
}

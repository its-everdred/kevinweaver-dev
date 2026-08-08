import { formatDayISO } from '@/lib/viz/driver'
import { LEVEL_COLORS, MARKER_COLOR } from './ribbonRamp'
import {
  paintRibbonRing,
  type RibbonRingCtx,
  type RibbonRingPaint,
} from './ribbonRing'

/** The slice of the 2D API the ribbon paints through. */
export interface RibbonCtx extends RibbonRingCtx {
  fillStyle: string | CanvasGradient | CanvasPattern
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  clearRect(x: number, y: number, width: number, height: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
}

/** Everything one ribbon frame is a pure function of. */
export interface RibbonPaintOptions extends RibbonRingPaint {
  readonly widthPx: number
  readonly heightPx: number
  /** ISO date of payload day 0. */
  readonly windowStartISO: string
}

/**
 * @description Paints one frame of the contribution grid: as many weeks of
 * density squares as the pane is wide, the year boundaries along the strip, and
 * a ring on the current day when anything landed on it.
 * @param ctx Destination 2D context.
 * @param options The window, lattice, and clock position to paint.
 *
 * Deterministic by construction — no clock, no randomness, integer lattice —
 * because the e2e suite screenshots this surface and asserts that two renders
 * of the same step are byte-identical. `options.ring` is the one thing that
 * moves, and it is a value the caller resolved from a clock it owns, not one
 * this module reads: the paint stays a pure function of what it is handed.
 */
export function paintRibbon(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  ctx.clearRect(0, 0, options.widthPx, options.heightPx)
  paintCells(ctx, options)
  paintYearMarkers(ctx, options)
  paintRibbonRing(ctx, options)
}

function paintCells(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  const { grid, layout } = options
  for (let column = 0; column < layout.columns; column += 1) {
    const x = layout.originXPx + column * layout.stepPx
    for (let row = 0; row < 7; row += 1) {
      const day = options.window.start + column * 7 + row
      // Days outside the payload stay empty canvas rather than reading as a
      // zero-contribution day that never existed.
      if (day < 0 || day >= grid.dayCount) continue
      // Clamped to the ramp, not to a hard-coded four: the payload's band
      // ladder and the ramp are the same length, so a band above the clamp
      // would be a band the strip cannot tell apart from the one below it.
      const level = Math.max(
        0,
        Math.min(LEVEL_COLORS.length - 1, grid.level[day] ?? 0)
      )
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

/** A column a year begins on, and where on the canvas that column starts. */
interface YearMark {
  readonly column: number
  readonly year: string
  readonly xPx: number
}

/**
 * The columns where a year begins. A column belongs to the year of its Sunday,
 * so a year begins on the first column whose Sunday has crossed into it — the
 * column the boundary rule is drawn against. The opening column is tested the
 * same way as every other, against the week before it, which usually sits
 * outside the window: opening part-way into a year is not a boundary, however
 * much of that year the strip goes on to show.
 */
function yearMarks(options: RibbonPaintOptions): YearMark[] {
  const { layout, window: visible } = options
  const yearAt = (day: number): string =>
    formatDayISO(options.windowStartISO, day).slice(0, 4)
  const marks: YearMark[] = []
  for (let column = 0; column < layout.columns; column += 1) {
    const day = visible.start + column * 7
    const year = yearAt(day)
    if (year === yearAt(day - 7)) continue
    marks.push({ column, year, xPx: layout.originXPx + column * layout.stepPx })
  }
  return marks
}

function paintYearMarkers(ctx: RibbonCtx, options: RibbonPaintOptions): void {
  const { layout } = options
  const scale = Math.max(1, options.dpr)
  const fontPx = Math.max(9, Math.round(10 * scale))
  const ruleWidthPx = Math.max(1, Math.round(scale))
  // Four monospace digits, plus slack, so a label never runs off the canvas or
  // collides with the one before it.
  const labelWidthPx = Math.round(fontPx * 2.6)
  const spacingPx = labelWidthPx + fontPx
  const marks = yearMarks(options)
  ctx.fillStyle = MARKER_COLOR
  // The rule sits in the gutter between two weeks, never over a cell — so a
  // year that begins on the opening column goes without one. There is no week
  // to its left to divide it from, only the edge of the grid.
  for (const mark of marks.filter((mark) => mark.column > 0))
    ctx.fillRect(
      mark.xPx - layout.gapPx,
      layout.originYPx,
      ruleWidthPx,
      layout.gridHeightPx
    )
  ctx.font = `${fontPx}px monospace`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const maxXPx = options.widthPx - labelWidthPx
  const baselineYPx = Math.max(fontPx, layout.originYPx - ruleWidthPx * 3)
  // Labels go where the years begin and nowhere else. Labelling the opening
  // column too would name whatever year the window happened to open in and put
  // it where no rule is drawn, which reads as a boundary that is not there —
  // and it is a lie by a wide margin when the real one is a few columns along.
  // A window that opens part-way into a year runs unlabelled until the first
  // boundary, and one that spans no boundary at all carries no label.
  let lastLabelXPx = Number.NEGATIVE_INFINITY
  for (const mark of marks) {
    if (mark.xPx - lastLabelXPx < spacingPx) continue
    ctx.fillText(mark.year, Math.min(mark.xPx, maxXPx), baselineYPx)
    lastLabelXPx = mark.xPx
  }
}

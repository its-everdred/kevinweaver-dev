import { formatDayISO } from '@/lib/viz/driver'
import {
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
 * @description Paints one frame of the contribution grid: as many weeks of
 * density squares as the pane is wide, the year boundaries along the strip, and
 * a ring on the current day when anything landed on it.
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
  for (let column = 0; column < layout.columns; column += 1) {
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

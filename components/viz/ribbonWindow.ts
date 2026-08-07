import { RIBBON_WEEKS } from '@/lib/viz/driver'

/**
 * Week columns assumed until the canvas has reported a width: the driver's
 * one-year lattice, so the first render and its text alternative open on the
 * familiar GitHub shape and then grow into whatever pane they landed in.
 */
export const RIBBON_DEFAULT_COLUMNS = RIBBON_WEEKS

/**
 * Widest a square gets, in CSS pixels. Height alone would let a roomy pane
 * paint chunky squares and stop there, leaving the rest of the pane empty;
 * capping the cell spends that width on more weeks instead.
 */
const MAX_CELL_CSS_PX = 12

/** The stretch of history on screen, as day indices into the payload grid. */
export interface RibbonWindow {
  /**
   * Day index at column 0, row 0. Always a Sunday, so weekday rows are true
   * weekdays; may precede day 0 when the payload does not open on one.
   */
  readonly start: number
  /** Day index at the last column, row 6. */
  readonly end: number
}

/** A day's seat in the 7-row weekday lattice. */
export interface RibbonCell {
  readonly column: number
  readonly row: number
}

/** Integer device-pixel lattice for one ribbon canvas. */
export interface RibbonLayout {
  readonly cellPx: number
  /** Week columns this canvas has room for. */
  readonly columns: number
  readonly gapPx: number
  readonly stepPx: number
  /** Height of the year-marker strip above the grid. */
  readonly labelPx: number
  readonly originXPx: number
  readonly originYPx: number
  readonly gridWidthPx: number
  readonly gridHeightPx: number
}

const positiveModulo = (value: number, span: number): number =>
  ((value % span) + span) % span

const windowFrom = (start: number, days: number): RibbonWindow => ({
  start,
  end: start + days - 1,
})

/**
 * @description Resolves the stretch of history on screen for a timeline step.
 * @param step Current day index from the shared galaxy timeline; negative
 * while the clock is still unseeked.
 * @param dayCount Total days in the payload.
 * @param startWeekday Weekday of day 0, as `weekdayOfISO` reports it.
 * @param columns Week columns the canvas measured out for itself.
 * @returns The Sunday-aligned window containing `step`.
 *
 * The newest window is the default and the resting place, and it always holds
 * the day the shared clock is on: a seek or a playback step older than the
 * window pages it back by whole windows, so the strip pages through history
 * instead of creeping a day at a time. How much history that is now follows the
 * pane's width, so a wide browser holds more than the galaxy's playback year
 * and a phone holds less — but either way the current day has a seat, which is
 * what keeps the two surfaces telling the same story.
 */
export function ribbonWindow(
  step: number,
  dayCount: number,
  startWeekday: number,
  columns: number
): RibbonWindow {
  const days = Math.max(1, Math.floor(columns)) * 7
  const minStart = -positiveModulo(startWeekday, 7)
  if (dayCount <= 0) return windowFrom(minStart, days)
  const align = (day: number): number => day - positiveModulo(day - minStart, 7)
  const maxStart = Math.max(minStart, align(dayCount - 1) - (days - 7))
  if (!(step >= 0) || step >= maxStart) return windowFrom(maxStart, days)
  const pages = Math.ceil((maxStart - step) / days)
  return windowFrom(Math.max(minStart, maxStart - pages * days), days)
}

/**
 * @description Seats a day in the visible lattice.
 * @param window The window on screen.
 * @param day Day index into the payload grid.
 * @returns Its column and row, or null when the day is off screen.
 */
export function ribbonCell(
  window: RibbonWindow,
  day: number
): RibbonCell | null {
  const offset = day - window.start
  if (offset < 0 || offset > window.end - window.start) return null
  return { column: Math.floor(offset / 7), row: offset % 7 }
}

/**
 * Week columns the pane has room for, capped at the payload. The last column
 * carries no trailing gutter, so one more fits than bare division suggests, and
 * a browser wider than the history stops at the history rather than padding the
 * strip with weeks that never happened — one column over the payload's weeks,
 * which is the most the Sunday alignment can cost.
 */
function ribbonColumns(
  widthPx: number,
  stepPx: number,
  gapPx: number,
  dayCount: number
): number {
  const byWidth = Math.floor((widthPx + gapPx) / stepPx)
  const byPayload = dayCount > 0 ? Math.ceil(dayCount / 7) + 1 : byWidth
  return Math.max(1, Math.min(byWidth, byPayload))
}

/**
 * @description Measures the square, integer backing-store lattice for a canvas.
 * @param widthPx Backing-store width.
 * @param heightPx Backing-store height.
 * @param dpr Device pixel ratio the backing store was sized at.
 * @param dayCount Total days in the payload.
 * @returns Cell, column, gap, and origin geometry, all whole device pixels so
 * the grid lands on the same lattice on every render.
 *
 * The square is sized from the height alone, then the width decides how many
 * of them fit: the grid spans the pane instead of stopping at a fixed year, and
 * a wider browser buys more weeks rather than a bigger cell. Only once the
 * payload runs out of weeks to add does the width go back into the squares,
 * because by then there is nothing else for it to buy.
 */
export function ribbonLayout(
  widthPx: number,
  heightPx: number,
  dpr: number,
  dayCount: number
): RibbonLayout {
  const scale = Math.max(1, dpr)
  const labelPx = Math.max(8, Math.round(11 * scale))
  const rowsPx = heightPx - labelPx
  // A short strip spends its height on cells rather than gutter; a roomy one
  // gets GitHub's two-pixel gap.
  const dense = rowsPx / 7 < 10 * scale
  const gapPx = Math.max(1, Math.round((dense ? 1 : 2) * scale))
  const byHeightPx = Math.max(1, Math.floor((rowsPx - 6 * gapPx) / 7))
  const cappedPx = Math.min(Math.round(MAX_CELL_CSS_PX * scale), byHeightPx)
  const columns = ribbonColumns(widthPx, cappedPx + gapPx, gapPx, dayCount)
  // Height keeps the last word, so seven rows always fit; width only ever
  // widens the square past its cap when the columns stopped short of the pane.
  const byWidthPx = Math.floor((widthPx - (columns - 1) * gapPx) / columns)
  const cellPx = Math.max(1, Math.min(byHeightPx, byWidthPx))
  const stepPx = cellPx + gapPx
  const gridWidthPx = columns * stepPx - gapPx
  const gridHeightPx = 7 * stepPx - gapPx
  return {
    cellPx,
    columns,
    gapPx,
    stepPx,
    labelPx,
    gridWidthPx,
    gridHeightPx,
    originXPx: Math.max(0, Math.floor((widthPx - gridWidthPx) / 2)),
    originYPx:
      labelPx +
      Math.max(0, Math.floor((heightPx - labelPx - gridHeightPx) / 2)),
  }
}

/**
 * @description Reads the day at a backing-store point, extrapolating past the
 * grid so a drag that leaves the window keeps walking a week per column.
 * @param window The window on screen.
 * @param layout Lattice the window is drawn on.
 * @param xPx Backing-store x.
 * @param yPx Backing-store y.
 * @returns A day index, unclamped: the caller owns the payload bounds.
 */
export function ribbonDayAt(
  window: RibbonWindow,
  layout: RibbonLayout,
  xPx: number,
  yPx: number
): number {
  const column = Math.floor((xPx - layout.originXPx) / layout.stepPx)
  // Rows saturate rather than wrap: sliding above or below the strip must not
  // skip a week.
  const row = Math.min(
    6,
    Math.max(0, Math.floor((yPx - layout.originYPx) / layout.stepPx))
  )
  return window.start + column * 7 + row
}

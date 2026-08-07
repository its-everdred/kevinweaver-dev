import { RIBBON_WEEKS } from '@/lib/viz/driver'

/** Week columns on screen, mirroring the driver's fixed detail-window shape. */
export { RIBBON_WEEKS }

/**
 * Days on screen: 53 week columns of 7 weekday rows. One column wider than the
 * galaxy's `PLAYBACK_WINDOW_STEPS` year, so a full backward pass of the galaxy
 * never pushes the strip off its opening window.
 */
export const RIBBON_WINDOW_DAYS = RIBBON_WEEKS * 7

/** The stretch of history on screen, as day indices into the payload grid. */
export interface RibbonWindow {
  /**
   * Day index at column 0, row 0. Always a Sunday, so weekday rows are true
   * weekdays; may precede day 0 when the payload does not open on one.
   */
  readonly start: number
  /** Day index at column 52, row 6. */
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

const windowFrom = (start: number): RibbonWindow => ({
  start,
  end: start + RIBBON_WINDOW_DAYS - 1,
})

/**
 * @description Resolves the year of history on screen for a timeline step.
 * @param step Current day index from the shared galaxy timeline; negative
 * while the clock is still unseeked.
 * @param dayCount Total days in the payload.
 * @param startWeekday Weekday of day 0, as `weekdayOfISO` reports it.
 * @returns The Sunday-aligned window containing `step`.
 *
 * The newest window is the default and the resting place: every step of the
 * galaxy's rolling backward year falls inside it, so the two surfaces never
 * disagree about which year is on screen while playback runs. Only a seek
 * older than the window moves it, and then it moves by a whole window, so the
 * strip pages through history instead of creeping a day at a time.
 */
export function ribbonWindow(
  step: number,
  dayCount: number,
  startWeekday: number
): RibbonWindow {
  const minStart = -positiveModulo(startWeekday, 7)
  if (dayCount <= 0) return windowFrom(minStart)
  const align = (day: number): number => day - positiveModulo(day - minStart, 7)
  const maxStart = Math.max(
    minStart,
    align(dayCount - 1) - 7 * (RIBBON_WEEKS - 1)
  )
  if (!(step >= 0) || step >= maxStart) return windowFrom(maxStart)
  const pages = Math.ceil((maxStart - step) / RIBBON_WINDOW_DAYS)
  return windowFrom(Math.max(minStart, maxStart - pages * RIBBON_WINDOW_DAYS))
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
  if (offset < 0 || offset >= RIBBON_WINDOW_DAYS) return null
  return { column: Math.floor(offset / 7), row: offset % 7 }
}

/**
 * @description Measures the square, integer backing-store lattice for a canvas.
 * @param widthPx Backing-store width.
 * @param heightPx Backing-store height.
 * @param dpr Device pixel ratio the backing store was sized at.
 * @returns Cell, gap, and origin geometry, all whole device pixels so the
 * grid lands on the same lattice on every render.
 */
export function ribbonLayout(
  widthPx: number,
  heightPx: number,
  dpr: number
): RibbonLayout {
  const scale = Math.max(1, dpr)
  // A narrow pane spends its width on cells rather than gutter; a roomy one
  // gets GitHub's two-pixel gap.
  const dense = widthPx / RIBBON_WEEKS < 12 * scale
  const gapPx = Math.max(1, Math.round((dense ? 1 : 2) * scale))
  const labelPx = Math.max(8, Math.round(11 * scale))
  const byWidth = Math.floor(
    (widthPx - (RIBBON_WEEKS - 1) * gapPx) / RIBBON_WEEKS
  )
  const byHeight = Math.floor((heightPx - labelPx - 6 * gapPx) / 7)
  const cellPx = Math.max(1, Math.min(byWidth, byHeight))
  const stepPx = cellPx + gapPx
  const gridWidthPx = RIBBON_WEEKS * stepPx - gapPx
  const gridHeightPx = 7 * stepPx - gapPx
  return {
    cellPx,
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

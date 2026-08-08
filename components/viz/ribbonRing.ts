import { CURRENT_RING, CURRENT_SEPARATOR } from './ribbonRamp'
import type { RibbonRing } from './ribbonTravel'
import {
  ribbonCell,
  type RibbonLayout,
  type RibbonWindow,
} from './ribbonWindow'

/** The slice of the 2D API the ring strokes through. */
export interface RibbonRingCtx {
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  strokeRect(x: number, y: number, width: number, height: number): void
}

/** Everything the current day's highlight is a function of. */
export interface RibbonRingPaint {
  readonly grid: {
    readonly level: ArrayLike<number>
    readonly dayCount: number
  }
  readonly window: RibbonWindow
  readonly layout: RibbonLayout
  readonly dpr: number
  /** Current day index from the shared galaxy timeline. */
  readonly step: number
  /**
   * Where the ring is on its way between two days, from `ribbonTravel`. Absent,
   * null, or at rest — the three are indistinguishable here by construction —
   * the ring sits square on `step`'s own cell, which is the frame every
   * screenshot baseline holds.
   */
  readonly ring?: RibbonRing | null
}

/**
 * @description Strokes the highlight on the day playback is holding.
 * @param ctx Destination 2D context.
 * @param options The window, lattice, and where the ring has got to.
 *
 * A settled ring paints exactly what an unanimated one painted: the swell is
 * zero and the seat is the cell's own, so every argument is the arithmetic the
 * committed baselines were taken from. Only a ring mid-crossing draws anything
 * else, and a crossing only ever opens while playback is running.
 */
export function paintRibbonRing(
  ctx: RibbonRingCtx,
  options: RibbonRingPaint
): void {
  const { layout, ring, step } = options
  if (step < 0 || step >= options.grid.dayCount) return
  // A day nothing landed on carries no highlight: the ring says "this is the
  // day being played", and ringing an empty square reads as a false positive.
  // Level 0 is exactly zero contributions — band 1's lower bound is 1 — so the
  // level already on hand answers the question without a second series.
  if ((options.grid.level[step] ?? 0) <= 0) return
  const cell = ribbonCell(options.window, step)
  if (!cell) return
  // The lattice seat is the fallback and the resting place both. A crossing
  // reports fractional columns and rows, which is the whole of its motion.
  const swellPx = (ring?.swell ?? 0) * layout.cellPx
  const x =
    layout.originXPx + (ring?.column ?? cell.column) * layout.stepPx - swellPx
  const y = layout.originYPx + (ring?.row ?? cell.row) * layout.stepPx - swellPx
  const sidePx = layout.cellPx + swellPx * 2
  const ringPx = Math.max(1, Math.round(Math.max(1, options.dpr)))
  ctx.lineWidth = ringPx
  // Two rings: a dark separator hugging the cell so the bright ring still
  // reads on #39d353, then the bright ring itself in the gutter.
  ctx.strokeStyle = CURRENT_SEPARATOR
  ctx.strokeRect(
    x - ringPx / 2,
    y - ringPx / 2,
    sidePx + ringPx,
    sidePx + ringPx
  )
  ctx.strokeStyle = CURRENT_RING
  ctx.strokeRect(
    x - ringPx * 1.5,
    y - ringPx * 1.5,
    sidePx + ringPx * 3,
    sidePx + ringPx * 3
  )
}

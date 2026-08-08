import type { RibbonCell } from './ribbonWindow'

/**
 * How long the ring takes to cross from one day to the next, in milliseconds.
 *
 * A day's slot is a second, so this is a little under a quarter of it: long
 * enough to read as travel, short enough that the ring is sitting still on the
 * day it names for the other three quarters. The ring is a cursor, not a
 * particle — the galaxy's contributor nodes cross their day at its midpoint and
 * are already leaving, which is right for a swarm and wrong for a highlight
 * that the text alternative promises is *on* the current day. It also has to
 * settle, because a ring that never stops moving has no frame to screenshot.
 *
 * Fixed, not scaled by distance. Playback skips empty days, so consecutive
 * highlighted days are one square apart or forty, and a duration that followed
 * the gap would make the strip's rhythm lurch with the data. One beat a day,
 * whatever the data did.
 */
export const RIBBON_TRAVEL_MS = 240

/**
 * The longest run of empty days the ring will sweep across rather than snap
 * over. Past about two months the two days are not neighbours in any sense the
 * eye recovers from a 240ms streak, and playback's window rollover — which
 * jumps a year in one step — must never be drawn as a crossing.
 */
export const RIBBON_TRAVEL_MAX_DAYS = 60

/** Furthest the ring swells mid-crossing, as a fraction of one cell. */
const SWELL_MAX = 0.2

/** How much of that swell each cell of travel buys. */
const SWELL_PER_CELL = 0.05

/** Where the ring is drawn, in continuous lattice coordinates. */
export interface RibbonRing {
  /** Week column, fractional while crossing. */
  readonly column: number
  /** Weekday row, fractional while crossing. */
  readonly row: number
  /** How far the ring is inflated past the cell, as a fraction of one cell. */
  readonly swell: number
  /** True while the crossing has time left to run, so the host keeps drawing. */
  readonly moving: boolean
}

/** One frame's worth of what the ring needs to know about the shared clock. */
export interface RibbonAdvance {
  /** The day the shared clock is on. */
  readonly step: number
  /** Playback direction, from the shared clock. */
  readonly direction: 'forward' | 'backward'
  /** False while paused: nothing but a seek moves a stopped clock. */
  readonly playing: boolean
  /** False under prefers-reduced-motion, where the ring never travels. */
  readonly animated: boolean
  /** This frame's timestamp, on the same clock the last call was given. */
  readonly now: number
  /** A day's contribution level; playback only ever lands on a non-zero one. */
  readonly level: (day: number) => number
  /** A day's seat in the window on screen, or null when it is off it. */
  readonly seat: (day: number) => RibbonCell | null
}

/** The ring's memory of where it is coming from. */
export interface RibbonTravel {
  /**
   * @param advance The clock and lattice this frame.
   * @returns Where to draw the ring, or null when the day has no seat.
   */
  ring(advance: RibbonAdvance): RibbonRing | null
}

const clamp01 = (value: number): number =>
  value > 0 ? (value < 1 ? value : 1) : 0

/**
 * Ease-out cubic. The ring leaves fast and decelerates into its day, because
 * what the eye needs from this move is where it *lands*: on a long jump across
 * several columns the departure is a streak and the arrival is the message.
 */
const easeOut = (t: number): number => 1 - (1 - t) ** 3

/** The ring sitting square on a day, which is the frame baselines are of. */
const atRest = (cell: RibbonCell): RibbonRing => ({
  column: cell.column,
  row: cell.row,
  swell: 0,
  moving: false,
})

/**
 * @description Places the ring on the leg between two days.
 * @param from The cell it left.
 * @param to The cell it is bound for.
 * @param progress How far through the crossing this frame is, in [0, 1].
 * @returns Its seat, swell, and whether it still has travel left.
 *
 * A straight line through the lattice, both axes together: consecutive green
 * days are rarely adjacent and usually change column as well as weekday row, so
 * a path that walked one axis and then the other would draw an L through the
 * squares. The swell — the ring growing and settling back over the crossing —
 * is what keeps a long diagonal reading as a hop over the grid rather than as a
 * selection box being dragged through it, and it grows with the distance so a
 * jump to the next square barely registers it.
 *
 * Past the end this returns the target's own resting ring exactly, not a value
 * that merely converges on it. `sin(PI)` is 1.2e-16, not zero, and the e2e
 * suite compares two renders of the same step byte for byte.
 */
export function ribbonRingAt(
  from: RibbonCell,
  to: RibbonCell,
  progress: number
): RibbonRing {
  if (!(progress < 1)) return atRest(to)
  const t = easeOut(clamp01(progress))
  const columns = to.column - from.column
  const rows = to.row - from.row
  const reach = Math.min(SWELL_MAX, Math.hypot(columns, rows) * SWELL_PER_CELL)
  return {
    column: from.column + columns * t,
    row: from.row + rows * t,
    swell: reach * Math.sin(Math.PI * clamp01(progress)),
    moving: true,
  }
}

/**
 * Whether the step change from `previous` is playback handing the day on, as
 * opposed to a seek. Playback walks one day at a time in its own direction and
 * skips every day carrying nothing, so an advance is a move in that direction
 * over a short run of empty days and nothing else. A scrub, a click on a
 * square, a drag, and the window rollover at the end of playback's year all
 * fail one of those, which is the point: a seek is a discontinuity, and
 * animating a four-hundred-day jump would say the clock travelled when it
 * did not.
 */
function advances(previous: number, advance: RibbonAdvance): boolean {
  if (previous < 0) return false
  if (!advance.animated || !advance.playing) return false
  const stride = advance.direction === 'backward' ? -1 : 1
  const span = (advance.step - previous) * stride
  if (span < 1 || span > RIBBON_TRAVEL_MAX_DAYS) return false
  for (let day = previous + stride; day !== advance.step; day += stride)
    if (advance.level(day) > 0) return false
  return true
}

/**
 * @description Carries the ring between the days playback stops on.
 * @returns A travel holding the day the ring last left and when it left it.
 *
 * Only a live advance opens a crossing. Everything else — a seek, a pause, a
 * window page that took the day it left off screen, reduced motion — settles
 * the ring on the current day at once, so the strip has a resting state that is
 * reachable without waiting for a clock and identical to the one it painted
 * before any of this existed.
 */
export function createRibbonTravel(): RibbonTravel {
  /** The day the ring was last asked for, or -1 before the first frame. */
  let shown = -1
  /** The day it is crossing from, or -1 when it is at rest. */
  let leaving = -1
  /** When that crossing opened, on the caller's clock. */
  let opened = 0
  return {
    ring(advance) {
      if (advance.step !== shown) {
        leaving = advances(shown, advance) ? shown : -1
        opened = advance.now
        shown = advance.step
      }
      const to = advance.seat(advance.step)
      if (!to) {
        leaving = -1
        return null
      }
      // Re-read every frame rather than only at the change: pausing has to
      // settle a crossing that is already in the air, or the frame a baseline
      // is taken of depends on when the pause landed.
      const from =
        leaving >= 0 && advance.animated && advance.playing
          ? advance.seat(leaving)
          : null
      if (!from) {
        leaving = -1
        return atRest(to)
      }
      const ring = ribbonRingAt(
        from,
        to,
        (advance.now - opened) / RIBBON_TRAVEL_MS
      )
      if (!ring.moving) leaving = -1
      return ring
    },
  }
}

import { describe, expect, it } from 'vitest'
import { paintRibbon, type RibbonCtx } from './ribbonPaint'
import {
  createRibbonTravel,
  ribbonRingAt,
  RIBBON_TRAVEL_MAX_DAYS,
  RIBBON_TRAVEL_MS,
  type RibbonAdvance,
  type RibbonRing,
} from './ribbonTravel'
import {
  ribbonCell,
  ribbonLayout,
  ribbonWindow,
  type RibbonCell,
} from './ribbonWindow'

/** One day of playback per second, from `galaxyDayClock`'s `STEP_MS`. */
const SLOT_MS = 1000

/**
 * Playback hands a day on to the next day carrying contributions and skips the
 * rest, so the fixture is green every third day: an advance is a three-day
 * stride over two empty days, which is the move the ring has to travel.
 */
const DAY_COUNT = 800
const LEVELS = Array.from({ length: DAY_COUNT }, (_, day) =>
  day % 3 === 0 ? 4 : 0
)

/** The lattice of a window opening on day 0: seven weekday rows to a column. */
const seat = (day: number): RibbonCell | null =>
  day >= 0 && day < DAY_COUNT
    ? { column: Math.floor(day / 7), row: day % 7 }
    : null

/**
 * Day 294 opens a column and day 291 sits four rows down the one before it, so
 * the advance between them is the diagonal, column-crossing jump — not the
 * neighbouring square.
 */
const FROM_DAY = 294
const TO_DAY = 291

const PLAYING: Omit<RibbonAdvance, 'now' | 'step'> = {
  animated: true,
  direction: 'backward',
  level: (day) => LEVELS[day] ?? 0,
  playing: true,
  seat,
}

/** Opens a travel by playing onto `FROM_DAY`, then advancing to `TO_DAY`. */
function advancing(): ReturnType<typeof createRibbonTravel> {
  const travel = createRibbonTravel()
  travel.ring({ ...PLAYING, now: 0, step: FROM_DAY })
  return travel
}

describe('where the ring sits between two days', () => {
  it('leaves the first cell and lands exactly on the second', () => {
    const from: RibbonCell = { column: 42, row: 0 }
    const to: RibbonCell = { column: 41, row: 4 }
    const opened = ribbonRingAt(from, to, 0)
    expect(opened.column).toBe(42)
    expect(opened.row).toBe(0)
    expect(opened.moving).toBe(true)
    const landed = ribbonRingAt(from, to, 1)
    expect(landed.column).toBe(41)
    expect(landed.row).toBe(4)
    expect(landed.moving).toBe(false)
  })

  it('crosses a diagonal jump on both axes at once', () => {
    // A long jump between non-adjacent green days is the normal case, and it is
    // usually diagonal: the ring has to walk the columns and the weekday rows
    // together or it draws an L through the grid.
    const half = ribbonRingAt(
      { column: 50, row: 1 },
      { column: 44, row: 6 },
      0.5
    )
    expect(half.column).toBeLessThan(50)
    expect(half.column).toBeGreaterThan(44)
    expect(half.row).toBeGreaterThan(1)
    expect(half.row).toBeLessThan(6)
  })

  it('decelerates into the target rather than out of the start', () => {
    // Ease-out: the eye needs to see where the ring lands, not where it left,
    // so more than half the distance is covered in the first half of the move.
    const from: RibbonCell = { column: 40, row: 0 }
    const to: RibbonCell = { column: 50, row: 0 }
    expect(ribbonRingAt(from, to, 0.5).column).toBeGreaterThan(45)
    const early = ribbonRingAt(from, to, 0.25).column
    const late = ribbonRingAt(from, to, 0.75).column
    expect(early - 40).toBeGreaterThan(50 - late)
  })

  it('swells over the crossing and is flat at both ends of it', () => {
    const from: RibbonCell = { column: 50, row: 1 }
    const to: RibbonCell = { column: 44, row: 6 }
    expect(ribbonRingAt(from, to, 0).swell).toBe(0)
    expect(ribbonRingAt(from, to, 0.5).swell).toBeGreaterThan(0)
    expect(ribbonRingAt(from, to, 1).swell).toBe(0)
  })

  it('barely swells for a short hop and fully for a long one', () => {
    const near = ribbonRingAt({ column: 9, row: 3 }, { column: 9, row: 4 }, 0.5)
    const far = ribbonRingAt({ column: 9, row: 3 }, { column: 1, row: 6 }, 0.5)
    expect(near.swell).toBeGreaterThan(0)
    expect(far.swell).toBeGreaterThan(near.swell * 3)
  })

  it('is exactly at rest once the crossing is over, however far past', () => {
    // The rest ring is the one every screenshot is taken of; it may not carry a
    // rounding tail from the easing or the swell.
    for (const progress of [1, 1.5, 40, Number.POSITIVE_INFINITY]) {
      const ring = ribbonRingAt(
        { column: 3, row: 5 },
        { column: 7, row: 2 },
        progress
      )
      expect(ring).toEqual({ column: 7, row: 2, swell: 0, moving: false })
    }
  })
})

describe('the ring following playback', () => {
  it('travels when playback hands the day on to the next green one', () => {
    const travel = advancing()
    const ring = travel.ring({ ...PLAYING, now: 60, step: TO_DAY })
    expect(ring?.moving).toBe(true)
    // Still short of the target: it is on its way, not already there.
    expect(ring?.column).toBeGreaterThan(41)
  })

  it('arrives with most of the day still to run', () => {
    // The day slot is a second. A ring that is still travelling when the day
    // ends lags playback and reads as a bug rather than as motion.
    expect(RIBBON_TRAVEL_MS).toBeLessThan(SLOT_MS / 2)
    const travel = advancing()
    // The crossing opens on the frame the day changed, so it is over exactly
    // one travel later — pinned from both sides, or the duration is not tested.
    travel.ring({ ...PLAYING, now: 0, step: TO_DAY })
    const short = travel.ring({
      ...PLAYING,
      now: RIBBON_TRAVEL_MS - 1,
      step: TO_DAY,
    })
    expect(short?.moving).toBe(true)
    const ring = travel.ring({
      ...PLAYING,
      now: RIBBON_TRAVEL_MS,
      step: TO_DAY,
    })
    expect(ring).toEqual({ column: 41, row: 4, swell: 0, moving: false })
  })

  it('rests on the day for the remainder of the slot', () => {
    const travel = advancing()
    travel.ring({ ...PLAYING, now: 60, step: TO_DAY })
    const resting = travel.ring({ ...PLAYING, now: SLOT_MS - 1, step: TO_DAY })
    expect(resting).toEqual({ column: 41, row: 4, swell: 0, moving: false })
  })

  it('snaps when the clock is seeked against the playback direction', () => {
    // A seek is a discontinuity, not a step. Playback runs backward, so a jump
    // forward cannot be an advance whatever else is true of it.
    const travel = advancing()
    const ring = travel.ring({ ...PLAYING, now: 10, step: FROM_DAY + 90 })
    expect(ring).toEqual({ ...seat(FROM_DAY + 90), swell: 0, moving: false })
  })

  it('snaps when the clock is seeked over days playback would have stopped on', () => {
    // Backward and plausible-looking, but days 297 and 294 carry contributions:
    // playback would have held each of them for a second, so this is a scrub.
    const travel = createRibbonTravel()
    travel.ring({ ...PLAYING, now: 0, step: 300 })
    const ring = travel.ring({ ...PLAYING, now: 10, step: 291 })
    expect(ring?.moving).toBe(false)
  })

  it('snaps across a gap too long to sweep', () => {
    const empty = { ...PLAYING, level: () => 0 }
    const travel = createRibbonTravel()
    travel.ring({ ...empty, now: 0, step: 400 })
    const near = travel.ring({
      ...empty,
      now: 10,
      step: 400 - RIBBON_TRAVEL_MAX_DAYS,
    })
    expect(near?.moving).toBe(true)
    const far = createRibbonTravel()
    far.ring({ ...empty, now: 0, step: 400 })
    const ring = far.ring({
      ...empty,
      now: 10,
      step: 400 - RIBBON_TRAVEL_MAX_DAYS - 1,
    })
    expect(ring?.moving).toBe(false)
  })

  it('snaps when the strip paged and the day it left is off screen', () => {
    const travel = advancing()
    const paged = {
      ...PLAYING,
      seat: (day: number) => (day === TO_DAY ? seat(day) : null),
    }
    const ring = travel.ring({ ...paged, now: 10, step: TO_DAY })
    expect(ring?.moving).toBe(false)
  })

  it('carries no ring at all for a day the window does not hold', () => {
    const travel = advancing()
    expect(travel.ring({ ...PLAYING, now: 10, step: -1 })).toBeNull()
  })
})

describe('the ring when nothing may move', () => {
  it('snaps every change while the clock is paused', () => {
    // Nothing but a seek moves a paused clock, and the e2e baselines are all
    // taken after `__viz.pause()`.
    const paused = { ...PLAYING, playing: false }
    const travel = createRibbonTravel()
    travel.ring({ ...paused, now: 0, step: FROM_DAY })
    const ring = travel.ring({ ...paused, now: 10, step: TO_DAY })
    expect(ring).toEqual({ column: 41, row: 4, swell: 0, moving: false })
  })

  it('settles a crossing already in flight the instant playback pauses', () => {
    // boot() plays for four seconds before it pauses, so a travel can be in the
    // air when the pause lands. A half-crossed ring in a baseline is a flake.
    const travel = advancing()
    expect(travel.ring({ ...PLAYING, now: 40, step: TO_DAY })?.moving).toBe(
      true
    )
    const ring = travel.ring({
      ...PLAYING,
      now: 80,
      playing: false,
      step: TO_DAY,
    })
    expect(ring).toEqual({ column: 41, row: 4, swell: 0, moving: false })
  })

  it('never travels under reduced motion', () => {
    const still = { ...PLAYING, animated: false }
    const travel = createRibbonTravel()
    travel.ring({ ...still, now: 0, step: FROM_DAY })
    const ring = travel.ring({ ...still, now: 10, step: TO_DAY })
    expect(ring).toEqual({ column: 41, row: 4, swell: 0, moving: false })
  })
})

type Call = [string, ...unknown[]]

/** A pure call log standing in for a 2D context; node has no real canvas. */
function recorder(): { ctx: RibbonCtx; calls: Call[] } {
  const calls: Call[] = []
  const target: Record<string, unknown> = {}
  for (const name of ['clearRect', 'fillRect', 'strokeRect', 'fillText'])
    target[name] = (...args: unknown[]): void => {
      calls.push([name, ...args])
    }
  const ctx = new Proxy(target, {
    set(holder, key, value) {
      if (typeof key === 'string') calls.push([`set:${key}`, value])
      holder[key as string] = value
      return true
    },
  }) as unknown as RibbonCtx
  return { ctx, calls }
}

const LAYOUT = ribbonLayout(1800, 256, 2, DAY_COUNT)
const STEP = 291
const VISIBLE = ribbonWindow(STEP, DAY_COUNT, 1, LAYOUT.columns)
const CELL = ribbonCell(VISIBLE, STEP)!

function paint(ring?: RibbonRing): Call[] {
  const recording = recorder()
  paintRibbon(recording.ctx, {
    dpr: 2,
    grid: { level: LEVELS, dayCount: DAY_COUNT },
    heightPx: 256,
    layout: LAYOUT,
    ring,
    step: STEP,
    widthPx: 1800,
    window: VISIBLE,
    windowStartISO: '2024-01-01',
  })
  return recording.calls
}

describe('painting a ring that is on its way somewhere', () => {
  it('draws a settled ring exactly as it drew one before any of this', () => {
    // The one guarantee the committed PNG baselines rest on: at rest the paint
    // is the paint it always was, call for call and argument for argument, so
    // a frame nothing is animating in is byte-identical to the old one.
    expect(LEVELS[STEP]).toBeGreaterThan(0)
    const settled = ribbonRingAt({ column: 0, row: 0 }, CELL, 1)
    expect(settled).toEqual({ ...CELL, swell: 0, moving: false })
    expect(paint(settled)).toEqual(paint())
  })

  it('strokes the resting ring on the arithmetic the PNGs were taken from', () => {
    // Spelled out rather than compared to itself: the committed baselines are
    // of these exact numbers, and the only way a settled crossing can move a
    // pixel is if this formula changed. `dpr: 2` makes the stroke 2 wide.
    const ringPx = 2
    const x = LAYOUT.originXPx + CELL.column * LAYOUT.stepPx
    const y = LAYOUT.originYPx + CELL.row * LAYOUT.stepPx
    const strokes = [
      [
        'strokeRect',
        x - ringPx / 2,
        y - ringPx / 2,
        LAYOUT.cellPx + ringPx,
        LAYOUT.cellPx + ringPx,
      ],
      [
        'strokeRect',
        x - ringPx * 1.5,
        y - ringPx * 1.5,
        LAYOUT.cellPx + ringPx * 3,
        LAYOUT.cellPx + ringPx * 3,
      ],
    ]
    const drawn = (calls: Call[]): Call[] =>
      calls.filter((call) => call[0] === 'strokeRect')
    expect(drawn(paint())).toEqual(strokes)
    expect(drawn(paint(ribbonRingAt({ column: 0, row: 0 }, CELL, 1)))).toEqual(
      strokes
    )
  })

  it('moves the ring off the lattice while it is crossing', () => {
    const crossing = paint({
      column: CELL.column + 1.4,
      row: CELL.row - 0.6,
      swell: 0.1,
      moving: true,
    })
    expect(crossing).not.toEqual(paint())
    expect(crossing.filter((call) => call[0] === 'strokeRect')).toHaveLength(2)
  })
})

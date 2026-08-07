import { describe, expect, it } from 'vitest'
import { formatDayISO, weekdayOfISO } from '@/lib/viz/driver'
import {
  PLAYBACK_WINDOW_STEPS,
  playbackWindowEnd,
  playbackWindowStart,
} from '@/packages/aiur-galaxy/src/universePlayback'
import {
  RIBBON_WEEKS,
  RIBBON_WINDOW_DAYS,
  ribbonCell,
  ribbonDayAt,
  ribbonLayout,
  ribbonWindow,
} from './ribbonWindow'
import { paintRibbon, type RibbonCtx } from './ribbonPaint'

/** Two years plus change, so one year on screen is a strict subset. */
const DAY_COUNT = 800
/** A Monday: day 0 lands in weekday row 1 of the very first column. */
const WINDOW_START = '2024-01-01'
const START_WEEKDAY = weekdayOfISO(WINDOW_START)
const NEWEST = DAY_COUNT - 1
/**
 * Derived by hand so the test pins the arithmetic rather than restating it:
 * day 799 is a Tuesday, so its week column opens on day 797, and 52 columns
 * earlier is day 433 — itself a Sunday.
 */
const NEWEST_WINDOW_START = 433

const LEVELS = Array.from({ length: DAY_COUNT }, (_, day) => day % 5)
const GRID = { level: LEVELS, dayCount: DAY_COUNT }

type Call = [string, ...unknown[]]
interface Recording {
  readonly ctx: RibbonCtx
  readonly calls: Call[]
}

/** A pure call log standing in for a 2D context; node has no real canvas. */
function recorder(): Recording {
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

const LAYOUT = ribbonLayout(1800, 256, 2)
function paint(step: number): Recording {
  const recording = recorder()
  paintRibbon(recording.ctx, {
    grid: GRID,
    window: ribbonWindow(step, DAY_COUNT, START_WEEKDAY),
    layout: LAYOUT,
    widthPx: 1800,
    heightPx: 256,
    dpr: 2,
    step,
    windowStartISO: WINDOW_START,
  })
  return recording
}
function named(calls: readonly Call[], name: string): Call[] {
  return calls.filter((call) => call[0] === name)
}

describe('the one-year ribbon window', () => {
  it('is exactly seven weekday rows by fifty-three week columns', () => {
    expect(RIBBON_WINDOW_DAYS).toBe(RIBBON_WEEKS * 7)
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY)
    expect(window.end - window.start + 1).toBe(RIBBON_WINDOW_DAYS)
  })

  it('opens on the newest year, aligned so row 0 is always a Sunday', () => {
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY)
    expect(window.start).toBe(NEWEST_WINDOW_START)
    expect(weekdayOfISO(formatDayISO(WINDOW_START, window.start))).toBe(0)
    expect(window.end).toBeGreaterThanOrEqual(NEWEST)
  })

  it('holds still for every step of the galaxy’s rolling year', () => {
    const opening = ribbonWindow(
      playbackWindowEnd(DAY_COUNT),
      DAY_COUNT,
      START_WEEKDAY
    )
    for (let step = playbackWindowStart(DAY_COUNT); step <= NEWEST; step += 1)
      expect(ribbonWindow(step, DAY_COUNT, START_WEEKDAY)).toEqual(opening)
    expect(DAY_COUNT - PLAYBACK_WINDOW_STEPS).toBeGreaterThanOrEqual(
      opening.start
    )
  })

  it('shifts a whole window back once the clock passes its oldest day', () => {
    const window = ribbonWindow(
      NEWEST_WINDOW_START - 1,
      DAY_COUNT,
      START_WEEKDAY
    )
    expect(window.start).toBe(NEWEST_WINDOW_START - RIBBON_WINDOW_DAYS)
    expect(window.end).toBe(NEWEST_WINDOW_START - 1)
    for (const step of [0, 61, 62, 100, 431])
      expect(step).toBeGreaterThanOrEqual(
        ribbonWindow(step, DAY_COUNT, START_WEEKDAY).start
      )
  })

  it('never scrolls past the oldest day in the payload', () => {
    const window = ribbonWindow(0, DAY_COUNT, START_WEEKDAY)
    expect(window.start).toBe(-START_WEEKDAY)
    expect(ribbonWindow(1, DAY_COUNT, START_WEEKDAY)).toEqual(window)
  })

  it('shows the newest year while the clock is still unseeked', () => {
    // The shared timeline publishes step -1 until the galaxy mounts; that must
    // not read as "scrolled all the way back".
    expect(ribbonWindow(-1, DAY_COUNT, START_WEEKDAY).start).toBe(
      NEWEST_WINDOW_START
    )
  })

  it('degrades to a single empty window for an empty payload', () => {
    const window = ribbonWindow(0, 0, START_WEEKDAY)
    expect(window.end - window.start + 1).toBe(RIBBON_WINDOW_DAYS)
    expect(ribbonCell(window, DAY_COUNT)).toBeNull()
  })
})

describe('the ribbon lattice', () => {
  it('places a day in its own week column and weekday row', () => {
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY)
    expect(ribbonCell(window, window.start)).toEqual({ column: 0, row: 0 })
    expect(ribbonCell(window, NEWEST)).toEqual({ column: 52, row: 2 })
    expect(ribbonCell(window, window.start - 1)).toBeNull()
    expect(ribbonCell(window, window.end + 1)).toBeNull()
  })

  it('is integral and fits inside the canvas it was measured for', () => {
    for (const [width, height, dpr] of [
      [1800, 256, 2],
      [552, 128, 2],
      [300, 150, 1],
    ] as const) {
      const layout = ribbonLayout(width, height, dpr)
      for (const value of Object.values(layout))
        expect(Number.isInteger(value)).toBe(true)
      expect(layout.cellPx).toBeGreaterThan(0)
      expect(
        layout.originXPx + RIBBON_WEEKS * layout.stepPx
      ).toBeLessThanOrEqual(width + layout.gapPx)
      expect(layout.originYPx + 7 * layout.stepPx).toBeLessThanOrEqual(
        height + layout.gapPx
      )
      expect(layout.originYPx).toBeGreaterThanOrEqual(layout.labelPx)
    }
  })

  it('inverts the lattice, and extrapolates beyond both edges', () => {
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY)
    const at = (column: number, row: number): number =>
      ribbonDayAt(
        window,
        LAYOUT,
        LAYOUT.originXPx + column * LAYOUT.stepPx + 1,
        LAYOUT.originYPx + row * LAYOUT.stepPx + 1
      )
    expect(at(0, 0)).toBe(window.start)
    expect(at(52, 2)).toBe(NEWEST)
    // A drag that leaves the grid keeps walking a week per column, which is how
    // the rest of the history is reachable from a one-year window.
    expect(at(-4, 0)).toBe(window.start - 28)
    expect(at(60, 0)).toBe(window.start + 420)
    // Rows saturate: sliding above or below the grid must not skip weeks.
    expect(at(3, -5)).toBe(window.start + 21)
    expect(at(3, 20)).toBe(window.start + 27)
  })
})

describe('painting the contribution grid', () => {
  it('paints one square per day of data on screen, and no more', () => {
    const { calls } = paint(NEWEST)
    const cells = named(calls, 'fillRect').filter(
      (call) => call[3] === LAYOUT.cellPx && call[4] === LAYOUT.cellPx
    )
    // Window [433, 803] over 800 days of payload: 367 days carry data.
    expect(cells).toHaveLength(NEWEST - NEWEST_WINDOW_START + 1)
    expect(cells.length).toBeLessThan(RIBBON_WINDOW_DAYS)
    expect(named(calls, 'clearRect')).toHaveLength(1)
  })

  it('marks the year boundaries along the strip', () => {
    const labels = named(paint(NEWEST).calls, 'fillText').map((call) => call[1])
    expect(labels).toEqual(['2025', '2026'])
    expect(named(paint(100).calls, 'fillText').map((call) => call[1])).toEqual([
      '2024',
      '2025',
    ])
  })

  it('rings the current day so it reads against every density color', () => {
    const { calls } = paint(NEWEST)
    const cell = ribbonCell(
      ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY),
      NEWEST
    )
    const x = LAYOUT.originXPx + cell!.column * LAYOUT.stepPx
    const y = LAYOUT.originYPx + cell!.row * LAYOUT.stepPx
    const rings = named(calls, 'strokeRect')
    expect(rings.length).toBeGreaterThanOrEqual(2)
    for (const [, rx, ry, rw, rh] of rings as [
      string,
      number,
      number,
      number,
      number,
    ][]) {
      expect(rx).toBeLessThan(x)
      expect(ry).toBeLessThan(y)
      expect(rx + rw).toBeGreaterThan(x + LAYOUT.cellPx)
      expect(ry + rh).toBeGreaterThan(y + LAYOUT.cellPx)
    }
    const strokes = calls.filter((call) => call[0] === 'set:strokeStyle')
    expect(strokes.map((call) => call[1])).toContain('#fbf1c7')
  })

  it('draws no ring for a day the payload does not have', () => {
    expect(named(paint(-1).calls, 'strokeRect')).toHaveLength(0)
  })

  it('leaves a day with no contributions unringed', () => {
    // Level 0 is exactly zero contributions: band 1's lower bound is 1, so a
    // day only falls to level 0 when nothing landed on it.
    const empty = 795
    const busy = 796
    expect(LEVELS[empty]).toBe(0)
    expect(LEVELS[busy]).toBeGreaterThan(0)
    expect(named(paint(empty).calls, 'strokeRect')).toHaveLength(0)
    expect(
      named(paint(busy).calls, 'strokeRect').length
    ).toBeGreaterThanOrEqual(2)
  })

  it('still paints the empty day’s square, it just does not ring it', () => {
    // The day is drawn like any other day on screen; only the highlight goes.
    const cells = named(paint(795).calls, 'fillRect').filter(
      (call) => call[3] === LAYOUT.cellPx && call[4] === LAYOUT.cellPx
    )
    expect(cells).toHaveLength(NEWEST - NEWEST_WINDOW_START + 1)
  })

  it('never hands the canvas a CSS custom property', () => {
    // A past round shipped fillStyle = 'var(--bg2)', which the 2D API silently
    // painted black. Every style this module writes is a concrete hex.
    const styles = paint(NEWEST).calls.filter(
      (call) => call[0] === 'set:fillStyle' || call[0] === 'set:strokeStyle'
    )
    expect(styles.length).toBeGreaterThan(0)
    for (const [, value] of styles) expect(value).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is a pure function of its inputs, twice over', () => {
    // The e2e suite screenshots this surface and asserts byte equality across
    // two renders of the same step; nothing here may read a clock.
    expect(paint(NEWEST).calls).toEqual(paint(NEWEST).calls)
    expect(paint(500).calls).not.toEqual(paint(NEWEST).calls)
  })
})

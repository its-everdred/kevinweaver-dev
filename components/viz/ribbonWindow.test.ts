import { describe, expect, it } from 'vitest'
import { formatDayISO, weekdayOfISO } from '@/lib/viz/driver'
import {
  PLAYBACK_WINDOW_STEPS,
  playbackWindowEnd,
  playbackWindowStart,
} from '@/packages/aiur-galaxy/src/universePlayback'
import {
  ribbonCell,
  ribbonDayAt,
  ribbonLayout,
  ribbonWindow,
  type RibbonLayout,
} from './ribbonWindow'
import { paintRibbon, type RibbonCtx } from './ribbonPaint'

/** Two years plus change, so the pane's window is a strict subset. */
const DAY_COUNT = 800
/** A Monday: day 0 lands in weekday row 1 of the very first column. */
const WINDOW_START = '2024-01-01'
const START_WEEKDAY = weekdayOfISO(WINDOW_START)
const NEWEST = DAY_COUNT - 1
/**
 * The lattice an 1800x256 backing store measures out at dpr 2, derived by hand
 * so the test pins the arithmetic rather than restating it: a 22px label strip
 * over 234px of rows, a 4px gutter, 24px squares — 28 device pixels a column,
 * and 64 of those columns across 1800.
 */
const COLUMNS = 64
const WINDOW_DAYS = COLUMNS * 7
/**
 * Day 799 is a Tuesday, so its week column opens on day 797, and 63 columns
 * earlier is day 356 — itself a Sunday.
 */
const NEWEST_WINDOW_START = 356

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

const LAYOUT = ribbonLayout(1800, 256, 2, DAY_COUNT)
function paint(step: number): Recording {
  const recording = recorder()
  paintRibbon(recording.ctx, {
    grid: GRID,
    window: ribbonWindow(step, DAY_COUNT, START_WEEKDAY, LAYOUT.columns),
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

/** A pane and a payload the 1800x256 fixture does not measure out. */
interface PaintCase {
  readonly widthPx: number
  readonly heightPx: number
  readonly dpr: number
  readonly dayCount: number
  readonly windowStartISO: string
  readonly step: number
}

/**
 * Paints one frame for an arbitrary pane. The year markers follow the window
 * the pane's width lands on, so they have to be checked on more windows than
 * the default lattice ever opens.
 */
function paintCase(input: PaintCase): Recording {
  const recording = recorder()
  const layout = ribbonLayout(
    input.widthPx,
    input.heightPx,
    input.dpr,
    input.dayCount
  )
  paintRibbon(recording.ctx, {
    grid: { level: [], dayCount: input.dayCount },
    window: ribbonWindow(
      input.step,
      input.dayCount,
      weekdayOfISO(input.windowStartISO),
      layout.columns
    ),
    layout,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    dpr: input.dpr,
    step: input.step,
    windowStartISO: input.windowStartISO,
  })
  return recording
}

/** The year and x of every label a paint drew, in the order it drew them. */
function labelsAt(calls: readonly Call[]): [string, number][] {
  return named(calls, 'fillText').map((call) => [
    call[1] as string,
    call[2] as number,
  ])
}

/** The x of every year rule a paint drew: the full-height, hairline fills. */
function rulesAt(calls: readonly Call[], layout: RibbonLayout): number[] {
  return named(calls, 'fillRect')
    .filter((call) => call[4] === layout.gridHeightPx)
    .map((call) => call[1] as number)
}

describe('the pane-width ribbon window', () => {
  it('is seven weekday rows by as many week columns as the pane fits', () => {
    expect(LAYOUT.columns).toBe(COLUMNS)
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY, COLUMNS)
    expect(window.end - window.start + 1).toBe(WINDOW_DAYS)
  })

  it('spends the whole pane width on week columns', () => {
    // The operator's ask: no empty pane to the right of the squares. Whatever
    // is left over is less than one more column's worth.
    for (const [width, height, dpr] of [
      [1800, 256, 2],
      [900, 128, 1],
      [320, 64, 1],
    ] as const) {
      const layout = ribbonLayout(width, height, dpr, DAY_COUNT)
      expect(layout.gridWidthPx).toBeLessThanOrEqual(width)
      expect(layout.gridWidthPx).toBeGreaterThan(width - layout.stepPx)
    }
  })

  it('buys weeks with the extra width, not chunkier squares', () => {
    const narrow = ribbonLayout(600, 256, 2, DAY_COUNT)
    const wide = ribbonLayout(2400, 256, 2, DAY_COUNT)
    expect(wide.columns).toBeGreaterThan(narrow.columns)
    expect(wide.cellPx).toBe(narrow.cellPx)
    // A phone-width pane stays a readable graph rather than a hairline.
    expect(ribbonLayout(320, 64, 1, DAY_COUNT).cellPx).toBeGreaterThanOrEqual(4)
  })

  it('stops the window at the payload however wide the browser is', () => {
    const layout = ribbonLayout(20_000, 256, 2, DAY_COUNT)
    const window = ribbonWindow(
      NEWEST,
      DAY_COUNT,
      START_WEEKDAY,
      layout.columns
    )
    expect(window.start).toBeLessThanOrEqual(0)
    expect(window.end).toBeGreaterThanOrEqual(NEWEST)
    // The whole history is on screen, so there is nothing left to page to.
    expect(ribbonWindow(0, DAY_COUNT, START_WEEKDAY, layout.columns)).toEqual(
      window
    )
    expect(window.end - window.start).toBeLessThan(DAY_COUNT + 14)
    // With no weeks left to add, the leftover width goes into the squares
    // instead — bounded by the height, so seven rows still fit.
    expect(layout.cellPx).toBeGreaterThan(
      ribbonLayout(2400, 256, 2, DAY_COUNT).cellPx
    )
    expect(layout.originYPx + 7 * layout.stepPx).toBeLessThanOrEqual(
      256 + layout.gapPx
    )
  })

  it('opens on the newest weeks, aligned so row 0 is always a Sunday', () => {
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY, COLUMNS)
    expect(window.start).toBe(NEWEST_WINDOW_START)
    expect(weekdayOfISO(formatDayISO(WINDOW_START, window.start))).toBe(0)
    expect(window.end).toBeGreaterThanOrEqual(NEWEST)
  })

  it('keeps the played day on screen at every width the pane can be', () => {
    // The galaxy still rolls backward through PLAYBACK_WINDOW_STEPS days of the
    // shared clock, and a narrow pane now holds fewer days than that. So the
    // agreement between the two surfaces is no longer "the same year" but the
    // stronger one: whatever step the clock reports, the strip has a seat for
    // it, so the ringed square is the day the galaxy is playing.
    for (const columns of [13, 43, COLUMNS, 116])
      for (
        let step = playbackWindowStart(DAY_COUNT);
        step <= playbackWindowEnd(DAY_COUNT);
        step += 1
      ) {
        const window = ribbonWindow(step, DAY_COUNT, START_WEEKDAY, columns)
        expect(ribbonCell(window, step)).not.toBeNull()
      }
  })

  it('holds still through the galaxy’s year when the pane fits one', () => {
    const columns = 53
    const opening = ribbonWindow(
      playbackWindowEnd(DAY_COUNT),
      DAY_COUNT,
      START_WEEKDAY,
      columns
    )
    for (let step = playbackWindowStart(DAY_COUNT); step <= NEWEST; step += 1)
      expect(ribbonWindow(step, DAY_COUNT, START_WEEKDAY, columns)).toEqual(
        opening
      )
    expect(DAY_COUNT - PLAYBACK_WINDOW_STEPS).toBeGreaterThanOrEqual(
      opening.start
    )
  })

  it('shifts a whole window back once the clock passes its oldest day', () => {
    // A quarter-wide strip, so there is a whole window of history left behind
    // it to page into.
    const columns = 13
    const newest = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY, columns)
    const paged = ribbonWindow(
      newest.start - 1,
      DAY_COUNT,
      START_WEEKDAY,
      columns
    )
    expect(paged.start).toBe(newest.start - columns * 7)
    expect(paged.end).toBe(newest.start - 1)
    // A page that would run off the oldest end stops at the payload's first
    // week instead, and the step that asked for it is still on screen.
    const clamped = ribbonWindow(
      NEWEST_WINDOW_START - 1,
      DAY_COUNT,
      START_WEEKDAY,
      COLUMNS
    )
    expect(clamped.start).toBe(-START_WEEKDAY)
    expect(clamped.end).toBeGreaterThanOrEqual(NEWEST_WINDOW_START - 1)
    for (const step of [0, 61, 62, 100, 355])
      expect(step).toBeGreaterThanOrEqual(
        ribbonWindow(step, DAY_COUNT, START_WEEKDAY, COLUMNS).start
      )
  })

  it('never scrolls past the oldest day in the payload', () => {
    const window = ribbonWindow(0, DAY_COUNT, START_WEEKDAY, COLUMNS)
    expect(window.start).toBe(-START_WEEKDAY)
    expect(ribbonWindow(1, DAY_COUNT, START_WEEKDAY, COLUMNS)).toEqual(window)
  })

  it('shows the newest weeks while the clock is still unseeked', () => {
    // The shared timeline publishes step -1 until the galaxy mounts; that must
    // not read as "scrolled all the way back".
    expect(ribbonWindow(-1, DAY_COUNT, START_WEEKDAY, COLUMNS).start).toBe(
      NEWEST_WINDOW_START
    )
  })

  it('degrades to a single empty window for an empty payload', () => {
    const window = ribbonWindow(0, 0, START_WEEKDAY, COLUMNS)
    expect(window.end - window.start + 1).toBe(WINDOW_DAYS)
    expect(ribbonCell(window, DAY_COUNT)).toBeNull()
    // Nothing to cap the lattice against yet, so the width alone measures it.
    expect(ribbonLayout(1800, 256, 2, 0).columns).toBe(COLUMNS)
  })
})

describe('the ribbon lattice', () => {
  it('places a day in its own week column and weekday row', () => {
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY, COLUMNS)
    expect(ribbonCell(window, window.start)).toEqual({ column: 0, row: 0 })
    expect(ribbonCell(window, NEWEST)).toEqual({ column: COLUMNS - 1, row: 2 })
    expect(ribbonCell(window, window.start - 1)).toBeNull()
    expect(ribbonCell(window, window.end + 1)).toBeNull()
  })

  it('is integral and fits inside the canvas it was measured for', () => {
    for (const [width, height, dpr] of [
      [1800, 256, 2],
      [552, 128, 2],
      [300, 150, 1],
    ] as const) {
      const layout = ribbonLayout(width, height, dpr, DAY_COUNT)
      for (const value of Object.values(layout))
        expect(Number.isInteger(value)).toBe(true)
      expect(layout.cellPx).toBeGreaterThan(0)
      expect(layout.columns).toBeGreaterThan(0)
      expect(
        layout.originXPx + layout.columns * layout.stepPx
      ).toBeLessThanOrEqual(width + layout.gapPx)
      expect(layout.originYPx + 7 * layout.stepPx).toBeLessThanOrEqual(
        height + layout.gapPx
      )
      expect(layout.originYPx).toBeGreaterThanOrEqual(layout.labelPx)
    }
  })

  it('inverts the lattice, and extrapolates beyond both edges', () => {
    const window = ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY, COLUMNS)
    const at = (column: number, row: number): number =>
      ribbonDayAt(
        window,
        LAYOUT,
        LAYOUT.originXPx + column * LAYOUT.stepPx + 1,
        LAYOUT.originYPx + row * LAYOUT.stepPx + 1
      )
    expect(at(0, 0)).toBe(window.start)
    expect(at(COLUMNS - 1, 2)).toBe(NEWEST)
    // A drag that leaves the grid keeps walking a week per column, which is how
    // the rest of the history is reachable from a window that holds part of it.
    expect(at(-4, 0)).toBe(window.start - 28)
    expect(at(COLUMNS + 6, 0)).toBe(window.start + (COLUMNS + 6) * 7)
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
    // Window [356, 803] over 800 days of payload: 444 days carry data.
    expect(cells).toHaveLength(NEWEST - NEWEST_WINDOW_START + 1)
    expect(cells.length).toBeLessThan(WINDOW_DAYS)
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

  it('puts a label only where a year begins, never on the opening column', () => {
    // A 724-pixel pane opens its window on 2025-09-14: mid-year, and sixteen
    // columns clear of the new year, so nothing here is crowded. The operator's
    // complaint was exactly this window — the opening column labelled with
    // whatever year the arithmetic happened to land in, sitting where no
    // boundary rule is drawn. Those sixteen columns now run unlabelled.
    const layout = ribbonLayout(724, 256, 2, DAY_COUNT)
    const window = ribbonWindow(
      NEWEST,
      DAY_COUNT,
      START_WEEKDAY,
      layout.columns
    )
    expect(layout.columns).toBe(26)
    expect(formatDayISO(WINDOW_START, window.start)).toBe('2025-09-14')
    const { calls } = paintCase({
      dayCount: DAY_COUNT,
      dpr: 2,
      heightPx: 256,
      step: NEWEST,
      widthPx: 724,
      windowStartISO: WINDOW_START,
    })
    const boundaryXPx = layout.originXPx + 16 * layout.stepPx
    expect(labelsAt(calls)).toEqual([['2026', boundaryXPx]])
    // Every label sits on a rule, which is what the operator asked for.
    expect(rulesAt(calls, layout)).toEqual([boundaryXPx - layout.gapPx])
  })

  it('labels the opening column when the year does begin there', () => {
    // A 1736-pixel pane opens on 2025-01-05, the first Sunday of that year, so
    // the leftmost column is a real boundary and keeps its label. It carries no
    // rule: the rule lives in the gutter between two weeks, and there is no
    // week to the left of the first one.
    const layout = ribbonLayout(1736, 256, 2, DAY_COUNT)
    const window = ribbonWindow(
      NEWEST,
      DAY_COUNT,
      START_WEEKDAY,
      layout.columns
    )
    expect(layout.columns).toBe(62)
    expect(formatDayISO(WINDOW_START, window.start)).toBe('2025-01-05')
    const { calls } = paintCase({
      dayCount: DAY_COUNT,
      dpr: 2,
      heightPx: 256,
      step: NEWEST,
      widthPx: 1736,
      windowStartISO: WINDOW_START,
    })
    const boundaryXPx = layout.originXPx + 52 * layout.stepPx
    expect(labelsAt(calls)).toEqual([
      ['2025', layout.originXPx],
      ['2026', boundaryXPx],
    ])
    expect(rulesAt(calls, layout)).toEqual([boundaryXPx - layout.gapPx])
  })

  it('names every year the pane spans, at the payload’s real scale', () => {
    // 6056 days from 2010, which is what the bundle now carries: a desktop pane
    // spans two boundaries at once and a phone one, so both ends of the
    // viewport range see windows the 800-day fixture never produces.
    const payload = { dayCount: 6056, step: 6055, windowStartISO: '2010-01-01' }
    const wide = ribbonLayout(2400, 256, 2, payload.dayCount)
    const wideCalls = paintCase({
      ...payload,
      dpr: 2,
      heightPx: 256,
      widthPx: 2400,
    }).calls
    // The window opens on 2024-12-15, three columns of December that name no
    // boundary; 2025 and 2026 each begin on screen and each get a label.
    expect(labelsAt(wideCalls)).toEqual([
      ['2025', wide.originXPx + 3 * wide.stepPx],
      ['2026', wide.originXPx + 55 * wide.stepPx],
    ])
    expect(rulesAt(wideCalls, wide)).toEqual(
      labelsAt(wideCalls).map(([, xPx]) => xPx - wide.gapPx)
    )
    const narrow = ribbonLayout(320, 64, 1, payload.dayCount)
    const narrowCalls = paintCase({
      ...payload,
      dpr: 1,
      heightPx: 64,
      widthPx: 320,
    }).calls
    expect(labelsAt(narrowCalls)).toEqual([
      ['2026', narrow.originXPx + 15 * narrow.stepPx],
    ])
  })

  it('leaves the strip unlabelled when no year begins on screen', () => {
    // Eleven chunky columns of 2026 and nothing else. A label here could only
    // be the opening column's, which is the one the operator asked us to drop;
    // the text alternative and the date readout still name the stretch.
    const { calls } = paintCase({
      dayCount: 6056,
      dpr: 2,
      heightPx: 256,
      step: 6055,
      widthPx: 320,
      windowStartISO: '2010-01-01',
    })
    expect(ribbonLayout(320, 256, 2, 6056).columns).toBe(11)
    expect(labelsAt(calls)).toEqual([])
    expect(rulesAt(calls, ribbonLayout(320, 256, 2, 6056))).toEqual([])
  })

  it('rings the current day so it reads against every density color', () => {
    const { calls } = paint(NEWEST)
    const cell = ribbonCell(
      ribbonWindow(NEWEST, DAY_COUNT, START_WEEKDAY, LAYOUT.columns),
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

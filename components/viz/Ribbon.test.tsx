import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { BundleHead } from '@/lib/bundle/loader'
import type { RepoRecord } from '@/lib/bundle/schema'
import { formatDayISO } from '@/lib/viz/driver'
import { PLAYBACK_WINDOW_STEPS } from '@/packages/aiur-galaxy/src/universePlayback'
import {
  createInstrumentViz,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
} from './galaxyTimeline'
import { Ribbon } from './Ribbon'

const runtime = vi.hoisted(() => ({
  current: { status: 'loading' } as InstrumentRuntimeState,
}))

vi.mock('./instrumentRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instrumentRuntime')>()
  return { ...actual, useInstrumentRuntime: () => runtime.current }
})

/** Two full years plus change, so the one-year window is a strict subset. */
const DAY_COUNT = 800
/** A Monday, so day 0 sits in weekday row 1 of the very first column. */
const WINDOW_START = '2024-01-01'
const WINDOW_END = formatDayISO(WINDOW_START, DAY_COUNT - 1)
const NEWEST = DAY_COUNT - 1

/**
 * The newest window, derived by hand so the test pins the arithmetic rather
 * than restating it: day 799 is a Tuesday, so its column starts on day 797;
 * 52 columns earlier is day 433, itself a Sunday.
 */
const NEWEST_WINDOW_START = 433
/** 53 week columns of 7 weekday rows. */
const WINDOW_DAYS = 371

/** jsdom runs no layout, so every canvas under test reports this CSS box. */
const CSS_W = 600
const CSS_H = 400
/**
 * jsdom has no 2D context, so the paint effect bails before it ever resizes
 * the backing store: it stays at the HTML default of 300x150. Hit testing runs
 * against the backing store, so the lattice below is the one under test:
 * gap 1, cell 4, step 5, origin (18, 63) — see ribbonLayout.
 */
const STEP_PX = 5
const ORIGIN_X_PX = 18
const ORIGIN_Y_PX = 63
const SCALE_X = 300 / CSS_W
const SCALE_Y = 150 / CSS_H

/** CSS-pixel client coordinates of the first row of a given lattice column. */
function clientAt(column: number): { clientX: number; clientY: number } {
  return {
    clientX: (ORIGIN_X_PX + column * STEP_PX + 1) / SCALE_X,
    clientY: (ORIGIN_Y_PX + 1) / SCALE_Y,
  }
}

// prettier-ignore
function repo(id: number, short: string, actor: 0 | 1): RepoRecord {
  return { id, ghId: (id + 1) * 100, name: `fixture/${short}`, short, actor, vol: 4, stars: 2, from: WINDOW_START, to: WINDOW_END, private: false, ext: ['ts'], status: 'ok' }
}

// prettier-ignore
const HEAD: BundleHead = {
  manifest: { v: 1, generatedAt: '2026-03-10T12:00:00Z', commit: 'fixture-commit', days: [WINDOW_END, WINDOW_START], refs: 'all', windowStart: WINDOW_START, windowEnd: WINDOW_END, dayCount: DAY_COUNT, repoCount: 2, repoCountDefinition: 'ownerPublicNonFork', actors: [{ id: 0, login: 'human-fixture', kind: 'human' }, { id: 1, login: 'agent-fixture', kind: 'agent' }], degraded: [], chunkSize: 10, chunks: 1, events: 2 },
  repos: [repo(0, 'alpha', 0), repo(1, 'beta', 1)],
  grid: { start: WINDOW_START, dayCount: DAY_COUNT, human: Array.from({ length: DAY_COUNT }, (_, day) => day % 5), agent: Array.from({ length: DAY_COUNT }, (_, day) => day % 3), privateMonthly: [], privateStart: '2024-01', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
  events: [{ day: 0, repo: 1, path: 'docs/latest.md', actor: 1 }, { day: NEWEST, repo: 0, path: 'src/needle.ts', actor: 0 }],
}

let viz: ReturnType<typeof createInstrumentViz>

/**
 * jsdom implements no pointer capture, so the suite models the single property
 * the scrub depends on: a captured pointer keeps reporting to the element that
 * captured it, wherever on the page it travels.
 */
const captured = new Set<number>()

beforeAll(() => {
  // jsdom ships no pointer capture and no layout; both are browser-side gaps,
  // not component behavior, so they are filled here rather than guarded for in
  // production code.
  Element.prototype.setPointerCapture = (pointerId: number) => {
    captured.add(pointerId)
  }
  Element.prototype.releasePointerCapture = (pointerId: number) => {
    captured.delete(pointerId)
  }
  Element.prototype.hasPointerCapture = (pointerId: number) =>
    captured.has(pointerId)
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    new DOMRect(0, 0, CSS_W, CSS_H)
  viz = createInstrumentViz(HEAD)
  runtime.current = { status: 'ready', viz }
})

afterAll(() => {
  viz.driver.destroy()
})

beforeEach(() => {
  captured.clear()
  publishGalaxyTimeline({
    step: NEWEST,
    date: WINDOW_END,
    playing: false,
    total: DAY_COUNT,
    direction: 'backward',
    windowStartISO: WINDOW_START,
  })
  seekGalaxyTimeline(NEWEST, DAY_COUNT)
})

function ribbonCanvas(): HTMLCanvasElement {
  const canvas = screen.getByRole('img', { name: /contribution/i })
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('not a canvas')
  return canvas
}

function label(): string {
  return ribbonCanvas().getAttribute('aria-label') ?? ''
}

describe('the one-year contribution window', () => {
  it('names only the visible year, not the whole history', () => {
    render(<Ribbon />)
    // e2e/a11y.spec.ts resolves this canvas by name; keep the phrase it uses.
    expect(label()).toMatch(/contribution grid/i)
    expect(label()).toContain(formatDayISO(WINDOW_START, NEWEST_WINDOW_START))
    expect(label()).toContain(WINDOW_END)
    expect(label()).not.toContain(WINDOW_START)
  })

  it('shows the same year the galaxy plays through', () => {
    render(<Ribbon />)
    // The galaxy rolls backward through [total - 365, total - 1]; both ends of
    // that pass have to be inside the window the ribbon is naming.
    const oldest = DAY_COUNT - PLAYBACK_WINDOW_STEPS
    expect(NEWEST_WINDOW_START).toBeLessThanOrEqual(oldest)
    expect(NEWEST_WINDOW_START + WINDOW_DAYS - 1).toBeGreaterThanOrEqual(NEWEST)
  })

  it('shifts the window back when the clock reaches an older day', () => {
    render(<Ribbon />)
    const older = NEWEST_WINDOW_START - WINDOW_DAYS
    act(() => seekGalaxyTimeline(100, DAY_COUNT))
    expect(label()).toContain(formatDayISO(WINDOW_START, older))
    expect(label()).toContain(
      formatDayISO(WINDOW_START, NEWEST_WINDOW_START - 1)
    )
  })

  it('names the current day in the text alternative', () => {
    render(<Ribbon />)
    act(() => seekGalaxyTimeline(NEWEST - 3, DAY_COUNT))
    expect(label()).toContain(formatDayISO(WINDOW_START, NEWEST - 3))
  })
})

describe('the contribution grid as the seek surface', () => {
  it('seeks to the day under the pointer inside the visible window', () => {
    render(<Ribbon />)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...clientAt(0) })
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...clientAt(10) })
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START + 70)
  })

  it('walks a week per column of drag, past the window into older history', () => {
    render(<Ribbon />)
    const grabbed = clientAt(0)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...grabbed })
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX - 300,
      clientY: grabbed.clientY,
    })
    // 300 CSS px left is 150 backing px, 30 columns, 210 days.
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START - 210)
  })

  it('clamps a drag that runs off the oldest end of the history', () => {
    render(<Ribbon />)
    const grabbed = clientAt(0)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...grabbed })
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX - 10_000,
      clientY: grabbed.clientY,
    })
    expect(getGalaxyTimeline().step).toBe(0)
  })

  it('ignores a move that is not part of a drag', () => {
    render(<Ribbon />)
    fireEvent.pointerMove(ribbonCanvas(), { pointerId: 1, ...clientAt(0) })
    expect(getGalaxyTimeline().step).toBe(NEWEST)
  })

  it('captures the pointer so a drag off the strip keeps scrubbing', () => {
    render(<Ribbon />)
    const grabbed = clientAt(0)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 7, ...grabbed })
    // The strip is one pane row tall. Without capture the browser routes the
    // rest of the gesture to whatever the cursor is over, so a drag strands the
    // instant it wanders off the squares.
    expect(captured.has(7)).toBe(true)
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 7,
      buttons: 1,
      clientX: -200,
      clientY: grabbed.clientY,
    })
    // 200 CSS px left of the canvas is 100 backing px outside it; 119 backing
    // px from the grab is 24 columns, 168 days.
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START - 168)
    fireEvent.pointerUp(ribbonCanvas(), { pointerId: 7 })
    expect(captured.has(7)).toBe(false)
  })

  it('lets the pointer go when the gesture is cancelled', () => {
    render(<Ribbon />)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 3, ...clientAt(0) })
    fireEvent.pointerCancel(ribbonCanvas(), { pointerId: 3 })
    expect(captured.has(3)).toBe(false)
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 3,
      buttons: 1,
      ...clientAt(20),
    })
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START)
  })

  it('treats a press that never travels as a seek, not a scrub', () => {
    render(<Ribbon />)
    const pressed = clientAt(10)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...pressed })
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      ...pressed,
    })
    // The tremor a real click carries is well under half a cell, so it walks
    // nowhere and the click stays a single-day seek.
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: pressed.clientX + 1,
      clientY: pressed.clientY + 1,
    })
    fireEvent.pointerUp(ribbonCanvas(), { pointerId: 1 })
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START + 70)
  })

  it('claims the touch gesture so a finger scrubs instead of scrolling', () => {
    render(<Ribbon />)
    expect(ribbonCanvas().style.touchAction).toBe('none')
  })
})

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

/** Two full years plus change, so the pane's window is a strict subset. */
const DAY_COUNT = 800
/** A Monday, so day 0 sits in weekday row 1 of the very first column. */
const WINDOW_START = '2024-01-01'
const WINDOW_END = formatDayISO(WINDOW_START, DAY_COUNT - 1)
const NEWEST = DAY_COUNT - 1

/** jsdom runs no layout, so every canvas under test reports this CSS box. */
const CSS_W = 600
const CSS_H = 400
/**
 * The lattice a 600x400 pane measures out at dpr 1, derived by hand so the test
 * pins the arithmetic rather than restating it: an 11px label strip over 389px
 * of rows, a 2px gutter, 12px squares — 14 pixels a week column, and 43 of them
 * across 600, which is exactly 600 pixels of grid. See `ribbonLayout`.
 */
const COLUMNS = 43
const STEP_PX = 14
const ORIGIN_X_PX = 0
const ORIGIN_Y_PX = 157
/** 43 week columns of 7 weekday rows. */
const WINDOW_DAYS = COLUMNS * 7
/**
 * The newest window: day 799 is a Tuesday, so its column starts on day 797, and
 * 42 columns earlier is day 503, itself a Sunday.
 */
const NEWEST_WINDOW_START = 503

/** CSS-pixel client coordinates of the first row of a given lattice column. */
function clientAt(column: number): { clientX: number; clientY: number } {
  // The backing store is sized from the CSS box at dpr 1, so the two are the
  // same ruler here.
  return {
    clientX: ORIGIN_X_PX + column * STEP_PX + 1,
    clientY: ORIGIN_Y_PX + 1,
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
/** Live ResizeObserver callbacks, one per mounted strip. */
const observers = new Set<() => void>()

/**
 * jsdom implements no 2D context either, and without one the strip never
 * measures its pane. The paint itself is covered against a recording context in
 * ribbonWindow.test.ts; here it only has to exist and swallow the calls.
 */
const context2d = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  font: '',
  textAlign: 'left',
  textBaseline: 'alphabetic',
  clearRect: () => {},
  fillRect: () => {},
  strokeRect: () => {},
  fillText: () => {},
}

/** Reports a new pane size to every mounted strip, as a real resize would. */
function resizePane(width: number, height: number): void {
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    new DOMRect(0, 0, width, height)
  act(() => observers.forEach((notify) => notify()))
}

beforeAll(() => {
  // jsdom ships no pointer capture, no layout, no ResizeObserver and no canvas
  // context; all four are browser-side gaps, not component behavior, so they
  // are filled here rather than guarded for in production code.
  Element.prototype.setPointerCapture = (pointerId: number) => {
    captured.add(pointerId)
  }
  Element.prototype.releasePointerCapture = (pointerId: number) => {
    captured.delete(pointerId)
  }
  Element.prototype.hasPointerCapture = (pointerId: number) =>
    captured.has(pointerId)
  HTMLCanvasElement.prototype.getContext = ((id: string) =>
    id === '2d' ? context2d : null) as HTMLCanvasElement['getContext']
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: () => void) {
      observers.add(callback)
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      observers.delete(this.callback)
    }
  } as unknown as typeof ResizeObserver
  viz = createInstrumentViz(HEAD)
  runtime.current = { status: 'ready', viz }
})

afterAll(() => {
  viz.driver.destroy()
})

beforeEach(() => {
  captured.clear()
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    new DOMRect(0, 0, CSS_W, CSS_H)
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

describe('the pane-width contribution window', () => {
  it('names only the visible stretch, not the whole history', () => {
    render(<Ribbon />)
    // e2e/a11y.spec.ts resolves this canvas by name; keep the phrase it uses.
    expect(label()).toMatch(/contribution grid/i)
    expect(label()).toContain(formatDayISO(WINDOW_START, NEWEST_WINDOW_START))
    expect(label()).toContain(WINDOW_END)
    expect(label()).not.toContain(WINDOW_START)
  })

  it('puts more history on screen when the pane gets wider', () => {
    render(<Ribbon />)
    // 1600 pixels of pane is 114 columns of the same 14-pixel week, so the
    // window opens on day 6 instead of day 503 — the squares grew into the
    // width rather than leaving it empty.
    resizePane(1600, CSS_H)
    expect(label()).toContain(formatDayISO(WINDOW_START, 6))
    expect(label()).toContain(WINDOW_END)
    expect(label()).not.toContain(
      formatDayISO(WINDOW_START, NEWEST_WINDOW_START)
    )
  })

  it('holds fewer weeks on a phone-width pane', () => {
    render(<Ribbon />)
    // 320 pixels is 23 columns: 161 days, still ending on the newest day.
    resizePane(320, CSS_H)
    expect(label()).toContain(formatDayISO(WINDOW_START, 643))
    expect(label()).toContain(WINDOW_END)
  })

  it('keeps the day the galaxy is playing inside the window it names', () => {
    render(<Ribbon />)
    // The galaxy still rolls backward through [total - 365, total - 1], which
    // is more days than a 600-pixel pane holds. The two stay coherent because
    // the strip pages to wherever the shared clock is, not because the two
    // windows are the same length.
    const oldest = DAY_COUNT - PLAYBACK_WINDOW_STEPS
    act(() => seekGalaxyTimeline(oldest, DAY_COUNT))
    expect(label()).toContain(formatDayISO(WINDOW_START, 202))
    expect(label()).toContain(formatDayISO(WINDOW_START, 502))
    expect(label()).toContain(formatDayISO(WINDOW_START, oldest))
  })

  it('shifts the window back when the clock reaches an older day', () => {
    render(<Ribbon />)
    const older = NEWEST_WINDOW_START - WINDOW_DAYS
    act(() => seekGalaxyTimeline(400, DAY_COUNT))
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

  it('stops watching the pane once the strip is gone', () => {
    const view = render(<Ribbon />)
    expect(observers.size).toBe(1)
    view.unmount()
    expect(observers.size).toBe(0)
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

  it('pulls the strip with the pointer, a week per column of travel', () => {
    render(<Ribbon />)
    const grabbed = clientAt(0)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...grabbed })
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX + 300,
      clientY: grabbed.clientY,
    })
    // The squares follow the hand like a sheet of paper: dragging right slides
    // them right and uncovers what was off the left edge, so 300 px of travel
    // is 21 columns further back, 147 days.
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START - 147)
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX - 300,
      clientY: grabbed.clientY,
    })
    // Same travel the other way, same distance forward. Only the transport's
    // progress bar seeks with the pointer instead of against it.
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START + 147)
  })

  it('walks down a column the same way it walks across the strip', () => {
    render(<Ribbon />)
    const grabbed = clientAt(0)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...grabbed })
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX,
      clientY: grabbed.clientY + 3 * STEP_PX,
    })
    // Three weekday rows of downward pull is three days back, not forward: the
    // two axes have to agree, or a diagonal drag walks both ways at once.
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START - 3)
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX + 2 * STEP_PX,
      clientY: grabbed.clientY + 3 * STEP_PX,
    })
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START - 17)
  })

  it('clamps a drag that runs off the oldest end of the history', () => {
    render(<Ribbon />)
    const grabbed = clientAt(0)
    fireEvent.pointerDown(ribbonCanvas(), { pointerId: 1, ...grabbed })
    fireEvent.pointerMove(ribbonCanvas(), {
      pointerId: 1,
      buttons: 1,
      clientX: grabbed.clientX + 10_000,
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
    // 200 px left of the canvas is 201 px from the grab: 14 columns of pull,
    // 98 days forward.
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START + 98)
    fireEvent.pointerUp(ribbonCanvas(), { pointerId: 7 })
    expect(captured.has(7)).toBe(false)
  })

  it('still seeks when the browser refuses the pointer capture', () => {
    // A real browser throws NotFoundError from `setPointerCapture` when the id
    // names no active pointer. Capture is an enhancement for drags that leave
    // the strip; letting the refusal escape a React handler would take the
    // whole gesture — and the only seek surface — down with it.
    render(<Ribbon />)
    const target = ribbonCanvas()
    const refuse = vi.spyOn(target, 'setPointerCapture').mockImplementation(() => {
      throw new DOMException('No active pointer', 'NotFoundError')
    })
    expect(() =>
      fireEvent.pointerDown(target, { pointerId: 9, ...clientAt(0) })
    ).not.toThrow()
    expect(refuse).toHaveBeenCalled()
    expect(getGalaxyTimeline().step).toBe(NEWEST_WINDOW_START)
    refuse.mockRestore()
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

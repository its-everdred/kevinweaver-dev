import { act, render, screen } from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { BundleHead } from '@/lib/bundle/loader'
import type { BundleEvent, RepoRecord } from '@/lib/bundle/schema'
// Per module, not through the barrel: see the note in useGalaxyScene.ts.
import { privateRepo } from '@/packages/aiur-galaxy/src/privateRepo'
import {
  createInstrumentViz,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import {
  publishGalaxyTimeline,
  seekGalaxyTimeline,
  setGalaxyPlaying,
  type GalaxyDirection,
} from './galaxyTimeline'
import { EventsTail } from './EventsTail'

const runtime = vi.hoisted(() => ({
  current: { status: 'loading' } as InstrumentRuntimeState,
}))

vi.mock('./instrumentRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instrumentRuntime')>()
  return { ...actual, useInstrumentRuntime: () => runtime.current }
})

const WINDOW_START = '2026-02-01'
const DAY_COUNT = 5

// prettier-ignore
function repo(id: number, short: string, actor: 0 | 1): RepoRecord {
  return { id, ghId: (id + 1) * 100, name: `fixture/${short}`, short, actor, vol: 4, stars: 2, from: '2026-02-01', to: '2026-02-05', private: false, ext: ['ts'], status: 'ok' }
}

/**
 * Event day 0 is the newest day, so step `n` carries event day `4 - n`: step 4
 * is the forty-contribution day, step 3 is empty, and step 2 carries three.
 *
 * The calendar underneath disagrees with the file history on steps 0 and 1, the
 * way the real payload disagrees on 847 of its 1193 green days: both count
 * contributions the history cannot place. Step 3 is grey in both, so it is the
 * only day either surface may call empty.
 */
const BUSY: readonly BundleEvent[] = Array.from({ length: 40 }, (_, index) => ({
  day: 0,
  repo: index % 2,
  path: `src/b${String(index).padStart(2, '0')}.ts`,
  actor: (index % 2) as 0 | 1,
}))
const TRIO: readonly BundleEvent[] = [
  { day: 2, repo: 0, path: 'src/newest.ts', actor: 0 },
  { day: 2, repo: 1, path: 'docs/middle.md', actor: 1 },
  { day: 2, repo: 0, path: 'src/oldest.ts', actor: 0 },
]

// prettier-ignore
const HEAD: BundleHead = {
  manifest: { v: 1, generatedAt: '2026-02-05T12:00:00Z', commit: 'fixture-commit', days: ['2026-02-05', '2026-02-01'], refs: 'all', windowStart: WINDOW_START, windowEnd: '2026-02-05', dayCount: DAY_COUNT, repoCount: 2, repoCountDefinition: 'ownerPublicNonFork', actors: [{ id: 0, login: 'human-fixture', kind: 'human' }, { id: 1, login: 'agent-fixture', kind: 'agent' }], degraded: [], chunkSize: 50, chunks: 1, events: 43 },
  repos: [repo(0, 'alpha', 0), repo(1, 'beta', 1)],
  grid: { start: WINDOW_START, dayCount: DAY_COUNT, human: [1, 0, 2, 0, 1], agent: [0, 3, 0, 0, 0], privateMonthly: [], privateStart: '2026-02', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
  events: [...BUSY, ...TRIO],
}

/** A step the calendar counts and the file history cannot place. */
const UNPLACED_STEP = 0
/**
 * Rows that step owes the log, counted from the synthesis the galaxy draws from
 * rather than written down here, so a change to how those days are sized moves
 * the beams and this expectation together.
 */
const UNPLACED_ROWS =
  privateRepo({
    human: HEAD.grid.human,
    agent: HEAD.grid.agent,
    covered: new Set(HEAD.events.map((event) => DAY_COUNT - 1 - event.day)),
    stepCount: DAY_COUNT,
  })?.events.filter((event) => event.step === UNPLACED_STEP).length ?? 0

let viz: ReturnType<typeof createInstrumentViz>
let pending: FrameRequestCallback | null = null

beforeAll(() => {
  viz = createInstrumentViz(HEAD)
})

beforeEach(() => {
  runtime.current = { status: 'ready', viz }
  pending = null
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null
  })
  vi.spyOn(performance, 'now').mockReturnValue(0)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Parks the shared clock on a step, paused, so nothing reads as an advance. */
function park(step: number, direction: GalaxyDirection = 'backward'): void {
  act(() => {
    publishGalaxyTimeline({
      step,
      date: '',
      playing: false,
      total: DAY_COUNT,
      direction,
      windowStartISO: WINDOW_START,
    })
    seekGalaxyTimeline(step, DAY_COUNT)
  })
}

/** Advances the clock one step the way the render loop's own tick does. */
function advance(step: number): void {
  act(() => seekGalaxyTimeline(step, DAY_COUNT))
}

const play = (): void => act(() => setGalaxyPlaying(true))

/** Runs the reveal's next frame at `at` milliseconds into the step. */
function frame(at: number): void {
  const callback = pending
  if (!callback) throw new Error('no animation frame scheduled')
  pending = null
  act(() => callback(at))
}

const files = (): readonly string[] =>
  screen.getAllByRole('link').map((link) => link.textContent ?? '')

/**
 * What a screen reader is left with for one row: everything `aria-hidden`
 * dropped, and the remaining columns joined by the space a block boundary
 * inserts, because `.e` is a flex container and its children are blockified.
 * `textContent` alone runs the columns together and would prove nothing about
 * what is announced.
 */
function announced(row: Element): string {
  const clone = row.cloneNode(true) as Element
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]'))
    hidden.remove()
  return [...clone.children]
    .map((child) => (child.textContent ?? '').trim())
    .filter((text) => text.length > 0)
    .join(' ')
}

const rowsOf = (container: HTMLElement): readonly Element[] => [
  ...container.querySelectorAll('.kw-events .e'),
]

/**
 * Rows the pane holds while it reports no height. jsdom runs no layout, so the
 * capacity hook never measures and every case here sees the unmeasured default.
 */
const PANE_ROWS = 12

describe('EventsTail', () => {
  it('lists only the contributions of the day being played', () => {
    park(2)
    render(<EventsTail />)

    expect(files()).toEqual([
      'src/newest.ts',
      'docs/middle.md',
      'src/oldest.ts',
    ])
    expect(screen.queryByText('src/b00.ts')).toBeNull()
  })

  it('reveals the day most recent first, one line at a time', () => {
    park(3)
    play()
    render(<EventsTail />)
    advance(2)

    expect(files()).toEqual(['src/newest.ts'])
    frame(334)
    expect(files()).toEqual(['src/newest.ts', 'docs/middle.md'])
    frame(667)
    expect(files()).toEqual([
      'src/newest.ts',
      'docs/middle.md',
      'src/oldest.ts',
    ])
  })

  it('paces a forty-contribution day across the same one-second slot', () => {
    park(3, 'forward')
    play()
    render(<EventsTail />)
    advance(4)

    expect(files()).toHaveLength(1)
    frame(250)
    expect(files()).toHaveLength(11)
    // The slot ends on the day's oldest contribution: the reveal walked all
    // forty past the pane rather than stopping at the dozen that fit in it.
    frame(999)
    expect(files().at(-1)).toBe('src/b39.ts')
  })

  it('slides the window so the rows on screen change as the day plays', () => {
    park(3, 'forward')
    play()
    render(<EventsTail />)
    advance(4)

    frame(400)
    const early = files()
    frame(999)
    const late = files()

    expect(late[0]).not.toBe(early[0])
    expect(late).not.toContain(early[0])
    expect(early).toHaveLength(PANE_ROWS)
    expect(late).toHaveLength(PANE_ROWS)
  })

  it('mounts only the rows the pane can hold when the day is at rest', () => {
    park(4, 'forward')
    render(<EventsTail />)

    expect(files()).toHaveLength(PANE_ROWS)
    expect(files()[0]).toBe('src/b00.ts')
  })

  it('announces one summary per day and keeps the churn out of it', () => {
    park(3, 'forward')
    play()
    const { container } = render(<EventsTail />)
    advance(4)

    const live = container.querySelector('[aria-live="polite"]')
    expect(live).toHaveTextContent('2026-02-05: 40 contributions')
    expect(container.querySelector('.rows')).toHaveAttribute('aria-live', 'off')

    frame(400)
    expect(live).toHaveTextContent('2026-02-05: 40 contributions')
  })

  it('renders the empty state for a day with no contributions', () => {
    park(4)
    play()
    render(<EventsTail />)
    advance(3)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/no contributions this day/i)).toBeInTheDocument()
  })

  it('logs the day the galaxy draws when no file event places it', () => {
    expect(UNPLACED_ROWS).toBeGreaterThan(0)
    park(UNPLACED_STEP)
    const { container } = render(<EventsTail />)

    // The galaxy fires a beam per synthesized contribution on this day. A log
    // reading off `head.events` alone called the same day empty.
    expect(screen.queryByText(/no contributions this day/i)).toBeNull()
    expect(rowsOf(container)).toHaveLength(UNPLACED_ROWS)
    expect(screen.getAllByText('private')).toHaveLength(UNPLACED_ROWS)
  })

  it('reads as ordinary work behind a redaction rather than as an apology', () => {
    park(UNPLACED_STEP)
    const { container } = render(<EventsTail />)

    const redacted = [...container.querySelectorAll('.kw-events .e .redact')]
    expect(redacted).toHaveLength(UNPLACED_ROWS)
    for (const node of redacted)
      expect(node.textContent).toMatch(/^[a-z]+\/[a-z]+\/[a-z]+\.[a-z]+$/)

    // The class alone proves nothing: jsdom applies no styles, so dropping the
    // rule out of the concatenated sheet would leave these rows reading as
    // plain paths with every other assertion here still green. Every style in
    // the document, because `precedence` has React hoist the tag out of the
    // container and rename its key to `data-href`.
    const sheets = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('')
    expect(sheets).toContain('.kw-events .e .redact{filter:blur(')
  })

  it('names no file and links to none for a contribution it cannot place', () => {
    park(UNPLACED_STEP)
    const { container } = render(<EventsTail />)

    // The synthesized paths are pool slots, not filenames, and `private` is not
    // a GitHub account: neither may reach the page. The blur makes this matter
    // more, not less, because it is paint over text anyone can still read out
    // of the DOM, so the only safe thing to put there is something invented.
    expect(container.textContent).not.toContain('unplaced')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('tells a listener the row is private instead of reading it a fiction', () => {
    park(UNPLACED_STEP)
    const { container } = render(<EventsTail />)

    // The path on screen is fabricated. Announcing it as though it were work
    // would mislead precisely the viewer who cannot see that it is blurred, so
    // it is out of the accessibility tree and the truth is in its place.
    for (const row of rowsOf(container))
      expect(announced(row)).toBe('kw private contribution')
  })

  it('leaves a row it can place reading as the file it names', () => {
    park(2)
    const { container } = render(<EventsTail />)

    expect(rowsOf(container).map(announced)).toEqual([
      'kw alpha src/newest.ts',
      'ak beta docs/middle.md',
      'kw alpha src/oldest.ts',
    ])
  })

  it('announces an unplaced day as counted rather than as named files', () => {
    park(UNPLACED_STEP)
    const { container } = render(<EventsTail />)

    const live = container.querySelector('[aria-live="polite"]')
    expect(live).toHaveTextContent(
      `${WINDOW_START}: ${UNPLACED_ROWS} contributions, none placed to a file`
    )
  })

  it('renders the day complete under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    park(3)
    play()
    render(<EventsTail />)
    advance(2)

    expect(files()).toHaveLength(3)
    expect(pending).toBeNull()
  })

  it('renders the day complete after a scrub rather than animating', () => {
    park(4)
    play()
    render(<EventsTail />)
    advance(2)

    expect(files()).toHaveLength(3)
    expect(pending).toBeNull()
  })

  it('renders the day complete while the clock is paused', () => {
    park(3)
    render(<EventsTail />)
    advance(2)

    expect(files()).toHaveLength(3)
    expect(pending).toBeNull()
  })

  it('shows the same lines whether the step was sought or played into', () => {
    park(3)
    play()
    const played = render(<EventsTail />)
    advance(2)
    frame(999)
    const streamed = files()
    played.unmount()

    park(2)
    render(<EventsTail />)
    expect(files()).toEqual(streamed)
  })

  it('clears the previous day when the step advances', () => {
    park(3, 'forward')
    play()
    render(<EventsTail />)
    advance(4)
    frame(999)
    expect(files()).toHaveLength(PANE_ROWS)

    park(2)
    expect(files()).toEqual([
      'src/newest.ts',
      'docs/middle.md',
      'src/oldest.ts',
    ])
  })

  it('labels the day and releases its frame loop on unmount', () => {
    park(3)
    play()
    const view = render(<EventsTail />)
    advance(2)
    expect(screen.getByText('2026-02-03')).toBeInTheDocument()
    expect(pending).not.toBeNull()

    view.unmount()
    expect(pending).toBeNull()
  })
})

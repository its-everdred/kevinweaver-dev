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
  grid: { start: WINDOW_START, dayCount: DAY_COUNT, human: [1, 0, 2, 0, 1], agent: [0, 3, 0, 1, 0], privateMonthly: [], privateStart: '2026-02', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
  events: [...BUSY, ...TRIO],
}

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
    frame(999)
    expect(files()).toHaveLength(40)
  })

  it('renders the empty state for a day with no contributions', () => {
    park(4)
    play()
    render(<EventsTail />)
    advance(3)

    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText(/no contributions this day/i)).toBeInTheDocument()
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
    expect(files()).toHaveLength(40)

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

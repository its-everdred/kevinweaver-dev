import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
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
import { MAX_ORBIT_DISTANCE, MIN_ORBIT_DISTANCE } from '@/lib/viz/orbit'
import { PRIVATE_REPO_ID } from '@/packages/aiur-galaxy/src/privateRepo'
import {
  createInstrumentViz,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import {
  clearGalaxySelection,
  getGalaxySelection,
  publishGalaxySelection,
} from './galaxySelection'
import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
} from './galaxyTimeline'
import { buildGalaxyUniverse, GalaxyUniverse } from './GalaxyUniverse'
import { Ribbon } from './Ribbon'

const runtime = vi.hoisted(() => ({
  current: { status: 'loading' } as InstrumentRuntimeState,
}))

vi.mock('./instrumentRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instrumentRuntime')>()
  return { ...actual, useInstrumentRuntime: () => runtime.current }
})

// prettier-ignore
function repo(id: number, short: string, actor: 0 | 1, from: string): RepoRecord {
  return { id, ghId: (id + 1) * 100, name: `fixture/${short}`, short, actor, vol: 4, stars: 2, from, to: '2026-02-05', private: false, ext: ['ts'], status: 'ok' }
}

// prettier-ignore
const HEAD: BundleHead = {
  manifest: { v: 1, generatedAt: '2026-02-05T12:00:00Z', commit: 'fixture-commit', days: ['2026-02-05', '2026-02-01'], refs: 'all', windowStart: '2026-02-01', windowEnd: '2026-02-05', dayCount: 5, repoCount: 2, repoCountDefinition: 'ownerPublicNonFork', actors: [{ id: 0, login: 'human-fixture', kind: 'human' }, { id: 1, login: 'agent-fixture', kind: 'agent' }], degraded: [], chunkSize: 10, chunks: 1, events: 3 },
  repos: [repo(0, 'alpha', 0, '2026-02-01'), repo(1, 'beta', 1, '2026-02-02')],
  grid: { start: '2026-02-01', dayCount: 5, human: [1, 0, 2, 0, 1], agent: [0, 3, 0, 1, 0], privateMonthly: [], privateStart: '2026-02', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
  events: [{ day: 0, repo: 1, path: 'docs/latest.md', actor: 1 }, { day: 2, repo: 0, path: 'src/needle.ts', actor: 0 }, { day: 4, repo: 0, path: 'src/other.ts', actor: 0 }],
}

const TOTAL = HEAD.manifest.dayCount
const START_STEP = 2
/** WCAG 2.2 SC 2.5.8, the minimum axe `target-size` accepts. */
const MIN_TARGET_PX = 24
/** jsdom runs no layout, so every canvas under test reports this box. */
const CANVAS_W = 600
const CANVAS_H = 400

interface Orbit {
  readonly azimuth: number
  readonly polar: number
  readonly distance: number
}

function galaxyCanvas(): HTMLCanvasElement {
  const canvas = screen.getByRole('img', { name: /repository map/i })
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('not a canvas')
  return canvas
}

/** Reads the camera the canvas surfaces, the way `data-beam-overflow` is read. */
function orbitOf(canvas: HTMLCanvasElement): Orbit {
  const raw = canvas.dataset.orbit
  if (!raw) throw new Error('the galaxy canvas surfaces no camera state')
  const [azimuth, polar, distance] = raw.split(' ').map(Number)
  if (azimuth === undefined || polar === undefined || distance === undefined)
    throw new Error(`unreadable camera state: ${raw}`)
  return { azimuth, polar, distance }
}

function zoomIn(): HTMLElement {
  return screen.getByRole('button', { name: /zoom in/i })
}

function zoomOut(): HTMLElement {
  return screen.getByRole('button', { name: /zoom out/i })
}

function drag(
  canvas: HTMLCanvasElement,
  from: readonly [number, number],
  to: readonly [number, number]
): void {
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    clientX: from[0],
    clientY: from[1],
    buttons: 1,
  })
  fireEvent.pointerMove(canvas, {
    pointerId: 1,
    clientX: to[0],
    clientY: to[1],
    buttons: 1,
  })
}

let viz: ReturnType<typeof createInstrumentViz>

beforeAll(() => {
  // jsdom ships no pointer capture, no layout, and no matchMedia; all three are
  // browser-side gaps, not component behavior, so they are filled here rather
  // than guarded for in production code.
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.hasPointerCapture = () => false
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    new DOMRect(0, 0, CANVAS_W, CANVAS_H)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  viz = createInstrumentViz(HEAD)
  runtime.current = { status: 'ready', viz }
})

afterAll(() => {
  viz.driver.destroy()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  publishGalaxyTimeline({
    step: START_STEP,
    date: '2026-02-03',
    playing: false,
    total: TOTAL,
    direction: 'forward',
    windowStartISO: HEAD.manifest.windowStart,
  })
  seekGalaxyTimeline(START_STEP, TOTAL)
  clearGalaxySelection()
})

describe('the galaxy canvas text alternative', () => {
  it('keeps its accessible name, chunk marker, and fallback copy', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    expect(canvas.dataset.chunk).toBe('kw-galaxy-universe')
    expect(canvas.getAttribute('aria-label')).toMatch(/repository map/i)
    expect(canvas.textContent).toMatch(/most recently active repos/i)
    expect(canvas.tabIndex).toBe(0)
  })

  it('claims the touch gesture so pinch and drag reach the camera', () => {
    render(<GalaxyUniverse />)
    expect(galaxyCanvas().style.touchAction).toBe('none')
  })
})

describe('rotate and zoom controls', () => {
  it('rotates the camera on a pointer drag', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    const before = orbitOf(canvas)
    drag(canvas, [100, 100], [180, 140])
    const after = orbitOf(canvas)
    expect(after.azimuth).not.toBe(before.azimuth)
    expect(after.polar).not.toBe(before.polar)
    expect(after.distance).toBe(before.distance)
  })

  it('dollies on a two-pointer pinch without rotating', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    const before = orbitOf(canvas)
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 140, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 220, clientY: 100 })
    const after = orbitOf(canvas)
    expect(after.distance).toBeLessThan(before.distance)
    expect(after.azimuth).toBe(before.azimuth)
    expect(after.polar).toBe(before.polar)
  })

  it('does not strand the camera when a pointer leaves mid-drag', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    drag(canvas, [100, 100], [140, 100])
    const stopped = orbitOf(canvas)
    fireEvent.pointerLeave(canvas, { pointerId: 1, clientX: 140, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 900, clientY: 700 })
    expect(orbitOf(canvas)).toEqual(stopped)
  })

  it('zooms from the on-screen buttons', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    const before = orbitOf(canvas)
    fireEvent.click(zoomIn())
    expect(orbitOf(canvas).distance).toBeLessThan(before.distance)
    fireEvent.click(zoomOut())
    fireEvent.click(zoomOut())
    expect(orbitOf(canvas).distance).toBeGreaterThan(before.distance)
  })

  it('clamps the zoom buttons to the dolly limits', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    for (let press = 0; press < 40; press++) fireEvent.click(zoomIn())
    expect(orbitOf(canvas).distance).toBeCloseTo(MIN_ORBIT_DISTANCE, 6)
    for (let press = 0; press < 60; press++) fireEvent.click(zoomOut())
    expect(orbitOf(canvas).distance).toBeCloseTo(MAX_ORBIT_DISTANCE, 6)
  })

  it('rotates and zooms from the keyboard on the focused canvas', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    const start = orbitOf(canvas)
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' })
    expect(orbitOf(canvas).azimuth).not.toBe(start.azimuth)
    fireEvent.keyDown(canvas, { key: 'ArrowUp' })
    expect(orbitOf(canvas).polar).not.toBe(start.polar)
    const turned = orbitOf(canvas)
    fireEvent.keyDown(canvas, { key: '+' })
    expect(orbitOf(canvas).distance).toBeLessThan(turned.distance)
    fireEvent.keyDown(canvas, { key: '-' })
    expect(orbitOf(canvas).distance).toBeCloseTo(turned.distance, 6)
  })
})

describe('zoom control accessibility', () => {
  it('exposes real, named, tabbable buttons', () => {
    render(<GalaxyUniverse />)
    for (const button of [zoomIn(), zoomOut()]) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button).not.toBeDisabled()
      expect(button.tabIndex).toBe(0)
      button.focus()
      expect(button).toHaveFocus()
    }
  })

  it('hides the glyph so the accessible name is the whole visible label', () => {
    render(<GalaxyUniverse />)
    for (const button of [zoomIn(), zoomOut()]) {
      const glyph = button.firstElementChild
      expect(glyph?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('sizes each zoom target at or above the 24x24 axe minimum', () => {
    const css = readFileSync(
      join(process.cwd(), 'components/viz/GalaxyUniverse.module.css'),
      'utf8'
    )
    const block = /\.zoom\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(block, 'no .zoom rule in the galaxy control stylesheet').toBeTruthy()
    const sizeOf = (property: string): number =>
      Number(new RegExp(`${property}:\\s*(\\d+)px`).exec(block ?? '')?.[1] ?? 0)
    expect(sizeOf('min-width')).toBeGreaterThanOrEqual(MIN_TARGET_PX)
    expect(sizeOf('min-height')).toBeGreaterThanOrEqual(MIN_TARGET_PX)
    expect(sizeOf('width')).toBeGreaterThanOrEqual(MIN_TARGET_PX)
    expect(sizeOf('height')).toBeGreaterThanOrEqual(MIN_TARGET_PX)
  })
})

describe('reduced motion', () => {
  it('never moves the camera on its own, and still answers the controls', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    const at_rest = orbitOf(canvas)
    for (let frame = 0; frame < 10; frame++) fireEvent.pointerMove(canvas, {})
    expect(orbitOf(canvas)).toEqual(at_rest)
    fireEvent.click(zoomIn())
    expect(orbitOf(canvas).distance).toBeLessThan(at_rest.distance)
    drag(canvas, [10, 10], [80, 60])
    expect(orbitOf(canvas).azimuth).not.toBe(at_rest.azimuth)
  })
})

describe('clicking the galaxy selects a repo', () => {
  /** A repo the pane is already showing, so a clear is observable. */
  function preselect(): void {
    publishGalaxySelection({
      repoId: 1,
      name: 'fixture/beta',
      fileCount: 4,
      lastStep: 3,
    })
  }

  function press(canvas: HTMLCanvasElement, at: readonly [number, number]): void {
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: at[0],
      clientY: at[1],
      buttons: 1,
    })
  }

  function lift(canvas: HTMLCanvasElement, at: readonly [number, number]): void {
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: at[0], clientY: at[1] })
  }

  it('clears the selection when the click finds no repo', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    preselect()
    press(canvas, [300, 200])
    lift(canvas, [300, 200])
    expect(getGalaxySelection().repoId).toBeNull()
    expect(getGalaxySelection().name).toBeNull()
  })

  it('leaves the selection alone when the pointer was dragged', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    preselect()
    // The same gesture that rotates the camera must not also pick a repo, or
    // every orbit would reselect whatever the pointer happened to land on.
    drag(canvas, [100, 100], [260, 180])
    lift(canvas, [260, 180])
    expect(getGalaxySelection().repoId).toBe(1)
  })

  it('forgives the hand shake a real click has in it', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    preselect()
    drag(canvas, [100, 100], [102, 101])
    lift(canvas, [102, 101])
    expect(getGalaxySelection().repoId).toBeNull()
  })

  it('keeps the camera answering the same gesture', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    const before = orbitOf(canvas)
    drag(canvas, [100, 100], [260, 180])
    lift(canvas, [260, 180])
    expect(orbitOf(canvas).azimuth).not.toBe(before.azimuth)
  })
})

describe('the universe the galaxy renders', () => {
  /**
   * Six days, oldest first. The calendar is green on steps 3 and 4; the one
   * real file event names day 1, which is step 4 (`dayCount - 1 - day`). So
   * step 3 is the only green the file history cannot place, and the only step
   * that may carry a synthesized beam.
   *
   * The two index conventions run in opposite directions, and this window is
   * built so that mirroring either one is visible: reading the calendar from
   * the newest day would synthesize step 1 or 2, and reading an event's day as
   * a step would leave step 4 uncovered and synthesize that as well.
   */
  // prettier-ignore
  const GAP_HEAD: BundleHead = {
    manifest: { ...HEAD.manifest, days: ['2026-02-06', '2026-02-01'], windowEnd: '2026-02-06', dayCount: 6, repoCount: 1, events: 1 },
    repos: [repo(0, 'alpha', 0, '2026-02-01')],
    grid: { start: '2026-02-01', dayCount: 6, human: [0, 0, 0, 7, 9, 0], agent: [0, 0, 0, 0, 0, 0], privateMonthly: [], privateStart: '2026-02', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
    events: [{ day: 1, repo: 0, path: 'src/a.ts', actor: 0 }],
  }

  function stepsFor(repoId: number): number[] {
    return [
      ...new Set(
        buildGalaxyUniverse(GAP_HEAD)
          .contributions.filter((entry) => entry.repo === repoId)
          .map((entry) => entry.step)
      ),
    ].sort((left, right) => left - right)
  }

  it('places a real file event on the step its day counts back to', () => {
    expect(stepsFor(0)).toEqual([4])
  })

  it('synthesizes the green day the file history cannot place, on that day', () => {
    // Without this the contribution graph shows green while the galaxy draws
    // nothing, and `resolveContributors` returns no node to hang beams on.
    expect(stepsFor(PRIVATE_REPO_ID)).toEqual([3])
  })
})

describe('the timeline is seeked elsewhere', () => {
  it('does not scrub the shared clock when the galaxy canvas is dragged', () => {
    render(<GalaxyUniverse />)
    const canvas = galaxyCanvas()
    drag(canvas, [10, 10], [300, 10])
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 10 })
    expect(getGalaxyTimeline().step).toBe(START_STEP)
  })

  it('still follows the shared clock once the canvas stops writing to it', () => {
    render(<GalaxyUniverse />)
    drag(galaxyCanvas(), [10, 10], [300, 10])
    seekGalaxyTimeline(TOTAL - 1, TOTAL)
    expect(getGalaxyTimeline().step).toBe(TOTAL - 1)
  })

  it('keeps the contribution graph as a working seek surface', () => {
    render(<Ribbon />)
    const ribbon = screen.getByRole('img', { name: /contribution/i })
    fireEvent.pointerDown(ribbon, { clientX: CANVAS_W, clientY: 1 })
    expect(getGalaxyTimeline().step).toBe(TOTAL - 1)
    fireEvent.pointerMove(ribbon, { clientX: 0, clientY: 1, buttons: 1 })
    expect(getGalaxyTimeline().step).toBe(0)
  })
})

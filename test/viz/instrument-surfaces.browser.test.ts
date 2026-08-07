import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import Gource, { GOURCE_CHUNK_MARKER } from '@/components/viz/Gource'
import { ContributionTable } from '@/components/viz/ContributionTable'
import { Overview } from '@/components/viz/Overview'
import { Ribbon } from '@/components/viz/Ribbon'
// prettier-ignore
import { BOOT_PROBE_FILES, createInstrumentViz, useInstrumentRuntime, type InstrumentRuntimeState } from '@/components/viz/instrumentRuntime'
import { useCanvasSurface as useSurface } from '@/components/viz/useCanvasSurface'
import { encodeBundle } from '@/lib/bundle/codec'
import type { BundleHead } from '@/lib/bundle/loader'
import type { RepoRecord, SortableEvent } from '@/lib/bundle/schema'
import { getVizTransport, type VizSurfaceGeometry } from '@/lib/viz/driver'
import { getGalaxyTimeline, seekGalaxyTimeline } from '@/components/viz/galaxyTimeline'
import { AG, LV } from '@/lib/viz/tokens/ramp'
import { make2d } from '@/test/canvas-fixture'
import { recordContext } from '@/test/canvas-recorder'
// prettier-ignore
const HEAD: BundleHead = {
  manifest: { v: 1, generatedAt: '2026-02-03T12:00:00Z', commit: 'fixture-commit', days: ['2026-02-03', '2026-02-01'], refs: 'all', windowStart: '2026-02-01', windowEnd: '2026-02-03', dayCount: 3, repoCount: 2, repoCountDefinition: 'ownerPublicNonFork', actors: [{ id: 0, login: 'human-fixture', kind: 'human' }, { id: 1, login: 'agent-fixture', kind: 'agent' }], degraded: [], chunkSize: 10, chunks: 1, events: 2 },
  repos: [repo(0, 'alpha', 0, '2026-02-01'), repo(1, 'beta', 1, '2026-02-02')],
  grid: { start: '2026-02-01', dayCount: 3, human: [1, 0, 2], agent: [0, 37, 0], privateMonthly: [], privateStart: '2026-02', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
  events: [{ day: 0, repo: 1, path: 'docs/latest.md', actor: 1 }, { day: 2, repo: 0, path: 'src/needle.ts', actor: 0 }],
}
// prettier-ignore
function repo(id: number, short: string, actor: 0 | 1, from: string): RepoRecord {
  return { id, ghId: (id + 1) * 100, name: `fixture/${short}`, short, actor, vol: 4, stars: 2, from, to: '2026-02-03', private: false, ext: ['ts'], status: 'ok' }
}
// prettier-ignore
const GEOMETRY: VizSurfaceGeometry = { cssWidth: 530, cssHeight: 180, deviceWidth: 530, deviceHeight: 180, dpr: 1, font: { micro: 10, small: 11, mono: 12 } }
const BASE_DPR = window.devicePixelRatio
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setDpr(BASE_DPR)
})
test('maps and renders one exact BundleHead index space', async () => {
  vi.stubGlobal('OffscreenCanvas', undefined)
  const viz = createInstrumentViz(HEAD)
  expectMapping(viz)
  await expectRecordedPayload(viz)
  viz.driver.destroy()
})
function expectMapping(viz: ReturnType<typeof createInstrumentViz>): void {
  // prettier-ignore
  expect(viz.render.meta.repos.map((repo) => repo.short)).toEqual(['alpha', 'beta'])
  expect([...viz.render.grid.total]).toEqual([1, 37, 2])
  expect([...viz.render.grid.agent]).toEqual([0, 37, 0])
  // prettier-ignore
  expect([viz.render.grid.agentBirthDay, ...viz.input.repoOf]).toEqual([1, -1, -1, 0, 1])
  expect([...viz.input.birthDay]).toEqual([0, 1, 0, 2])
  expect(viz.render.meta.agentBirthLabel).toBe('agent-fixture initialized')
}
async function expectRecordedPayload(
  viz: ReturnType<typeof createInstrumentViz>
): Promise<void> {
  const ribbon = recording(530, 180)
  const graph = recording(530, 300)
  viz.driver.attach({ id: 'ribbon', ctx: ribbon.ctx, geometry: GEOMETRY })
  // prettier-ignore
  viz.driver.attach({ id: 'gource', ctx: graph.ctx, geometry: { ...GEOMETRY, cssHeight: 300, deviceHeight: 300 } })
  await viz.driver.seekDay(2)
  viz.driver.state.heat[2] = 1
  await viz.driver.renderFrame(0)
  expect(ribbon.calls).toContainEqual(['set:fillStyle', LV[6]])
  expect(ribbon.calls).toContainEqual(['set:fillStyle', AG[6]])
  // prettier-ignore
  expect(graph.calls).toContainEqual(expect.arrayContaining(['fillText', 'src/needle.ts']))
}
test('mounts DPR-correct, accessible, isolated interactive surfaces', async () => {
  const release = stubPayload()
  const failed = render(createElement(Overview))
  // prettier-ignore
  await waitFor(() => expect(failed.getByRole('img')).toHaveAccessibleName(/unavailable/))
  failed.unmount()
  await expectGeometryFirstJoin(release)
  await expectDprResize()
  await expectRuntimeFirstPointerInput()
  await expectRibbonAlternativeAndIsolation()
  await expectIdleGourceAttachment()
})
// prettier-ignore
const FILES = encodeBundle({ meta: HEAD.manifest, repos: HEAD.repos, grid: HEAD.grid, events: HEAD.events.map((event, index) => ({ ...event, repoName: HEAD.repos[event.repo]?.name ?? '', sha: `f-${index}` })) }).files
function stubPayload(): () => void {
  let release = (): void => undefined
  let attempts = 0
  const gate = new Promise<void>((resolve) => (release = resolve))
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    // Fail the first probe round so the runtime's retry is exercised; the
    // instrument boot probes BOOT_PROBE_FILES with one fetch each before the
    // loader's full five-file boot, so one round is exactly that many fetches.
    if (attempts++ < BOOT_PROBE_FILES.length)
      throw new TypeError('transient fixture failure')
    await gate
    const name = input.toString().split('/data/v1/')[1] ?? ''
    const body = FILES.get(name)
    return new Response(body ?? 'missing', { status: body ? 200 : 404 })
  })
  return release
}
async function expectGeometryFirstJoin(release: () => void): Promise<void> {
  setDpr(3)
  const orphan = render(createElement(Surface, { width: 1194, height: 602 }))
  const abandoned = getCanvas(orphan.getByRole('img'))
  await waitFor(() => expect(abandoned).toHaveProperty('width', 2388))
  orphan.unmount()
  const waiting = render(createElement(Surface))
  const canvas = getCanvas(waiting.getByRole('img'))
  await waitFor(() => expect(canvas).toHaveProperty('width', 640))
  expect(painted(canvas)).toBe(false)
  release()
  await waitFor(() => expect(painted(canvas)).toBe(true))
  expect(painted(abandoned)).toBe(false)
  waiting.unmount()
}
async function expectDprResize(): Promise<void> {
  // prettier-ignore
  const view = render(createElement(Surface, { enabled: false, width: 1194, height: 602 }))
  const canvas = getCanvas(view.getByRole('img'))
  await waitFor(() => expect(canvas).toHaveProperty('height', 1204))
  expect(canvas.getContext('2d')?.getTransform().a).toBe(2)
  // prettier-ignore
  view.rerender(createElement(Surface, { enabled: false, width: 600, height: 300 }))
  await waitFor(() => expect(canvas).toHaveProperty('width', 1200))
  expect(canvas.getContext('2d')?.getTransform().a).toBe(2)
  view.unmount()
}
async function expectRuntimeFirstPointerInput(): Promise<void> {
  const view = render(createElement(Overview))
  const canvas = getCanvas(view.getByRole('img'))
  await waitFor(() => expect(painted(canvas)).toBe(true))
  let captured = false
  canvas.setPointerCapture = () => (captured = true)
  canvas.hasPointerCapture = () => captured
  canvas.releasePointerCapture = () => (captured = false)
  fireEvent(canvas, pointer('pointerdown', 1))
  const firstDay = getVizTransport().getSnapshot().dayIndex
  fireEvent(canvas, pointer('pointermove', 319))
  expect(getVizTransport().getSnapshot().dayIndex).toBeGreaterThan(firstDay)
  fireEvent(canvas, pointer('pointercancel', 319))
  expect(captured).toBe(false)
  expect(canvas).toHaveAccessibleName(/2026-02-01.*2026-02-03/)
  view.unmount()
}
async function expectRibbonAlternativeAndIsolation(): Promise<void> {
  const view = render(createElement(Ribbon))
  const canvas = getCanvas(view.getByRole('img'))
  await waitFor(() => expect(painted(canvas)).toBe(true))
  // The ribbon scrubs the shared galaxy timeline on pointer down: a click at a
  // fraction of the width seeks the store to that day.
  seekGalaxyTimeline(0, 100)
  fireEvent(canvas, pointer('pointerdown', 1))
  expect(getGalaxyTimeline().step).toBeGreaterThanOrEqual(0)
  // KW-025 note 4: the canvas is NOT wired to the table via aria-describedby —
  // the accessible-description algorithm would flatten all dayCount rows into
  // one enormous string. The hidden table is a sibling in the accessibility tree.
  expect(canvas).not.toHaveAttribute('aria-describedby')
  // KW-029: the DEC-011 contribution table moved out of the ribbon into the
  // extracted ContributionTable; the ribbon itself must not inline it.
  expect(view.container.querySelectorAll('tbody tr')).toHaveLength(0)
  const tableView = render(
    createElement(ContributionTable, {
      id: 'kw-contribution-table',
      grid: {
        start: '2026-02-01',
        dayCount: 21,
        human: Array(21).fill(0),
        agent: Array(21).fill(0),
        privateMonthly: [],
        privateStart: '2026-02',
        bands: [],
      },
      meta: {
        windowStart: '2026-02-01',
        windowEnd: '2026-02-21',
        dayCount: 21,
        generatedAt: '2026-02-21T12:00:00Z',
      },
    })
  )
  expect(tableView.container.querySelectorAll('tbody tr')).toHaveLength(3)
  tableView.unmount()
  const transport = getVizTransport()
  if (transport.getSnapshot().playing) transport.toggle()
  const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect')
  const draws = clear.mock.calls.length
  view.rerender(createElement(Ribbon))
  expect(clear).toHaveBeenCalledTimes(draws)
  view.unmount()
}
async function expectIdleGourceAttachment(): Promise<void> {
  let idle: IdleRequestCallback | undefined
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    idle = callback
    return 1
  })
  vi.stubGlobal('cancelIdleCallback', () => undefined)
  const clear = vi.spyOn(CanvasRenderingContext2D.prototype, 'clearRect')
  const view = render(createElement(Gource))
  const canvas = getCanvas(view.getByRole('img'))
  expect(canvas).toHaveAttribute('data-chunk', GOURCE_CHUNK_MARKER)
  expect(clear).not.toHaveBeenCalled()
  idle?.({ didTimeout: false, timeRemaining: () => 10 })
  await waitFor(() => expect(clear).toHaveBeenCalled())
  view.unmount()
}
function Surface({ enabled = true, width = 320, height = 120 }): ReactNode {
  const runtime = useInstrumentRuntime()
  const driver = runtime.status === 'ready' ? runtime.viz.driver : null
  // prettier-ignore
  const handle = useSurface({ id: 'overview', driver, label: 'fixture', enabled })
  // prettier-ignore
  return createElement('canvas', { ...handle.canvasProps, ref: handle.ref, style: { ...handle.canvasProps.style, width, height } })
}
// prettier-ignore
function recording(width: number, height: number) { return recordContext(make2d(width, height)) }
// prettier-ignore
function getCanvas(element: HTMLElement): HTMLCanvasElement { if (!(element instanceof HTMLCanvasElement)) throw new Error('canvas missing'); return element }
// prettier-ignore
function painted(canvas: HTMLCanvasElement): boolean { const width = Math.min(canvas.width, 640); const height = Math.min(canvas.height, 240); const pixels = canvas.getContext('2d')?.getImageData(0, 0, width, height).data; return pixels?.some((value, index) => index % 4 === 3 && value > 0) ?? false }
// prettier-ignore
function pointer(type: string, x: number): PointerEvent { const event = new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch' }); Object.defineProperty(event, 'offsetX', { value: x }); return event }
function setDpr(value: number): void {
  // prettier-ignore
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value })
}
/**
 * KW-U1 chunk pump. The runtime is a module-level singleton, so each scenario
 * imports its own instance through a cache-busting query rather than sharing
 * the boot the surface specs above already consumed.
 */
type RuntimeModule = typeof import('@/components/viz/instrumentRuntime')
const PUMP_REPOS = 6
const PUMP_FILES = 12
let instances = 0
async function freshRuntime(): Promise<RuntimeModule> {
  instances += 1
  const url = `/components/viz/instrumentRuntime.ts?instance=${instances}`
  return (await import(/* @vite-ignore */ url)) as RuntimeModule
}
test('pumps every event chunk into one enriched ready state', async () => {
  const held = gate()
  servePump(pumpBundle(), { name: 'events/ee-01.json', open: held.open })
  const probe = mountProbe(await freshRuntime())
  await waitFor(() => expect(probe.state().status).toBe('ready'))
  // First paint is the boot chunk alone: chunk 0 holds only repo r0's two files
  // even though repos.json already declares all six repositories.
  expect(reposWithFiles(probe.state())).toEqual([1, PUMP_REPOS])
  expect(fileCount(probe.state())).toBe(2)
  const firstPaint = probe.renders()
  held.release()
  // prettier-ignore
  await waitFor(() => expect(reposWithFiles(probe.state())).toEqual([PUMP_REPOS, PUMP_REPOS]))
  expect(fileCount(probe.state())).toBe(PUMP_FILES)
  // One rebuild, not one per chunk: five chunks arrive, one state is published.
  expect(probe.renders()).toBe(firstPaint + 1)
  expect(probe.statuses()).toEqual(['loading', 'ready'])
  probe.view.unmount()
})
test('keeps the chunks that loaded when a later chunk fails', async () => {
  await expectDegradedPump((files) => files.delete('events/ee-02.json'))
  await expectDegradedPump((files) => files.set('events/ee-02.json', '{"b":'))
})
/** AE5: a missing or malformed chunk must never withdraw the ready state. */
async function expectDegradedPump(
  damage: (files: Map<string, string>) => void
): Promise<void> {
  const files = pumpBundle()
  damage(files)
  servePump(files)
  const errors = vi.spyOn(console, 'error')
  const probe = mountProbe(await freshRuntime())
  // Chunks 0 and 1 carry r0, r1, and r2; chunk 2 onwards never arrives.
  await waitFor(() => expect(reposWithFiles(probe.state())).toEqual([3, 6]))
  expect(fileCount(probe.state())).toBe(4)
  expect(probe.statuses()).toEqual(['loading', 'ready'])
  expect(errors).not.toHaveBeenCalled()
  probe.view.unmount()
  errors.mockRestore()
}
test('disposes the loader when the last instrument unmounts mid-pump', async () => {
  const held = gate()
  // prettier-ignore
  const signals = servePump(pumpBundle(), { name: 'events/ee-01.json', open: held.open })
  const probe = mountProbe(await freshRuntime())
  await waitFor(() => expect(probe.state().status).toBe('ready'))
  const errors = vi.spyOn(console, 'error')
  const painted = probe.renders()
  probe.view.unmount()
  // prettier-ignore
  await waitFor(() => expect(signals.some((signal) => signal.aborted)).toBe(true))
  held.release()
  await settle()
  expect(probe.renders()).toBe(painted)
  expect(errors).not.toHaveBeenCalled()
  errors.mockRestore()
})
test('does not double-count events across concurrent or repeated mounts', async () => {
  servePump(pumpBundle())
  const runtime = await freshRuntime()
  const first = mountProbe(runtime)
  const second = mountProbe(runtime)
  // prettier-ignore
  await waitFor(() => expect(reposWithFiles(first.state())).toEqual([PUMP_REPOS, PUMP_REPOS]))
  expect(fileCount(second.state())).toBe(PUMP_FILES)
  first.view.unmount()
  second.view.unmount()
  await settle()
  const third = mountProbe(runtime)
  await waitFor(() => expect(third.state().status).toBe('ready'))
  expect(reposWithFiles(third.state())).toEqual([PUMP_REPOS, PUMP_REPOS])
  expect(fileCount(third.state())).toBe(PUMP_FILES)
  third.view.unmount()
})
interface Probe {
  readonly view: ReturnType<typeof render>
  readonly state: () => InstrumentRuntimeState
  readonly statuses: () => readonly string[]
  readonly renders: () => number
}
function mountProbe(runtime: RuntimeModule): Probe {
  const seen: string[] = []
  let latest: InstrumentRuntimeState = { status: 'loading' }
  let renders = 0
  function Leaf(): ReactNode {
    latest = runtime.useInstrumentRuntime()
    renders += 1
    if (seen.at(-1) !== latest.status) seen.push(latest.status)
    return null
  }
  const view = render(createElement(Leaf))
  // prettier-ignore
  return { view, state: () => latest, statuses: () => seen, renders: () => renders }
}
/** Repositories that own at least one file-star, paired with the declared total. */
function reposWithFiles(state: InstrumentRuntimeState): readonly number[] {
  if (state.status !== 'ready') return [-1, -1]
  const { repoCount, repoOf } = state.viz.input
  return [new Set([...repoOf].filter((id) => id >= 0)).size, repoCount]
}
// prettier-ignore
function fileCount(state: InstrumentRuntimeState): number { return state.status === 'ready' ? state.viz.input.entityCount - state.viz.input.repoCount : -1 }
/**
 * Six repositories over six two-event chunks. Chunk 0 holds only `r0`, so the
 * pump's contribution is exactly the difference between one repo and six.
 */
function pumpBundle(): Map<string, string> {
  // prettier-ignore
  const repos = Array.from({ length: PUMP_REPOS }, (_, id) => repo(id, `r${id}`, 0, '2026-02-01'))
  const events: SortableEvent[] = [
    pumpEvent(repos, 0, 0, 'a.ts', 'a'),
    pumpEvent(repos, 0, 0, 'b.ts', 'b'),
    ...repos.slice(1).flatMap((_, index) => [
      pumpEvent(repos, index + 1, 1, 'mid.ts', 'm'),
      pumpEvent(repos, index + 1, 2, 'old.ts', 'o'),
    ]),
  ]
  // prettier-ignore
  const input = { meta: { ...HEAD.manifest, repoCount: PUMP_REPOS }, repos, grid: HEAD.grid, events }
  return new Map(encodeBundle(input, { chunkSize: 2 }).files)
}
// prettier-ignore
function pumpEvent(repos: readonly RepoRecord[], id: number, day: number, file: string, sha: string): SortableEvent {
  return { day, repo: id, path: `r${id}/${file}`, actor: 0, repoName: repos[id]!.name, sha }
}
/** Serves one encoded bundle, optionally holding a chunk open, and records every loader signal. */
function servePump(
  files: ReadonlyMap<string, string>,
  hold?: { name: string; open: Promise<void> }
): readonly AbortSignal[] {
  const signals: AbortSignal[] = []
  // prettier-ignore
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = input.toString().split('/data/v1/')[1] ?? ''
    if (init?.signal) signals.push(init.signal)
    if (hold && name === hold.name) await hold.open
    const body = files.get(name)
    return new Response(body ?? 'missing', { status: body === undefined ? 404 : 200 })
  })
  return signals
}
// prettier-ignore
function gate(): { open: Promise<void>; release: () => void } { let release = (): void => undefined; const open = new Promise<void>((resolve) => (release = () => resolve())); return { open, release } }
// prettier-ignore
const settle = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 16))

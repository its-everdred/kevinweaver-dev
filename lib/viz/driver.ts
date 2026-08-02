import {
  liveIdsAscending,
  advanceCursor,
  isLive,
  repoPhase,
  seekCursor,
} from './sim/cursor'
import { packOnce } from './sim/layout'
import { seedRng } from './sim/rng'
import { createSimState, digestSimState, resetSimState } from './sim/state'
import { step } from './sim/step'
import {
  ENTITY_REPO,
  FIXED_DT,
  MAX_STEPS,
  PHASE_ABSENT,
  PHASE_LIVE,
  SPEEDS,
  type SimInput,
  type SimState,
} from './sim/types'
import type { RenderView } from './render/budget'
import { syncVizRibbonWindow } from './surface-pointer'
import { createVizSurfaceController } from './surface-controller'
import { paintVizSurfaces } from './surface-painter'
import { createVizDriverSurfaceApi } from './driver-surface-api'
import { createVizDriverLifecycle } from './driver-lifecycle'
import { createVizDriverRibbon } from './driver-ribbon'
import {
  createVizDriverRenderLayers,
  createVizRenderMeta,
  renderVizQuality,
} from './driver-render'
import type {
  VizPointer,
  VizSurfaceAttachment,
  VizSurfaceGeometry,
  VizSurfaceId,
} from './surfaces'

export { bindVizTransport, getVizTransport } from './transport'
export type {
  VizTransport,
  VizTransportMetadata,
  VizTransportSnapshot,
} from './transport'
export type {
  VizPointer,
  VizSurfaceAttachment,
  VizSurfaceGeometry,
  VizSurfaceId,
} from './surfaces'

export type VizCanvasId = 'graph' | 'ribbon' | 'overview'
export interface VizViewport {
  readonly cssWidth: number
  readonly cssHeight: number
  readonly dpr: number
}
export type VizQualityTier = 0 | 1 | 2 | 3 | 4 | 5
export interface VizQuality {
  readonly tier: VizQualityTier
  readonly fileLabels: boolean
  readonly spokes: boolean
  readonly glow: boolean
  readonly dprCap: 1 | 2
  readonly fileCap: number
}
export interface VizRenderOptions {
  readonly viewport: VizViewport
  readonly quality: VizQuality
  readonly winStart: number
  readonly ribbonWeeks: number
  readonly settled: boolean
}
export interface VizFrameInfo {
  readonly tick: number
  readonly cursorDay: number
  readonly cursorDayInt: number
  readonly date: string
  readonly speedIndex: number
  readonly playing: boolean
  readonly reducedMotion: boolean
  readonly settled: boolean
  readonly nLive: number
  readonly liveRepos: readonly string[]
  readonly ghostRepos: number
  readonly liveHash: number
  readonly rngState: number
  readonly rngDraws: number
  readonly winStart: number
  readonly highlightCell: {
    readonly week: number
    readonly weekday: number
  } | null
  readonly beams: number
  readonly drawCalls: {
    readonly graph: number
    readonly ribbon: number
    readonly overview: number
    readonly total: number
  }
  readonly qualityTier: VizQualityTier
}
export interface VizPerfInfo {
  readonly lastFrameMs: number
  readonly medianFrameMs: number
  readonly framesOverBudget: number
  readonly governorEnabled: boolean
}
export interface VizDriverOptions {
  readonly input: SimInput
  readonly repoNames: readonly string[]
  readonly seed: number
  readonly reducedMotion?: boolean
}
export interface VizDriver {
  readonly state: SimState
  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void
  setViewport(id: VizCanvasId, viewport: VizViewport): void
  attach(attachment: VizSurfaceAttachment): void
  detach(id: VizSurfaceId): void
  resize(id: VizSurfaceId, geometry: VizSurfaceGeometry): void
  invalidate(id: VizSurfaceId): void
  setPointer(id: VizSurfaceId, point: VizPointer | null): void
  scrubTo(fraction: number): void
  start(): void
  stop(): void
  play(): void
  pause(): Promise<void>
  setSpeedIndex(index: number): void
  seekDay(day: number): Promise<VizFrameInfo>
  releaseWindow(): void
  seekTick(tick: number): Promise<VizFrameInfo>
  seekDate(iso: string): Promise<VizFrameInfo>
  renderFrame(steps?: number): Promise<VizFrameInfo>
  reset(seed?: number): void
  setQuality(q: 'high' | 'low' | 'auto'): void
  inspect(): VizFrameInfo
  perf(): VizPerfInfo
  subscribe(listener: (info: VizFrameInfo) => void): () => void
  onDestroy(listener: () => void): () => void
  destroy(): void
}

export const DEFAULT_SPEED_INDEX = 2
export const DWELL_TICKS = Math.round(4.2 / FIXED_DT)
export const RIBBON_WEEKS = 53
const WINDOW_LEAD_DAYS = 185
const FRAME_BACKLOG_CAP = 0.25
const SETTLED_HEAT = 0.32
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

export interface TickMapping {
  readonly day0: number
  readonly daysPerTick: number
  readonly rewindTicks: number
  readonly sweepTicks: number
}
export function tickMapping(input: SimInput): TickMapping {
  const daysPerTick = SPEEDS[DEFAULT_SPEED_INDEX] * FIXED_DT
  const day0 = input.dayCount - 1
  const rewindTicks = Math.ceil(day0 / daysPerTick)
  return {
    day0,
    daysPerTick,
    rewindTicks,
    sweepTicks: DWELL_TICKS + rewindTicks,
  }
}
export function cursorDayAtTick(mapping: TickMapping, tick: number): number {
  const period = mapping.sweepTicks
  const position = ((tick % period) + period) % period
  if (position <= DWELL_TICKS) return mapping.day0
  return Math.max(
    0,
    mapping.day0 - mapping.daysPerTick * (position - DWELL_TICKS)
  )
}
export function rngAnchor(seed: number, tick: number): number {
  return (seedRng(seed) + Math.imul(tick, 0x6d2b79f5)) >>> 0
}
export function weekdayOfISO(iso: string): number {
  const [year, month, day] = dateParts(iso)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}
export function formatDayISO(windowStartISO: string, day: number): string {
  const [year, month, date] = dateParts(windowStartISO)
  const value = new Date(Date.UTC(year, month - 1, date) + day * 86_400_000)
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
}
export function ribbonWinStart(
  input: SimInput,
  cursorDayInt: number,
  latched: number | null
): number {
  if (latched !== null) return latched
  const startWeekday = weekdayOfISO(input.windowStartISO)
  const last = input.dayCount - 1
  const lastSunday = last - positiveModulo(last + startWeekday, 7)
  const minStart = -startWeekday
  const maxStart = Math.max(minStart, lastSunday - 7 * (RIBBON_WEEKS - 1))
  let start = Math.min(
    maxStart,
    Math.max(minStart, cursorDayInt - WINDOW_LEAD_DAYS)
  )
  start -= positiveModulo(start + startWeekday, 7)
  return Math.max(minStart, start) | 0
}
export function highlightCellFor(
  input: SimInput,
  cursorDayInt: number,
  winStart: number
): { week: number; weekday: number } | null {
  const week = Math.floor((cursorDayInt - winStart) / 7)
  const weekday = positiveModulo(
    cursorDayInt + weekdayOfISO(input.windowStartISO),
    7
  )
  return week >= 0 && week < RIBBON_WEEKS ? { week, weekday } : null
}
export function qualityForTier(tier: VizQualityTier): VizQuality {
  return {
    tier,
    fileLabels: tier < 1,
    spokes: tier < 2,
    glow: tier < 3,
    dprCap: tier < 4 ? 2 : 1,
    fileCap: tier < 5 ? 2000 : 1000,
  }
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}
function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function createVizDriver(options: VizDriverOptions): VizDriver {
  if (options.repoNames.length !== options.input.repoCount)
    throw new RangeError(
      `repoNames length ${options.repoNames.length} does not match repoCount ${options.input.repoCount}`
    )
  let seed = options.seed
  const state = createSimState(options.input, seed)
  state.speedIndex = DEFAULT_SPEED_INDEX
  packOnce(state)
  // `packOnce` is guarded by a module-level WeakSet keyed on the state object, so
  // it can never run twice for this state. But `resetSimState` zeroes the very
  // arrays it fills (px, py, pr, repoR, repoX, repoY, repoAngle), and `step`
  // never rewrites them — repoX/repoY are recomputed from repoAngle, which is
  // also zeroed. Without this snapshot, every seek-driven frame renders repos at
  // radius 0 stacked at one ring point: the reduced-motion static frame and every
  // screenshot baseline would capture collapsed geometry while CI stayed green.
  const packedLayout = {
    px: state.px.slice(),
    py: state.py.slice(),
    pr: state.pr.slice(),
    repoR: state.repoR.slice(),
    repoX: state.repoX.slice(),
    repoY: state.repoY.slice(),
    repoAngle: state.repoAngle.slice(),
  } as const
  /** Restores the packed layout after a reset that zeroed it. */
  function restorePackedLayout(): void {
    state.px.set(packedLayout.px)
    state.py.set(packedLayout.py)
    state.pr.set(packedLayout.pr)
    state.repoR.set(packedLayout.repoR)
    state.repoX.set(packedLayout.repoX)
    state.repoY.set(packedLayout.repoY)
    state.repoAngle.set(packedLayout.repoAngle)
  }
  const mapping = tickMapping(options.input)
  const listeners = new Set<(info: VizFrameInfo) => void>()
  const destroyListeners = new Set<() => void>()
  const layers = createVizDriverRenderLayers(options.input)
  const surfaceController = createVizSurfaceController(layers.budget)
  let quality = qualityForTier(0)
  let qualityMode: 'high' | 'low' | 'auto' = 'auto'
  let raf: number | undefined
  let invalidationRaf = 0
  let previous = 0
  let accumulator = 0
  let latchedWindow: number | null = null
  let settled = false
  const lifecycle = createVizDriverLifecycle(
    state,
    options.reducedMotion ?? mediaQuery()?.matches ?? false
  )
  let media: MediaQueryList | null = mediaQuery()
  let uninstallHarness: (() => void) | undefined
  let lastFrameMs = 0
  let medianFrameMs = 0
  let framesOverBudget = 0
  let samples: number[] = []
  let governorStreak = 0
  const ribbon = createVizDriverRibbon({
    input: options.input,
    layer: layers.ribbon,
    syncWindow: syncRibbonWindow,
    highlightCell: (day, winStart) =>
      highlightCellFor(options.input, day, winStart),
  })
  let lastInfo = buildInfo()
  const surfaceApi = createVizDriverSurfaceApi(surfaceController, {
    state,
    onDirty: scheduleInvalidatedPaint,
    onPointer: updateSurfacePointer,
    onEmptyDirty: cancelInvalidatedPaint,
    seekDay,
  })

  const onMediaChange = (event: MediaQueryListEvent): void => {
    const action = lifecycle.mediaChanged(event.matches)
    if (action === 'pause-and-settle') {
      stop()
      void seekTick(0)
    } else if (action === 'resume') {
      accumulator = 0
      cancelInvalidatedPaint()
      publishFrameInfo()
      if (lifecycle.running) scheduleFrame()
    } else paint(settled)
  }
  media?.addEventListener('change', onMediaChange)

  function mediaQuery(): MediaQueryList | null {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCE_QUERY)
      : null
  }
  function updateSurfacePointer(
    id: VizSurfaceId,
    point: VizPointer | null
  ): void {
    if (id !== 'ribbon') return
    const highlight = ribbon.setPointer(point, buildRenderView('ribbon'))
    lastInfo = {
      ...lastInfo,
      winStart: syncRibbonWindow(),
      highlightCell: highlight,
    }
    surfaceApi.invalidateCanvas('ribbon')
  }
  function syncRibbonWindow(): number {
    const winStart = ribbonWinStart(
      options.input,
      state.cursorDayInt,
      latchedWindow
    )
    syncVizRibbonWindow(layers.ribbon, winStart)
    return winStart
  }
  function scheduleInvalidatedPaint(): void {
    if (
      lifecycle.destroyed ||
      lifecycle.running ||
      invalidationRaf ||
      !surfaceController.hasDirty() ||
      typeof requestAnimationFrame !== 'function'
    )
      return
    invalidationRaf = requestAnimationFrame(() => {
      invalidationRaf = 0
      const targets = surfaceController.drainDirty()
      if (targets.size > 0) paint(settled, targets)
    })
  }
  function start(): void {
    if (lifecycle.running) return
    if (lifecycle.reducedMotion) {
      void seekTick(0)
      return
    }
    schedule()
  }
  function schedule(): void {
    if (!lifecycle.start()) return
    cancelInvalidatedPaint()
    scheduleFrame()
  }
  function scheduleFrame(): void {
    if (raf !== undefined || lifecycle.destroyed || !lifecycle.running) return
    previous = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    if (raf !== undefined) cancelAnimationFrame(raf)
    raf = undefined
    lifecycle.stop()
    scheduleInvalidatedPaint()
  }
  function cancelInvalidatedPaint(): void {
    if (!invalidationRaf) return
    cancelAnimationFrame(invalidationRaf)
    invalidationRaf = 0
  }
  function play(): void {
    if (!lifecycle.running) schedule()
  }
  function pause(): Promise<void> {
    stop()
    return Promise.resolve()
  }
  function frame(now: number): void {
    raf = undefined
    if (!lifecycle.running) return
    try {
      const dt = Math.min(
        FRAME_BACKLOG_CAP,
        Math.max(0, (now - previous) / 1000)
      )
      previous = now
      accumulator += dt
      let count = 0
      while (accumulator >= FIXED_DT && count < MAX_STEPS) {
        advance()
        accumulator -= FIXED_DT
        count++
      }
      if (count === MAX_STEPS) accumulator = 0
      paint(false)
      sampleGovernor(now)
      scheduleFrame()
    } catch {
      stop()
      listeners.forEach((listener) => listener(lastInfo))
    }
  }
  function advance(): void {
    const tick = state.tick + 1
    state.rngState = rngAnchor(seed, tick)
    state.rngDraws = 0
    step(state)
    anchorTick(tick)
  }
  function anchorTick(tick: number): void {
    state.tick = tick
    const day = cursorDayAtTick(mapping, tick)
    const dayInt = Math.floor(day)
    state.cursorDay = day
    if (dayInt < state.cursorDayInt) advanceCursor(state, dayInt)
    else if (dayInt > state.cursorDayInt) seekCursor(state, dayInt)
    state.cursorDayInt = dayInt
  }
  function settleChannels(): void {
    for (let id = 0; id < state.entityCount; id++) {
      const live =
        state.kind[id] === ENTITY_REPO
          ? repoPhase(state, id, state.cursorDayInt) === PHASE_LIVE
          : isLive(state, id)
      state.alpha[id] = live ? 1 : 0
      state.heat[id] = live ? SETTLED_HEAT : 0
    }
    for (let id = 0; id < state.repoCount; id++)
      state.repoAlpha[id] =
        repoPhase(state, id, state.cursorDayInt) === PHASE_ABSENT ? 0 : 1
    state.actorX.set(state.actorTX)
    state.actorY.set(state.actorTY)
    state.beamHead = 0
    state.beamLife.fill(0)
    state.beamEnt.fill(-1)
  }
  async function seekTick(tick: number): Promise<VizFrameInfo> {
    assertTick(tick)
    resetSimState(state, seed)
    restorePackedLayout()
    // I-D3: two seekTick(t) calls must be identical regardless of what happened
    // between them. seekDay/seekDate latch a ribbon window that paint() resolves
    // through, so without clearing it the same tick renders differently after a
    // prior seekDay — exactly the path-dependence this ticket exists to prevent.
    latchedWindow = null
    state.speedIndex = DEFAULT_SPEED_INDEX
    state.playing = false
    anchorTick(tick)
    state.rngState = rngAnchor(seed, tick)
    state.rngDraws = 0
    step(state)
    anchorTick(tick)
    settleChannels()
    settled = true
    paint(true)
    flushRaster()
    return Promise.resolve(lastInfo)
  }
  function renderFrame(steps = 1): Promise<VizFrameInfo> {
    const count = Math.max(0, Math.floor(steps))
    state.playing = true
    for (let index = 0; index < count; index++) advance()
    settled = false
    paint(false)
    flushRaster()
    return Promise.resolve(lastInfo)
  }
  function seekDay(day: number): Promise<VizFrameInfo> {
    const target = Math.max(
      0,
      Math.min(options.input.dayCount - 1, Math.floor(day))
    )
    const rewindTick =
      target === mapping.day0
        ? 0
        : DWELL_TICKS + Math.ceil((mapping.day0 - target) / mapping.daysPerTick)
    const tick = Math.min(mapping.sweepTicks - 1, rewindTick)
    latchedWindow = ribbonWinStart(options.input, target, null)
    return seekTick(tick)
  }
  function seekDate(iso: string): Promise<VizFrameInfo> {
    const start = Date.parse(`${options.input.windowStartISO}T00:00:00Z`)
    const target = Date.parse(`${iso}T00:00:00Z`)
    const day = Math.round((target - start) / 86_400_000)
    return seekDay(Number.isFinite(day) ? day : 0)
  }
  function reset(nextSeed = seed): void {
    seed = nextSeed
    resetSimState(state, seed)
    restorePackedLayout()
    state.speedIndex = DEFAULT_SPEED_INDEX
    state.playing = false
    latchedWindow = null
    settled = false
    paint(true)
  }
  function releaseWindow(): void {
    latchedWindow = null
  }
  function setSpeedIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= SPEEDS.length)
      throw new RangeError(`speed index ${index} is invalid`)
    state.speedIndex = index
  }
  function setQuality(mode: 'high' | 'low' | 'auto'): void {
    qualityMode = mode
    quality = qualityForTier(mode === 'low' ? 5 : 0)
  }
  function inspect(): VizFrameInfo {
    return lastInfo
  }
  function perf(): VizPerfInfo {
    return {
      lastFrameMs,
      medianFrameMs,
      framesOverBudget,
      governorEnabled: qualityMode === 'auto',
    }
  }
  function subscribe(listener: (info: VizFrameInfo) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  function onDestroy(listener: () => void): () => void {
    destroyListeners.add(listener)
    return () => destroyListeners.delete(listener)
  }
  function destroy(): void {
    lifecycle.destroy()
    destroyListeners.forEach((listener) => listener())
    destroyListeners.clear()
    stop()
    cancelInvalidatedPaint()
    media?.removeEventListener('change', onMediaChange)
    media = null
    uninstallHarness?.()
    surfaceApi.destroy()
    surfaceController.destroy()
    listeners.clear()
  }
  function paint(
    nextSettled: boolean,
    targets?: ReadonlySet<VizCanvasId>
  ): void {
    settled = nextSettled
    const winStart = syncRibbonWindow()
    const total = paintVizSurfaces(
      surfaceController,
      surfacePaintOptions(winStart, targets)
    )
    if (targets === undefined) surfaceController.clearDirty()
    publishFrameInfo(winStart, total)
  }
  function publishFrameInfo(winStart = syncRibbonWindow(), total = 0): void {
    lastInfo = buildInfo(winStart, total)
    listeners.forEach((listener) => listener(lastInfo))
  }
  function surfacePaintOptions(
    winStart: number,
    targets: ReadonlySet<VizCanvasId> | undefined
  ) {
    return {
      state,
      layers,
      quality: renderVizQuality(quality),
      meta: createVizRenderMeta(options.repoNames),
      focusedDay: state.cursorDayInt,
      winStart,
      targets,
      onRibbonPaint: updateRibbonPointerHighlight,
    }
  }
  function updateRibbonPointerHighlight(view: RenderView): void {
    ribbon.refreshPointer(view)
  }
  function buildInfo(winStart = syncRibbonWindow(), total = 0): VizFrameInfo {
    const digest = digestSimState(state)
    const pointerHighlight = ribbon.pointerHighlight()
    const names: string[] = []
    const ids = new Int32Array(state.entityCount)
    const count = liveIdsAscending(state, ids)
    for (let index = 0; index < count; index++) {
      const id = ids[index]
      if (id !== undefined && id < state.repoCount)
        names.push(options.repoNames[id] ?? '')
    }
    return {
      tick: state.tick,
      cursorDay: state.cursorDay,
      cursorDayInt: state.cursorDayInt,
      date: formatDayISO(options.input.windowStartISO, state.cursorDayInt),
      speedIndex: state.speedIndex,
      playing: state.playing,
      reducedMotion: lifecycle.reducedMotion,
      settled,
      nLive: digest.nLive,
      liveRepos: names,
      ghostRepos: digest.ghostRepos,
      liveHash: digest.liveHash,
      rngState: digest.rngState,
      rngDraws: digest.rngDraws,
      winStart,
      highlightCell:
        pointerHighlight === undefined
          ? highlightCellFor(options.input, state.cursorDayInt, winStart)
          : pointerHighlight,
      beams: state.beamLife.filter((life) => life > 0).length,
      drawCalls: { graph: 0, ribbon: 0, overview: 0, total },
      qualityTier: quality.tier,
    }
  }
  function buildRenderView(surface: VizCanvasId = 'graph'): RenderView {
    return surfaceController.buildView(
      surface,
      renderVizQuality(quality),
      createVizRenderMeta(options.repoNames),
      state.cursorDayInt
    )
  }
  function flushRaster(): void {
    surfaceController.flush()
  }
  function sampleGovernor(now: number): void {
    const delta =
      lastFrameMs === 0 ? 0 : Math.max(0, now - (previous - FIXED_DT * 1000))
    lastFrameMs = delta
    samples = [...samples.slice(-59), delta]
    medianFrameMs =
      [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 0
    if (medianFrameMs > 12) {
      governorStreak++
      framesOverBudget++
    } else governorStreak = 0
    if (qualityMode === 'auto' && governorStreak >= 30 && quality.tier < 5) {
      quality = qualityForTier((quality.tier + 1) as VizQualityTier)
      governorStreak = 0
    }
  }
  const driver: VizDriver = {
    state,
    setCanvas: surfaceApi.setCanvas.bind(surfaceApi),
    setViewport: surfaceApi.setViewport.bind(surfaceApi),
    attach: surfaceApi.attach.bind(surfaceApi),
    detach: surfaceApi.detach.bind(surfaceApi),
    resize: surfaceApi.resize.bind(surfaceApi),
    invalidate: surfaceApi.invalidate.bind(surfaceApi),
    setPointer: surfaceApi.setPointer.bind(surfaceApi),
    scrubTo: surfaceApi.scrubTo.bind(surfaceApi),
    start,
    stop,
    play,
    pause,
    setSpeedIndex,
    seekDay,
    releaseWindow,
    seekTick,
    seekDate,
    renderFrame,
    reset,
    setQuality,
    inspect,
    perf,
    subscribe,
    onDestroy,
    destroy,
  }
  const buildHooks =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_TEST_HOOKS === '1'
  if (buildHooks)
    void import('./testHarness').then((module) => {
      if (lifecycle.destroyed) return
      uninstallHarness = module.installTestHarness(driver)
    })
  return driver
}

function assertTick(tick: number): void {
  if (!Number.isInteger(tick) || !Number.isFinite(tick))
    throw new RangeError(`tick ${tick} must be a finite integer`)
}
function dateParts(iso: string): [number, number, number] {
  const parts = iso.split('-').map(Number)
  const year = parts[0]
  const month = parts[1]
  const day = parts[2]
  if (year === undefined || month === undefined || day === undefined)
    throw new RangeError(`invalid ISO date ${iso}`)
  return [year, month, day]
}

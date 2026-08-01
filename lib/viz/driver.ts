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
import { renderGraph, createGraphLayer } from './render/graph'
import { renderOverview, createOverviewLayer } from './render/overview'
import { renderRibbon, createRibbonLayer } from './render/ribbon'
import {
  createFrameBudget,
  instrumentContext,
  type Ctx2D,
  type GridSeries,
  type RenderMeta,
  type RenderTheme,
  type RenderView,
  type Quality,
  type Viewport,
} from './render/budget'
import { AG, LV, PANE_SURFACE } from './tokens/ramp'

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
  const mapping = tickMapping(options.input)
  const contexts = new Map<VizCanvasId, Ctx2D>()
  const viewports = new Map<VizCanvasId, VizViewport>()
  const listeners = new Set<(info: VizFrameInfo) => void>()
  const layers = createLayers(options.input)
  let quality = qualityForTier(0)
  let qualityMode: 'high' | 'low' | 'auto' = 'auto'
  let running = false
  let resumeAfterReduce = false
  let raf = 0
  let previous = 0
  let accumulator = 0
  let latchedWindow: number | null = null
  let settled = false
  let reducedMotion = options.reducedMotion ?? mediaQuery()?.matches ?? false
  let media: MediaQueryList | null = mediaQuery()
  let uninstallHarness: (() => void) | undefined
  let lastFrameMs = 0
  let medianFrameMs = 0
  let framesOverBudget = 0
  let samples: number[] = []
  let governorStreak = 0
  let lastInfo = buildInfo()

  const onMediaChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches
    if (reducedMotion) {
      resumeAfterReduce = running
      stop()
      void seekTick(0)
    } else if (resumeAfterReduce) {
      resumeAfterReduce = false
      running = true
      state.playing = true
      previous = performance.now()
      accumulator = 0
      raf = requestAnimationFrame(frame)
    }
  }
  media?.addEventListener('change', onMediaChange)

  function mediaQuery(): MediaQueryList | null {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCE_QUERY)
      : null
  }
  function setCanvas(
    id: VizCanvasId,
    ctx: CanvasRenderingContext2D | null
  ): void {
    if (ctx) contexts.set(id, instrumentContext(ctx, layers.budget))
    else contexts.delete(id)
  }
  function setViewport(id: VizCanvasId, viewport: VizViewport): void {
    viewports.set(id, viewport)
  }
  function start(): void {
    if (running) return
    if (reducedMotion) {
      void seekTick(0)
      return
    }
    schedule()
  }
  function schedule(): void {
    running = true
    state.playing = true
    previous = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop(): void {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    running = false
    state.playing = false
  }
  function play(): void {
    state.playing = true
    if (!running) schedule()
  }
  function pause(): Promise<void> {
    stop()
    return Promise.resolve()
  }
  function frame(now: number): void {
    if (!running) return
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
      raf = requestAnimationFrame(frame)
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
    const tick =
      target === mapping.day0
        ? 0
        : DWELL_TICKS + Math.ceil((mapping.day0 - target) / mapping.daysPerTick)
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
  function destroy(): void {
    stop()
    media?.removeEventListener('change', onMediaChange)
    media = null
    uninstallHarness?.()
    contexts.clear()
    listeners.clear()
  }
  function paint(nextSettled: boolean): void {
    settled = nextSettled
    const winStart = ribbonWinStart(
      options.input,
      state.cursorDayInt,
      latchedWindow
    )
    layers.budget.begin()
    const renderView = buildRenderView()
    const overview = contexts.get('overview')
    if (overview)
      renderOverview(state, overview, renderView, layers.overview, winStart)
    const ribbon = contexts.get('ribbon')
    if (ribbon) renderRibbon(state, ribbon, renderView, layers.ribbon)
    const graph = contexts.get('graph')
    if (graph) renderGraph(state, graph, renderView, layers.graph)
    const report = layers.budget.end()
    lastInfo = buildInfo(winStart, report.drawCalls)
    listeners.forEach((listener) => listener(lastInfo))
  }
  function buildInfo(
    winStart = ribbonWinStart(options.input, state.cursorDayInt, latchedWindow),
    total = 0
  ): VizFrameInfo {
    const digest = digestSimState(state)
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
      reducedMotion,
      settled,
      nLive: digest.nLive,
      liveRepos: names,
      ghostRepos: digest.ghostRepos,
      liveHash: digest.liveHash,
      rngState: digest.rngState,
      rngDraws: digest.rngDraws,
      winStart,
      highlightCell: highlightCellFor(
        options.input,
        state.cursorDayInt,
        winStart
      ),
      beams: state.beamLife.filter((life) => life > 0).length,
      drawCalls: { graph: 0, ribbon: 0, overview: 0, total },
      qualityTier: quality.tier,
    }
  }
  function buildRenderView(): RenderView {
    const viewport = viewports.get('graph') ?? {
      cssWidth: 1,
      cssHeight: 1,
      dpr: 1,
    }
    const renderViewport: Viewport = {
      ...viewport,
      pxWidth: Math.max(1, Math.round(viewport.cssWidth * viewport.dpr)),
      pxHeight: Math.max(1, Math.round(viewport.cssHeight * viewport.dpr)),
    }
    return {
      viewport: renderViewport,
      theme: defaultTheme(),
      quality: renderQuality(quality),
      meta: renderMeta(options.repoNames),
      budget: layers.budget,
      focusedDay: state.cursorDayInt,
    }
  }
  function flushRaster(): void {
    for (const [id, ctx] of contexts) {
      try {
        ctx.getImageData(0, 0, 1, 1)
      } catch {
        contexts.delete(id)
      }
    }
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
    setCanvas,
    setViewport,
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
    destroy,
  }
  const buildHooks =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_TEST_HOOKS === '1'
  if (buildHooks)
    void import('./testHarness').then((module) => {
      uninstallHarness = module.installTestHarness(driver)
    })
  return driver
}

function assertTick(tick: number): void {
  if (!Number.isInteger(tick) || !Number.isFinite(tick))
    throw new RangeError(`tick ${tick} must be a finite integer`)
}
function createLayers(input: SimInput): {
  readonly budget: ReturnType<typeof createFrameBudget>
  readonly graph: ReturnType<typeof createGraphLayer>
  readonly ribbon: ReturnType<typeof createRibbonLayer>
  readonly overview: ReturnType<typeof createOverviewLayer>
} {
  const grid: GridSeries = {
    dayCount: input.dayCount,
    windowStartISO: input.windowStartISO,
    total: new Uint16Array(input.dayCount),
    agent: new Uint16Array(input.dayCount),
    level: new Uint8Array(input.dayCount),
    agentBirthDay: -1,
  }
  return {
    budget: createFrameBudget(false),
    graph: createGraphLayer(input.entityCount),
    ribbon: createRibbonLayer(grid),
    overview: createOverviewLayer(grid),
  }
}
function defaultTheme(): RenderTheme {
  const token = {
    bgH: PANE_SURFACE,
    bg0: LV[0],
    bg1: LV[1],
    bg2: LV[2],
    bg3: LV[3],
    bg4: LV[4],
    fg0: LV[9],
    fg1: LV[8],
    fg2: LV[7],
    fg3: LV[6],
    fg4: LV[5],
    gray: LV[4],
    green: LV[8],
    greenD: LV[6],
    aqua: AG[8],
    aquaD: AG[6],
    purple: AG[7],
    purpleD: AG[5],
    yellow: LV[9],
    yellowD: LV[7],
    red: AG[8],
    blue: AG[7],
  } as const
  return {
    lv: LV,
    ag: AG,
    paneSurface: PANE_SURFACE,
    token,
    fontPx: { micro: 10, small: 12, mono: 14 },
    fontFamily: 'monospace',
  }
}
function renderQuality(value: VizQuality): Quality {
  return {
    name:
      value.tier === 0
        ? 'full'
        : value.tier === 1
          ? 'no-file-labels'
          : value.tier === 2
            ? 'no-spokes'
            : value.tier === 3
              ? 'no-shadows'
              : value.tier === 4
                ? 'dpr1'
                : 'half-files',
    dpr: value.dprCap,
    fileLabels: value.fileLabels,
    spokes: value.spokes,
    shadows: value.glow,
    maxFiles: value.fileCap,
    clusterMode: value.tier < 4 ? 'blur' : 'hatch',
  }
}
function renderMeta(repoNames: readonly string[]): RenderMeta {
  return {
    repos: repoNames.map((short) => ({
      short,
      actor: 0,
      stars: 0,
      isPrivate: false,
    })),
    fileLabel: (id) => String(id),
    agentBirthLabel: null,
    agentBirthSubLabel: null,
  }
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

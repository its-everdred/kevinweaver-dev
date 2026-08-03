import { AG, LV, PANE_SURFACE } from '@/lib/viz/tokens/ramp'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Measured device-pixel clamp used for every instrument canvas. */
export const DPR_CAP = 2

/** Contribution data accepted by the render modules. */
export interface GridSeries {
  readonly dayCount: number
  readonly windowStartISO: string
  readonly total: Uint16Array
  readonly agent: Uint16Array
  readonly level: Uint8Array
  readonly agentBirthDay: number
}

/** A calendar transition expressed as a day offset from GridSeries day zero. */
export interface CalendarMarker {
  readonly day: number
  readonly month: number
  readonly year: number
}

/** Display-safe repository metadata indexed by simulation repository id. */
export interface RepoMeta {
  readonly short: string
  readonly actor: 0 | 1 | 2
  readonly stars: number
  readonly isPrivate: boolean
}

/** Presentation data that does not belong in the simulation state. */
export interface RenderMeta {
  readonly repos: readonly RepoMeta[]
  fileLabel(entityId: number): string
  readonly agentBirthLabel: string | null
  readonly agentBirthSubLabel: string | null
  /** Optional until the bundle adapter supplies the same birth day as GridSeries. */
  readonly agentBirthDay?: number
}

export type TokenName =
  | 'bgH'
  | 'bg0'
  | 'bg1'
  | 'bg2'
  | 'bg3'
  | 'bg4'
  | 'fg0'
  | 'fg1'
  | 'fg2'
  | 'fg3'
  | 'fg4'
  | 'gray'
  | 'green'
  | 'greenD'
  | 'aqua'
  | 'aquaD'
  | 'purple'
  | 'purpleD'
  | 'yellow'
  | 'yellowD'
  | 'red'
  | 'blue'

/** Resolved design-system values used by canvas rendering. */
export interface RenderTheme {
  readonly lv: readonly string[]
  readonly ag: readonly string[]
  readonly paneSurface: string
  readonly token: Readonly<Record<TokenName, string>>
  readonly fontPx: {
    readonly micro: number
    readonly small: number
    readonly mono: number
  }
  readonly fontFamily: string
}

/** Adaptive rendering configuration, intentionally absent from SimState. */
export interface Quality {
  readonly name:
    | 'full'
    | 'no-file-labels'
    | 'no-spokes'
    | 'no-shadows'
    | 'dpr1'
    | 'half-files'
  readonly dpr: number
  readonly fileLabels: boolean
  readonly spokes: boolean
  readonly shadows: boolean
  readonly maxFiles: number
  readonly clusterMode: 'blur' | 'hatch'
}

/** Measured unit costs in microseconds on the software-raster bound. */
export const UNIT_COST_US = {
  smallArcFill: 1.21,
  largeArcFill: 13.1,
  radialLine40px: 0.3,
  longLine640px: 2.55,
  fillTextMono: 1.57,
  blitCachedBitmap: 20.2,
  filteredDrawCall: 5440,
  shadowMultiplier: 5.3,
} as const

/** Measured caps enforced by the optional development frame instrument. */
export const CAPS = {
  frameBudgetMs: 8,
  maxDrawCalls: 3000,
  maxFilteredDrawCallsPerFrame: 0,
  maxFilteredDrawCallsPerBuild: 1,
  maxFileCircles: 2000,
  maxRepoCircles: 56,
  maxSpokes: 2000,
  maxFillText: 200,
  maxShadowPrimitives: 48,
  maxBitmapEdgePx: 16384,
} as const

/** Six rungs ordered from complete fidelity to the emergency minimum. */
export const QUALITY_LADDER: readonly Quality[] = [
  {
    name: 'full',
    dpr: DPR_CAP,
    fileLabels: true,
    spokes: true,
    shadows: true,
    maxFiles: CAPS.maxFileCircles,
    clusterMode: 'blur',
  },
  {
    name: 'no-file-labels',
    dpr: DPR_CAP,
    fileLabels: false,
    spokes: true,
    shadows: true,
    maxFiles: CAPS.maxFileCircles,
    clusterMode: 'blur',
  },
  {
    name: 'no-spokes',
    dpr: DPR_CAP,
    fileLabels: false,
    spokes: false,
    shadows: true,
    maxFiles: CAPS.maxFileCircles,
    clusterMode: 'blur',
  },
  {
    name: 'no-shadows',
    dpr: DPR_CAP,
    fileLabels: false,
    spokes: false,
    shadows: false,
    maxFiles: CAPS.maxFileCircles,
    clusterMode: 'blur',
  },
  {
    name: 'dpr1',
    dpr: 1,
    fileLabels: false,
    spokes: false,
    shadows: false,
    maxFiles: CAPS.maxFileCircles,
    clusterMode: 'hatch',
  },
  {
    name: 'half-files',
    dpr: 1,
    fileLabels: false,
    spokes: false,
    shadows: false,
    maxFiles: CAPS.maxFileCircles / 2,
    clusterMode: 'hatch',
  },
]

/** Returns the next measured degradation rung, or the final rung unchanged. */
export function degrade(current: Quality): Quality {
  const index = QUALITY_LADDER.findIndex(
    (quality) => quality.name === current.name
  )
  return (
    QUALITY_LADDER[
      Math.min(QUALITY_LADDER.length - 1, Math.max(0, index + 1))
    ] ?? current
  )
}

/** Backing-store dimensions supplied by the canvas-owning UI layer. */
export interface Viewport {
  readonly cssWidth: number
  readonly cssHeight: number
  readonly dpr: number
  readonly pxWidth: number
  readonly pxHeight: number
}

/** Pure data shared by each painter for a single frame. */
export interface RenderView {
  readonly viewport: Viewport
  readonly theme: RenderTheme
  readonly quality: Quality
  readonly meta: RenderMeta
  readonly budget: FrameBudget
  readonly focusedDay: number
}

/** Deterministic accounting emitted for every instrumented frame. */
export interface FrameReport {
  readonly drawCalls: number
  readonly filteredDrawCalls: number
  readonly arcFills: number
  readonly lines: number
  readonly fillTextCalls: number
  readonly shadowPrimitives: number
  readonly blits: number
  readonly nonIntegerBlits: number
  readonly rotatedBlits: number
  readonly estimatedMs: number
  readonly violations: readonly string[]
}

/** Owns one frame's optional render accounting. */
export interface FrameBudget {
  begin(): void
  end(): FrameReport
  readonly last: FrameReport | null
}

interface BudgetCounters {
  drawCalls: number
  filteredDrawCalls: number
  arcFills: number
  lines: number
  fillTextCalls: number
  shadowPrimitives: number
  blits: number
  nonIntegerBlits: number
  rotatedBlits: number
  filterActive: boolean
  shadowActive: boolean
  pathArcs: number
  pathLines: number
  contextStack: ContextState[]
}

interface ContextState {
  readonly filterActive: boolean
  readonly shadowActive: boolean
}

interface BudgetState {
  readonly enforce: boolean
  readonly counters: BudgetCounters
  last: FrameReport | null
}

const BUDGETS = new WeakMap<FrameBudget, BudgetState>()

const DRAW_CALLS = new Set([
  'fill',
  'stroke',
  'fillRect',
  'strokeRect',
  'clearRect',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
])

const TOKEN_CSS: Readonly<Record<TokenName, string>> = {
  bgH: '--bg-h',
  bg0: '--bg0',
  bg1: '--bg1',
  bg2: '--bg2',
  bg3: '--bg3',
  bg4: '--bg4',
  fg0: '--fg0',
  fg1: '--fg1',
  fg2: '--fg2',
  fg3: '--fg3',
  fg4: '--fg4',
  gray: '--gray',
  green: '--green',
  greenD: '--green-d',
  aqua: '--aqua',
  aquaD: '--aqua-d',
  purple: '--purple',
  purpleD: '--purple-d',
  yellow: '--yellow',
  yellowD: '--yellow-d',
  red: '--red',
  blue: '--blue',
}

/** Resolves CSS custom properties once, at a UI-owned lifecycle boundary. */
export function resolveRenderTheme(el: Element): RenderTheme {
  const style = getComputedStyle(el)
  const token = readThemeTokens(style)
  return {
    lv: LV,
    ag: AG,
    paneSurface: token.bgH || PANE_SURFACE,
    token,
    fontPx: {
      micro: readFontSize(style, '--fs-micro'),
      small: readFontSize(style, '--fs-small'),
      mono: readFontSize(style, '--fs-mono'),
    },
    fontFamily: readCssValue(style, '--mono') || 'monospace',
  }
}

/** Derives month and year boundaries by advancing the supplied ISO day without clocks. */
export function calendarMarkers(grid: GridSeries): readonly CalendarMarker[] {
  const start = parseIsoDay(grid.windowStartISO)
  if (!start || grid.dayCount <= 0) return []
  const markers: CalendarMarker[] = []
  let year = start.year
  let month = start.month
  let day = start.day
  for (let index = 0; index < grid.dayCount; index += 1) {
    if (index === 0 || day === 1) markers.push({ day: index, month, year })
    day += 1
    if (day <= daysInMonth(year, month)) continue
    day = 1
    month += 1
    if (month <= 12) continue
    month = 1
    year += 1
  }
  return markers
}

/** Creates a reusable, deterministic frame-budget instrument. */
export function createFrameBudget(enforce: boolean): FrameBudget {
  const counters = createCounters()
  const state: BudgetState = { enforce, counters, last: null }
  const budget: FrameBudget = {
    begin(): void {
      resetCounters(counters)
    },
    end(): FrameReport {
      const report = buildReport(counters)
      state.last = report
      if (state.enforce) assertFrameBudget(report)
      return report
    },
    get last(): FrameReport | null {
      return state.last
    },
  }
  BUDGETS.set(budget, state)
  return budget
}

/** Wraps a canvas context to account for draw calls without changing output. */
export function instrumentContext(ctx: Ctx2D, budget: FrameBudget): Ctx2D {
  const state = BUDGETS.get(budget)
  if (!state) return ctx
  return new Proxy(ctx, {
    get(target, property) {
      const value = Reflect.get(target, property, target)
      if (typeof property !== 'string' || typeof value !== 'function')
        return value
      if (DRAW_CALLS.has(property)) {
        return (...args: unknown[]) => {
          countDraw(state.counters, property, args, target)
          return value.apply(target, args)
        }
      }
      if (property === 'beginPath') {
        return (...args: unknown[]) => {
          state.counters.pathArcs = 0
          state.counters.pathLines = 0
          return value.apply(target, args)
        }
      }
      if (property === 'arc') {
        return (...args: unknown[]) => {
          state.counters.pathArcs += 1
          return value.apply(target, args)
        }
      }
      if (property === 'lineTo') {
        return (...args: unknown[]) => {
          state.counters.pathLines += 1
          return value.apply(target, args)
        }
      }
      if (property === 'save') {
        return (...args: unknown[]) => {
          state.counters.contextStack.push({
            filterActive: state.counters.filterActive,
            shadowActive: state.counters.shadowActive,
          })
          return value.apply(target, args)
        }
      }
      if (property === 'restore') {
        return (...args: unknown[]) => {
          const result = value.apply(target, args)
          const previous = state.counters.contextStack.pop()
          if (previous) {
            state.counters.filterActive = previous.filterActive
            state.counters.shadowActive = previous.shadowActive
          }
          return result
        }
      }
      return value.bind(target)
    },
    set(target, property, value) {
      if (property === 'filter') state.counters.filterActive = value !== 'none'
      if (property === 'shadowBlur')
        state.counters.shadowActive = Number(value) > 0
      return Reflect.set(target, property, value, target)
    },
  })
}

/** Throws a stable error when a completed frame violates a measured invariant. */
export function assertFrameBudget(report: FrameReport): void {
  if (report.violations.length === 0) return
  throw new FrameBudgetViolationError(report.violations.join(', '))
}

class FrameBudgetViolationError extends Error {
  constructor(violation: string) {
    super(`KW-022 frame budget: ${violation}`)
    this.name = 'FrameBudgetViolationError'
  }
}

function createCounters(): BudgetCounters {
  return {
    drawCalls: 0,
    filteredDrawCalls: 0,
    arcFills: 0,
    lines: 0,
    fillTextCalls: 0,
    shadowPrimitives: 0,
    blits: 0,
    nonIntegerBlits: 0,
    rotatedBlits: 0,
    filterActive: false,
    shadowActive: false,
    pathArcs: 0,
    pathLines: 0,
    contextStack: [],
  }
}

function resetCounters(counters: BudgetCounters): void {
  Object.assign(counters, createCounters())
}

function countDraw(
  counters: BudgetCounters,
  property: string,
  args: readonly unknown[],
  ctx: Ctx2D
): void {
  counters.drawCalls += 1
  if (counters.filterActive) counters.filteredDrawCalls += 1
  if (counters.shadowActive) counters.shadowPrimitives += 1
  if (property === 'fill') counters.arcFills += counters.pathArcs
  if (property === 'stroke') counters.lines += counters.pathLines
  if (property === 'fillText' || property === 'strokeText')
    counters.fillTextCalls += 1
  if (property !== 'drawImage') return
  counters.blits += 1
  const destination = imageDestination(args)
  const matrix = ctx.getTransform()
  const transformedX =
    destination.x * matrix.a + destination.y * matrix.c + matrix.e
  const transformedY =
    destination.x * matrix.b + destination.y * matrix.d + matrix.f
  if (!Number.isInteger(transformedX) || !Number.isInteger(transformedY)) {
    counters.nonIntegerBlits += 1
  }
  if (matrix.b !== 0 || matrix.c !== 0) counters.rotatedBlits += 1
}

function imageDestination(args: readonly unknown[]): { x: number; y: number } {
  const offset = args.length === 9 ? 5 : 1
  return { x: numberAt(args, offset), y: numberAt(args, offset + 1) }
}

function numberAt(values: readonly unknown[], index: number): number {
  const value = values[index]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.NaN
}

function buildReport(counters: BudgetCounters): FrameReport {
  const estimatedMs =
    (counters.arcFills * UNIT_COST_US.smallArcFill +
      counters.lines * UNIT_COST_US.longLine640px +
      counters.fillTextCalls * UNIT_COST_US.fillTextMono +
      counters.blits * UNIT_COST_US.blitCachedBitmap +
      counters.filteredDrawCalls * UNIT_COST_US.filteredDrawCall +
      counters.shadowPrimitives * 1.5 * 4.3) /
    1000
  const violations = collectViolations(counters, estimatedMs)
  return {
    drawCalls: counters.drawCalls,
    filteredDrawCalls: counters.filteredDrawCalls,
    arcFills: counters.arcFills,
    lines: counters.lines,
    fillTextCalls: counters.fillTextCalls,
    shadowPrimitives: counters.shadowPrimitives,
    blits: counters.blits,
    nonIntegerBlits: counters.nonIntegerBlits,
    rotatedBlits: counters.rotatedBlits,
    estimatedMs,
    violations,
  }
}

function collectViolations(
  counters: BudgetCounters,
  estimatedMs: number
): string[] {
  const violations: string[] = []
  addViolation(
    violations,
    counters.drawCalls > CAPS.maxDrawCalls,
    'draw-call cap'
  )
  addViolation(
    violations,
    counters.filteredDrawCalls > CAPS.maxFilteredDrawCallsPerFrame,
    'filtered draw-call cap'
  )
  addViolation(
    violations,
    counters.fillTextCalls > CAPS.maxFillText,
    'fillText cap'
  )
  addViolation(
    violations,
    counters.shadowPrimitives > CAPS.maxShadowPrimitives,
    'shadow cap'
  )
  addViolation(violations, counters.nonIntegerBlits > 0, 'non-integer blit')
  addViolation(violations, counters.rotatedBlits > 0, 'rotated blit')
  addViolation(
    violations,
    estimatedMs > CAPS.frameBudgetMs,
    'estimated frame cost'
  )
  return violations
}

function addViolation(
  violations: string[],
  condition: boolean,
  violation: string
): void {
  if (condition) violations.push(violation)
}

function readThemeTokens(
  style: CSSStyleDeclaration
): Readonly<Record<TokenName, string>> {
  return {
    bgH: readToken(style, 'bgH'),
    bg0: readToken(style, 'bg0'),
    bg1: readToken(style, 'bg1'),
    bg2: readToken(style, 'bg2'),
    bg3: readToken(style, 'bg3'),
    bg4: readToken(style, 'bg4'),
    fg0: readToken(style, 'fg0'),
    fg1: readToken(style, 'fg1'),
    fg2: readToken(style, 'fg2'),
    fg3: readToken(style, 'fg3'),
    fg4: readToken(style, 'fg4'),
    gray: readToken(style, 'gray'),
    green: readToken(style, 'green'),
    greenD: readToken(style, 'greenD'),
    aqua: readToken(style, 'aqua'),
    aquaD: readToken(style, 'aquaD'),
    purple: readToken(style, 'purple'),
    purpleD: readToken(style, 'purpleD'),
    yellow: readToken(style, 'yellow'),
    yellowD: readToken(style, 'yellowD'),
    red: readToken(style, 'red'),
    blue: readToken(style, 'blue'),
  }
}

function readToken(style: CSSStyleDeclaration, name: TokenName): string {
  return readCssValue(style, TOKEN_CSS[name]) || PANE_SURFACE
}

function readCssValue(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim()
}

function readFontSize(style: CSSStyleDeclaration, name: string): number {
  const value = Number.parseFloat(readCssValue(style, name))
  return Number.isFinite(value) && value > 0 ? value : 11
}

function parseIsoDay(
  value: string
): { year: number; month: number; day: number } | null {
  const year = Number.parseInt(value.slice(0, 4), 10)
  const month = Number.parseInt(value.slice(5, 7), 10)
  const day = Number.parseInt(value.slice(8, 10), 10)
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  )
    return null
  return { year, month, day }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

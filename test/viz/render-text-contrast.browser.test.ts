import { describe, expect, test } from 'vitest'
import { make2d } from '../canvas-fixture'
import { recordContext, type Call } from '../canvas-recorder'
import { buildClusterTile, renderCluster } from '../../lib/viz/render/cluster'
import {
  createGraphLayer,
  createSpriteAtlas,
  renderGraph,
  type GraphLayer,
} from '../../lib/viz/render/graph'
import {
  createOverviewLayer,
  renderOverview,
} from '../../lib/viz/render/overview'
import {
  createRibbonLayer,
  renderRibbon,
} from '../../lib/viz/render/ribbon'
import {
  createFrameBudget,
  type GridSeries,
  type Quality,
  type RenderMeta,
  type RenderTheme,
  type RenderView,
  type Viewport,
} from '../../lib/viz/render/budget'
import { createSimState } from '../../lib/viz/sim/state'
import {
  DAY_ALIVE,
  ENTITY_FILE,
  ENTITY_REPO,
  type SimInput,
  type SimState,
} from '../../lib/viz/sim/types'
import { AG, LV } from '../../lib/viz/tokens/ramp'
import {
  PANE_SURFACE,
  TOKEN_HEXES,
  isApprovedTextColor,
  worstCaseTextContrast,
} from './contrast-fixture'

/** A recorded `fillText` with the fill style active when it was issued. */
interface TextCommand {
  readonly fill: string | null
  readonly text: string
}

/** Replays a recorded call log, tracking fillStyle through save/restore. */
function textCommands(calls: readonly Call[]): TextCommand[] {
  const commands: TextCommand[] = []
  let fill: string | null = null
  const stack: (string | null)[] = []
  for (const [name, ...args] of calls) {
    if (name === 'set:fillStyle') {
      fill = typeof args[0] === 'string' ? args[0] : fill
      continue
    }
    if (name === 'save') {
      stack.push(fill)
      continue
    }
    if (name === 'restore') {
      fill = stack.pop() ?? fill
      continue
    }
    if (name !== 'fillText') continue
    commands.push({ fill, text: typeof args[0] === 'string' ? args[0] : '' })
  }
  return commands
}

/**
 * The regression's single audit rule: a capture passes only when it recorded
 * at least one text command and every fill clears AA normal text on the pane
 * surface under the measured scanline darkening, with neither forbidden token.
 */
function auditTextCommands(commands: readonly TextCommand[]): string[] {
  if (commands.length === 0) return ['no text commands were recorded']
  const failures: string[] = []
  for (const { fill, text } of commands) {
    if (fill === null) {
      failures.push(`text "${text}" was painted with no fillStyle`)
      continue
    }
    if (fill === TOKEN_HEXES.gray || fill === TOKEN_HEXES.bg4) {
      failures.push(`text "${text}" restored a forbidden token (${fill})`)
      continue
    }
    if (!isApprovedTextColor(fill)) {
      failures.push(
        `text "${text}" uses ${fill} at ${worstCaseTextContrast(fill).toFixed(2)}:1 on the pane surface`
      )
    }
  }
  return failures
}

const INPUT: SimInput = {
  dayCount: 400,
  windowStartISO: '2026-01-01',
  repoCount: 3,
  entityCount: 6,
  kind: Uint8Array.from([
    ENTITY_REPO,
    ENTITY_REPO,
    ENTITY_REPO,
    ENTITY_FILE,
    ENTITY_FILE,
    ENTITY_FILE,
  ]),
  repoOf: Int32Array.from([-1, -1, -1, 0, 0, 2]),
  birthDay: Int32Array.from([0, 0, 0, 0, 0, 0]),
  // Repo 1 dies at day 90 (0 + 90-day dwell tail) so it is ABSENT at day 399;
  // the rest stay alive, giving live, live, and live-private repositories.
  lastTouchDay: Int32Array.from([
    DAY_ALIVE,
    0,
    DAY_ALIVE,
    DAY_ALIVE,
    DAY_ALIVE,
    DAY_ALIVE,
  ]),
}

const GRID: GridSeries = {
  dayCount: INPUT.dayCount,
  windowStartISO: INPUT.windowStartISO,
  total: new Uint16Array([0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 8, 4]),
  agent: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  level: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 3, 2]),
  agentBirthDay: 264,
}

const META: RenderMeta = {
  repos: [
    { short: 'alpha', actor: 0, stars: 1200, isPrivate: false },
    { short: 'beta', actor: 0, stars: 0, isPrivate: false },
    { short: 'gamma', actor: 1, stars: 50, isPrivate: true },
  ],
  fileLabel: (id) => `f-${id}`,
  agentBirthLabel: 'agent-fixture initialized',
  agentBirthSubLabel: 'agent birth sublabel',
  agentBirthDay: 0,
}

/** Full-fidelity render quality so file labels and the cluster blur are on. */
const QUALITY: Quality = {
  name: 'full',
  dpr: 1,
  fileLabels: true,
  spokes: true,
  shadows: true,
  maxFiles: 2000,
  clusterMode: 'blur',
}

function theme(): RenderTheme {
  return {
    lv: LV,
    ag: AG,
    paneSurface: PANE_SURFACE,
    token: TOKEN_HEXES,
    fontPx: { micro: 9, small: 11, mono: 13 },
    fontFamily: 'monospace',
  }
}

function view(width: number, height: number): RenderView {
  const viewport: Viewport = {
    cssWidth: width,
    cssHeight: height,
    dpr: 1,
    pxWidth: width,
    pxHeight: height,
  }
  return {
    viewport,
    theme: theme(),
    quality: QUALITY,
    meta: META,
    budget: createFrameBudget(false),
    focusedDay: -1,
  }
}

function state(): SimState {
  const simulation = createSimState(INPUT, 12345)
  // Hot files so file labels render; heat is a mutable channel, not geometry.
  simulation.heat[3] = 1
  simulation.heat[4] = 0.6
  simulation.heat[5] = 0.8
  return simulation
}

function graphLayer(): GraphLayer {
  const layer = createGraphLayer(INPUT.entityCount)
  layer.sprites = createSpriteAtlas(theme(), 1)
  return layer
}

describe('canvas render text contrast', () => {
  test('overview year markers clear AA on the pane surface', () => {
    const canvas = make2d(530, 300)
    const calls = recordContext(canvas)
    renderOverview(
      state(),
      calls.ctx,
      view(530, 300),
      createOverviewLayer(GRID),
      0
    )
    const texts = textCommands(calls.calls)
    expect(texts.some(({ text }) => /^\d{4}$/.test(text))).toBe(true)
    expect(auditTextCommands(texts)).toEqual([])
  })

  test('ribbon weekday and month labels clear AA on the pane surface', () => {
    const canvas = make2d(530, 300)
    const calls = recordContext(canvas)
    renderRibbon(state(), calls.ctx, view(530, 300), createRibbonLayer(GRID))
    const texts = textCommands(calls.calls)
    for (const weekday of ['sun', 'tue', 'thu', 'sat'])
      expect(texts.some(({ text }) => text === weekday)).toBe(true)
    expect(
      texts.some(({ text }) =>
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(text)
      )
    ).toBe(true)
    expect(auditTextCommands(texts)).toEqual([])
  })

  test('graph labels, star counts, birth sublabel, and cluster clear AA', () => {
    const canvas = make2d(530, 300)
    const calls = recordContext(canvas)
    renderGraph(state(), calls.ctx, view(530, 300), graphLayer())
    const texts = textCommands(calls.calls)
    // Repo 1 died at day 90 and is ABSENT at the day-399 cursor: its label must
    // not render under the appear-on-contribution lifecycle.
    expect(texts.some(({ text }) => text === 'beta')).toBe(false)
    expect(texts.some(({ text }) => text === 'alpha')).toBe(true)
    expect(texts.some(({ text }) => text === 'gamma')).toBe(true)
    // Repository star counts for live repositories.
    expect(texts.some(({ text }) => text.startsWith('★'))).toBe(true)
    // Agent-birth sublabel.
    expect(texts.some(({ text }) => text === 'agent birth sublabel')).toBe(true)
    // Private-cluster path label.
    expect(texts.some(({ text }) => text === 'private repos')).toBe(true)
    expect(auditTextCommands(texts)).toEqual([])
  })

  test('the private-cluster label clears AA through the cluster path directly', () => {
    const canvas = make2d(530, 300)
    const calls = recordContext(canvas)
    const tile = buildClusterTile(theme(), QUALITY, 102, 99)
    const renderView = view(530, 300)
    renderCluster(calls.ctx, tile, 214, 88, renderView, 'private repos')
    const texts = textCommands(calls.calls)
    expect(texts.some(({ text }) => text === 'private repos')).toBe(true)
    expect(auditTextCommands(texts)).toEqual([])
  })

  test('the oracle is not trivially permissive and rejects empty captures', () => {
    // The two forbidden tokens must fail the AA bar even without the scanline.
    expect(worstCaseTextContrast(TOKEN_HEXES.gray)).toBeLessThan(4.5)
    expect(worstCaseTextContrast(TOKEN_HEXES.bg4)).toBeLessThan(4.5)
    expect(isApprovedTextColor(TOKEN_HEXES.gray)).toBe(false)
    expect(isApprovedTextColor(TOKEN_HEXES.bg4)).toBe(false)
    // The approved replacement clears the bar under the worst-case darkening.
    expect(isApprovedTextColor(TOKEN_HEXES.fg4)).toBe(true)
    // An empty capture and a forbidden-token capture both fail the audit.
    expect(auditTextCommands([])).not.toEqual([])
    expect(
      auditTextCommands([{ fill: TOKEN_HEXES.gray, text: 'regressed' }])
    ).not.toEqual([])
    expect(
      auditTextCommands([{ fill: TOKEN_HEXES.fg4, text: 'fine' }])
    ).toEqual([])
  })
})

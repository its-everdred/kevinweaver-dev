import { expect, test } from 'vitest'

import '../../styles/ds/tokens/colors.css'
import {
  createFrameBudget,
  resolveRenderTheme,
  type GridSeries,
  type RenderView,
} from '../../lib/viz/render/budget'
import {
  createGraphLayer,
  createSpriteAtlas,
  renderGraph,
} from '../../lib/viz/render/graph'
import {
  createOverviewLayer,
  renderOverview,
} from '../../lib/viz/render/overview'
import { createRibbonLayer, renderRibbon } from '../../lib/viz/render/ribbon'
import { createSimState } from '../../lib/viz/sim/state'
import { DAY_ALIVE, ENTITY_REPO, type SimInput } from '../../lib/viz/sim/types'
import { make2d } from '../canvas-fixture'
import { recordContext, type Call } from '../canvas-recorder'
import { contrastRatio } from './contrast-fixture'

const SCANLINE_CHANNEL_SCALE = 0.944
const NORMAL_TEXT_MINIMUM = 4.5

const THEME = resolveRenderTheme(document.documentElement)

const INPUT: SimInput = {
  dayCount: 400,
  windowStartISO: '2025-01-01',
  repoCount: 2,
  entityCount: 2,
  kind: Uint8Array.from([ENTITY_REPO, ENTITY_REPO]),
  repoOf: Int32Array.from([-1, -1]),
  birthDay: Int32Array.from([0, 0]),
  lastTouchDay: Int32Array.from([0, DAY_ALIVE]),
}

const GRID: GridSeries = {
  dayCount: INPUT.dayCount,
  windowStartISO: INPUT.windowStartISO,
  total: new Uint16Array(INPUT.dayCount),
  agent: new Uint16Array(INPUT.dayCount),
  level: new Uint8Array(INPUT.dayCount),
  agentBirthDay: 200,
}

function makeView(): RenderView {
  return {
    viewport: {
      cssWidth: 800,
      cssHeight: 400,
      dpr: 1,
      pxWidth: 800,
      pxHeight: 400,
    },
    theme: THEME,
    quality: {
      name: 'dpr1',
      dpr: 1,
      fileLabels: false,
      spokes: false,
      shadows: false,
      maxFiles: 2_000,
      clusterMode: 'hatch',
    },
    meta: {
      repos: [
        { short: 'ghost repo', actor: 0, stars: 0, isPrivate: true },
        { short: 'star repo', actor: 1, stars: 100, isPrivate: false },
      ],
      fileLabel: (entityId) => `file-${entityId}`,
      agentBirthLabel: 'agent birth',
      agentBirthSubLabel: 'agent birth sublabel',
      agentBirthDay: GRID.agentBirthDay,
    },
    budget: createFrameBudget(false),
    focusedDay: -1,
  }
}

function renderTextCalls(): Call[] {
  const state = createSimState(INPUT, 7)
  const view = makeView()
  const recording = recordContext(make2d(800, 400))
  renderOverview(state, recording.ctx, view, createOverviewLayer(GRID), 0)
  renderRibbon(state, recording.ctx, view, createRibbonLayer(GRID))
  const layer = createGraphLayer(INPUT.entityCount)
  layer.sprites = createSpriteAtlas(THEME, 1)
  renderGraph(state, recording.ctx, view, layer)
  return recording.calls
}

interface TextCommand {
  readonly text: string
  readonly color: string
}

class MissingTextCommandsError extends Error {
  constructor() {
    super('no recorded text commands')
    this.name = 'MissingTextCommandsError'
  }
}

class TextContrastError extends Error {
  constructor(text: string, contrast: number) {
    super(`${text} has ${contrast.toFixed(2)}:1 contrast`)
    this.name = 'TextContrastError'
  }
}

function textCommands(calls: readonly Call[]): TextCommand[] {
  const commands: TextCommand[] = []
  let color = ''
  for (const [name, ...args] of calls) {
    if (name === 'set:fillStyle' && typeof args[0] === 'string') color = args[0]
    if (name === 'fillText' && typeof args[0] === 'string') {
      commands.push({ text: args[0], color })
    }
  }
  return commands
}

function assertTextContrast(commands: readonly TextCommand[]): void {
  if (commands.length === 0) throw new MissingTextCommandsError()
  for (const command of commands) {
    const contrast = contrastRatio(
      command.color,
      THEME.paneSurface,
      SCANLINE_CHANNEL_SCALE
    )
    if (contrast < NORMAL_TEXT_MINIMUM) {
      throw new TextContrastError(command.text, contrast)
    }
  }
}

test('canvas text roles clear normal-text contrast on pane surfaces', () => {
  const commands = textCommands(renderTextCalls())
  const text = commands.map((command) => command.text)
  expect(commands.length).toBeGreaterThan(0)
  expect(text.some((value) => /^20\d{2}$/.test(value))).toBe(true)
  expect(text).toEqual(
    expect.arrayContaining([
      'mon',
      'jan',
      'ghost repo',
      '★ 100',
      'agent birth sublabel',
      'private repos',
    ])
  )
  expect(() => assertTextContrast(commands)).not.toThrow()

  const negative = recordContext(make2d())
  negative.ctx.fillStyle = THEME.token.gray
  negative.ctx.fillText('negative control', 0, 0)
  expect(() => assertTextContrast(textCommands(negative.calls))).toThrow(
    TextContrastError
  )
})

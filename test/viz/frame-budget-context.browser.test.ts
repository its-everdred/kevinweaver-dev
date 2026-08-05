import { expect, test } from 'vitest'

import {
  createFrameBudget,
  instrumentContext,
  type FrameReport,
} from '../../lib/viz/render/budget'
import { qualityForTier } from '../../lib/viz/driver'
import {
  createVizDriverRenderLayers,
  renderVizQuality,
} from '../../lib/viz/driver-render'
import { createSimState } from '../../lib/viz/sim/state'
import { DAY_ALIVE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'
import { paintVizSurfaces } from '../../lib/viz/surface-painter'
import { createVizSurfaceController } from '../../lib/viz/surface-controller'
import { make2d } from '../canvas-fixture'
import { createDriverRenderData } from './driver-render-fixture'

const INPUT: SimInput = {
  dayCount: 14,
  windowStartISO: '2026-01-01',
  repoCount: 1,
  entityCount: 1,
  kind: Uint8Array.from([ENTITY_REPO]),
  repoOf: Int32Array.from([-1]),
  birthDay: Int32Array.from([0]),
  lastTouchDay: Int32Array.from([DAY_ALIVE]),
}

const OVERVIEW_GEOMETRY = {
  cssWidth: 120,
  cssHeight: 40,
  deviceWidth: 120,
  deviceHeight: 40,
  dpr: 1,
  font: { micro: 7, small: 9, mono: 13 },
} as const

function paintOverview(context: CanvasRenderingContext2D): {
  readonly total: number
  readonly report: FrameReport | null
} {
  const data = createDriverRenderData(INPUT, ['alpha'])
  data.grid.level.fill(6)
  const layers = createVizDriverRenderLayers(INPUT, data)
  const controller = createVizSurfaceController(layers.budget)
  controller.setCanvas('overview', context)
  controller.setGeometry('overview', OVERVIEW_GEOMETRY)
  const total = paintVizSurfaces(controller, {
    state: createSimState(INPUT, 12345),
    layers,
    quality: renderVizQuality(qualityForTier(0)),
    meta: data.meta,
    focusedDay: 13,
    winStart: 0,
    targets: new Set(['overview'] as const),
    onRibbonPaint: () => undefined,
  })
  const report = layers.budget.last
  controller.destroy()
  return { total, report }
}

test('tracks native filter and shadow state through save and restore', () => {
  const budget = createFrameBudget(false)
  const nativeContext = make2d(8, 8)
  const context = instrumentContext(nativeContext, budget)

  budget.begin()
  context.filter = 'blur(1px)'
  context.shadowBlur = 2
  context.save()
  context.filter = 'none'
  context.shadowBlur = 0
  context.fillRect(0, 0, 1, 1)
  context.restore()
  expect(context.filter).toBe('blur(1px)')
  expect(context.shadowBlur).toBe(2)
  context.fillRect(1, 0, 1, 1)
  const report = budget.end()

  expect(report.drawCalls).toBe(2)
  expect(report.filteredDrawCalls).toBe(1)
  expect(report.shadowPrimitives).toBe(1)
})

test('paints an overview and records draw and text counters', () => {
  const context = make2d(120, 40)
  const { total, report } = paintOverview(context)

  expect(report).not.toBeNull()
  expect(total).toBeGreaterThan(0)
  expect(report?.drawCalls).toBe(total)
  expect(report?.fillTextCalls).toBeGreaterThan(0)
  expect(context.getImageData(1, 28, 1, 1).data[3]).toBeGreaterThan(0)
})

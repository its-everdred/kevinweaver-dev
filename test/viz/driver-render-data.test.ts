import { describe, expect, it } from 'vitest'

import { createVizDriverRenderLayers } from '../../lib/viz/driver-render'
import type { VizDriverRenderData } from '../../lib/viz/driver'
import { DAY_ALIVE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'
import { createDriverRenderData } from './driver-render-fixture'

const INPUT: SimInput = {
  dayCount: 4,
  windowStartISO: '2026-01-01',
  repoCount: 1,
  entityCount: 1,
  kind: Uint8Array.from([ENTITY_REPO]),
  repoOf: Int32Array.from([-1]),
  birthDay: Int32Array.from([0]),
  lastTouchDay: Int32Array.from([DAY_ALIVE]),
}

interface InvalidRenderDataCase {
  readonly name: string
  readonly change: (data: VizDriverRenderData) => VizDriverRenderData
}

const INVALID_RENDER_DATA: readonly InvalidRenderDataCase[] = [
  {
    name: 'grid day count',
    change: (data) => ({
      ...data,
      grid: { ...data.grid, dayCount: INPUT.dayCount - 1 },
    }),
  },
  {
    name: 'grid start',
    change: (data) => ({
      ...data,
      grid: { ...data.grid, windowStartISO: '2026-01-02' },
    }),
  },
  ...(['total', 'agent', 'level'] as const).map((series) => ({
    name: `${series} series length`,
    change: (data: VizDriverRenderData): VizDriverRenderData => ({
      ...data,
      grid: {
        ...data.grid,
        [series]: data.grid[series].slice(1),
      },
    }),
  })),
  {
    name: 'repository count',
    change: (data) => ({
      ...data,
      meta: { ...data.meta, repos: [] },
    }),
  },
  {
    name: 'negative birth day',
    change: (data) => ({
      ...data,
      grid: { ...data.grid, agentBirthDay: -2 },
    }),
  },
  {
    name: 'non-integer birth day',
    change: (data) => ({
      ...data,
      grid: { ...data.grid, agentBirthDay: Number.NaN },
    }),
  },
  {
    name: 'birth day after the window',
    change: (data) => ({
      ...data,
      grid: { ...data.grid, agentBirthDay: INPUT.dayCount },
    }),
  },
  {
    name: 'metadata birth day',
    change: (data) => ({
      ...data,
      meta: { ...data.meta, agentBirthDay: 0 },
    }),
  },
]

describe('viz driver render data', () => {
  it('preserves the supplied contribution grid', () => {
    const data = createDriverRenderData(INPUT, ['alpha'])
    data.grid.total[2] = 7
    data.grid.agent[2] = 3
    data.grid.level[2] = 6

    const layers = createVizDriverRenderLayers(INPUT, data)

    expect(layers.ribbon.grid).toBe(data.grid)
    expect(layers.overview.grid).toBe(data.grid)
    expect(layers.ribbon.grid.total[2]).toBe(7)
    expect(layers.ribbon.grid.agent[2]).toBe(3)
    expect(layers.overview.grid.level[2]).toBe(6)
  })

  it.each(INVALID_RENDER_DATA)('rejects invalid $name', ({ change }) => {
    const data = createDriverRenderData(INPUT, ['alpha'])

    expect(() => createVizDriverRenderLayers(INPUT, change(data))).toThrow(
      RangeError
    )
  })
})

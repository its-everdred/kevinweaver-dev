import { expect, test, vi } from 'vitest'

import type { Ctx2D } from '../../lib/viz/render/budget'
import {
  createVizDriver,
  type VizSurfaceGeometry,
} from '../../lib/viz/driver'
import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'
import { recordContext } from '../canvas-recorder'

vi.mock('../../lib/viz/render/budget', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/viz/render/budget')>()
  return { ...actual, instrumentContext: (ctx: Ctx2D): Ctx2D => ctx }
})

const INPUT: SimInput = {
  dayCount: 400,
  windowStartISO: '2026-01-01',
  repoCount: 1,
  entityCount: 2,
  kind: Uint8Array.from([ENTITY_REPO, ENTITY_FILE]),
  repoOf: Int32Array.from([-1, 0]),
  birthDay: Int32Array.from([0, 2]),
  lastTouchDay: Int32Array.from([DAY_ALIVE, DAY_ALIVE]),
}

const DPR_TWO_GEOMETRY = {
  cssWidth: 530,
  cssHeight: 140,
  deviceWidth: 1060,
  deviceHeight: 280,
  dpr: 2,
  font: { micro: 7, small: 9, mono: 13 },
} satisfies VizSurfaceGeometry

test('normalizes a resized downstream DPR transform at paint time', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = DPR_TWO_GEOMETRY.deviceWidth
  canvas.height = DPR_TWO_GEOMETRY.deviceHeight
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no 2d context')
  const recorded = recordContext(context)
  const driver = createVizDriver({
    input: INPUT,
    repoNames: ['alpha'],
    seed: 1,
  })

  driver.attach({ id: 'ribbon', ctx: recorded.ctx, geometry: DPR_TWO_GEOMETRY })
  canvas.width = 1080
  canvas.height = 300
  recorded.ctx.setTransform(2, 0, 0, 2, 0, 0)
  driver.resize('ribbon', {
    ...DPR_TWO_GEOMETRY,
    cssWidth: 540,
    cssHeight: 150,
    deviceWidth: 1080,
    deviceHeight: 300,
  })
  await driver.renderFrame(0)
  driver.setPointer('ribbon', { x: 528, y: 59 })

  const clearIndex = recorded.calls
    .map((call, index) => ({ call, index }))
    .reverse()
    .find(({ call }) => call[0] === 'clearRect')?.index
  if (clearIndex === undefined) throw new Error('ribbon did not clear')
  const transform = recorded.calls
    .slice(0, clearIndex)
    .filter(([name]) => name === 'setTransform')
    .at(-1)
  expect(transform).toEqual(['setTransform', 1, 0, 0, 1, 0, 0])
  expect(recorded.calls).toContainEqual(['clearRect', 0, 0, 1080, 300])
  expect(recorded.calls).toContainEqual(['set:font', '600 14px monospace'])
  expect(recorded.ctx.getImageData(1055, 116, 1, 1).data[3]).toBeGreaterThan(0)
  expect(driver.inspect().highlightCell?.week).toBe(52)

  driver.destroy()
})

test('does not schedule while adapter cleanup detaches surfaces', () => {
  let requests = 0
  vi.stubGlobal('requestAnimationFrame', () => ++requests)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no 2d context')
  const driver = createVizDriver({
    input: INPUT,
    repoNames: ['alpha'],
    seed: 1,
  })

  driver.attach({ id: 'ribbon', ctx: context, geometry: DPR_TWO_GEOMETRY })
  const beforeDestroy = requests
  driver.destroy()

  expect(requests).toBe(beforeDestroy)
  vi.unstubAllGlobals()
})

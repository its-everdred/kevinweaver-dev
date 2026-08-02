import { expect, test, vi } from 'vitest'

import type { Ctx2D } from '../../lib/viz/render/budget'
import {
  createVizDriver,
  highlightCellFor,
  type VizSurfaceGeometry,
} from '../../lib/viz/driver'
import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'
import { recordContext } from '../canvas-recorder'

vi.mock('../../lib/viz/render/budget', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/viz/render/budget')>()
  return {
    ...actual,
    instrumentContext: (ctx: Ctx2D): Ctx2D => ctx,
  }
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

const PUBLISHED_RIBBON_GEOMETRY = {
  cssWidth: 530,
  cssHeight: 140,
  dpr: 1,
  deviceWidth: 530,
  deviceHeight: 140,
  font: { micro: 7, small: 9, mono: 13 },
} satisfies VizSurfaceGeometry

function createContext(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('no 2d context')
  return recordContext(ctx)
}

function createDriver() {
  return createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 12345 })
}

test('renders a ribbon using attached device geometry and fonts', async () => {
  const recorded = createContext(530, 140)
  const driver = createDriver()

  driver.attach({
    id: 'ribbon',
    ctx: recorded.ctx,
    geometry: PUBLISHED_RIBBON_GEOMETRY,
  })
  driver.setViewport('ribbon', { cssWidth: 530, cssHeight: 140, dpr: 1 })
  await driver.renderFrame(0)
  driver.setPointer('ribbon', { x: 42, y: 22 })

  expect(recorded.ctx.getImageData(402, 22, 1, 1).data[3]).toBeGreaterThan(0)
  expect(recorded.calls).toContainEqual(['clearRect', 0, 0, 530, 140])
  expect(
    recorded.calls.some(
      ([name, value]) => name === 'set:font' && value === '600 7px monospace'
    )
  ).toBe(true)
  expect(driver.inspect().highlightCell).toEqual(
    highlightCellFor(INPUT, 31, 31)
  )

  driver.resize('ribbon', {
    ...PUBLISHED_RIBBON_GEOMETRY,
    cssWidth: 260,
    cssHeight: 100,
    deviceWidth: 260,
    deviceHeight: 100,
  })
  await driver.renderFrame(0)
  expect(recorded.calls).toContainEqual(['clearRect', 0, 0, 260, 100])
  driver.setPointer('ribbon', { x: 38, y: 20 })
  expect(driver.inspect().highlightCell).toEqual(
    highlightCellFor(INPUT, 31, 31)
  )

  driver.destroy()
})

test('replaces and detaches a surface context', async () => {
  const first = createContext(530, 140)
  const second = createContext(530, 140)
  const driver = createDriver()

  driver.attach({
    id: 'ribbon',
    ctx: first.ctx,
    geometry: PUBLISHED_RIBBON_GEOMETRY,
  })
  await driver.renderFrame(0)
  expect(first.calls.some(([name]) => name === 'fillRect')).toBe(true)

  const firstCallsBeforeReplacement = first.calls.length
  driver.attach({
    id: 'ribbon',
    ctx: second.ctx,
    geometry: PUBLISHED_RIBBON_GEOMETRY,
  })
  await driver.renderFrame(0)
  expect(second.calls.some(([name]) => name === 'fillRect')).toBe(true)
  expect(first.calls).toHaveLength(firstCallsBeforeReplacement)

  driver.setPointer('ribbon', { x: 42, y: 22 })
  expect(driver.inspect().highlightCell).toEqual(
    highlightCellFor(INPUT, 31, 31)
  )
  const callsBeforeDetach = second.calls.length
  driver.detach('ribbon')
  expect(driver.inspect().highlightCell).toBeNull()
  driver.attach({
    id: 'ribbon',
    ctx: second.ctx,
    geometry: PUBLISHED_RIBBON_GEOMETRY,
  })
  expect(driver.inspect().highlightCell).toBeNull()
  await driver.renderFrame(0)
  expect(second.calls.length).toBeGreaterThan(callsBeforeDetach)

  const callsBeforeDestroy = second.calls.length
  driver.destroy()
  await driver.renderFrame(0)
  expect(second.calls).toHaveLength(callsBeforeDestroy)
})

test('coalesces invalidation into the dirty surface paint', () => {
  let runPaint: FrameRequestCallback | undefined
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    runPaint = callback
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const ribbon = createContext(530, 140)
  const overview = createContext(120, 40)
  const driver = createDriver()
  const overviewGeometry = {
    ...PUBLISHED_RIBBON_GEOMETRY,
    cssWidth: 120,
    cssHeight: 40,
    deviceWidth: 120,
    deviceHeight: 40,
  }

  driver.attach({
    id: 'ribbon',
    ctx: ribbon.ctx,
    geometry: PUBLISHED_RIBBON_GEOMETRY,
  })
  driver.attach({
    id: 'overview',
    ctx: overview.ctx,
    geometry: overviewGeometry,
  })
  runPaint?.(0)
  expect(overview.calls.some(([name]) => name === 'clearRect')).toBe(true)
  ribbon.calls.length = 0
  overview.calls.length = 0
  driver.invalidate('ribbon')
  runPaint?.(0)

  expect(ribbon.calls.some(([name]) => name === 'clearRect')).toBe(true)
  expect(overview.calls).toEqual([])

  driver.play()
  driver.invalidate('ribbon')
  driver.pause()
  ribbon.calls.length = 0
  overview.calls.length = 0
  runPaint?.(0)
  expect(ribbon.calls.some(([name]) => name === 'clearRect')).toBe(true)
  expect(overview.calls).toEqual([])
  ribbon.calls.length = 0
  overview.calls.length = 0
  driver.invalidate('overview')
  runPaint?.(0)

  expect(ribbon.calls).toEqual([])
  expect(overview.calls.some(([name]) => name === 'clearRect')).toBe(true)

  driver.destroy()
  vi.unstubAllGlobals()
})

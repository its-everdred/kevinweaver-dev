import { expect, test, vi } from 'vitest'

import { createVizDriver, highlightCellFor } from '../../lib/viz/driver'
import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'
import { createDriverOptions } from './driver-render-fixture'

const INPUT: SimInput = {
  dayCount: 12,
  windowStartISO: '2026-01-01',
  repoCount: 1,
  entityCount: 2,
  kind: Uint8Array.from([ENTITY_REPO, ENTITY_FILE]),
  repoOf: Int32Array.from([-1, 0]),
  birthDay: Int32Array.from([0, 2]),
  lastTouchDay: Int32Array.from([DAY_ALIVE, DAY_ALIVE]),
}

test('coalesces pointer invalidation through the driver', () => {
  let runPaint: (() => void) | undefined
  let requests = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    requests += 1
    runPaint = () => callback(0)
    return requests
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const driver = createVizDriver(createDriverOptions(INPUT, ['alpha'], 12345))
  let paints = 0
  const unsubscribe = driver.subscribe(() => {
    paints += 1
  })

  driver.resize('ribbon', {
    cssWidth: 530,
    cssHeight: 140,
    dpr: 1,
    deviceWidth: 530,
    deviceHeight: 140,
    font: { micro: 7, small: 9, mono: 13 },
  })
  runPaint?.()
  requests = 0
  paints = 0
  driver.setPointer('ribbon', { x: 42, y: 58 })
  driver.invalidate('ribbon')
  driver.invalidate('ribbon')

  expect(requests).toBe(1)
  expect(paints).toBe(0)
  expect(driver.inspect().highlightCell).toEqual(highlightCellFor(INPUT, 0, -4))
  driver.setPointer('ribbon', null)
  expect(driver.inspect().highlightCell).toBeNull()
  runPaint?.()
  expect(paints).toBe(1)

  unsubscribe()
  driver.destroy()
  vi.unstubAllGlobals()
})

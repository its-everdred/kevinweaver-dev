import { expect, test, vi } from 'vitest'

import { createVizDriver } from '../../lib/viz/driver'
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

function runFrames(
  callbacks: Map<number, FrameRequestCallback>,
  count: number,
  advanceClock: () => void
): void {
  for (let id = 1; id <= count; id++) {
    const callback = callbacks.get(id)
    callbacks.delete(id)
    callback?.(0)
    advanceClock()
  }
}

function createTimedDriver(paintCost: number) {
  const callbacks = new Map<number, FrameRequestCallback>()
  let clock = 0
  let nextId = 0
  vi.stubGlobal('performance', { now: () => clock })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextId
    callbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  const driver = createVizDriver(createDriverOptions(INPUT, ['alpha'], 1))
  driver.subscribe(() => {
    clock += paintCost
  })
  driver.play()
  return { driver, callbacks, advanceClock: () => (clock += 16) }
}

test('keeps fast frames high quality', () => {
  const timed = createTimedDriver(1)

  runFrames(timed.callbacks, 31, timed.advanceClock)

  expect(timed.driver.inspect().qualityTier).toBe(0)
  timed.driver.destroy()
  vi.unstubAllGlobals()
})

test('downgrades sustained slow frames', () => {
  const timed = createTimedDriver(20)

  runFrames(timed.callbacks, 31, timed.advanceClock)

  expect(timed.driver.inspect().qualityTier).toBe(1)
  timed.driver.destroy()
  vi.unstubAllGlobals()
})

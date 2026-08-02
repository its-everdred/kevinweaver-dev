import { expect, test, vi } from 'vitest'

import { createVizDriver } from '../../lib/viz/driver'
import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'

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

test('rearms a dirty paint after a canceled first animation frame', () => {
  let latest: FrameRequestCallback | undefined
  let requests = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    latest = callback
    requests += 1
    return requests
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const driver = createVizDriver({
    input: INPUT,
    repoNames: ['alpha'],
    seed: 1,
  })
  let paints = 0
  const unsubscribe = driver.subscribe(() => {
    paints += 1
  })

  driver.invalidate('ribbon')
  driver.play()
  driver.pause()
  latest?.(0)

  expect(paints).toBe(1)
  const requestsBeforeDestroy = requests
  driver.destroy()
  expect(requests).toBe(requestsBeforeDestroy)

  unsubscribe()
  vi.unstubAllGlobals()
})

test.each(['pause', 'destroy'] as const)(
  'does not queue after a subscriber calls %s',
  (action) => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })
    driver.subscribe(() => driver[action]())

    driver.play()
    callbacks[0]?.(0)

    expect(callbacks).toHaveLength(1)
    driver.destroy()
    vi.unstubAllGlobals()
  }
)

test('keeps one frame when a subscriber pauses then plays', () => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextId
    callbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })
  let replay = true
  driver.subscribe(() => {
    if (!replay) return
    replay = false
    void driver.pause()
    driver.play()
  })

  driver.play()
  const callback = callbacks.get(1)
  callbacks.delete(1)
  callback?.(0)

  expect(callbacks).toHaveLength(1)
  driver.destroy()
  vi.unstubAllGlobals()
})

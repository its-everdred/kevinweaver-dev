import { expect, test, vi } from 'vitest'

import {
  bindVizTransport,
  createVizDriver,
  getVizTransport,
} from '../../lib/viz/driver'
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

class MediaChangeEvent extends Event {
  constructor(readonly matches: boolean) {
    super('change')
  }
}

class FakeMediaQuery extends EventTarget {
  #matches: boolean

  constructor(matches = true) {
    super()
    this.#matches = matches
  }

  get matches(): boolean {
    return this.#matches
  }
  setMatches(matches: boolean): void {
    this.#matches = matches
    this.dispatchEvent(new MediaChangeEvent(matches))
  }
}

test('publishes reduced-motion removal without starting animation', () => {
  const media = new FakeMediaQuery()
  let requests = 0
  vi.stubGlobal('window', { matchMedia: () => media })
  vi.stubGlobal('requestAnimationFrame', () => ++requests)
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })
  const unbind = bindVizTransport(driver, { dayCount: INPUT.dayCount })
  const cursor = driver.inspect().cursorDayInt

  media.setMatches(false)

  expect(driver.inspect()).toMatchObject({ reducedMotion: false, cursorDayInt: cursor })
  expect(getVizTransport().getSnapshot().reducedMotion).toBe(false)
  expect(requests).toBe(0)

  unbind()
  driver.destroy()
  vi.unstubAllGlobals()
})

test('replaces a pending invalidation with one resumed animation frame', () => {
  const media = new FakeMediaQuery(false)
  const active = new Set<number>()
  let nextId = 0
  vi.stubGlobal('window', { matchMedia: () => media })
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })

  driver.invalidate('ribbon')
  driver.play()
  media.setMatches(true)
  media.setMatches(false)

  expect(active).toEqual(new Set([nextId]))
  driver.destroy()
  expect(active).toEqual(new Set())
  vi.unstubAllGlobals()
})

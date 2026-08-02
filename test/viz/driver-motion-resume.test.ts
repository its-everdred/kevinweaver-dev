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
  #matches = false

  get matches(): boolean {
    return this.#matches
  }
  setMatches(matches: boolean): void {
    this.#matches = matches
    this.dispatchEvent(new MediaChangeEvent(matches))
  }
}

test('resumes one frame with the selected speed', () => {
  const media = new FakeMediaQuery()
  const { active, driver, nextId } = scheduledDriver(media)
  driver.invalidate('ribbon')
  driver.play()
  driver.setSpeedIndex(4)
  const unbind = bindVizTransport(driver, { dayCount: INPUT.dayCount })

  media.setMatches(true)
  expect(driver.inspect()).toMatchObject({ playing: false, speedIndex: 4 })
  media.setMatches(false)

  expect(active).toEqual(new Set([nextId()]))
  expect(driver.inspect()).toMatchObject({
    playing: true,
    reducedMotion: false,
    speedIndex: 4,
  })
  expect(getVizTransport().getSnapshot()).toMatchObject({
    playing: true,
    reducedMotion: false,
  })
  unbind()
  driver.destroy()
  expect(active).toEqual(new Set())
  vi.unstubAllGlobals()
})

test.each(['pause', 'destroy'] as const)(
  'does not resume after a subscriber calls %s',
  (action) => {
    const media = new FakeMediaQuery()
    let requests = 0
    stubWindow(media)
    vi.stubGlobal('requestAnimationFrame', () => ++requests)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const driver = createVizDriver({
      input: INPUT,
      repoNames: ['alpha'],
      seed: 1,
    })
    driver.subscribe((info) => {
      if (!info.reducedMotion) driver[action]()
    })

    driver.play()
    media.setMatches(true)
    media.setMatches(false)

    expect(requests).toBe(1)
    driver.destroy()
    vi.unstubAllGlobals()
  }
)

function scheduledDriver(media: FakeMediaQuery) {
  const active = new Set<number>()
  let id = 0
  stubWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => {
    active.add(++id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (value: number) => active.delete(value))
  const driver = createVizDriver({
    input: INPUT,
    repoNames: ['alpha'],
    seed: 1,
  })
  return { active, driver, nextId: () => id }
}

function stubWindow(media: FakeMediaQuery): void {
  vi.stubGlobal('window', {
    location: { search: '' },
    matchMedia: () => media,
  })
}

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

function stubWindow(media: FakeMediaQuery): void {
  vi.stubGlobal('window', {
    location: { search: '' },
    matchMedia: () => media,
  })
}

test('publishes reduced-motion removal without starting animation', () => {
  const media = new FakeMediaQuery()
  let requests = 0
  stubWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => ++requests)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
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

test('suppresses automatic start but permits explicit reduced-motion play', () => {
  const media = new FakeMediaQuery()
  let requests = 0
  stubWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => ++requests)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })

  driver.start()
  expect(requests).toBe(0)
  driver.play()
  expect(requests).toBe(1)

  driver.destroy()
  vi.unstubAllGlobals()
})

test('replaces a pending invalidation with one resumed animation frame', () => {
  const media = new FakeMediaQuery(false)
  const active = new Set<number>()
  let nextId = 0
  stubWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })

  driver.invalidate('ribbon')
  driver.play()
  const unbind = bindVizTransport(driver, { dayCount: INPUT.dayCount })
  media.setMatches(true)
  media.setMatches(false)

  expect(active).toEqual(new Set([nextId]))
  expect(driver.inspect()).toMatchObject({ playing: true, reducedMotion: false })
  expect(getVizTransport().getSnapshot()).toMatchObject({
    playing: true,
    reducedMotion: false,
  })
  unbind()
  driver.destroy()
  expect(active).toEqual(new Set())
  vi.unstubAllGlobals()
})

test('does not resume twice after explicit reduced-motion play', () => {
  const media = new FakeMediaQuery(false)
  const active = new Set<number>()
  let nextId = 0
  stubWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })

  driver.play()
  media.setMatches(true)
  driver.play()
  media.setMatches(false)

  expect(active).toEqual(new Set([nextId]))
  driver.destroy()
  expect(active).toEqual(new Set())
  vi.unstubAllGlobals()
})

test('does not resume after an explicit reduced-motion pause', () => {
  const media = new FakeMediaQuery(false)
  const active = new Set<number>()
  let nextId = 0
  stubWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })

  driver.play()
  media.setMatches(true)
  void driver.pause()
  media.setMatches(false)

  expect(active).toEqual(new Set())
  expect(driver.inspect()).toMatchObject({ playing: false, reducedMotion: false })
  driver.destroy()
  vi.unstubAllGlobals()
})

test.each(['pause', 'destroy'] as const)(
  'does not resume after a subscriber calls %s',
  (action) => {
    const media = new FakeMediaQuery(false)
    let requests = 0
    stubWindow(media)
    vi.stubGlobal('requestAnimationFrame', () => ++requests)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const driver = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })
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

import { expect, test, vi } from 'vitest'

import {
  bindVizTransport,
  createVizDriver,
  getVizTransport,
} from '../../lib/viz/driver'
import {
  FakeMediaQuery,
  MOTION_INPUT as INPUT,
  stubMotionWindow,
} from './driver-motion-fixture'
import { createDriverOptions } from './driver-render-fixture'

test('publishes reduced-motion removal without starting animation', () => {
  const media = new FakeMediaQuery()
  let requests = 0
  stubMotionWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => ++requests)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const driver = createVizDriver(createDriverOptions(INPUT, ['alpha'], 1))
  const unbind = bindVizTransport(driver, { dayCount: INPUT.dayCount })
  const cursor = driver.inspect().cursorDayInt

  media.setMatches(false)

  expect(driver.inspect()).toMatchObject({
    reducedMotion: false,
    cursorDayInt: cursor,
  })
  expect(getVizTransport().getSnapshot().reducedMotion).toBe(false)
  expect(requests).toBe(0)

  unbind()
  driver.destroy()
  vi.unstubAllGlobals()
})

test('suppresses automatic start but permits explicit reduced-motion play', () => {
  const media = new FakeMediaQuery()
  let requests = 0
  stubMotionWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => ++requests)
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  const driver = createVizDriver(createDriverOptions(INPUT, ['alpha'], 1))

  driver.start()
  expect(requests).toBe(0)
  driver.play()
  expect(requests).toBe(1)

  driver.destroy()
  vi.unstubAllGlobals()
})

test('does not resume twice after explicit reduced-motion play', () => {
  const media = new FakeMediaQuery(false)
  const active = new Set<number>()
  let nextId = 0
  stubMotionWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver(createDriverOptions(INPUT, ['alpha'], 1))

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
  stubMotionWindow(media)
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver(createDriverOptions(INPUT, ['alpha'], 1))

  driver.play()
  media.setMatches(true)
  void driver.pause()
  media.setMatches(false)

  expect(active).toEqual(new Set())
  expect(driver.inspect()).toMatchObject({
    playing: false,
    reducedMotion: false,
  })
  driver.destroy()
  vi.unstubAllGlobals()
})

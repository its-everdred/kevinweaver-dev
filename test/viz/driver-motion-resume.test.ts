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

test('resumes one frame with the selected speed', () => {
  const media = new FakeMediaQuery(false)
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
    const media = new FakeMediaQuery(false)
    let requests = 0
    stubMotionWindow(media)
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
  stubMotionWindow(media)
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

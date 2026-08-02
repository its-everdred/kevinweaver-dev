import { describe, expect, it, vi } from 'vitest'

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

function createDriver() {
  return createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 12345 })
}

describe('viz driver adapters', () => {
  it('keeps the inert transport snapshot stable before binding', () => {
    const transport = getVizTransport()
    const first = transport.getSnapshot()
    transport.toggle()
    transport.seekToDay(4)
    transport.setSpeedIndex(3)
    expect(transport.getServerSnapshot()).toBe(first)
    expect(transport.getSnapshot()).toBe(first)
    expect(first).toMatchObject({ ready: false, dayCount: 0, playing: false })
  })

  it('binds payload metadata and only notifies for visible changes', async () => {
    const driver = createDriver()
    const transport = getVizTransport()
    const unbind = bindVizTransport(driver, {
      generatedAt: '2026-01-12T00:00:00Z',
      windowStartISO: '2026-01-01',
      windowEndISO: '2026-01-12',
      dayStart: 0,
      dayEnd: 11,
      birthDayIndex: 2,
    })
    const bound = transport.getSnapshot()
    let notifications = 0
    const unsubscribe = transport.subscribe(() => {
      notifications += 1
    })

    expect(bound).toMatchObject({
      ready: true,
      dayCount: 12,
      generatedAt: '2026-01-12T00:00:00Z',
      windowStartLabel: '2026',
      birthDayIndex: 2,
    })
    expect(transport.getSnapshot()).toBe(bound)

    await driver.renderFrame(0)
    notifications = 0
    await driver.renderFrame(0)

    expect(notifications).toBe(0)
    expect(transport.getSnapshot()).toBe(bound)

    transport.seekToDay(-10)
    expect(transport.getSnapshot().dayIndex).toBe(0)
    transport.setSpeedIndex(99)
    expect(transport.getSnapshot().speedIndex).toBe(4)

    driver.scrubTo(1)
    expect(transport.getSnapshot().dayIndex).toBe(11)
    driver.scrubTo(-1)
    expect(transport.getSnapshot().dayIndex).toBe(0)

    notifications = 0
    unbind()

    expect(notifications).toBe(1)
    expect(transport.getSnapshot()).toBe(transport.getServerSnapshot())
    unbind()
    expect(notifications).toBe(1)

    unsubscribe()
    driver.destroy()
  })

  it('restores the inert transport when its bound driver is destroyed', () => {
    const driver = createDriver()
    const transport = getVizTransport()
    bindVizTransport(driver, {
      generatedAt: null,
      windowStartISO: '2026-01-01',
      windowEndISO: '2026-01-12',
      dayCount: 12,
      birthDayIndex: -1,
    })
    let notifications = 0
    const unsubscribe = transport.subscribe(() => {
      notifications += 1
    })

    driver.destroy()

    expect(notifications).toBe(1)
    expect(transport.getSnapshot().ready).toBe(false)
    unsubscribe()
  })

  it('updates a transport snapshot when a same-year binding changes date', () => {
    const firstDriver = createDriver()
    const firstUnbind = bindVizTransport(firstDriver, { dayCount: 12 })
    const first = getVizTransport().getSnapshot()
    const laterDriver = createVizDriver({
      input: { ...INPUT, windowStartISO: '2026-02-01' },
      repoNames: ['alpha'],
      seed: 12345,
    })
    const laterUnbind = bindVizTransport(laterDriver, { dayCount: 12 })
    const later = getVizTransport().getSnapshot()

    expect(later).not.toBe(first)
    expect(later.dateLabel).not.toBe(first.dateLabel)
    expect(later.dateLabel).toMatch(/feb 2026$/)

    firstUnbind()
    laterUnbind()
    firstDriver.destroy()
    laterDriver.destroy()
  })

  it('toggles from the driver state before another paint', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const driver = createDriver()
    await driver.seekDay(0)
    const unbind = bindVizTransport(driver, { dayCount: 12 })
    const transport = getVizTransport()

    transport.toggle()
    transport.toggle()

    expect(driver.state.playing).toBe(false)

    unbind()
    driver.destroy()
    vi.unstubAllGlobals()
  })
})

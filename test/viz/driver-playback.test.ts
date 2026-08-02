import { expect, test, vi } from 'vitest'

import { createVizDriver, DWELL_TICKS } from '../../lib/viz/driver'
import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'

const INPUT: SimInput = {
  dayCount: 80,
  windowStartISO: '2026-01-01',
  repoCount: 1,
  entityCount: 2,
  kind: Uint8Array.from([ENTITY_REPO, ENTITY_FILE]),
  repoOf: Int32Array.from([-1, 0]),
  birthDay: Int32Array.from([0, 2]),
  lastTouchDay: Int32Array.from([DAY_ALIVE, 40]),
}

test('preserves active playback and speed through a consumer seek', async () => {
  const { active, driver } = scheduledDriver()

  driver.play()
  driver.setSpeedIndex(3)
  await driver.seekDay(4)

  expect(driver.inspect()).toMatchObject({ playing: true, speedIndex: 3 })
  expect(active.size).toBe(1)
  cleanup(driver)
})

test('does not report playback after a paused manual render', async () => {
  const driver = createVizDriver({
    input: INPUT,
    repoNames: ['alpha'],
    seed: 1,
  })

  driver.setSpeedIndex(3)
  await driver.pause()
  const frame = await driver.renderFrame(DWELL_TICKS + 95)

  expect(frame).toMatchObject({ playing: false, speedIndex: 3 })
  expect(frame.cursorDayInt).toBeLessThan(INPUT.dayCount - 1)
  expect(frame.beams).toBeGreaterThan(0)
  driver.destroy()
})

test('advances farther at faster playback speeds', async () => {
  const slow = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })
  const fast = createVizDriver({ input: INPUT, repoNames: ['alpha'], seed: 1 })

  slow.setSpeedIndex(0)
  fast.setSpeedIndex(4)
  const slowFrame = await slow.renderFrame(DWELL_TICKS + 120)
  const fastFrame = await fast.renderFrame(DWELL_TICKS + 120)

  expect(slowFrame.cursorDay).toBeCloseTo(INPUT.dayCount - 1 - 4)
  expect(fastFrame.cursorDay).toBeCloseTo(INPUT.dayCount - 1 - 32)
  slow.destroy()
  fast.destroy()
})

test.each(['seek', 'reset'] as const)(
  'stops active playback after a direct %s',
  async (action) => {
    const { active, driver } = scheduledDriver()
    const defaultSpeedIndex = driver.inspect().speedIndex
    driver.play()
    driver.setSpeedIndex(3)

    if (action === 'seek') await driver.seekTick(4)
    else driver.reset()

    expect(driver.inspect()).toMatchObject({
      playing: false,
      speedIndex: defaultSpeedIndex,
    })
    expect(active).toEqual(new Set())
    cleanup(driver)
  }
)

function scheduledDriver() {
  const active = new Set<number>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', () => {
    const id = ++nextId
    active.add(id)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => active.delete(id))
  const driver = createVizDriver({
    input: INPUT,
    repoNames: ['alpha'],
    seed: 1,
  })
  return { active, driver }
}

function cleanup(driver: ReturnType<typeof createVizDriver>): void {
  driver.destroy()
  vi.unstubAllGlobals()
}

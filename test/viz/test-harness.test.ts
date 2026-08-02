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

class FakeMediaQuery extends EventTarget {
  get matches(): boolean {
    return false
  }
}

function stubTestWindow(): void {
  const media = new FakeMediaQuery()
  vi.stubGlobal('window', {
    location: { search: '?viz-test=1' },
    matchMedia: () => media,
  })
}

function createDriver() {
  return createVizDriver(createDriverOptions(INPUT, ['alpha'], 1))
}

test('does not install a harness after its driver is destroyed', async () => {
  stubTestWindow()
  const driver = createDriver()
  driver.destroy()

  await vi.dynamicImportSettled()

  expect(window.__viz).toBeUndefined()
  vi.unstubAllGlobals()
})

test('does not remove a newer driver harness during old cleanup', async () => {
  stubTestWindow()
  const first = createDriver()
  await vi.dynamicImportSettled()
  const second = createDriver()
  await vi.dynamicImportSettled()
  const newerHarness = window.__viz

  first.destroy()

  expect(window.__viz).toBe(newerHarness)
  second.destroy()
  vi.unstubAllGlobals()
})

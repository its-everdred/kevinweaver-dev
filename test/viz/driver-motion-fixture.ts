import { vi } from 'vitest'

import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO } from '../../lib/viz/sim/types'
import type { SimInput } from '../../lib/viz/sim/types'

export const MOTION_INPUT: SimInput = {
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

/**
 * @description Controllable reduced-motion media query for driver lifecycle tests.
 */
export class FakeMediaQuery extends EventTarget {
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

/**
 * @description Installs a minimal window whose motion query uses the supplied fixture.
 * @param media Controllable media-query fixture returned by matchMedia.
 */
export function stubMotionWindow(media: FakeMediaQuery): void {
  vi.stubGlobal('window', {
    location: { search: '' },
    matchMedia: () => media,
  })
}

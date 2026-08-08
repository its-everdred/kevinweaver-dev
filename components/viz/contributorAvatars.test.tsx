import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UniverseActor } from '@/packages/aiur-galaxy/src/types'
import { loadContributorAvatars } from './contributorAvatars'

/** Every image the loader asked for, so a test can settle them by hand. */
const requested: FakeImage[] = []

/**
 * jsdom fetches no subresources, so `onload` would never fire against a real
 * `Image`. This records the request and leaves the settling to the test.
 */
class FakeImage {
  src = ''
  decoding = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    requested.push(this)
  }
}

function stubImages(): void {
  requested.length = 0
  vi.stubGlobal('Image', FakeImage)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadContributorAvatars', () => {
  it('asks for one avatar per actor, from the files the site serves', () => {
    stubImages()
    loadContributorAvatars(() => undefined)
    expect(requested.map((image) => image.src)).toEqual([
      '/images/its-everdred.png',
      '/images/its-applekid.jpg',
    ])
  })

  it('hands each decoded image to the actor that asked for it', () => {
    stubImages()
    const painted: UniverseActor[] = []
    loadContributorAvatars((actor) => painted.push(actor))
    for (const image of requested) image.onload?.()
    expect(painted).toEqual([0, 1])
  })

  it('leaves the other node alone when one avatar fails to load', () => {
    stubImages()
    const painted: UniverseActor[] = []
    loadContributorAvatars((actor) => painted.push(actor))
    // A 404, a corrupt file, or an offline visitor: an avatar is decoration,
    // and the galaxy has to render without it rather than throw or blank.
    expect(() => requested[0]?.onerror?.()).not.toThrow()
    requested[1]?.onload?.()
    expect(painted).toEqual([1])
  })

  it('drops an image that arrives after the scene has gone', () => {
    stubImages()
    const painted: UniverseActor[] = []
    const stop = loadContributorAvatars((actor) => painted.push(actor))
    stop()
    for (const image of requested) image.onload?.()
    expect(painted).toEqual([])
  })
})

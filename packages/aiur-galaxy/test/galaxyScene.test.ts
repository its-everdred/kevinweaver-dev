import { describe, expect, it } from 'vitest'

import { buildGalaxyPoints } from '../src/galaxyScene'
import { layoutUniverse } from '../src/galaxy'
import type { UniverseSnapshot } from '../src/types'

const SNAPSHOT: UniverseSnapshot = {
  repos: [
    { id: 0, name: 'a/r1', files: ['a.ts', 'b.ts', 'c.ts'] },
    { id: 1, name: 'a/r2', files: ['d.ts'] },
  ],
  contributions: [
    { step: 0, repo: 0, file: 'a.ts', actor: 0 },
    { step: 0, repo: 1, file: 'd.ts', actor: 1 },
  ],
  stepCount: 1,
}

const THEME = {
  background: 0x1d2021,
  star: 0x5c6370,
  liveStar: 0x81a1c1,
  currentStar: 0x98c379,
  contributor: 0x61afef,
  agent: 0xc678dd,
  label: 0xd8dee9,
}

describe('buildGalaxyPoints', () => {
  it('creates one point vertex per file in the galaxy', () => {
    const layout = layoutUniverse(SNAPSHOT)
    const points = buildGalaxyPoints(layout, 0, THEME)
    const position = points.geometry.getAttribute('position')
    const color = points.geometry.getAttribute('color')
    expect(position.count).toBe(3)
    expect(color.count).toBe(3)
    const material = points.material as unknown as {
      transparent: boolean
      blending: number
      dispose: () => void
    }
    expect(material.transparent).toBe(true)
    expect(material.blending === 2).toBe(true) // AdditiveBlending
    points.geometry.dispose()
    material.dispose()
  })

  it('throws for an out-of-range galaxy index', () => {
    const layout = layoutUniverse(SNAPSHOT)
    expect(() => buildGalaxyPoints(layout, 99, THEME)).toThrow(RangeError)
  })
})

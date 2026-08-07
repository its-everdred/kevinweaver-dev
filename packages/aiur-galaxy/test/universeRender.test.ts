import { describe, expect, it } from 'vitest'

import { layoutUniverse } from '../src/galaxy'
import { resolveContributors } from '../src/contributors'
import { universeFrame } from '../src/universePlayback'
import type { UniverseSnapshot } from '../src/types'

const SNAPSHOT: UniverseSnapshot = {
  repos: [
    { id: 0, name: 'a/r1', files: ['a.ts', 'b.ts'] },
    { id: 1, name: 'a/r2', files: ['c.ts', 'd.ts'] },
  ],
  contributions: [
    { step: 0, repo: 0, file: 'a.ts', actor: 0 },
    { step: 0, repo: 1, file: 'c.ts', actor: 1 },
    { step: 1, repo: 0, file: 'b.ts', actor: 0 },
  ],
  stepCount: 2,
}


describe('resolveContributors', () => {
  it('returns one node per actor that contributed on the step', () => {
    const layout = layoutUniverse(SNAPSHOT)
    const frame = universeFrame(SNAPSHOT, 0, 'forward')
    const contributors = resolveContributors(layout, frame)
    expect(contributors.map((c) => c.actor).sort()).toEqual([0, 1])
    expect(contributors.every((c) => c.active)).toBe(true)
  })

  it('omits actors with no current contributions', () => {
    const layout = layoutUniverse(SNAPSHOT)
    const frame = universeFrame(SNAPSHOT, 1, 'forward')
    const contributors = resolveContributors(layout, frame)
    expect(contributors.map((c) => c.actor)).toEqual([0])
  })

  it('returns no nodes when the timeline is empty', () => {
    const layout = layoutUniverse({ ...SNAPSHOT, contributions: [], stepCount: 0 })
    const frame = universeFrame({ ...SNAPSHOT, contributions: [], stepCount: 0 }, 0, 'forward')
    expect(resolveContributors(layout, frame)).toEqual([])
  })
})

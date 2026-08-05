import { describe, expect, it } from 'vitest'

import {
  clampStep,
  nextUniverseStep,
  universeFrame,
  universeLiveAt,
} from '../src/universePlayback'
import type { UniverseSnapshot } from '../src/types'

const SNAPSHOT: UniverseSnapshot = {
  repos: [
    { id: 0, name: 'a/r1', files: ['a.ts', 'b.ts'] },
    { id: 1, name: 'a/r2', files: ['c.ts', 'd.ts'] },
  ],
  contributions: [
    { step: 0, repo: 0, file: 'a.ts' },
    { step: 0, repo: 1, file: 'c.ts' },
    { step: 1, repo: 0, file: 'b.ts' },
    { step: 2, repo: 1, file: 'd.ts' },
  ],
  stepCount: 3,
}

describe('clampStep', () => {
  it('clamps to the valid range', () => {
    expect(clampStep(-3, 3)).toBe(0)
    expect(clampStep(99, 3)).toBe(2)
    expect(clampStep(0, 0)).toBe(-1)
  })
})

describe('universeLiveAt', () => {
  it('accumulates files from the start in forward order', () => {
    expect([...universeLiveAt(SNAPSHOT.contributions, 0, 'forward')].sort()).toEqual([
      '0:a.ts',
      '1:c.ts',
    ])
    expect([...universeLiveAt(SNAPSHOT.contributions, 2, 'forward')].sort()).toEqual([
      '0:a.ts',
      '0:b.ts',
      '1:c.ts',
      '1:d.ts',
    ])
  })

  it('accumulates files from the end in backward order', () => {
    expect([...universeLiveAt(SNAPSHOT.contributions, 2, 'backward')].sort()).toEqual([
      '1:d.ts',
    ])
    expect([...universeLiveAt(SNAPSHOT.contributions, 0, 'backward')].sort()).toEqual([
      '0:a.ts',
      '0:b.ts',
      '1:c.ts',
      '1:d.ts',
    ])
  })
})

describe('universeFrame', () => {
  it('resolves current files and repos at a step', () => {
    const frame = universeFrame(SNAPSHOT, 0, 'forward')
    expect([...frame.currentFiles].sort()).toEqual(['0:a.ts', '1:c.ts'])
    expect([...frame.currentRepos].sort()).toEqual([0, 1])
    expect(frame.total).toBe(3)
    expect(frame.progress).toBeCloseTo(1 / 3)
  })

  it('handles an empty timeline', () => {
    const empty = { ...SNAPSHOT, contributions: [], stepCount: 0 }
    const frame = universeFrame(empty, 0, 'forward')
    expect(frame.currentFiles).toEqual([])
    expect(frame.currentRepos.size).toBe(0)
    expect(frame.progress).toBe(0)
  })
})

describe('nextUniverseStep', () => {
  it('advances and clamps in both directions', () => {
    const frame = universeFrame(SNAPSHOT, 1, 'forward')
    expect(nextUniverseStep(frame, 'forward')).toBe(2)
    expect(nextUniverseStep(frame, 'backward')).toBe(0)
    expect(nextUniverseStep(universeFrame(SNAPSHOT, 2, 'forward'), 'forward')).toBe(2)
    expect(nextUniverseStep(universeFrame(SNAPSHOT, 0, 'backward'), 'backward')).toBe(0)
  })
})

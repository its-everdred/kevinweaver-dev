import { describe, expect, it } from 'vitest'

import { buildUniverse } from '../src/buildUniverse'

describe('buildUniverse', () => {
  it('builds per-repo distinct file lists and a sorted timeline', () => {
    const universe = buildUniverse(
      [
        { id: 0, name: 'a/r1' },
        { id: 1, name: 'a/r2' },
        { id: 2, name: 'a/r3' },
      ],
      [
        { repo: 1, path: 'b.ts', step: 0 },
        { repo: 0, path: 'a.ts', step: 0 },
        { repo: 0, path: 'a.ts', step: 1 },
        { repo: 0, path: 'c.ts', step: 2 },
      ],
      3
    )
    expect(universe.repos.length).toBe(2)
    expect(universe.repos[0]?.name).toBe('a/r1')
    expect(universe.repos[0]?.files).toEqual(['a.ts', 'c.ts'])
    expect(universe.repos[1]?.files).toEqual(['b.ts'])
    expect(universe.contributions.map((c) => `${c.step}:${c.repo}:${c.file}`)).toEqual([
      '0:0:a.ts',
      '0:1:b.ts',
      '1:0:a.ts',
      '2:0:c.ts',
    ])
  })

  it('skips repos with no events', () => {
    const universe = buildUniverse(
      [
        { id: 0, name: 'a/r1' },
        { id: 1, name: 'a/r2' },
      ],
      [{ repo: 0, path: 'x.ts', step: 0 }],
      1
    )
    expect(universe.repos.length).toBe(1)
    expect(universe.repos[0]?.name).toBe('a/r1')
  })

  it('handles empty input', () => {
    const universe = buildUniverse([], [], 0)
    expect(universe.repos).toEqual([])
    expect(universe.contributions).toEqual([])
  })
})

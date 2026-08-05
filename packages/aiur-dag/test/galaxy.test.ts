import { describe, expect, it } from 'vitest'

import { layoutUniverse } from '../src/galaxy'
import type { UniverseSnapshot } from '../src/types'

function snapshot(repos: readonly { id: number; name: string; files: readonly string[] }[]): UniverseSnapshot {
  return {
    repos: repos.map((repo) => ({ id: repo.id, name: repo.name, files: repo.files })),
    contributions: [],
    stepCount: 0,
  }
}

describe('layoutUniverse', () => {
  it('is deterministic: same input, same galaxy and star positions', () => {
    const input = snapshot([
      { id: 1, name: 'a/r1', files: ['x.ts', 'y.ts', 'z.ts'] },
      { id: 2, name: 'a/r2', files: ['a.ts'] },
      { id: 3, name: 'a/r3', files: ['b.ts', 'c.ts'] },
    ])
    const first = layoutUniverse(input)
    const second = layoutUniverse(input)
    expect(first.galaxies).toEqual(second.galaxies)
  })

  it('creates one galaxy per repo with one star per file', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/r1', files: ['x.ts', 'y.ts'] },
        { id: 2, name: 'a/r2', files: ['a.ts', 'b.ts', 'c.ts'] },
      ])
    )
    expect(layout.galaxies.length).toBe(2)
    expect(layout.starCount).toBe(5)
    expect(layout.galaxies[0]?.stars.length).toBe(2)
    expect(layout.galaxies[1]?.stars.length).toBe(3)
  })

  it('keeps every star within its galaxy field', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/r1', files: ['x.ts', 'y.ts'] },
        { id: 2, name: 'a/r2', files: ['a.ts'] },
      ])
    )
    for (const galaxy of layout.galaxies) {
      for (const star of galaxy.stars) {
        expect(star.x).toBeGreaterThanOrEqual(0)
        expect(star.x).toBeLessThanOrEqual(1)
        expect(star.y).toBeGreaterThanOrEqual(0)
        expect(star.y).toBeLessThanOrEqual(1)
      }
      expect(galaxy.x).toBeGreaterThan(0)
      expect(galaxy.x).toBeLessThan(1)
      expect(galaxy.y).toBeGreaterThan(0)
      expect(galaxy.y).toBeLessThan(1)
    }
  })

  it('attaches the file path to each star', () => {
    const layout = layoutUniverse(
      snapshot([{ id: 7, name: 'a/r', files: ['src/main.ts', 'README.md'] }])
    )
    const files = layout.galaxies[0]?.stars.map((star) => star.file).sort()
    expect(files).toEqual(['README.md', 'src/main.ts'])
  })

  it('handles an empty universe', () => {
    const layout = layoutUniverse(snapshot([]))
    expect(layout.galaxies).toEqual([])
    expect(layout.starCount).toBe(0)
  })
})

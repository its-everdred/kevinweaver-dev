import { describe, expect, it } from 'vitest'

import { layoutUniverse, starKey } from '../src/galaxy'
import type { StarPosition, UniverseLayout } from '../src/galaxy'
import type { UniverseContribution, UniverseSnapshot } from '../src/types'

interface RepoSpec {
  readonly id: number
  readonly name: string
  readonly files: readonly string[]
  /** Step of this repo's most recent contribution; omitted means never active. */
  readonly lastStep?: number
}

function snapshot(repos: readonly RepoSpec[]): UniverseSnapshot {
  const contributions: UniverseContribution[] = []
  for (const repo of repos) {
    const file = repo.files[0]
    if (repo.lastStep === undefined || !file) continue
    contributions.push({ step: repo.lastStep, repo: repo.id, file, actor: 0 })
  }
  contributions.sort((left, right) => left.step - right.step || left.repo - right.repo)
  const lastStep = contributions[contributions.length - 1]?.step ?? -1
  return {
    repos: repos.map((repo) => ({ id: repo.id, name: repo.name, files: repo.files })),
    contributions,
    stepCount: lastStep + 1,
  }
}

function paths(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `src/mod-${index}.ts`)
}

function starsOf(layout: UniverseLayout, repoId: number): readonly StarPosition[] {
  return layout.stars.filter((star) => star.repoId === repoId)
}

function radiusOf(star: StarPosition): number {
  return Math.hypot(star.x - 0.5, star.y - 0.5)
}

function meanRadius(layout: UniverseLayout, repoId: number): number {
  const stars = starsOf(layout, repoId)
  return stars.reduce((sum, star) => sum + radiusOf(star), 0) / Math.max(1, stars.length)
}

function radialRange(layout: UniverseLayout, repoId: number): { min: number; max: number } {
  const radii = starsOf(layout, repoId).map(radiusOf)
  return { min: Math.min(...radii), max: Math.max(...radii) }
}

const RECENCY = snapshot([
  { id: 1, name: 'a/oldest', files: paths(40), lastStep: 1 },
  { id: 2, name: 'a/middle', files: paths(40), lastStep: 5 },
  { id: 3, name: 'a/newest', files: paths(40), lastStep: 9 },
])

describe('layoutUniverse', () => {
  it('is deterministic: same snapshot, identical coordinates vertex for vertex', () => {
    const first = layoutUniverse(RECENCY)
    const second = layoutUniverse(RECENCY)
    expect(first.stars).toEqual(second.stars)
    expect(first.repos).toEqual(second.repos)
    expect([...first.starIndex]).toEqual([...second.starIndex])
  })

  it('orders repos by recency, newest first, and shrinks radius with recency', () => {
    const layout = layoutUniverse(RECENCY)
    expect(layout.repos.map((repo) => repo.repoId)).toEqual([3, 2, 1])
    expect(meanRadius(layout, 3)).toBeLessThan(meanRadius(layout, 1))
  })

  it('places a repo with no contributions on the rim', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/r1', files: paths(20), lastStep: 0 },
        { id: 2, name: 'a/quiet', files: paths(20) },
        { id: 3, name: 'a/r3', files: paths(20), lastStep: 4 },
      ])
    )
    expect(layout.repos.map((repo) => repo.repoId)).toEqual([3, 1, 2])
    expect(meanRadius(layout, 2)).toBeGreaterThan(meanRadius(layout, 3))
  })

  it('emits every file in every repo exactly once', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/r1', files: ['x.ts', 'y.ts', 'z.ts'], lastStep: 2 },
        { id: 2, name: 'a/r2', files: ['x.ts'], lastStep: 1 },
      ])
    )
    const keys = layout.stars.map((star) => starKey(star.repoId, star.file))
    expect(keys.sort()).toEqual(['1:x.ts', '1:y.ts', '1:z.ts', '2:x.ts'])
    expect(layout.starCount).toBe(4)
  })

  it('resolves every star key to a distinct in-range vertex index', () => {
    const layout = layoutUniverse(RECENCY)
    expect(layout.starIndex.size).toBe(layout.starCount)
    const seen = new Set<number>()
    for (const star of layout.stars) {
      const index = layout.starIndex.get(starKey(star.repoId, star.file))
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(layout.starCount)
      expect(index === undefined ? undefined : layout.stars[index]).toBe(star)
      seen.add(index ?? -1)
    }
    expect(seen.size).toBe(layout.starCount)
  })

  it('overlaps the radial ranges of repos adjacent in recency order', () => {
    const layout = layoutUniverse(
      snapshot(
        Array.from({ length: 8 }, (_, index) => ({
          id: index + 1,
          name: `a/r${index + 1}`,
          files: paths(40),
          lastStep: index,
        }))
      )
    )
    for (let index = 1; index < layout.repos.length; index++) {
      const inner = layout.repos[index - 1]
      const outer = layout.repos[index]
      if (!inner || !outer) throw new Error('missing repo arm')
      const a = radialRange(layout, inner.repoId)
      const b = radialRange(layout, outer.repoId)
      expect(Math.max(a.min, b.min)).toBeLessThan(Math.min(a.max, b.max))
    }
  })

  it('keeps a one-file repo and a 7449-file repo in range', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/tiny', files: ['only.ts'], lastStep: 1 },
        { id: 2, name: 'a/huge', files: paths(7449), lastStep: 0 },
      ])
    )
    expect(layout.starCount).toBe(7450)
    for (const star of layout.stars) {
      expect(star.x).toBeGreaterThanOrEqual(0)
      expect(star.x).toBeLessThanOrEqual(1)
      expect(star.y).toBeGreaterThanOrEqual(0)
      expect(star.y).toBeLessThanOrEqual(1)
      expect(star.z).toBeGreaterThanOrEqual(0)
      expect(star.z).toBeLessThanOrEqual(1)
    }
    // Volume must not buy area: the huge repo stays inside its own annulus.
    const huge = radialRange(layout, 2)
    expect(huge.max - huge.min).toBeLessThan(0.2)
  })

  it('orders repos sharing a last-activity step by repo id, whatever the input order', () => {
    const specs: readonly RepoSpec[] = [
      { id: 3, name: 'a/r3', files: paths(4), lastStep: 5 },
      { id: 1, name: 'a/r1', files: paths(4), lastStep: 5 },
      { id: 2, name: 'a/r2', files: paths(4), lastStep: 5 },
    ]
    const layout = layoutUniverse(snapshot(specs))
    expect(layout.repos.map((repo) => repo.repoId)).toEqual([1, 2, 3])
    const reordered = layoutUniverse(snapshot([...specs].reverse()))
    expect(reordered.repos).toEqual(layout.repos)
    expect(reordered.stars).toEqual(layout.stars)
  })

  it('gives the disc thickness rather than a flat plane', () => {
    const layout = layoutUniverse(RECENCY)
    const depths = new Set(layout.stars.map((star) => star.z))
    expect(depths.size).toBeGreaterThan(1)
    const spread = Math.max(...depths) - Math.min(...depths)
    expect(spread).toBeGreaterThan(0)
    expect(spread).toBeLessThan(0.25)
  })

  it('anchors one arm segment per repo, ordinal ordered', () => {
    const layout = layoutUniverse(RECENCY)
    expect(layout.repos.map((repo) => repo.ordinal)).toEqual([0, 1, 2])
    expect(layout.repos.map((repo) => repo.name)).toEqual(['a/newest', 'a/middle', 'a/oldest'])
    for (const repo of layout.repos) {
      expect(repo.starCount).toBe(40)
      expect(layout.stars[repo.starOffset]?.repoId).toBe(repo.repoId)
    }
  })

  it('handles an empty universe', () => {
    const layout = layoutUniverse(snapshot([]))
    expect(layout.repos).toEqual([])
    expect(layout.stars).toEqual([])
    expect(layout.starCount).toBe(0)
    expect(layout.starIndex.size).toBe(0)
  })
})

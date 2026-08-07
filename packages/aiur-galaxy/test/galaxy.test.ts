import { describe, expect, it } from 'vitest'

import { layoutUniverse, starKey } from '../src/galaxy'
import type { StarPosition, UniverseLayout } from '../src/galaxy'
import { PRIVATE_REPO_ID } from '../src/privateRepo'
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

/** Ten-degree slices of the disc, so an occupied bin is a readable wedge. */
const ANGLE_BINS = 36

/**
 * How many of the disc's angular bins hold a star between two radii. Stars
 * glued to thin arm curves occupy a handful of wedges; a star field that
 * merely carries spiral structure fills most of the ring.
 */
function ringBins(
  layout: UniverseLayout,
  inner: number,
  outer: number
): number[] {
  const turn = Math.PI * 2
  const bins = new Array<number>(ANGLE_BINS).fill(0)
  for (const star of layout.stars) {
    const radius = radiusOf(star)
    if (radius < inner || radius > outer) continue
    const angle = (Math.atan2(star.y - 0.5, star.x - 0.5) + turn) % turn
    const bin = Math.min(ANGLE_BINS - 1, Math.floor((angle / turn) * ANGLE_BINS))
    bins[bin] = (bins[bin] ?? 0) + 1
  }
  return bins
}

/**
 * Share of a ring's stars that fall in its twelve emptiest wedges — the space
 * between the arms. Stars glued to the arm curves leave that space bare; a
 * star field fills it. A featureless field would score 1/3.
 */
function sparsestThirdShare(
  layout: UniverseLayout,
  inner: number,
  outer: number
): number {
  const bins = [...ringBins(layout, inner, outer)].sort((a, b) => a - b)
  const total = bins.reduce((sum, count) => sum + count, 0)
  const sparsest = bins.slice(0, ANGLE_BINS / 3).reduce((sum, count) => sum + count, 0)
  return total === 0 ? 0 : sparsest / total
}

/** Busiest wedge of a ring over its average wedge: how far the arms stand out. */
function peakOverMean(
  layout: UniverseLayout,
  inner: number,
  outer: number
): number {
  const bins = ringBins(layout, inner, outer)
  const total = bins.reduce((sum, count) => sum + count, 0)
  return total === 0 ? 0 : Math.max(...bins) / (total / ANGLE_BINS)
}

const DENSE = snapshot(
  Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    name: `a/r${index + 1}`,
    files: paths(200),
    lastStep: index,
  }))
)

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

  it('spreads stars across a wide angular band rather than onto thin arm curves', () => {
    const layout = layoutUniverse(DENSE)
    // A mid-disc ring, cut into 36 ten-degree wedges. The twelve emptiest
    // wedges are the space between the arms: at least 15% of the ring's stars
    // must land there, against the 33% a structureless field would score.
    expect(sparsestThirdShare(layout, 0.16, 0.24)).toBeGreaterThanOrEqual(0.15)
    // And the arms must be legible, not merely present: the busiest wedge
    // carries nearly twice its share. The previous 1.3 bound passed at a
    // scatter wide enough that the spiral read as fog, so it is raised here to
    // the contrast the arms actually have to hold.
    expect(peakOverMean(layout, 0.16, 0.24)).toBeGreaterThanOrEqual(1.9)
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

  it('pins the private repo to the core whatever its recency says', () => {
    // Radius encodes recency everywhere else in the disc. The private repo is
    // the one deliberate exception: the operator asked for it near the centre,
    // so it takes ordinal 0 even when its last activity is the oldest here.
    const layout = layoutUniverse(
      snapshot([
        { id: PRIVATE_REPO_ID, name: 'private', files: paths(20), lastStep: 0 },
        { id: 1, name: 'a/r1', files: paths(20), lastStep: 4 },
        { id: 2, name: 'a/r2', files: paths(20), lastStep: 8 },
      ])
    )
    expect(layout.repos.map((repo) => repo.repoId)).toEqual([PRIVATE_REPO_ID, 2, 1])
    expect(layout.repos[0]?.ordinal).toBe(0)
    for (const repoId of [1, 2])
      expect(meanRadius(layout, PRIVATE_REPO_ID)).toBeLessThan(meanRadius(layout, repoId))
  })

  it('handles an empty universe', () => {
    const layout = layoutUniverse(snapshot([]))
    expect(layout.repos).toEqual([])
    expect(layout.stars).toEqual([])
    expect(layout.starCount).toBe(0)
    expect(layout.starIndex.size).toBe(0)
  })
})

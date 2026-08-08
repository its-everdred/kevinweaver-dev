import { describe, expect, it } from 'vitest'

import { DISC_FIELD_RADIUS, layoutUniverse, starKey } from '../src/galaxy'
import type { RepoArm, StarPosition, UniverseLayout } from '../src/galaxy'
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

/**
 * How far every star of a repo sits from the arm anchor its label is drawn on.
 * A repo reads as a place in the disc only while these stay small: the name is
 * painted at the anchor, so a star far from it is a star nothing identifies.
 */
function labelReach(layout: UniverseLayout, repo: RepoArm): number[] {
  return layout.stars
    .slice(repo.starOffset, repo.starOffset + repo.starCount)
    .map((star) => Math.hypot(star.x - repo.x, star.y - repo.y))
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

/**
 * Payload-shaped repo sizes — one giant, a short head, a long tail — with size
 * decorrelated from recency, so the giant sits wherever its last commit puts it
 * rather than conveniently at the core. `DENSE` gives every repo the same file
 * count, and equal sizes is precisely the case a size-blind cluster gets right:
 * the arms only come apart once one repo holds forty times its neighbour's
 * stars, which is what the real payload looks like.
 */
const SPREAD = snapshot(
  Array.from({ length: 90 }, (_, index) => ({
    id: index + 1,
    name: `a/r${index + 1}`,
    files: paths(Math.max(1, Math.round(7400 / (index + 1) ** 2))),
    lastStep: 1 + ((index * 17) % 90),
  }))
)

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

  it('resolves every file to an in-range vertex, folded or not', () => {
    const layout = layoutUniverse(RECENCY)
    // Three repos of forty files each. The map stays total over files, because
    // a beam that cannot resolve its endpoint is silently dropped, while the
    // vertices it points into are fewer than the files pointing at them.
    expect(layout.starIndex.size).toBe(120)
    expect(layout.starCount).toBeLessThan(120)
    const reached = new Set<number>()
    for (const [, index] of layout.starIndex) {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(layout.starCount)
      reached.add(index)
    }
    // No orphan vertices either: every star is some file's endpoint.
    expect(reached.size).toBe(layout.starCount)
    // And a star resolves to itself, so the field's reverse lookup lands back
    // on the vertex it started from.
    for (const star of layout.stars)
      expect(layout.stars[layout.starIndex.get(starKey(star.repoId, star.file)) ?? -1]).toBe(star)
  })

  it('keeps one star per file until folding would buy something', () => {
    const layout = layoutUniverse(
      snapshot([{ id: 1, name: 'a/small', files: paths(12), lastStep: 0 }])
    )
    expect(layout.starCount).toBe(12)
  })

  it('buys stars sublinearly, so volume still reads as volume without owning the field', () => {
    const starsFor = (files: number): number =>
      layoutUniverse(snapshot([{ id: 1, name: 'a/r', files: paths(files), lastStep: 0 }]))
        .starCount
    const small = starsFor(512)
    const large = starsFor(4096)
    // Eight times the files buys more stars, but nothing like eight times more.
    expect(large).toBeGreaterThan(small * 2)
    expect(large).toBeLessThan(small * 4)
  })

  it('stops the largest repo from taking most of the disc', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/giant', files: paths(7449), lastStep: 1 },
        ...Array.from({ length: 5 }, (_, index) => ({
          id: index + 2,
          name: `a/r${index + 2}`,
          files: paths(1000),
          lastStep: 0,
        })),
      ])
    )
    const giant = layout.repos.find((repo) => repo.repoId === 1)
    const rival = layout.repos.find((repo) => repo.repoId === 2)
    if (!giant || !rival) throw new Error('missing repo arm')
    // The giant holds 60% of the files. It must hold a far smaller share of the
    // stars, while still reading as the biggest arm in the disc.
    expect(giant.starCount / layout.starCount).toBeLessThan(0.45)
    expect(giant.starCount).toBeGreaterThan(rival.starCount * 2)
  })

  it('names a shared star after the earliest file it carries', () => {
    // Steps run opposite to path order, so a star named after the first path in
    // its group would fail this: the earliest-touched file has to win.
    const files = paths(64)
    const contributions: UniverseContribution[] = files.map((file, index) => ({
      step: files.length - index,
      repo: 1,
      file,
      actor: 0,
    }))
    const layout = layoutUniverse({
      repos: [{ id: 1, name: 'a/folded', files }],
      contributions: [...contributions].sort((left, right) => left.step - right.step),
      stepCount: files.length + 1,
    })
    expect(layout.starCount).toBeLessThan(files.length)
    const touched = new Map(
      contributions.map((entry) => [starKey(entry.repo, entry.file), entry.step])
    )
    // The star a file folds onto was touched no later than the file itself, so
    // the star field's index-to-key lookup calls a star live exactly when one of
    // the files it carries is live.
    for (const [key, index] of layout.starIndex) {
      const star = layout.stars[index]
      if (!star) throw new Error(`no star at ${index}`)
      expect(touched.get(starKey(star.repoId, star.file)) ?? -1).toBeLessThanOrEqual(
        touched.get(key) ?? -1
      )
    }
  })

  it('overlaps the radial ranges of repos adjacent in recency order', () => {
    // This is the floor under the cluster reach, and the reason a repo cannot
    // simply be tightened to a dot on its label: neighbouring clusters have to
    // meet, or the disc reads as a ring of separate beads rather than as one
    // continuous field.
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

  it('clusters a repo’s stars around the label that names them', () => {
    // The operator's ask: a repo is a place in the disc, not a streak. Its
    // label is painted on the arm anchor, and the along-arm smear this replaced
    // ran a repo's stars two fifths of the disc radius from that anchor on
    // average and half again the whole disc radius at the tail, which put a
    // repo's stars nowhere near its own name. Clustering brought that to 0.087
    // and 0.221 of the disc radius; sizing the cluster by star count leaves it
    // at 0.072 and 0.203, because the reach a repo of this size gets down the
    // arm is shorter than the fixed one it used to get across it.
    const layout = layoutUniverse(DENSE)
    const reaches = layout.repos.flatMap((repo) => labelReach(layout, repo))
    const mean = reaches.reduce((sum, gap) => sum + gap, 0) / reaches.length
    expect(mean).toBeLessThan(DISC_FIELD_RADIUS * 0.1)
    // And no straggler: the cluster is bounded, not merely centred.
    expect(Math.max(...reaches)).toBeLessThan(DISC_FIELD_RADIUS * 0.25)
  })

  it('fills the space between the arms while leaving the arms legible', () => {
    const layout = layoutUniverse(DENSE)
    // A mid-disc ring, cut into 36 ten-degree wedges. The twelve emptiest
    // wedges are the space between the arms, and a structureless field would
    // put 33% of the ring's stars there. The floor was 15%, measured at a
    // cluster 0.48 of a `t` wide against a 0.455 gap between the two arms —
    // that is, at an arm so wide it ran into its neighbour everywhere, which is
    // why the winding was not visible and is the complaint this round answers.
    // An arm narrower than the gap between arms necessarily empties that gap
    // somewhat, so the floor drops to 10% and the reading falls from 0.191 to
    // 0.114: still a third of what a featureless field would score, so a disc
    // rather than two bare curves, and no longer bought by erasing the spiral.
    expect(sparsestThirdShare(layout, 0.16, 0.24)).toBeGreaterThanOrEqual(0.1)
    // And the arms must be legible, not merely present: the busiest wedge
    // carries nearly twice its share. The previous 1.3 bound passed at a
    // scatter wide enough that the spiral read as fog, so it is raised here to
    // the contrast the arms actually have to hold — 1.950 at that scatter,
    // 2.271 once repos were clustered, 2.180 now.
    expect(peakOverMean(layout, 0.16, 0.24)).toBeGreaterThanOrEqual(1.9)
  })

  it('keeps the arms legible when one repo dwarfs the rest', () => {
    // `peakOverMean` only ever had a floor, and a floor alone reads a single
    // bright blob as a triumph: on payload-shaped sizes the outer ring scored
    // 9.05 not because its arms stood out but because the giant's whole budget
    // landed in one ten-degree wedge. An arm is a ridge, not a spike, so the
    // contrast is bounded on both sides; spreading that budget down the arm
    // halves the peak to 4.43 without flattening the ring to featureless.
    const layout = layoutUniverse(SPREAD)
    expect(peakOverMean(layout, 0.24, 0.34)).toBeGreaterThanOrEqual(1.9)
    expect(peakOverMean(layout, 0.24, 0.34)).toBeLessThanOrEqual(5)
  })

  it('keeps a one-file repo and a 7449-file repo in range', () => {
    const layout = layoutUniverse(
      snapshot([
        { id: 1, name: 'a/tiny', files: ['only.ts'], lastStep: 1 },
        { id: 2, name: 'a/huge', files: paths(7449), lastStep: 0 },
      ])
    )
    // One file is one star; 7449 files fold onto 432. Both ends of that range
    // still have to land inside the field.
    expect(starsOf(layout, 1).length).toBe(1)
    expect(starsOf(layout, 2).length).toBe(432)
    // Folded or not, every file resolves to a star: nothing is dropped.
    expect(layout.starIndex.size).toBe(7450)
    for (const star of layout.stars) {
      expect(star.x).toBeGreaterThanOrEqual(0)
      expect(star.x).toBeLessThanOrEqual(1)
      expect(star.y).toBeGreaterThanOrEqual(0)
      expect(star.y).toBeLessThanOrEqual(1)
      expect(star.z).toBeGreaterThanOrEqual(0)
      expect(star.z).toBeLessThanOrEqual(1)
    }
    // Volume must not buy width. The bound is the annulus the huge repo lies
    // in, and its ceiling is two arm widths plus what the arm's own pitch adds
    // as the cluster runs down it — never the file count, which now buys length
    // along the arm instead. 0.358 of the disc radius when both reaches were
    // fixed, 0.325 now, both inside the 40% this has held since the smear.
    const huge = radialRange(layout, 2)
    expect(huge.max - huge.min).toBeLessThan(DISC_FIELD_RADIUS * 0.4)
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
      // Forty files, thirty-two stars: `starCount` counts vertices, not files.
      expect(repo.starCount).toBe(32)
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

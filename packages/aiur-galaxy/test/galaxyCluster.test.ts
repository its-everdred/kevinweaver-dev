import { describe, expect, it } from 'vitest'

import { DISC_FIELD_RADIUS, layoutUniverse } from '../src/galaxy'
import type { RepoArm, UniverseLayout } from '../src/galaxy'
import { PRIVATE_REPO_ID } from '../src/privateRepo'
import type { UniverseContribution, UniverseSnapshot } from '../src/types'

interface RepoSpec {
  readonly id: number
  readonly name: string
  readonly files: number
  readonly lastStep: number
}

function snapshot(specs: readonly RepoSpec[]): UniverseSnapshot {
  const contributions: UniverseContribution[] = specs
    .map((spec) => ({ step: spec.lastStep, repo: spec.id, file: 'src/mod-0.ts', actor: 0 as const }))
    .sort((left, right) => left.step - right.step || left.repo - right.repo)
  return {
    repos: specs.map((spec) => ({
      id: spec.id,
      name: spec.name,
      files: Array.from({ length: spec.files }, (_, index) => `src/mod-${index}.ts`),
    })),
    contributions,
    stepCount: (contributions[contributions.length - 1]?.step ?? -1) + 1,
  }
}

/**
 * Ninety repos, sized like the payload's — one giant, a short head, a long tail
 * of near-empty ones — with size deliberately decorrelated from recency so the
 * giant sits wherever its last commit puts it. Both the count and the shape
 * matter: the other fixtures here give every repo the same file count, which is
 * exactly the case a size-blind cluster gets right, while on the real payload
 * the largest repo holds 43% of the paths and the median repo holds 0.02%.
 */
const SPREAD = snapshot([
  ...Array.from({ length: 90 }, (_, index) => ({
    id: index + 1,
    name: `a/r${index + 1}`,
    files: Math.max(1, Math.round(7400 / (index + 1) ** 2)),
    lastStep: 1 + ((index * 17) % 90),
  })),
  { id: PRIVATE_REPO_ID, name: 'private', files: 512, lastStep: 0 },
])

const TURN = Math.PI * 2

function starsOf(layout: UniverseLayout, repo: RepoArm) {
  return layout.stars.slice(repo.starOffset, repo.starOffset + repo.starCount)
}

function radiusOf(star: { x: number; y: number }): number {
  return Math.hypot(star.x - 0.5, star.y - 0.5)
}

function rms(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / Math.max(1, values.length))
}

/**
 * A cluster's two half-extents in the anchor's own frame, both in field units:
 * `across` is how far it spreads in radius, which is the arm's width, and
 * `along` is how far it spreads in arc length, which is its run down the arm.
 * Both are root-mean-square rather than min-to-max, because a five-star repo
 * never samples its own extremes and a five-hundred-star repo always does,
 * which would make any span measurement a measurement of the star count.
 */
function extent(layout: UniverseLayout, repo: RepoArm): { across: number; along: number } {
  const stars = starsOf(layout, repo)
  const anchor = Math.atan2(repo.y - 0.5, repo.x - 0.5)
  const wrap = (angle: number): number => (((angle + Math.PI) % TURN) + TURN) % TURN - Math.PI
  return {
    across: rms(stars.map((star) => radiusOf(star) - repo.radius)),
    along: rms(
      stars.map((star) => wrap(Math.atan2(star.y - 0.5, star.x - 0.5) - anchor) * repo.radius)
    ),
  }
}

/** How elongated a cluster is down its arm: above 1 it is a streak, below it a bead. */
function aspect(layout: UniverseLayout, repo: RepoArm): number {
  const { across, along } = extent(layout, repo)
  return along / across
}

/** Stars per unit of the disc a repo covers: the repo's surface brightness. */
function density(layout: UniverseLayout, repo: RepoArm): number {
  const { across, along } = extent(layout, repo)
  return repo.starCount / (across * along)
}

function armOf(layout: UniverseLayout, repoId: number): RepoArm {
  const arm = layout.repos.find((repo) => repo.repoId === repoId)
  if (!arm) throw new Error(`no arm for repo ${repoId}`)
  return arm
}

/**
 * The biggest and smallest repos of the disc proper. Both filters earn their
 * place: under sixteen stars a cluster is too small a sample to measure, and
 * inside the bulge every cluster is dense because there is less disc there to
 * spread over, so comparing a core repo against a rim one measures the radius
 * rather than the rule.
 */
function ends(layout: UniverseLayout): { big: RepoArm; small: RepoArm } {
  const ranked = layout.repos
    .filter(
      (repo) =>
        repo.repoId !== PRIVATE_REPO_ID &&
        repo.starCount >= 16 &&
        repo.radius >= DISC_FIELD_RADIUS * 0.4
    )
    .sort((left, right) => right.starCount - left.starCount)
  const big = ranked[0]
  const small = ranked[ranked.length - 1]
  if (!big || !small) throw new Error('fixture has no measurable repos')
  return { big, small }
}

describe('cluster shape', () => {
  it('gives a big repo more room along the arm without widening the arm', () => {
    const layout = layoutUniverse(SPREAD)
    const { big, small } = ends(layout)
    // The operator's ask, stated as geometry: size buys length down the arm and
    // nothing else. Before, both reaches were the same constant for every repo,
    // so a repo holding twenty-two times its neighbour's stars ran 1.13 times
    // as far down the arm; now it runs 6.15 times as far and is no wider.
    expect(big.starCount).toBeGreaterThan(small.starCount * 15)
    expect(extent(layout, big).across).toBeLessThan(extent(layout, small).across * 1.4)
    expect(extent(layout, big).along).toBeGreaterThan(extent(layout, small).along * 3)
    expect(aspect(layout, big)).toBeGreaterThan(aspect(layout, small) * 2.5)
  })

  it('smooths the surface brightness between the biggest repo and the smallest', () => {
    const layout = layoutUniverse(SPREAD)
    const { big, small } = ends(layout)
    // Stars per unit of disc, which is what "massive" meant: the big repo used
    // to pour its whole budget into a cluster the size of everyone else's and
    // came out 38 times as bright. It may still read as the denser of the two,
    // but by a single-digit factor — 3.4 here — rather than by its size ratio.
    expect(density(layout, big) / density(layout, small)).toBeLessThan(8)
    expect(density(layout, big)).toBeGreaterThan(density(layout, small))
  })

  it('condenses the core into a knot rather than a haze around the centre', () => {
    const layout = layoutUniverse(SPREAD)
    const core = armOf(layout, PRIVATE_REPO_ID)
    const reach = Math.max(...starsOf(layout, core).map(radiusOf))
    // `private` is pinned to ordinal 0 by `corePin`, so it is the innermost
    // cluster in the disc and the one the operator asked to condense. A cluster
    // whose reach outruns its own distance from the centre does not sit at the
    // centre, it surrounds it: at a fixed reach this one spread over 3.9 times
    // its own anchor radius and 23% of the whole disc, wrapping 350 degrees of
    // core. Now 1.9 times its anchor and 10% of the disc, so it covers a fifth
    // of the area it did and reads as a knot.
    expect(reach).toBeLessThan(core.radius * 2)
    expect(reach).toBeLessThan(DISC_FIELD_RADIUS * 0.13)
  })

  it('is deterministic across builds', () => {
    const first = layoutUniverse(SPREAD)
    const second = layoutUniverse(SPREAD)
    expect(first.stars).toEqual(second.stars)
  })
})

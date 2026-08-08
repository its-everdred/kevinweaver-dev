import {
  anchorPoint,
  anchorRadius,
  armGeometry,
  clusterPoint,
  type ArmGeometry,
} from './galaxyCluster'
import { corePin } from './privateRepo'
import type { UniverseRepo, UniverseSnapshot } from './types'

export { DISC_FIELD_RADIUS, hash01 } from './galaxyCluster'

/** A star in the disc, in normalized field units (every axis in [0, 1]). */
export interface StarPosition {
  /** Repo this star belongs to. */
  readonly repoId: number
  /**
   * The star's name: the earliest-touched of the repo-relative paths folded
   * onto it. A large repo has more files than stars, so this names the group
   * rather than exhausting it; `starIndex` is what maps a path to its star.
   */
  readonly file: string
  /** Field x and y; 0.5 on both is the galactic center. */
  readonly x: number
  readonly y: number
  /** Field z: 0.5 is the disc plane, and the disc's thickness lives here. */
  readonly z: number
}

/** One repo's segment of the single disc. */
export interface RepoArm {
  readonly repoId: number
  readonly name: string
  /** Rank in recency order; 0 is the most recently active repo. */
  readonly ordinal: number
  /** Step of this repo's most recent contribution, or -1 when never active. */
  readonly lastStep: number
  /** Segment anchor, in the same field units as a star. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Distance of the anchor from the disc center, in field units. */
  readonly radius: number
  /**
   * Index of this repo's first star in `stars`, and how many follow it. This
   * counts vertices, not files: a repo with more files than its star budget
   * folds them onto shared stars.
   */
  readonly starOffset: number
  readonly starCount: number
}

/** Result of laying a universe out as one recency-ordered spiral disc. */
export interface UniverseLayout {
  /** Arm segments, most recently active first. */
  readonly repos: readonly RepoArm[]
  /** Every star in the disc, grouped by repo in `repos` order. */
  readonly stars: readonly StarPosition[]
  /**
   * Vertex index by star key, so the render path never searches for a star.
   * Total over every file of every repo, including the files that share a
   * star: a contribution whose key missed here would have its beam silently
   * dropped, so folding stars must never shrink this map.
   */
  readonly starIndex: ReadonlyMap<string, number>
  /** Total number of stars in the disc, which is at most one per file. */
  readonly starCount: number
}

const NEVER_ACTIVE = -1
/**
 * Exponent that turns a repo's file count into its star count. Below 1 a big
 * repo still reads as bigger than a small one while giving up the field it
 * used to own: the largest repo here holds 7449 of the payload's 19784 files,
 * which was 38% of the disc at one star per file and is 19% of it at 0.62.
 */
const STAR_COMPRESSION = 0.62
/**
 * Multiplier on the compressed count. It sets how dense the disc is without
 * touching the shares the exponent decides, and it sets where folding begins:
 * under `STAR_DENSITY ** (1 / (1 - STAR_COMPRESSION))` files, about 18 here, a
 * repo keeps one star per file, because folding a handful of files saves no
 * vertices worth the star losing its name.
 */
const STAR_DENSITY = 3

/** A repo paired with the step of its most recent contribution. */
interface RepoRecency {
  readonly repo: UniverseRepo
  readonly lastStep: number
}

/**
 * @description Builds the repo-qualified key that identifies a star.
 * @returns The `"repoId:path"` key shared with the playback frame.
 */
export function starKey(repoId: number, file: string): string {
  return `${repoId}:${file}`
}

/**
 * @description Lays a universe out as one spiral disc: radius encodes recency,
 * so the most recently active repo sits at the core and the least recently
 * active at the rim, and every file reaches a star in the cluster its repo's
 * label sits on. Deterministic: recency comes from the contribution log and
 * positions from a hash of stable identifiers, never from randomness, input
 * order, or the clock.
 * @param snapshot The universe snapshot to position.
 * @returns The arm segments, every star, and a star key to vertex index map
 * that stays total over files even where several of them share a star.
 */
export function layoutUniverse(snapshot: UniverseSnapshot): UniverseLayout {
  const ordered = orderByRecency(snapshot)
  const touched = firstTouches(snapshot)
  const repos: RepoArm[] = []
  const stars: StarPosition[] = []
  const starIndex = new Map<string, number>()

  for (let ordinal = 0; ordinal < ordered.length; ordinal++) {
    const entry = ordered[ordinal]
    if (!entry) continue
    const arm = armGeometry(ordinal, ordered.length)
    const starOffset = stars.length
    appendStars(stars, starIndex, entry.repo, arm, touched)
    repos.push({
      repoId: entry.repo.id,
      name: entry.repo.name,
      ordinal,
      lastStep: entry.lastStep,
      ...anchorPoint(arm),
      radius: anchorRadius(arm.t),
      starOffset,
      starCount: stars.length - starOffset,
    })
  }

  return { repos, stars, starIndex, starCount: stars.length }
}

/**
 * @description Orders repos by most recent contribution, newest first. Repos
 * that never contributed sort to the rim; ties fall back to ascending repo id,
 * so input order never moves a star.
 */
function orderByRecency(snapshot: UniverseSnapshot): readonly RepoRecency[] {
  const lastSteps = new Map<number, number>()
  for (const contribution of snapshot.contributions) {
    const previous = lastSteps.get(contribution.repo) ?? NEVER_ACTIVE
    if (contribution.step > previous) lastSteps.set(contribution.repo, contribution.step)
  }
  return snapshot.repos
    .map((repo) => ({ repo, lastStep: lastSteps.get(repo.id) ?? NEVER_ACTIVE }))
    .sort(
      // The synthesized private repo is pinned to the core; see `corePin`.
      (left, right) =>
        corePin(left.repo.id) - corePin(right.repo.id) ||
        right.lastStep - left.lastStep ||
        left.repo.id - right.repo.id
    )
}

/**
 * @description Appends a repo's stars, each one placed in the cluster centred
 * on the arm anchor its label is drawn on; `clusterPoint` owns that geometry.
 * A repo gets `starBudget` stars rather than one per file, so volume buys
 * neither area nor a proportional count, but every file still resolves: the
 * paths are folded onto the budget in sorted order, which puts a directory's
 * files on the same star or on neighbouring ones.
 */
function appendStars(
  stars: StarPosition[],
  starIndex: Map<string, number>,
  repo: UniverseRepo,
  arm: ArmGeometry,
  touched: ReadonlyMap<string, number>
): void {
  const files = [...new Set(repo.files)].sort()
  const budget = starBudget(files.length)
  const offset = stars.length
  for (const file of leadFiles(files, budget, repo.id, touched))
    stars.push({ repoId: repo.id, file, ...clusterPoint(starKey(repo.id, file), arm) })
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    if (file !== undefined)
      starIndex.set(starKey(repo.id, file), offset + groupOf(index, files.length, budget))
  }
}

/**
 * @description How many stars a repo of `files` files gets: sublinear in the
 * file count, and never more stars than the repo has files.
 */
function starBudget(files: number): number {
  return Math.min(files, Math.round(STAR_DENSITY * files ** STAR_COMPRESSION))
}

/** Which of a repo's `budget` stars the file at `index` of `files` folds onto. */
function groupOf(index: number, files: number, budget: number): number {
  return Math.floor((index * budget) / files)
}

/**
 * @description Names each star after the earliest-touched file folded onto it.
 * The choice is not cosmetic: the star field reads a vertex back to a key
 * through this name, so naming a star after its earliest file is what makes
 * "this star's file is live" mean "some file on this star is live" as playback
 * runs forward, instead of letting a lit star go dark.
 * @returns One file per star, in star order. The array is dense: every group
 * holds at least one file, because the budget never exceeds the file count.
 */
function leadFiles(
  files: readonly string[],
  budget: number,
  repoId: number,
  touched: ReadonlyMap<string, number>
): readonly string[] {
  // A file the log never names sorts behind every file it does.
  const step = (file: string): number =>
    touched.get(starKey(repoId, file)) ?? Number.MAX_SAFE_INTEGER
  const leads: string[] = []
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    if (file === undefined) continue
    const group = groupOf(index, files.length, budget)
    const held = leads[group]
    if (held === undefined || step(file) < step(held)) leads[group] = file
  }
  return leads
}

/** The step every file was first contributed on, by star key. */
function firstTouches(snapshot: UniverseSnapshot): ReadonlyMap<string, number> {
  const steps = new Map<string, number>()
  for (const contribution of snapshot.contributions) {
    const key = starKey(contribution.repo, contribution.file)
    const previous = steps.get(key)
    if (previous === undefined || contribution.step < previous) steps.set(key, contribution.step)
  }
  return steps
}

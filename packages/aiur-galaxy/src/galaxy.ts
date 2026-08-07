import type { UniverseRepo, UniverseSnapshot } from './types'

/** A star in the disc, in normalized field units (every axis in [0, 1]). */
export interface StarPosition {
  /** Repo this star belongs to. */
  readonly repoId: number
  /** Repo-relative file path this star represents. */
  readonly file: string
  /** Field x, 0.5 at the galactic center. */
  readonly x: number
  /** Field y, 0.5 at the galactic center. */
  readonly y: number
  /** Field z, 0.5 in the disc plane; the disc's thickness lives on this axis. */
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
  /** Index of this repo's first star in `stars`. */
  readonly starOffset: number
  /** Number of stars this repo contributes. */
  readonly starCount: number
}

/** Result of laying a universe out as one recency-ordered spiral disc. */
export interface UniverseLayout {
  /** Arm segments, most recently active first. */
  readonly repos: readonly RepoArm[]
  /** Every star in the disc, grouped by repo in `repos` order. */
  readonly stars: readonly StarPosition[]
  /** Vertex index by star key, so the render path never searches for a star. */
  readonly starIndex: ReadonlyMap<string, number>
  /** Total number of stars in the disc. */
  readonly starCount: number
}

/** Half-extent of the disc in field units, leaving a margin for labels. */
export const DISC_FIELD_RADIUS = 0.42

const NEVER_ACTIVE = -1
const ARM_COUNT = 2
/** Radians of arm rotation between the core and the rim. */
const ARM_WINDING = 2.2 * Math.PI
/** Width of the per-star position along its repo's arm, centered on zero. */
const ALONG_SPAN = 1.5
/** Radial smear, wide enough that adjacent repos blend instead of banding. */
const RADIAL_SMEAR = 0.19
const ANGULAR_SMEAR = 1.15
const ANGULAR_JITTER = 0.42
const DISC_THICKNESS = 0.09
/** How much of the disc's thickness the rim loses relative to the core. */
const CORE_BULGE = 0.65
/** Largest radial coordinate a star can reach, used to normalize to the field. */
const MAX_RADIAL = 1 + (ALONG_SPAN / 2) * RADIAL_SMEAR

/** A repo paired with the step of its most recent contribution. */
interface RepoRecency {
  readonly repo: UniverseRepo
  readonly lastStep: number
}

/** An arm segment before per-star smearing. */
interface ArmGeometry {
  /** Radial coordinate of the segment, 0 at the core and 1 at the rim. */
  readonly t: number
  /** Angle of the arm at that radius, in radians. */
  readonly angle: number
}

/**
 * @description Builds the repo-qualified key that identifies a star.
 * @param repoId Repo id owning the file.
 * @param file Repo-relative file path.
 * @returns The `"repoId:path"` key shared with the playback frame.
 */
export function starKey(repoId: number, file: string): string {
  return `${repoId}:${file}`
}

/**
 * @description Lays a universe out as one spiral disc: radius encodes recency,
 * so the most recently active repo sits at the core and the least recently
 * active at the rim, and every file is a star smeared along its repo's arm.
 * @param snapshot The universe snapshot to position.
 * @returns The arm segments, every star, and a star key to vertex index map.
 *
 * Deterministic: recency comes from the contribution log and positions derive
 * from a hash of stable identifiers, never from randomness, insertion order, or
 * the clock, so renders are bit-reproducible.
 */
export function layoutUniverse(snapshot: UniverseSnapshot): UniverseLayout {
  const ordered = orderByRecency(snapshot)
  const repos: RepoArm[] = []
  const stars: StarPosition[] = []
  const starIndex = new Map<string, number>()

  for (let ordinal = 0; ordinal < ordered.length; ordinal++) {
    const entry = ordered[ordinal]
    if (!entry) continue
    const arm = armGeometry(ordinal, ordered.length)
    const starOffset = stars.length
    appendStars(stars, starIndex, entry.repo, arm)
    repos.push({
      repoId: entry.repo.id,
      name: entry.repo.name,
      ordinal,
      lastStep: entry.lastStep,
      ...fieldPoint(arm.t, arm.angle, 0),
      radius: (arm.t / MAX_RADIAL) * DISC_FIELD_RADIUS,
      starOffset,
      starCount: stars.length - starOffset,
    })
  }

  return { repos, stars, starIndex, starCount: stars.length }
}

/**
 * @description Orders repos by most recent contribution, newest first. Repos
 * that never contributed sort to the rim, and repos sharing a step fall back to
 * ascending id so input order never moves a star.
 */
function orderByRecency(snapshot: UniverseSnapshot): readonly RepoRecency[] {
  const lastSteps = new Map<number, number>()
  for (const contribution of snapshot.contributions) {
    const previous = lastSteps.get(contribution.repo) ?? NEVER_ACTIVE
    if (contribution.step > previous) lastSteps.set(contribution.repo, contribution.step)
  }
  return snapshot.repos
    .map((repo) => ({ repo, lastStep: lastSteps.get(repo.id) ?? NEVER_ACTIVE }))
    .sort((left, right) => right.lastStep - left.lastStep || left.repo.id - right.repo.id)
}

/**
 * @description Maps a recency ordinal onto one of the disc's spiral arms. The
 * square root keeps the core dense: early ordinals are packed, later ones step
 * outward by less and less, which is what makes the arms read as arms.
 */
function armGeometry(ordinal: number, total: number): ArmGeometry {
  const t = Math.sqrt((ordinal + 0.5) / Math.max(1, total))
  const arm = ordinal % ARM_COUNT
  return { t, angle: (arm * 2 * Math.PI) / ARM_COUNT + t * ARM_WINDING }
}

/**
 * @description Projects a radial coordinate, angle, and depth into field units.
 * A negative radius mirrors the star across the center, which fills the core
 * rather than clamping the innermost repos into a hot spot.
 */
function fieldPoint(
  radial: number,
  angle: number,
  depth: number
): { x: number; y: number; z: number } {
  const scaled = (radial / MAX_RADIAL) * DISC_FIELD_RADIUS
  return {
    x: 0.5 + Math.cos(angle) * scaled,
    y: 0.5 + Math.sin(angle) * scaled,
    z: 0.5 + depth,
  }
}

/**
 * @description Appends one star per file, smeared radially and angularly around
 * the repo's arm segment so adjacent repos blend into a continuous arm. Every
 * file becomes a star: there is no cap, and volume buys density, not area.
 */
function appendStars(
  stars: StarPosition[],
  starIndex: Map<string, number>,
  repo: UniverseRepo,
  arm: ArmGeometry
): void {
  for (const file of repo.files) {
    const key = starKey(repo.id, file)
    if (starIndex.has(key)) continue
    const along = (hash01(`${key}:along`) - 0.5) * ALONG_SPAN
    const angle =
      arm.angle + along * ANGULAR_SMEAR + (hash01(`${key}:angle`) - 0.5) * ANGULAR_JITTER
    const depth = (hash01(`${key}:depth`) - 0.5) * DISC_THICKNESS * (1 - arm.t * CORE_BULGE)
    starIndex.set(key, stars.length)
    stars.push({
      repoId: repo.id,
      file,
      ...fieldPoint(arm.t + along * RADIAL_SMEAR, angle, depth),
    })
  }
}

/**
 * @description Deterministic string hash returning a fraction in [0, 1).
 */
function hash01(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

import type { UniverseRepo, UniverseSnapshot } from './types'

/** A star in the disc, in normalized field units (every axis in [0, 1]). */
export interface StarPosition {
  /** Repo this star belongs to. */
  readonly repoId: number
  /** Repo-relative file path this star represents. */
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
  /** Index of this repo's first star in `stars`, and how many follow it. */
  readonly starOffset: number
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

/** An arm segment before per-star smearing: radius in [0, 1], angle in radians. */
interface ArmGeometry {
  readonly t: number
  readonly angle: number
}

/** A position in normalized field units, every axis in [0, 1]. */
type FieldPoint = Pick<StarPosition, 'x' | 'y' | 'z'>

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
 * active at the rim, and every file is a star smeared along its repo's arm.
 * Deterministic: recency comes from the contribution log and positions from a
 * hash of stable identifiers, never from randomness, input order, or the clock.
 * @param snapshot The universe snapshot to position.
 * @returns The arm segments, every star, and a star key to vertex index map.
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
    .sort((left, right) => right.lastStep - left.lastStep || left.repo.id - right.repo.id)
}

/**
 * @description Maps a recency ordinal onto one of the disc's spiral arms. The
 * square root keeps the core dense and shrinks the step between neighbours,
 * which is what lets the radial smear blend them into an arm.
 */
function armGeometry(ordinal: number, total: number): ArmGeometry {
  const t = Math.sqrt((ordinal + 0.5) / Math.max(1, total))
  const arm = ordinal % ARM_COUNT
  return { t, angle: (arm * 2 * Math.PI) / ARM_COUNT + t * ARM_WINDING }
}

/**
 * @description Projects a radial coordinate, angle, and depth into field units.
 * A negative radius mirrors the star across the center, filling the core rather
 * than clamping the innermost repos into a hot spot.
 */
function fieldPoint(radial: number, angle: number, depth: number): FieldPoint {
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
    const point = fieldPoint(arm.t + along * RADIAL_SMEAR, angle, depth)
    stars.push({ repoId: repo.id, file, ...point })
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

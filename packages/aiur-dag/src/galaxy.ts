import type { UniverseRepo, UniverseSnapshot } from './types'

/** A star position in normalized galaxy-local units (both axes in [0, 1]). */
export interface StarPosition {
  readonly x: number
  readonly y: number
  /** Repo-relative file path this star represents. */
  readonly file: string
}

/** A galaxy (repo) position in normalized field units plus its star positions. */
export interface GalaxyLayout {
  readonly repoId: number
  readonly name: string
  /** Field center of this galaxy, both axes in [0, 1]. */
  readonly x: number
  readonly y: number
  /** Fraction of the field radius this galaxy occupies. */
  readonly radius: number
  /** Star positions relative to the galaxy center, in [0, 1] galaxy-local. */
  readonly stars: readonly StarPosition[]
}

/** Result of laying out a universe as a cluster of galaxies. */
export interface UniverseLayout {
  readonly galaxies: readonly GalaxyLayout[]
  /** Total number of stars across all galaxies. */
  readonly starCount: number
}

const FIELD_MARGIN = 0.08

/**
 * @description Lays out a universe as a cluster of galaxies on a spiral of
 * galaxy centers, each with its files distributed as a deterministic spiral.
 * @param snapshot The universe snapshot to position.
 * @returns Per-galaxy field positions and per-star galaxy-local positions.
 *
 * Deterministic: positions derive from a hash of stable identifiers, never
 * from randomness or insertion order, so renders are bit-reproducible.
 */
export function layoutUniverse(snapshot: UniverseSnapshot): UniverseLayout {
  const galaxies: GalaxyLayout[] = []
  let starCount = 0

  for (let index = 0; index < snapshot.repos.length; index++) {
    const repo = snapshot.repos[index]
    if (!repo) continue
    const starCountInGalaxy = repo.files.length
    const angle = spiralAngle(index, snapshot.repos.length)
    const radius = spiralRadius(index, snapshot.repos.length)
    const fieldRadius = 0.5 - FIELD_MARGIN
    const galaxyRadius = galaxyScale(starCountInGalaxy)
    const stars = distributeStars(repo)
    galaxies.push({
      repoId: repo.id,
      name: repo.name,
      x: 0.5 + Math.cos(angle) * radius * fieldRadius,
      y: 0.5 + Math.sin(angle) * radius * fieldRadius,
      radius: galaxyRadius,
      stars,
    })
    starCount += starCountInGalaxy
  }

  return { galaxies, starCount }
}

/**
 * @description Places galaxy centers along an Archimedean spiral so the cluster
 * reads as a coherent structure even with many repos.
 */
function spiralAngle(index: number, total: number): number {
  return (index / Math.max(1, total)) * Math.PI * 2 * Math.sqrt(total)
}

function spiralRadius(index: number, total: number): number {
  return Math.min(1, Math.sqrt(index / Math.max(1, total)))
}

/**
 * @description Scales a galaxy by its star count: more files, a larger galaxy.
 */
function galaxyScale(starCount: number): number {
  return Math.max(0.05, Math.min(0.16, 0.03 + Math.sqrt(starCount) * 0.003))
}

/**
 * @description Distributes a repo's files as a spiral galaxy of stars. The arm
 * and radial offset come from a deterministic hash of the file path so every
 * file is stable across renders.
 */
function distributeStars(
  repo: UniverseRepo
): readonly StarPosition[] {
  const stars: StarPosition[] = []
  for (let index = 0; index < repo.files.length; index++) {
    const file = repo.files[index]
    if (!file) continue
    const radiusSeed = hash01(`${repo.id}:${file}:radius`)
    const angleSeed = hash01(`${repo.id}:${file}:angle`)
    // Two spiral arms; each file rides one arm at a hash-derived radius.
    const angle =
      (angleSeed * Math.PI * 2) + (index % 2) * Math.PI + radiusSeed * 4
    const radius = 0.1 + radiusSeed * 0.9
    stars.push({
      x: 0.5 + Math.cos(angle) * radius * 0.5,
      y: 0.5 + Math.sin(angle) * radius * 0.5,
      file,
    })
  }
  return stars
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

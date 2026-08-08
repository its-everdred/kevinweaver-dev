/** A position in normalized field units, every axis in [0, 1]. */
export interface FieldPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** An arm segment before its cluster is filled: radius in [0, 1], angle in radians. */
export interface ArmGeometry {
  readonly t: number
  readonly angle: number
}

/**
 * An arm segment together with the reach of the cluster one repo fills it with.
 * The two reaches are the whole of this module's answer to "a big repo must not
 * deform the disc": `across` is the arm's width and is the same for every repo,
 * `along` is the repo's run down the arm and is the only thing size buys.
 */
export interface ClusterShape {
  readonly arm: ArmGeometry
  /** Half-reach down the arm, measured in the arm's own parameter. */
  readonly along: number
  /** Half-reach across the arm, in the same units: half the arm's width. */
  readonly across: number
}

/** Half-extent of the disc in field units, leaving a margin for labels. */
export const DISC_FIELD_RADIUS = 0.42

const ARM_COUNT = 2
/** Radians of arm rotation between the core and the rim. */
const ARM_WINDING = 2.2 * Math.PI
/**
 * Half the arm's width, in the same units as an arm's `t`. Fixed for every
 * repo, whatever its size, because a constant width is what makes an arm read
 * as an arm. Its ceiling is the spacing between the two arms, which at this
 * winding is `Math.PI / ARM_WINDING` — 0.455 of a `t` — so an arm 0.48 wide,
 * which is what a 0.24 half-width gave, ran into its neighbour everywhere and
 * left no winding to see. 0.38 leaves a real gap while still overlapping the
 * neighbouring ordinals in radius, which the disc needs or it reads as a ring
 * of separate beads.
 */
const ARM_HALF_WIDTH = 0.19
/**
 * Star count whose run down the arm is `ALONG_BASE`, and that reach. The pivot
 * sits near the middle of the payload's per-repo budgets rather than at either
 * end, so the scale change coming from de-vendoring the path list moves repos
 * through it instead of past it; the reach is a 14-degree sweep of arc, against
 * 36 for the largest repo the payload keeps once vendored paths are dropped.
 */
const ALONG_PIVOT = 64
const ALONG_BASE = 0.035
/**
 * Ceiling on that reach, met at 1024 stars. Only the vendored payload's two
 * outliers reach it — they hold 43% and 34% of all paths between them — and
 * the cap is what stops those two setting the scale for every other repo.
 */
const ALONG_MAX = 0.14
/**
 * How far across its arm a cluster may reach, as a share of its own distance
 * from the centre. A cluster whose reach outruns its radius does not sit at the
 * centre, it surrounds it: before this the innermost repos wrapped 350 degrees
 * of core, and `private`, which `corePin` pins to ordinal 0, spread over 3.9
 * times its own anchor radius as a haze rather than the knot the operator asked
 * for — now 1.9. At 1 no cluster reaches the middle at all, which is what turns
 * the innermost handful of repos into a bulge instead of a fog. Stated by radius
 * rather than by ordinal so it stays one rule, and it binds nowhere past a `t`
 * of 0.19, where the arms proper begin.
 */
const CORE_FILL = 1
const DISC_THICKNESS = 0.09
/** How much of the disc's thickness the rim loses relative to the core. */
const CORE_BULGE = 0.65
/** Largest radial coordinate a star can reach, used to normalize to the field. */
const MAX_RADIAL = 1 + ARM_HALF_WIDTH + ALONG_MAX

/**
 * @description Maps a recency ordinal onto one of the disc's spiral arms. The
 * square root keeps the core dense and shrinks the step between neighbours,
 * which is what lets their clusters overlap into an arm.
 */
export function armGeometry(ordinal: number, total: number): ArmGeometry {
  const t = Math.sqrt((ordinal + 0.5) / Math.max(1, total))
  const arm = ordinal % ARM_COUNT
  return { t, angle: (arm * 2 * Math.PI) / ARM_COUNT + t * ARM_WINDING }
}

/** @description The anchor of an arm segment, which is where its label is drawn. */
export function anchorPoint(arm: ArmGeometry): FieldPoint {
  return fieldPoint(arm.t, 0, arm.angle, 0)
}

/** @description Distance of an arm anchor from the disc center, in field units. */
export function anchorRadius(t: number): number {
  return (t / MAX_RADIAL) * DISC_FIELD_RADIUS
}

/**
 * @description Sizes one repo's cluster on its arm segment. Volume is spent
 * entirely on `along`: a repo with twenty-two times its neighbour's stars runs
 * six times further down the arm and stays exactly as wide, so it reads as a
 * longer stretch of the same arm rather than as a brighter blob welded onto it.
 * The square root is what smooths the difference — with the star budget already
 * a square root of the file count, a repo holding ten thousand times another's
 * files ends up ten times as long and ten times as bright, not ten thousand
 * times as heavy.
 * @param arm The segment the cluster is centred on.
 * @param stars How many stars the repo was budgeted.
 * @returns The segment and the cluster's two half-reaches.
 */
export function clusterShape(arm: ArmGeometry, stars: number): ClusterShape {
  return {
    arm,
    // Neither reach may outrun the anchor's own radius, so no cluster reaches
    // the middle. Only `across` is held to `CORE_FILL`: squeezing the run down
    // the arm as hard would have crushed whichever large repo happened to be
    // recent — the payload's biggest sits at ordinal 2 — back into the blob
    // this is meant to undo, and running down the arm carries a cluster
    // outward, away from the crowding, rather than across it.
    along: Math.min(alongReach(stars), arm.t),
    across: Math.min(ARM_HALF_WIDTH, CORE_FILL * arm.t),
  }
}

/**
 * @description Places one star of a repo's cluster. The along-arm offset moves
 * the star's radius and its angle together, by exactly the amounts the arm's own
 * parameterization pairs, so a long cluster traces the spiral instead of cutting
 * a chord across it; the across-arm offset is the only thing that leaves the
 * curve, and it leaves it along the arm's normal rather than straight out from
 * the centre — where the spiral is steep, which is the core, a pure radial
 * offset runs *down* the arm and stretches the innermost clusters into needles
 * aimed at the middle. Both offsets are densest at zero, which gives a cluster a
 * bright core on its label anchor and a thinning edge, and the space between the
 * arms is filled by the tails of the clusters either side of it.
 * @param key The star's `"repoId:path"` key, which is the only entropy here.
 * @param shape The sized cluster the star belongs to.
 * @returns The star's position in field units.
 */
export function clusterPoint(key: string, shape: ClusterShape): FieldPoint {
  const along = scatter(key, 'along') * shape.along
  const t = shape.arm.t + along
  const pitch = ARM_WINDING * t
  const normal = Math.hypot(1, pitch)
  const across = scatter(key, 'across') * shape.across
  const depth =
    (hash01(`${key}:depth`) - 0.5) * DISC_THICKNESS * (1 - shape.arm.t * CORE_BULGE)
  return fieldPoint(
    t + (across * pitch) / normal,
    -across / normal,
    shape.arm.angle + along * ARM_WINDING,
    depth
  )
}

/** @description How far down its arm a repo of `stars` stars reaches. */
function alongReach(stars: number): number {
  return Math.min(ALONG_MAX, ALONG_BASE * Math.sqrt(Math.max(1, stars) / ALONG_PIVOT))
}

/**
 * @description Projects a point given as a radius, an arc offset at right
 * angles to it, an angle, and a depth into field units. A negative radius
 * mirrors the star across the center, filling the core rather than clamping the
 * innermost repos into a hot spot; the arc offset is taken as a displacement
 * rather than as an angle because an arc length over a radius near zero is not
 * an angle any more, and turning it into one is what spun the core.
 */
function fieldPoint(radial: number, arc: number, angle: number, depth: number): FieldPoint {
  const scale = DISC_FIELD_RADIUS / MAX_RADIAL
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: 0.5 + (radial * cos - arc * sin) * scale,
    y: 0.5 + (radial * sin + arc * cos) * scale,
    z: 0.5 + depth,
  }
}

/**
 * @description Deterministic scatter in (-1, 1), densest at zero. Summing two
 * hashes gives a triangular distribution, which is what keeps the anchor the
 * brightest part of a cluster; a single hash would spread every star with equal
 * probability and flatten each repo into a disc of uniform grey.
 */
function scatter(key: string, axis: string): number {
  return hash01(`${key}:${axis}`) + hash01(`${key}:${axis}:spread`) - 1
}

/**
 * @description Deterministic string hash returning a fraction in [0, 1).
 */
export function hash01(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

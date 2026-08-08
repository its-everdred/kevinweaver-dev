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

/** Half-extent of the disc in field units, leaving a margin for labels. */
export const DISC_FIELD_RADIUS = 0.42

const ARM_COUNT = 2
/** Radians of arm rotation between the core and the rim. */
const ARM_WINDING = 2.2 * Math.PI
/**
 * Radial half-reach of a repo's cluster, in the same units as an arm's `t`. It
 * is the one number that sets how much of the disc a repo owns, and it is held
 * well above the step between adjacent ordinals on purpose: neighbouring
 * clusters have to overlap in radius, or the disc reads as a ring of separate
 * dots instead of as one continuous field.
 */
const CLUSTER_REACH = 0.24
/**
 * Arc half-reach of the same cluster, as an arc length in `t` units that is
 * turned into radians at the anchor's own radius, so a cluster is the same size
 * wherever in the disc it sits. Held under `CLUSTER_REACH` because at this
 * winding the arm runs mostly tangentially: a cluster narrower across the arc
 * than it is deep in radius reads as a knot *on* the arm rather than as a bead
 * sliding along it.
 */
const CLUSTER_ARC = 0.18
const DISC_THICKNESS = 0.09
/** How much of the disc's thickness the rim loses relative to the core. */
const CORE_BULGE = 0.65
/** Largest radial coordinate a star can reach, used to normalize to the field. */
const MAX_RADIAL = 1 + CLUSTER_REACH

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
  return fieldPoint(arm.t, arm.angle, 0)
}

/** @description Distance of an arm anchor from the disc center, in field units. */
export function anchorRadius(t: number): number {
  return (t / MAX_RADIAL) * DISC_FIELD_RADIUS
}

/**
 * @description Places one star of a repo's cluster, centred on the arm anchor
 * its label is drawn on so the repo reads as a place in the disc rather than as
 * a streak down the arm. Both offsets are densest at zero, which gives the
 * cluster a bright core and a thinning edge, and the spiral survives the
 * tightening because adjacent ordinals sit half a turn apart while their
 * clusters still overlap in radius: the space between the arms is filled by the
 * tails of *other* repos rather than by this one's own stars.
 * @param key The star's `"repoId:path"` key, which is the only entropy here.
 * @param arm The segment whose anchor the cluster is centred on.
 * @returns The star's position in field units.
 */
export function clusterPoint(key: string, arm: ArmGeometry): FieldPoint {
  const angle = arm.angle + scatter(key, 'angle') * arcSpan(arm.t)
  const radial = arm.t + scatter(key, 'radial') * CLUSTER_REACH
  const depth =
    (hash01(`${key}:depth`) - 0.5) * DISC_THICKNESS * (1 - arm.t * CORE_BULGE)
  return fieldPoint(radial, angle, depth)
}

/**
 * @description Turns the cluster's arc reach into radians at an anchor sitting
 * `t` from the center. Capped at half a turn, because a cluster whose reach
 * outruns its own distance from the center surrounds the center rather than
 * wrapping past itself — which is exactly what the innermost repos do.
 */
function arcSpan(t: number): number {
  return Math.min(Math.PI, CLUSTER_ARC / t)
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

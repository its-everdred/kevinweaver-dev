/**
 * Where the camera is looking, as opposed to where it is looking from. The
 * orbit next door is azimuth, polar angle, and distance about a pivot; this
 * module is the pivot itself — the one degree of freedom that lets a viewer
 * bring an off-centre repo to the middle of the screen instead of only ever
 * spinning the disc about its own core.
 *
 * Pure, viewport-free arithmetic: no DOM, no clock, no randomness. The only
 * viewport term appears as a function argument, so a resize has nothing here to
 * overwrite.
 */

/** A point or an offset in world units. */
export interface PanVector {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** The un-panned pivot: the disc's own centre, which is where the view opens. */
export const NO_PAN: PanVector = { x: 0, y: 0, z: 0 }

/**
 * Furthest the pivot may travel from the disc centre, in world units.
 *
 * The disc is a circle of `DISC_FIELD_RADIUS` (0.42) in field units drawn
 * across a world width of 6, so its own radius is 2.52 and it spans about five
 * world units. Bounding the pivot by that radius buys both halves of what a pan
 * is for: any star on the rim can be brought to the middle of the screen, and
 * the disc centre is never further from the middle than the disc's own radius,
 * so part of the galaxy is always in frame. An unbounded pan is a trap — push
 * the disc off screen and nothing anywhere tells you which way to push it back.
 */
export const MAX_PAN_DISTANCE = 2.5

/**
 * World units one shifted arrow key moves the pivot. Ten presses cross the
 * whole range, which is the same order as the 48 presses an unshifted arrow
 * takes to bring the disc round once: enough resolution to aim with, few enough
 * that crossing the disc is not a chore.
 */
export const KEY_PAN = MAX_PAN_DISTANCE / 10

/**
 * Half the scene camera's vertical field of view, in radians. It mirrors the
 * `PerspectiveCamera(60, ...)` the renderer builds; stated rather than imported
 * because reaching for it would pull three.js into this module and into every
 * bundle that only wants the arithmetic.
 */
const HALF_FOV = Math.PI / 6

/** How far the pivot moves along the camera's own right and up axes. */
export interface PanStep {
  readonly right: number
  readonly up: number
}

/** As much of a camera as the pivot's own axes depend on. */
export interface PanFrame {
  /** Rotation about the world up axis, in radians. */
  readonly azimuth: number
  /** Angle down from the world up axis, in radians. */
  readonly polar: number
  /** The pivot as it stands. */
  readonly target: PanVector
}

/** A gesture that carried no pan in it at all. */
const STILL: PanStep = { right: 0, up: 0 }

/**
 * @description Converts a drag across the canvas into the pan it is worth, in
 * world units, such that the point under the fingers stays under the fingers.
 *
 * The scale is the camera distance, not a constant: the world is a perspective
 * projection, so the span a viewport covers at the pivot plane is
 * `2 * distance * tan(fov / 2)`, and a finger-width therefore has to mean more
 * world when the camera is far out than when it is close in. A fixed
 * pan-per-pixel feels glacial at one end of the dolly and twitchy at the other.
 *
 * The signs are what makes this a grab rather than a scrollbar: the fingers
 * carry the disc, so the pivot travels opposite the drag.
 *
 * @param dx Horizontal drag in CSS pixels; positive is rightward.
 * @param dy Vertical drag in CSS pixels; positive is downward.
 * @param height Canvas height in CSS pixels.
 * @param distance The camera's current distance from the pivot.
 * @returns The pivot's travel along the camera's right and up axes, and no
 * travel at all for a collapsed viewport or an unreadable drag.
 */
export function dragPan(
  dx: number,
  dy: number,
  height: number,
  distance: number
): PanStep {
  if (
    !(height > 0) ||
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(distance)
  )
    return STILL
  const perPixel = (2 * distance * Math.tan(HALF_FOV)) / height
  return { right: -dx * perPixel, up: dy * perPixel }
}

/**
 * @description Moves the pivot along the camera's own axes and holds it inside
 * the disc it belongs to.
 *
 * The axes are the camera's, not the world's: "right" means right on screen at
 * the orbit the viewer is currently at, so a pan still goes where it looks like
 * it should after the disc has been turned. With the world's up axis at `+y`,
 * the camera's right is `(cos a, 0, -sin a)` and its up is
 * `(-sin a cos p, sin p, -cos a cos p)`.
 *
 * @param frame The camera the pan is measured against: its rotation and the
 * pivot it currently holds.
 * @param step How far to move along the camera's right and up axes.
 * @returns A new pivot, never further than `MAX_PAN_DISTANCE` from the disc
 * centre; the given one is never mutated.
 */
export function panTarget(frame: PanFrame, step: PanStep): PanVector {
  const { azimuth, polar, target } = frame
  const { right, up } = step
  // A non-finite step would poison the pivot permanently, and nothing the
  // viewer could do afterwards would recover it.
  if (!Number.isFinite(right) || !Number.isFinite(up)) return target
  const eastward = Math.cos(azimuth)
  const northward = Math.sin(azimuth)
  const tilt = Math.cos(polar)
  return clampPan({
    x: target.x + eastward * right - northward * tilt * up,
    y: target.y + Math.sin(polar) * up,
    z: target.z - northward * right - eastward * tilt * up,
  })
}

/**
 * Holds a pivot inside the bound by its reach, not axis by axis: a box clamp
 * would let a diagonal pan travel `MAX_PAN_DISTANCE * sqrt(3)` from the centre,
 * a third again as far as the bound claims, and the disc really would leave the
 * frame in the corners. Scaling the whole vector also slides the pivot along
 * the boundary instead of catching it on a corner.
 */
function clampPan(point: PanVector): PanVector {
  const reach = Math.hypot(point.x, point.y, point.z)
  if (reach <= MAX_PAN_DISTANCE) return point
  const scale = MAX_PAN_DISTANCE / reach
  return { x: point.x * scale, y: point.y * scale, z: point.z * scale }
}

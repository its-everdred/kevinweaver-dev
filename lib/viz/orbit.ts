/**
 * Camera orbit math for the galaxy disc: rotate, dolly, and pan the pivot the
 * other two turn about, whose own arithmetic lives in `./pan`. Deliberately
 * narrower than a general orbit control — no auto-rotate, no damping — and it
 * holds no viewport term, so a resize has nothing here to overwrite.
 */

import { NO_PAN, panTarget, type PanVector } from './pan'

const TWO_PI = Math.PI * 2

/** Smallest angle kept between the polar angle and either pole, in radians. */
export const POLAR_MARGIN = 0.05
/** Closest the camera may dolly to the disc center, in world units. */
export const MIN_ORBIT_DISTANCE = 1.2
/** Furthest the camera may dolly from the disc center, in world units. */
export const MAX_ORBIT_DISTANCE = 12

/** Where the camera sits, and what it sits around. */
export interface OrbitState {
  /** Rotation about the disc's up axis, wrapped into (-PI, PI]. */
  readonly azimuth: number
  /** Angle down from the up axis, clamped clear of both poles. */
  readonly polar: number
  /** Distance from the pivot, in world units. */
  readonly distance: number
  /**
   * The point the camera turns about and looks at. Panning is exactly this
   * moving: the eye and the look-at share it, which is what separates a
   * translation from a swing about a fixed origin.
   */
  readonly target: PanVector
}

/** A camera position in world units. */
export type OrbitPosition = PanVector

/**
 * Every way the camera moves, and all of them user-initiated: nothing in this
 * module advances on a clock, which is what `prefers-reduced-motion` requires
 * of the camera.
 */
export type OrbitAction =
  | {
      readonly type: 'rotate'
      /** Azimuth delta in radians. */
      readonly azimuth: number
      /** Polar delta in radians. */
      readonly polar: number
    }
  | {
      readonly type: 'dolly'
      /** Multiplier on the current distance; below 1 moves the camera closer. */
      readonly factor: number
    }
  | {
      readonly type: 'pan'
      /** World units to slide the pivot along the camera's right axis. */
      readonly right: number
      /** World units to slide the pivot along the camera's up axis. */
      readonly up: number
    }
  /** Returns the pivot to the disc center, leaving rotation and dolly alone. */
  | { readonly type: 'recenter' }

/**
 * The multiplier one zoom press applies to the distance. Every zoom affordance
 * spends exactly this — the on-screen buttons, the plus and minus keys, and one
 * mouse-wheel detent — so a notch and a press are one unit of travel rather
 * than three tunings free to drift apart. The opening distance below is stated
 * in terms of it, so "one step closer than round 6" stays one press of a button.
 */
export const ZOOM_STEP = 1.25
/** How far round 6 opened, before the operator asked for one step nearer. */
const ROUND_SIX_DISTANCE = 6

/**
 * The opening view: tilted 45 degrees off the disc plane and pulled back far
 * enough to hold the whole thing in frame, so the galaxy reads as a dinner
 * plate seen from across a table rather than as a flat face-on target.
 *
 * `polar` is measured down from the up axis, and the disc lies in the world XY
 * plane with the renderer's up axis at `+y`. A camera on the `+y` side of it,
 * anything below `PI / 2`, puts the disc's near edge high in frame and its far
 * edge low, which reads as standing under it looking up. `3 * PI / 4` crosses
 * to the `-y` side, keeping the tilt and the side-on `+z` approach while
 * inverting which edge rises.
 */
export const DEFAULT_ORBIT: OrbitState = {
  azimuth: 0,
  polar: (3 * Math.PI) / 4,
  distance: ROUND_SIX_DISTANCE / ZOOM_STEP,
  target: NO_PAN,
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** Wraps an angle into (-PI, PI] so repeated spins never grow without bound. */
function wrapAngle(angle: number): number {
  const wrapped = (((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI
  return wrapped - Math.PI
}

/**
 * @description Applies one user-initiated camera action, with the pole and
 * dolly clamps that keep the view usable.
 * @param state The current orbit.
 * @param action The rotation, dolly, or pan the user asked for.
 * @returns A new orbit; the given one is never mutated.
 */
export function orbitReducer(
  state: OrbitState,
  action: OrbitAction
): OrbitState {
  if (action.type === 'dolly') {
    // A zero, negative, or non-finite factor would collapse or poison the
    // distance; a pinch that reports a degenerate span must be a no-op.
    if (!Number.isFinite(action.factor) || action.factor <= 0)
      return { ...state }
    return {
      ...state,
      distance: clamp(
        state.distance * action.factor,
        MIN_ORBIT_DISTANCE,
        MAX_ORBIT_DISTANCE
      ),
    }
  }
  // A pinch and a pan arrive from the same two fingers and are applied in the
  // same frame, so each has to leave the other's terms exactly as it found them.
  if (action.type === 'pan')
    return { ...state, target: panTarget(state, action) }
  if (action.type === 'recenter') return { ...state, target: NO_PAN }
  return {
    ...state,
    azimuth: wrapAngle(state.azimuth + action.azimuth),
    polar: clamp(
      state.polar + action.polar,
      POLAR_MARGIN,
      Math.PI - POLAR_MARGIN
    ),
  }
}

/**
 * @description Answers whether a dolly would move the camera at all, which is
 * how an input decides whether it has anything to spend. A wheel the camera
 * cannot spend — because the dolly is already against a clamp — belongs to
 * whatever would have handled it otherwise, and the caller needs to know that
 * before it cancels the event. The reducer's own clamps decide, so there is no
 * second set of limits here to drift out of step with them.
 * @param state The current orbit.
 * @param factor The multiplier the input is asking for.
 * @returns True when the resulting distance differs from the current one.
 */
export function dollyMoves(state: OrbitState, factor: number): boolean {
  return (
    orbitReducer(state, { type: 'dolly', factor }).distance !== state.distance
  )
}

/**
 * @description Converts a pointer drag into a rotation, so dragging the full
 * width of the canvas spins the disc exactly once.
 * @param dx Horizontal drag in CSS pixels; positive is rightward.
 * @param dy Vertical drag in CSS pixels; positive is downward.
 * @param width Canvas width in CSS pixels.
 * @param height Canvas height in CSS pixels.
 * @returns Azimuth and polar deltas in radians, both zero for an empty canvas.
 */
export function dragRotation(
  dx: number,
  dy: number,
  width: number,
  height: number
): { readonly azimuth: number; readonly polar: number } {
  return {
    azimuth: width > 0 ? (-TWO_PI * dx) / width : 0,
    polar: height > 0 ? (-Math.PI * dy) / height : 0,
  }
}

/**
 * @description Resolves the world-space camera position for an orbit.
 * @param state The orbit to resolve.
 * @returns The eye position, exactly `state.distance` from `state.target`. The
 * pivot is added rather than orbited about, so a pan carries the eye and the
 * look-at together and the view translates instead of swinging.
 */
export function orbitPosition(state: OrbitState): OrbitPosition {
  const planar = Math.sin(state.polar) * state.distance
  return {
    x: state.target.x + planar * Math.sin(state.azimuth),
    y: state.target.y + Math.cos(state.polar) * state.distance,
    z: state.target.z + planar * Math.cos(state.azimuth),
  }
}

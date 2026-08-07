/**
 * Camera orbit math for the galaxy disc: rotate and dolly, nothing else. This
 * is the whole of the in-repo camera controller's state model, deliberately
 * narrower than a general orbit control (no pan, no auto-rotate, no damping),
 * and it holds no viewport term, so a resize has nothing here to overwrite.
 */

const TWO_PI = Math.PI * 2

/** Smallest angle kept between the polar angle and either pole, in radians. */
export const POLAR_MARGIN = 0.05
/** Closest the camera may dolly to the disc center, in world units. */
export const MIN_ORBIT_DISTANCE = 1.2
/** Furthest the camera may dolly from the disc center, in world units. */
export const MAX_ORBIT_DISTANCE = 12

/** Where the camera sits relative to the disc center. */
export interface OrbitState {
  /** Rotation about the disc's up axis, wrapped into (-PI, PI]. */
  readonly azimuth: number
  /** Angle down from the up axis, clamped clear of both poles. */
  readonly polar: number
  /** Distance from the disc center, in world units. */
  readonly distance: number
}

/** A camera position in world units. */
export interface OrbitPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The only two ways the camera moves, and both are user-initiated: nothing in
 * this module advances on a clock, which is what `prefers-reduced-motion`
 * requires of the camera.
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

/**
 * The opening view: tilted 45 degrees above the disc and pulled back far enough
 * to hold the whole thing in frame, so the galaxy reads as a plate seen from
 * across the table rather than as a flat face-on target. `polar` is measured
 * down from the up axis, so `PI / 4` puts the camera halfway between overhead
 * and edge-on.
 */
export const DEFAULT_ORBIT: OrbitState = {
  azimuth: 0,
  polar: Math.PI / 4,
  distance: 6,
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
 * @param action The rotation or dolly the user asked for.
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
 * @returns The camera position, exactly `state.distance` from the disc center.
 */
export function orbitPosition(state: OrbitState): OrbitPosition {
  const planar = Math.sin(state.polar) * state.distance
  return {
    x: planar * Math.sin(state.azimuth),
    y: Math.cos(state.polar) * state.distance,
    z: planar * Math.cos(state.azimuth),
  }
}

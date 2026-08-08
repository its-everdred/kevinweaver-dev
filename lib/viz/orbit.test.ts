import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORBIT,
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  POLAR_MARGIN,
  ZOOM_STEP,
  dollyMoves,
  dragRotation,
  orbitPosition,
  orbitReducer,
  type OrbitState,
} from './orbit'
import { MAX_PAN_DISTANCE, NO_PAN } from './pan'

const TWO_PI = Math.PI * 2

function rotate(state: OrbitState, azimuth: number, polar: number): OrbitState {
  return orbitReducer(state, { type: 'rotate', azimuth, polar })
}

function dolly(state: OrbitState, factor: number): OrbitState {
  return orbitReducer(state, { type: 'dolly', factor })
}

function pan(state: OrbitState, right: number, up: number): OrbitState {
  return orbitReducer(state, { type: 'pan', right, up })
}

describe('orbit state', () => {
  it('carries only the camera terms, so a resize has nothing to write', () => {
    // The projection aspect is the renderer's business. Nothing viewport-shaped
    // lives here, so no resize path can discard a user's camera. `target` is the
    // pivot two-finger pan moves; it is a world position, not a viewport one.
    expect(Object.keys(DEFAULT_ORBIT).sort()).toEqual([
      'azimuth',
      'distance',
      'polar',
      'target',
    ])
  })

  it('opens with the pivot on the disc center, so the first frame is centred', () => {
    expect(DEFAULT_ORBIT.target).toEqual(NO_PAN)
  })

  it('opens from the other side of the disc plane than the disc is tilted', () => {
    // The disc lies in the world XY plane, and the renderer's up axis is +y.
    // A camera on the +y side puts the disc's near edge high in frame and its
    // far edge low, which reads as looking up at the disc from underneath.
    // Crossing to the -y side inverts that: the far edge rises and the near
    // edge drops, which is a dinner plate seen from across a table.
    expect(DEFAULT_ORBIT.azimuth).toBe(0)
    expect(DEFAULT_ORBIT.polar).toBeCloseTo((3 * Math.PI) / 4, 12)
    const view = orbitPosition(DEFAULT_ORBIT)
    expect(view.x).toBeCloseTo(0, 12)
    expect(view.y).toBeLessThan(0)
    // Still 45 degrees off the plane, and still in front of the disc rather
    // than behind it: only the side of the plane changed.
    expect(view.z).toBeGreaterThan(0)
    expect(view.y).toBeCloseTo(-view.z, 12)
  })

  it('opens inside the reducer clamps, so the first input moves nothing', () => {
    expect(DEFAULT_ORBIT.polar).toBeGreaterThan(POLAR_MARGIN)
    expect(DEFAULT_ORBIT.polar).toBeLessThan(Math.PI - POLAR_MARGIN)
    expect(DEFAULT_ORBIT.distance).toBeGreaterThan(MIN_ORBIT_DISTANCE)
    expect(DEFAULT_ORBIT.distance).toBeLessThan(MAX_ORBIT_DISTANCE)
  })

  it('opens exactly one zoom step nearer than round 6 framed it', () => {
    // One press of zoom-out from the opening view lands back on round 6's
    // distance, which is what "zoom in by one" means: one step of the control
    // the viewer already has, not an unrelated number.
    const roundSix = dolly(DEFAULT_ORBIT, ZOOM_STEP)
    expect(roundSix.distance).toBeCloseTo(6, 12)
    // And still far enough back to hold the disc, which spans 6 world units.
    expect(DEFAULT_ORBIT.distance).toBeGreaterThan(4)
  })
})

describe('rotation', () => {
  it('clamps the polar angle short of both poles', () => {
    expect(rotate(DEFAULT_ORBIT, 0, -10).polar).toBeCloseTo(POLAR_MARGIN, 12)
    expect(rotate(DEFAULT_ORBIT, 0, 10).polar).toBeCloseTo(
      Math.PI - POLAR_MARGIN,
      12
    )
    expect(POLAR_MARGIN).toBeGreaterThan(0)
  })

  it('never flips past a pole under repeated rotation in one direction', () => {
    let up = DEFAULT_ORBIT
    let down = DEFAULT_ORBIT
    for (let turn = 0; turn < 40; turn++) {
      up = rotate(up, 0, -0.3)
      down = rotate(down, 0, 0.3)
      for (const state of [up, down]) {
        expect(state.polar).toBeGreaterThanOrEqual(POLAR_MARGIN)
        expect(state.polar).toBeLessThanOrEqual(Math.PI - POLAR_MARGIN)
      }
    }
    // A flip would swing the camera back through the far side; a clamp holds it
    // just short of the pole, above and below the disc plane respectively.
    expect(orbitPosition(up).y).toBeGreaterThan(0)
    expect(orbitPosition(down).y).toBeLessThan(0)
  })

  it('wraps azimuth instead of accumulating without bound', () => {
    const spun = rotate(DEFAULT_ORBIT, TWO_PI * 3, 0)
    expect(spun.azimuth).toBeGreaterThan(-Math.PI)
    expect(spun.azimuth).toBeLessThanOrEqual(Math.PI)
    // A full spin returns the camera to where it started, whatever the tilt.
    expect(orbitPosition(spun).z).toBeCloseTo(orbitPosition(DEFAULT_ORBIT).z, 9)
  })

  it('leaves the dolly distance untouched', () => {
    expect(rotate(DEFAULT_ORBIT, 1.1, 0.4).distance).toBe(
      DEFAULT_ORBIT.distance
    )
  })

  it('returns a new state and never mutates the one it was given', () => {
    const before = { ...DEFAULT_ORBIT }
    const after = rotate(DEFAULT_ORBIT, 0.5, 0.5)
    expect(DEFAULT_ORBIT).toEqual(before)
    expect(after).not.toBe(DEFAULT_ORBIT)
  })
})

describe('dolly', () => {
  it('clamps to a minimum and a maximum distance', () => {
    expect(dolly(DEFAULT_ORBIT, 1000).distance).toBe(MAX_ORBIT_DISTANCE)
    expect(dolly(DEFAULT_ORBIT, 0.0001).distance).toBe(MIN_ORBIT_DISTANCE)
    expect(MIN_ORBIT_DISTANCE).toBeLessThan(MAX_ORBIT_DISTANCE)
  })

  it('scales the distance by the factor inside the clamps', () => {
    expect(dolly(DEFAULT_ORBIT, 2).distance).toBeCloseTo(
      DEFAULT_ORBIT.distance * 2,
      12
    )
  })

  it('changes distance and not rotation, which is what a pinch needs', () => {
    const turned = rotate(DEFAULT_ORBIT, 0.7, 0.3)
    const pinched = dolly(turned, 0.5)
    expect(pinched.azimuth).toBe(turned.azimuth)
    expect(pinched.polar).toBe(turned.polar)
    expect(pinched.distance).not.toBe(turned.distance)
  })

  it('ignores a non-finite or non-positive factor rather than producing NaN', () => {
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(dolly(DEFAULT_ORBIT, factor).distance).toBe(DEFAULT_ORBIT.distance)
    }
  })

  it('states the step every zoom affordance shares, rather than mirroring it', () => {
    // The buttons, the plus/minus keys, and one wheel notch all spend this.
    // It used to be copied into `useGalaxyCamera` and into this file, which is
    // three places for one number and two of them free to drift.
    expect(dolly(DEFAULT_ORBIT, ZOOM_STEP).distance).toBeCloseTo(6, 12)
    expect(ZOOM_STEP).toBeGreaterThan(1)
  })
})

describe('dollyMoves', () => {
  it('answers whether a dolly would change the distance at all', () => {
    expect(dollyMoves(DEFAULT_ORBIT, ZOOM_STEP)).toBe(true)
    expect(dollyMoves(DEFAULT_ORBIT, 1 / ZOOM_STEP)).toBe(true)
    expect(dollyMoves(DEFAULT_ORBIT, 1)).toBe(false)
  })

  it('reports no movement at the clamp the dolly is already pressed against', () => {
    // This is what lets a wheel the camera cannot spend fall through to the
    // page: the reducer's own clamps decide, so there is no second set here to
    // drift out of step with them.
    const far = dolly(DEFAULT_ORBIT, 1000)
    expect(far.distance).toBe(MAX_ORBIT_DISTANCE)
    expect(dollyMoves(far, ZOOM_STEP)).toBe(false)
    expect(dollyMoves(far, 1 / ZOOM_STEP)).toBe(true)

    const near = dolly(DEFAULT_ORBIT, 0.0001)
    expect(near.distance).toBe(MIN_ORBIT_DISTANCE)
    expect(dollyMoves(near, 1 / ZOOM_STEP)).toBe(false)
    expect(dollyMoves(near, ZOOM_STEP)).toBe(true)
  })

  it('reports no movement for a factor the reducer rejects outright', () => {
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(dollyMoves(DEFAULT_ORBIT, factor)).toBe(false)
  })

  it('never mutates the orbit it is asked about', () => {
    const before = { ...DEFAULT_ORBIT }
    dollyMoves(DEFAULT_ORBIT, 3)
    expect(DEFAULT_ORBIT).toEqual(before)
  })
})

describe('dragRotation', () => {
  it('maps a full-width drag to one full turn', () => {
    expect(dragRotation(600, 0, 600, 400).azimuth).toBeCloseTo(-TWO_PI, 12)
    expect(dragRotation(600, 0, 600, 400).polar).toBeCloseTo(0, 12)
  })

  it('maps a full-height drag to one pole-to-pole sweep', () => {
    expect(dragRotation(0, 400, 600, 400).polar).toBeCloseTo(-Math.PI, 12)
    expect(dragRotation(0, 400, 600, 400).azimuth).toBeCloseTo(0, 12)
  })

  it('yields no rotation for a zero-sized viewport', () => {
    const still = dragRotation(10, 10, 0, 0)
    expect(still.azimuth).toBe(0)
    expect(still.polar).toBe(0)
  })
})

describe('pan', () => {
  it('moves the pivot and leaves the rotation and the dolly alone', () => {
    // A two-finger gesture is a pinch and a pan at once, and the two have to be
    // separable: a pan that quietly nudged the azimuth would make every drift
    // of the hand during a pinch spin the disc.
    const turned = dolly(rotate(DEFAULT_ORBIT, 0.7, 0.3), 1.4)
    const panned = pan(turned, 0.5, -0.2)
    expect(panned.azimuth).toBe(turned.azimuth)
    expect(panned.polar).toBe(turned.polar)
    expect(panned.distance).toBe(turned.distance)
    expect(panned.target).not.toEqual(turned.target)
  })

  it('clamps the pivot to the disc it belongs to', () => {
    let far = DEFAULT_ORBIT
    for (let push = 0; push < 50; push++) far = pan(far, 1, 0)
    const { target } = far
    expect(Math.hypot(target.x, target.y, target.z)).toBeCloseTo(
      MAX_PAN_DISTANCE,
      9
    )
  })

  it('leaves the pivot alone under rotation and dolly', () => {
    const panned = pan(DEFAULT_ORBIT, 0.5, 0.5)
    expect(rotate(panned, 1, 0.2).target).toBe(panned.target)
    expect(dolly(panned, 1.3).target).toBe(panned.target)
  })

  it('returns the pivot to the disc center on recenter, and nothing else', () => {
    // The one way back for a viewer who has panned somewhere they did not mean
    // to go. It moves the pivot only: a reset that also threw away the rotation
    // and the zoom would take more than the viewer asked it to.
    const wandered = pan(dolly(rotate(DEFAULT_ORBIT, 0.9, 0.2), 1.6), 1.2, -0.8)
    const home = orbitReducer(wandered, { type: 'recenter' })
    expect(home.target).toEqual(NO_PAN)
    expect(home.azimuth).toBe(wandered.azimuth)
    expect(home.polar).toBe(wandered.polar)
    expect(home.distance).toBe(wandered.distance)
  })

  it('never mutates the orbit it was given', () => {
    const before = { ...DEFAULT_ORBIT }
    pan(DEFAULT_ORBIT, 0.4, 0.4)
    expect(DEFAULT_ORBIT).toEqual(before)
  })
})

describe('orbitPosition', () => {
  it('keeps the camera exactly `distance` from the disc center', () => {
    const state = dolly(rotate(DEFAULT_ORBIT, 1.3, -0.6), 1.5)
    const { x, y, z } = orbitPosition(state)
    expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(state.distance, 9)
  })

  it('carries the eye with the pivot, so a pan translates rather than swings', () => {
    // Pan moves the point the camera looks at. If the eye did not move with it
    // by exactly the same offset, the "pan" would swing the camera around a
    // fixed origin instead — a rotation wearing a pan's name.
    const still = dolly(rotate(DEFAULT_ORBIT, 1.3, -0.6), 1.5)
    const moved = pan(still, 0.6, -0.4)
    const from = orbitPosition(still)
    const to = orbitPosition(moved)
    expect(to.x - from.x).toBeCloseTo(moved.target.x, 12)
    expect(to.y - from.y).toBeCloseTo(moved.target.y, 12)
    expect(to.z - from.z).toBeCloseTo(moved.target.z, 12)
    // And the eye is still exactly `distance` from what it is looking at.
    expect(
      Math.hypot(
        to.x - moved.target.x,
        to.y - moved.target.y,
        to.z - moved.target.z
      )
    ).toBeCloseTo(moved.distance, 9)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORBIT,
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  POLAR_MARGIN,
  dragRotation,
  orbitPosition,
  orbitReducer,
  type OrbitState,
} from './orbit'

const TWO_PI = Math.PI * 2
/** The multiplier one zoom press applies, mirrored from `useGalaxyCamera`. */
const ZOOM_STEP = 1.25

function rotate(state: OrbitState, azimuth: number, polar: number): OrbitState {
  return orbitReducer(state, { type: 'rotate', azimuth, polar })
}

function dolly(state: OrbitState, factor: number): OrbitState {
  return orbitReducer(state, { type: 'dolly', factor })
}

describe('orbit state', () => {
  it('carries only the three orbit terms, so a resize has nothing to write', () => {
    // The projection aspect is the renderer's business. Nothing viewport-shaped
    // lives here, so no resize path can discard a user's camera.
    expect(Object.keys(DEFAULT_ORBIT).sort()).toEqual([
      'azimuth',
      'distance',
      'polar',
    ])
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

describe('orbitPosition', () => {
  it('keeps the camera exactly `distance` from the disc center', () => {
    const state = dolly(rotate(DEFAULT_ORBIT, 1.3, -0.6), 1.5)
    const { x, y, z } = orbitPosition(state)
    expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(state.distance, 9)
  })
})

import { describe, expect, it } from 'vitest'
import {
  KEY_PAN,
  MAX_PAN_DISTANCE,
  NO_PAN,
  dragPan,
  panTarget,
  type PanVector,
} from './pan'

/** The scene camera's vertical field of view, halved, in radians. */
const HALF_FOV = Math.PI / 6

/**
 * World height visible at the pivot plane for a given camera distance, which is
 * the whole of what "the point under the finger stays under the finger" means:
 * a drag of the full viewport height must cover exactly this much world.
 */
function visibleHeight(distance: number): number {
  return 2 * distance * Math.tan(HALF_FOV)
}

function reach(point: PanVector): number {
  return Math.hypot(point.x, point.y, point.z)
}

/** Pans from a stated camera, which is all `panTarget` reads of one. */
function pan(
  target: PanVector,
  azimuth: number,
  polar: number,
  step: { right: number; up: number }
): PanVector {
  return panTarget({ azimuth, polar, target }, step)
}

describe('the pan clamp', () => {
  it("stops the pivot at the disc's own rim, so the galaxy is never lost", () => {
    // The disc is a circle of DISC_FIELD_RADIUS (0.42) in field units drawn
    // across a world width of 6, so its own radius is 2.52 world units. Bounding
    // the pivot by that means any star on the rim can be brought to the middle
    // of the screen — the whole point of panning — while the disc center is
    // never further from the middle than the disc's own radius, so some of the
    // galaxy is always in frame. An unbounded pan is a trap: push the disc off
    // screen and there is no cue anywhere saying which way to push it back.
    expect(MAX_PAN_DISTANCE).toBeGreaterThan(2)
    expect(MAX_PAN_DISTANCE).toBeLessThanOrEqual(2.52)
  })

  it('clamps the reach and not each axis, so a diagonal pan cannot cheat it', () => {
    // A per-axis clamp would let a diagonal drag reach MAX * sqrt(3) from the
    // center, which is a third again as far as the bound claims.
    let target: PanVector = NO_PAN
    for (let push = 0; push < 40; push++)
      target = pan(target, 0.9, 1.1, { right: 1, up: 1 })
    expect(reach(target)).toBeCloseTo(MAX_PAN_DISTANCE, 9)
  })

  it('leaves a pan inside the bound exactly where it asked to go', () => {
    const target = pan(NO_PAN, 0, Math.PI / 2, { right: 0.4, up: 0 })
    expect(target.x).toBeCloseTo(0.4, 12)
    expect(reach(target)).toBeCloseTo(0.4, 12)
  })

  it('opens un-panned, with the pivot on the disc center', () => {
    expect(NO_PAN).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('panTarget', () => {
  it('moves the pivot along the camera axes, not the world axes', () => {
    // Right is +x with the camera at azimuth 0; a quarter turn puts it on -z.
    // Panning in world axes instead would send the pivot sideways off screen
    // the moment the viewer had rotated the disc.
    const east = pan(NO_PAN, 0, Math.PI / 2, { right: 1, up: 0 })
    expect(east.x).toBeCloseTo(1, 12)
    expect(east.y).toBeCloseTo(0, 12)
    expect(east.z).toBeCloseTo(0, 12)

    const turned = pan(NO_PAN, Math.PI / 2, Math.PI / 2, {
      right: 1,
      up: 0,
    })
    expect(turned.x).toBeCloseTo(0, 12)
    expect(turned.z).toBeCloseTo(-1, 12)
  })

  it('tilts the up axis with the camera rather than using world up', () => {
    // At the default 45-degree tilt an "up the screen" pan is partly upward and
    // partly away, because the screen's up is not the world's.
    const up = pan(NO_PAN, 0, (3 * Math.PI) / 4, { right: 0, up: 1 })
    expect(up.y).toBeCloseTo(Math.sin((3 * Math.PI) / 4), 12)
    expect(up.z).toBeCloseTo(-Math.cos((3 * Math.PI) / 4), 12)
    expect(reach(up)).toBeCloseTo(1, 12)
  })

  it('keeps the two axes independent, so a diagonal is the sum of its parts', () => {
    const both = pan(NO_PAN, 0.3, 1.2, { right: 0.2, up: 0.3 })
    const apart = pan(pan(NO_PAN, 0.3, 1.2, { right: 0.2, up: 0 }), 0.3, 1.2, {
      right: 0,
      up: 0.3,
    })
    expect(both.x).toBeCloseTo(apart.x, 12)
    expect(both.y).toBeCloseTo(apart.y, 12)
    expect(both.z).toBeCloseTo(apart.z, 12)
  })

  it('ignores a non-finite step rather than poisoning the pivot', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pan(NO_PAN, 0, 1, { right: bad, up: 0 })).toEqual(NO_PAN)
      expect(pan(NO_PAN, 0, 1, { right: 0, up: bad })).toEqual(NO_PAN)
    }
  })

  it('returns a new pivot and never mutates the one it was given', () => {
    const before = { ...NO_PAN }
    const after = pan(NO_PAN, 0.5, 0.5, { right: 0.3, up: 0.3 })
    expect(NO_PAN).toEqual(before)
    expect(after).not.toBe(NO_PAN)
  })
})

describe('dragPan', () => {
  it('keeps the point under the finger under the finger', () => {
    // A drag of the whole viewport height must move the world by the whole
    // world height visible at the pivot plane. Anything else and the galaxy
    // slides out from under the hand pushing it.
    const step = dragPan(0, 400, 400, 5)
    expect(step.up).toBeCloseTo(visibleHeight(5), 12)
    expect(step.right).toBeCloseTo(0, 12)
  })

  it('covers more world per pixel the further out the camera is', () => {
    // A fixed pan-per-pixel feels wrong at both ends: glacial when zoomed out,
    // twitchy when zoomed in. Scaling by the camera distance is what makes one
    // finger-width mean the same *fraction of the view* at every zoom level.
    const near = dragPan(100, 0, 400, 2)
    const far = dragPan(100, 0, 400, 4)
    expect(far.right).toBeCloseTo(near.right * 2, 12)
  })

  it('moves the pivot against the drag, so the disc follows the finger', () => {
    // Drag right and the galaxy must travel right, which means the camera's
    // pivot travels left. The sign here is the difference between grabbing the
    // disc and pushing a scrollbar.
    expect(dragPan(50, 0, 400, 5).right).toBeLessThan(0)
    expect(dragPan(-50, 0, 400, 5).right).toBeGreaterThan(0)
    // Drag down and the galaxy travels down, so the pivot rises.
    expect(dragPan(0, 50, 400, 5).up).toBeGreaterThan(0)
    expect(dragPan(0, -50, 400, 5).up).toBeLessThan(0)
  })

  it('yields no travel for a collapsed viewport or an unreadable drag', () => {
    const still = { right: 0, up: 0 }
    expect(dragPan(10, 10, 0, 5)).toEqual(still)
    expect(dragPan(10, 10, -400, 5)).toEqual(still)
    expect(dragPan(Number.NaN, 10, 400, 5)).toEqual(still)
    expect(dragPan(10, Number.NaN, 400, 5)).toEqual(still)
    expect(dragPan(10, 10, 400, Number.POSITIVE_INFINITY)).toEqual(still)
  })
})

describe('KEY_PAN', () => {
  it('crosses the whole pan range in a countable number of presses', () => {
    // The keyboard is the accessible path, not a token one: pressing a key ten
    // times has to actually get somewhere. Ten steps from center to rim is the
    // same order as the arrow keys' 48 presses for a full turn.
    expect(MAX_PAN_DISTANCE / KEY_PAN).toBeGreaterThanOrEqual(5)
    expect(MAX_PAN_DISTANCE / KEY_PAN).toBeLessThanOrEqual(20)
  })
})

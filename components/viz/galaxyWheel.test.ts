import { describe, expect, it } from 'vitest'
import { ZOOM_STEP } from '@/lib/viz/orbit'
import {
  MAX_WHEEL_NOTCHES,
  WHEEL_LINE_PIXELS,
  WHEEL_NOTCH_PIXELS,
  WHEEL_PAGE_PIXELS,
  wheelDollyFactor,
  wheelPixels,
} from './galaxyWheel'

/** The cap one event may spend, in CSS pixels. */
const CAP = MAX_WHEEL_NOTCHES * WHEEL_NOTCH_PIXELS

describe('wheelPixels', () => {
  it('takes a pixel-mode delta as it stands', () => {
    // Chrome and Safari report DOM_DELTA_PIXEL for both a mouse and a trackpad;
    // the two differ only in how large and how frequent the deltas are.
    expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100)
    expect(wheelPixels({ deltaY: -100, deltaMode: 0 })).toBe(-100)
  })

  it('scales a line-mode delta, which is what Firefox reports for a mouse', () => {
    // Firefox sends DOM_DELTA_LINE with three lines to a detent, so a notch has
    // to be read through the line height rather than taken as three pixels.
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(3 * WHEEL_LINE_PIXELS)
    expect(wheelPixels({ deltaY: -3, deltaMode: 1 })).toBe(
      -3 * WHEEL_LINE_PIXELS
    )
  })

  it('scales a page-mode delta, which a screen-at-a-time setting sends', () => {
    // A quarter page, because a whole one is over the cap on its own and the
    // scaling would be hidden behind it.
    expect(wheelPixels({ deltaY: 0.25, deltaMode: 2 })).toBe(
      WHEEL_PAGE_PIXELS / 4
    )
  })

  it('caps one event so no single fling crosses the whole dolly range', () => {
    expect(wheelPixels({ deltaY: 100_000, deltaMode: 0 })).toBe(CAP)
    expect(wheelPixels({ deltaY: -100_000, deltaMode: 0 })).toBe(-CAP)
    // A page-mode delta is over the cap on its own, which is the point of it.
    expect(WHEEL_PAGE_PIXELS).toBeGreaterThan(CAP)
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBe(CAP)
  })

  it('reads a non-finite or unknown-mode delta as no scroll at all', () => {
    // `deltaMode` is an enum with three members. A fourth is a device or a
    // synthetic event this code does not understand, and guessing at its unit
    // would zoom by an arbitrary amount.
    expect(wheelPixels({ deltaY: 100, deltaMode: 7 })).toBe(0)
    expect(wheelPixels({ deltaY: Number.NaN, deltaMode: 0 })).toBe(0)
    expect(
      wheelPixels({ deltaY: Number.POSITIVE_INFINITY, deltaMode: 0 })
    ).toBe(0)
  })
})

describe('wheelDollyFactor', () => {
  it('spends one mouse notch as exactly one zoom step', () => {
    // The same step the +/- buttons and the plus/minus keys apply, so a notch
    // and a press are the same unit of travel rather than two tunings.
    expect(
      wheelDollyFactor({ deltaY: WHEEL_NOTCH_PIXELS, deltaMode: 0 })
    ).toBeCloseTo(ZOOM_STEP, 12)
    expect(
      wheelDollyFactor({ deltaY: -WHEEL_NOTCH_PIXELS, deltaMode: 0 })
    ).toBeCloseTo(1 / ZOOM_STEP, 12)
  })

  it('pushes the camera out on a downward wheel and pulls it in on an upward one', () => {
    // Scrolling down the page recedes from the galaxy, which is the direction
    // every map and orbit control agrees on, and which lets a wheel that runs
    // out of galaxy carry straight on down the page.
    expect(wheelDollyFactor({ deltaY: 10, deltaMode: 0 })).toBeGreaterThan(1)
    expect(wheelDollyFactor({ deltaY: -10, deltaMode: 0 })).toBeLessThan(1)
  })

  it('makes one trackpad delta a fraction of a notch, not a notch', () => {
    // A trackpad emits dozens of small deltas where a mouse emits one detent.
    // Reading each as a notch would zoom the full range in a single flick.
    const factor = wheelDollyFactor({ deltaY: 4, deltaMode: 0 })
    expect(factor).toBeGreaterThan(1)
    expect(factor).toBeLessThan(1.01)
  })

  it('composes: the deltas a trackpad spends over one notch multiply to one step', () => {
    let product = 1
    for (let event = 0; event < 25; event++)
      product *= wheelDollyFactor({ deltaY: 4, deltaMode: 0 })
    expect(product).toBeCloseTo(ZOOM_STEP, 9)
  })

  it('is the identity factor for a horizontal, empty, or unreadable wheel', () => {
    // Exactly 1 is the reducer's no-op, and the hook reads it as "this wheel
    // was never the galaxy's", so a sideways trackpad swipe stays the page's.
    expect(wheelDollyFactor({ deltaY: 0, deltaMode: 0 })).toBe(1)
    expect(wheelDollyFactor({ deltaY: Number.NaN, deltaMode: 0 })).toBe(1)
    expect(wheelDollyFactor({ deltaY: 100, deltaMode: 9 })).toBe(1)
  })

  it('never yields a factor the reducer would reject', () => {
    for (const deltaY of [-100_000, -100, -1, 1, 100, 100_000])
      for (const deltaMode of [0, 1, 2]) {
        const factor = wheelDollyFactor({ deltaY, deltaMode })
        expect(Number.isFinite(factor)).toBe(true)
        expect(factor).toBeGreaterThan(0)
      }
  })
})

/**
 * Wheel deltas to dolly factors, and nothing else: no DOM, no React, no state.
 * A `WheelEvent` reports its scroll in one of three units and at wildly
 * different resolutions — a mouse detent arrives as one large delta, a trackpad
 * flick as dozens of small ones — so the two have to be reconciled to a common
 * unit before either can be spent as a zoom.
 */

import { ZOOM_STEP } from '@/lib/viz/orbit'

/** As much of a `WheelEvent` as the factor depends on. */
export interface WheelDelta {
  /** Vertical scroll, in the unit `deltaMode` names. */
  readonly deltaY: number
  /** `WheelEvent.DOM_DELTA_PIXEL`, `_LINE`, or `_PAGE`. */
  readonly deltaMode: number
}

/**
 * CSS pixels worth one zoom step. Chrome and Safari report about 100 pixels per
 * mouse detent and Firefox three lines, so at this size one detent is one press
 * of the zoom button on every browser the site is tested in.
 */
export const WHEEL_NOTCH_PIXELS = 100
/** CSS pixels one `DOM_DELTA_LINE` unit stands for. */
export const WHEEL_LINE_PIXELS = 40
/** CSS pixels one `DOM_DELTA_PAGE` unit stands for. */
export const WHEEL_PAGE_PIXELS = 800
/**
 * The most one event may spend. A momentum fling, a page-mode delta, or a
 * synthetic event with an absurd `deltaY` would otherwise cross the entire
 * dolly range between two frames, which reads as a teleport rather than a zoom.
 */
export const MAX_WHEEL_NOTCHES = 4

const MAX_WHEEL_PIXELS = MAX_WHEEL_NOTCHES * WHEEL_NOTCH_PIXELS

/** CSS pixels per unit for each `deltaMode`, indexed by the mode itself. */
const MODE_PIXELS: readonly number[] = [1, WHEEL_LINE_PIXELS, WHEEL_PAGE_PIXELS]

/**
 * @description Normalises one wheel event's vertical delta to CSS pixels, so a
 * mouse in line mode and a trackpad in pixel mode are measured the same way.
 * @param delta The event's `deltaY` and `deltaMode`.
 * @returns Signed CSS pixels, capped, and 0 for anything unreadable. Positive
 * is a downward scroll.
 */
export function wheelPixels(delta: WheelDelta): number {
  const scale = MODE_PIXELS[delta.deltaMode]
  // A fourth `deltaMode` is a unit this code has never seen. Guessing at it
  // would zoom by an arbitrary amount, so it reads as no scroll and the event
  // stays with whatever else would have handled it.
  if (scale === undefined || !Number.isFinite(delta.deltaY)) return 0
  const pixels = delta.deltaY * scale
  return Math.max(-MAX_WHEEL_PIXELS, Math.min(MAX_WHEEL_PIXELS, pixels))
}

/**
 * @description Converts one wheel event into the dolly factor it is worth.
 * Continuous rather than stepped: a full detent is exactly one `ZOOM_STEP`, and
 * the many small deltas a trackpad emits over the same distance multiply to the
 * same step, because the exponents add. Rounding each event up to a notch
 * instead would make one trackpad flick cross the whole dolly range.
 * @param delta The event's `deltaY` and `deltaMode`.
 * @returns A positive, finite multiplier for the camera distance. Scrolling
 * down yields a factor above 1, pushing the camera out; scrolling up pulls it
 * in. Exactly 1 means the event carried no zoom in it at all.
 */
export function wheelDollyFactor(delta: WheelDelta): number {
  const pixels = wheelPixels(delta)
  if (pixels === 0) return 1
  return ZOOM_STEP ** (pixels / WHEEL_NOTCH_PIXELS)
}

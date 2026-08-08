/**
 * What a set of pointer contacts on the galaxy canvas is worth, in client
 * pixels — and nothing else. No React, no reducer, no world units: this module
 * answers "the hand did *that*", and `useGalaxyCamera` decides what the camera
 * spends on it.
 *
 * The interesting case is two fingers. A real two-finger gesture is almost
 * never purely a pinch or purely a drag: fingers spread a little while the hand
 * drifts, and the ratio changes continuously through the gesture. So the two
 * are read as independent components of one gesture — the change in the
 * *distance* between the contacts is the zoom, the travel of their *midpoint*
 * is the pan — and every sample reports both. Locking into one mode on a
 * threshold is the alternative, and it fails the moment the viewer's intent
 * changes mid-gesture: the camera stops doing the thing the hand is currently
 * doing and there is no way to say so without lifting off and starting again.
 */

/** Where each active pointer last was, in client pixels. */
export type Pointers = Map<number, { x: number; y: number }>

/**
 * Client pixels a pointer may travel and still count as a click. Every drag
 * starts as a press, so without a slop the same gesture that rotates the disc
 * would also pick whatever arm it happened to end over; with one, a hand that
 * shakes by a pixel or two still clicks.
 */
export const CLICK_SLOP = 6

/** One continuous set of contacts, from the first press to the last lift. */
export interface Gesture {
  readonly pointers: Pointers
  /** Distance between the first two contacts as of the last sample, or 0. */
  span: number
  /** Midpoint of the first two contacts as of the last sample. */
  centroid: { x: number; y: number }
  /** Where the gesture began, or null when no pointer is down. */
  origin: { x: number; y: number } | null
  /** True once it has travelled far enough to be a drag rather than a click. */
  dragged: boolean
}

/** What one pointer move is worth to the camera. */
export type GestureMove =
  | {
      readonly kind: 'rotate'
      /** Travel of the single contact, in client pixels. */
      readonly dx: number
      readonly dy: number
    }
  | {
      readonly kind: 'pinch'
      /** Multiplier on the camera distance; below 1 pulls the camera in. */
      readonly factor: number
      /** Travel of the midpoint, in client pixels. */
      readonly dx: number
      readonly dy: number
    }

/** @description An empty gesture, before any finger has landed. */
export function createGesture(): Gesture {
  return {
    pointers: new Map(),
    span: 0,
    centroid: { x: 0, y: 0 },
    origin: null,
    dragged: false,
  }
}

/**
 * @description Records a contact landing and re-seeds what the next sample is
 * measured against. Seeding matters most for the second finger: the midpoint
 * leaps from one contact to halfway between two the instant it arrives, and
 * read as pan that jump would fling the galaxy across the screen.
 * @param gesture The gesture to record into; mutated in place.
 * @param pointerId The contact's id.
 * @param x Client x.
 * @param y Client y.
 */
export function pressGesture(
  gesture: Gesture,
  pointerId: number,
  x: number,
  y: number
): void {
  gesture.pointers.set(pointerId, { x, y })
  resample(gesture)
  if (gesture.pointers.size === 1) {
    gesture.origin = { x, y }
    gesture.dragged = false
    return
  }
  // A second finger is a pinch or a pan. Neither is ever a click.
  gesture.dragged = true
}

/**
 * @description Reads one pointer move against the gesture and reports what it
 * is worth, consuming the sample it was measured from.
 * @param gesture The gesture to read; mutated in place.
 * @param pointerId The contact that moved.
 * @param x Client x.
 * @param y Client y.
 * @returns The rotation or the pinch-and-pan the move carries, or null for a
 * contact this gesture never saw land — whose delta would otherwise be read
 * against a missing anchor.
 */
export function moveGesture(
  gesture: Gesture,
  pointerId: number,
  x: number,
  y: number
): GestureMove | null {
  const previous = gesture.pointers.get(pointerId)
  if (!previous) return null
  const dx = x - previous.x
  const dy = y - previous.y
  gesture.pointers.set(pointerId, { x, y })
  // A gesture that has once travelled past the slop stays a drag, even if it
  // wanders back: the camera has already moved, so the lift that ends it is the
  // end of a rotation and not a pick.
  const { origin } = gesture
  if (origin && Math.hypot(x - origin.x, y - origin.y) > CLICK_SLOP)
    gesture.dragged = true
  if (gesture.pointers.size < 2) return { kind: 'rotate', dx, dy }
  const previousSpan = gesture.span
  const from = gesture.centroid
  resample(gesture)
  return {
    kind: 'pinch',
    // A zero span is a degenerate pinch; the camera's reducer rejects the
    // factor as a no-op rather than collapsing the distance.
    factor: gesture.span > 0 ? previousSpan / gesture.span : 0,
    dx: gesture.centroid.x - from.x,
    dy: gesture.centroid.y - from.y,
  }
}

/** @description Records a contact lifting, leaving any others still gesturing. */
export function liftGesture(gesture: Gesture, pointerId: number): void {
  gesture.pointers.delete(pointerId)
  resample(gesture)
  if (gesture.pointers.size === 0) gesture.origin = null
}

/**
 * @description Ends the gesture outright, which is what a pointer leaving the
 * canvas means. Without it a stale anchor survives and the next move is read as
 * the whole gap between where the hand left and where it came back.
 */
export function clearGesture(gesture: Gesture): void {
  gesture.pointers.clear()
  gesture.span = 0
  gesture.origin = null
}

/**
 * @description Whether the gesture ending here was a click rather than a drag.
 * @param gesture The gesture, before it is retired.
 * @param x Client x of the lift.
 * @param y Client y of the lift.
 * @returns True only for a single contact that never left the slop.
 */
export function isClickGesture(
  gesture: Gesture,
  x: number,
  y: number
): boolean {
  const { origin, dragged } = gesture
  if (!origin || dragged) return false
  return Math.hypot(x - origin.x, y - origin.y) <= CLICK_SLOP
}

/** Re-reads the span and midpoint of the first two contacts. */
function resample(gesture: Gesture): void {
  const [first, second] = [...gesture.pointers.values()]
  if (!first || !second) {
    gesture.span = 0
    return
  }
  gesture.span = Math.hypot(second.x - first.x, second.y - first.y)
  gesture.centroid = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

/**
 * The two pointer-capture calls the galaxy canvas makes, and the guards that
 * stop either of them taking the page down.
 *
 * Capture is what keeps a gesture alive when the hand strays outside the
 * canvas: without it a drag that crosses the edge stops dead, and a two-finger
 * pan crosses the edge constantly. It is nonetheless an optimisation, which is
 * the whole reason it can be guarded this bluntly — losing it costs a gesture
 * that wandered off the element, and nothing else.
 */

/**
 * @description Takes the pointer capture for a contact, if the browser will
 * give it.
 *
 * `setPointerCapture` throws `NotFoundError` for a contact the browser has
 * already retired, and an exception thrown out of a React event handler
 * surfaces as an unhandled rejection: green across 522 unit tests, exit 1 in
 * CI. jsdom omits these methods entirely, which is a second way to throw.
 *
 * @param target The element the gesture is on.
 * @param pointerId The contact to capture.
 */
export function capture(target: Element, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId)
  } catch {
    // The gesture still works; it just ends at the element's edge.
  }
}

/**
 * @description Releases a capture, and only one this element actually holds —
 * a `pointerleave` may fire for a contact that was never captured.
 * @param target The element the gesture is on.
 * @param pointerId The contact to release.
 */
export function release(target: Element, pointerId: number): void {
  try {
    if (target.hasPointerCapture(pointerId))
      target.releasePointerCapture(pointerId)
  } catch {
    // Already released by the browser, which is the state this wanted anyway.
  }
}

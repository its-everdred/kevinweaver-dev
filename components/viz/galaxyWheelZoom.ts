'use client'
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { dollyMoves } from '@/lib/viz/orbit'
import { wheelDollyFactor } from './galaxyWheel'
import type { GalaxyCamera } from './useGalaxyCamera'

/**
 * @description Lets the wheel drive the camera's existing dolly, without ever
 * trapping the page scroll.
 *
 * The galaxy is one section of a long scrolling page and its canvas is full
 * width, so a wheel handler that cancelled every event would stop the page dead
 * the moment a reader's cursor crossed it — trivially easy to hit by accident
 * on a trackpad. Two gates keep that from happening, and between them the wheel
 * is only ever taken when the reader is unambiguously driving the galaxy:
 *
 * 1. The canvas must hold focus. That is the same gate the arrow and plus/minus
 *    keys already sit behind, and it is reached by the same acts that mean "I
 *    am using this": a click, a drag, or a Tab. A cursor merely passing over on
 *    the way down the page never claims a single event.
 * 2. The dolly must have somewhere to go. At either clamp the event is left
 *    uncancelled, so a reader who has zoomed the galaxy all the way out and
 *    keeps scrolling carries straight on down the page.
 *
 * Ctrl and meta wheel are never taken: that is the browser's own page zoom and
 * what a trackpad pinch reports, and claiming it would remove a WCAG 1.4.4
 * resize affordance at exactly the spot a reader might reach for it.
 *
 * Nothing here is animated, damped, or on a clock — one event moves the camera
 * once, immediately — so `prefers-reduced-motion` has nothing to suppress. It
 * governs motion the reader did not ask for, and this is direct manipulation;
 * gating it would remove a control rather than remove motion.
 *
 * The listener is native and non-passive because React registers `wheel`
 * passively at the root container (verified in `react-dom` 19.2.8), which makes
 * `preventDefault` in an `onWheel` prop a no-op.
 *
 * @param canvasRef The canvas the galaxy renders into.
 * @param camera The camera whose dolly the wheel reaches. Wheel input goes
 * through the same reducer as the buttons and the keys, so there is one place
 * where a zoom happens and one set of clamps.
 */
export function useGalaxyWheelZoom(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  camera: GalaxyCamera
): void {
  const { dolly, orbitRef } = camera
  useEffect(() => {
    const canvas = canvasRef.current
    // A ref that never resolved is a canvas that never mounted; there is no
    // element to listen on and nothing to clean up.
    if (!canvas) return

    // An arrow bound to a `const`, not a hoisted declaration: the null check
    // above only narrows into a closure that cannot run before it.
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) return
      // A wheel event is dispatched to the element under the pointer, so being
      // here already means the cursor is over the canvas. Focus is the second
      // half: it is what separates "reading past the galaxy" from "driving it".
      if (canvas.ownerDocument.activeElement !== canvas) return
      const factor = wheelDollyFactor(event)
      // Nothing to spend — a sideways swipe, or a dolly already at its clamp.
      // The event is left alone rather than cancelled, so the page scrolls.
      if (!dollyMoves(orbitRef.current, factor)) return
      dolly(factor)
      // Claimed only now that the camera has actually moved. An event is either
      // the galaxy's or the page's; splitting one between them would zoom and
      // scroll at once, which reads as the page lurching.
      event.preventDefault()
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      // The same element the listener went on, captured above rather than read
      // back off the ref, which by teardown may point somewhere else or nowhere.
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [canvasRef, dolly, orbitRef])
}

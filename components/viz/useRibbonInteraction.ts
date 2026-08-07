'use client'
import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { getGalaxyTimeline, seekGalaxyTimeline } from './galaxyTimeline'
import { ribbonDayAt, ribbonLayout, ribbonWindow } from './ribbonWindow'

interface InteractionOptions {
  /** Total days in the payload. */
  readonly dayCount: number
  /** Weekday of payload day 0, as `weekdayOfISO` reports it. */
  readonly startWeekday: number
}
/** The day and backing-store point a drag was grabbed at. */
interface Grab {
  readonly day: number
  readonly xPx: number
  readonly yPx: number
  readonly stepPx: number
}
interface RibbonInteraction {
  readonly onPointerCancel: (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => void
  readonly onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void
}
type GrabRef = RefObject<Grab | null>

/**
 * @description Provides the contribution grid's scrub gesture: press seeks the
 * shared galaxy timeline to the square under the pointer, drag walks history
 * from where it was grabbed.
 * @param options Payload dimensions the lattice is measured against.
 * @returns Stable-shape pointer handlers for the ribbon canvas.
 *
 * Two mappings, on purpose. A press is absolute — the day under the cursor is
 * the day you get, so clicking a square seeks to exactly that day. A drag is
 * relative to the grab point — a week per column of travel, a day per row —
 * which is what lets the gesture keep walking once it leaves the window the
 * pane has room for. An absolute drag could not: the window shifts under the
 * pointer as the clock passes its oldest day, and the cursor would jump a whole
 * window with it. Anchored to the grab, the shift is invisible to the gesture.
 *
 * The drag pulls rather than pushes: dragging right slides the strip right
 * under the hand, which uncovers the weeks that were off its left edge, so time
 * runs backward. It is a sheet of paper being moved, not a scrollbar being
 * thrown. The transport's progress bar is the scrollbar and seeks with the
 * pointer instead; a press here, being absolute, has no direction to invert.
 *
 * The press takes pointer capture, so the whole drag reports back here however
 * far off the strip it wanders. The strip is one pane row tall; an uncaptured
 * drag hands every move to whatever the cursor happens to be over and dies a
 * few pixels above the squares.
 */
export function useRibbonInteraction(
  options: InteractionOptions
): RibbonInteraction {
  const grab = useRef<Grab | null>(null)
  return {
    onPointerCancel: (event) => release(grab, event),
    onPointerDown: (event) => onPointerDown(options, grab, event),
    onPointerMove: (event) => onPointerMove(options, grab, event),
    onPointerUp: (event) => release(grab, event),
  }
}

/** Device pixel cap shared with every other instrument canvas. */
function ribbonDpr(): number {
  return Math.min(2, window.devicePixelRatio || 1)
}

/**
 * Client coordinates in backing-store space. The lattice is measured in
 * backing-store pixels, so the pointer has to be read there too.
 */
function backingPoint(
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>
): { xPx: number; yPx: number } | null {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    xPx: (event.clientX - rect.left) * (canvas.width / rect.width),
    yPx: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

/**
 * @description Claims the pointer for the drag, tolerating a refusal.
 *
 * `setPointerCapture` throws `NotFoundError` when the id names no active
 * pointer — a pointer already released, or a synthetic event. Capture is what
 * keeps a scrub alive when the drag wanders off the one-row-tall strip, but it
 * is an enhancement: the move handler also accepts a held button, so a refused
 * capture costs robustness at the edges, never the gesture. Letting it throw
 * out of a React event handler would take the whole scrub with it.
 * @param canvas The ribbon canvas.
 * @param pointerId The pointer to claim.
 */
function capturePointer(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    canvas.setPointerCapture(pointerId)
  } catch {
    /* no active pointer with this id; the button-state fallback covers it */
  }
}

function onPointerDown(
  options: InteractionOptions,
  grab: GrabRef,
  event: ReactPointerEvent<HTMLCanvasElement>
): void {
  const canvas = event.currentTarget
  const point = backingPoint(canvas, event)
  if (!point || options.dayCount <= 0) return
  capturePointer(canvas, event.pointerId)
  // Measured here rather than passed in, so the hit test reads the same lattice
  // the canvas was last painted on however the pane has been resized since.
  const layout = ribbonLayout(
    canvas.width,
    canvas.height,
    ribbonDpr(),
    options.dayCount
  )
  const visible = ribbonWindow(
    getGalaxyTimeline().step,
    options.dayCount,
    options.startWeekday,
    layout.columns
  )
  const day = ribbonDayAt(visible, layout, point.xPx, point.yPx)
  grab.current = { day, xPx: point.xPx, yPx: point.yPx, stepPx: layout.stepPx }
  seekGalaxyTimeline(day, options.dayCount)
}

function onPointerMove(
  options: InteractionOptions,
  grab: GrabRef,
  event: ReactPointerEvent<HTMLCanvasElement>
): void {
  const anchor = grab.current
  if (!anchor) return
  // Either signal keeps the gesture live. The capture is the one that matters —
  // it reports every move here however far off the strip the drag travels — and
  // the button state covers a pointer the UA refused to hand over. A hover
  // carries neither.
  const canvas = event.currentTarget
  if (!canvas.hasPointerCapture(event.pointerId) && !event.buttons) return
  const point = backingPoint(canvas, event)
  if (!point) return
  // Measured from the pointer back to the grab, not forward from it: the drag
  // pulls the strip, so the day walks against the hand and the squares appear
  // to travel with it. Both axes are read the same way round — the vertical one
  // walks a day at a time — so a diagonal drag agrees with itself.
  const columns = Math.round((anchor.xPx - point.xPx) / anchor.stepPx)
  const rows = Math.round((anchor.yPx - point.yPx) / anchor.stepPx)
  seekGalaxyTimeline(anchor.day + columns * 7 + rows, options.dayCount)
}

function release(
  grab: GrabRef,
  event: ReactPointerEvent<HTMLCanvasElement>
): void {
  grab.current = null
  const canvas = event.currentTarget
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId)
}

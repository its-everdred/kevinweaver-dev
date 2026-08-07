'use client'
import { useCallback, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import {
  DEFAULT_ORBIT,
  dragRotation,
  orbitReducer,
  type OrbitAction,
  type OrbitState,
} from '@/lib/viz/orbit'

/** Multiplier one zoom press, key, or wheel-free step applies to the distance. */
const ZOOM_STEP = 1.25
/** Radians one arrow key turns the camera. */
const KEY_TURN = Math.PI / 24

/** Where each active pointer last was, in client pixels. */
type Pointers = Map<number, { x: number; y: number }>

interface Gesture {
  readonly pointers: Pointers
  /** Distance between the first two pointers on the previous move, or 0. */
  span: number
}

/** Camera controls shared by the canvas, the zoom buttons, and the keyboard. */
export interface GalaxyCamera {
  /** Current orbit, for rendering. */
  readonly orbit: OrbitState
  /** The same orbit, readable from a render loop without re-subscribing. */
  readonly orbitRef: RefObject<OrbitState>
  readonly zoomIn: () => void
  readonly zoomOut: () => void
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void
  readonly onPointerCancel: (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => void
  readonly onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void
}

/**
 * @description Owns the galaxy camera: pointer drag rotates, two-pointer pinch
 * dollies, and the zoom buttons and arrow keys reach the same reducer, so the
 * keyboard has parity with the mouse and touch affordances. Every transition is
 * user-initiated; nothing here runs on a clock or damps toward a target, which
 * is how `prefers-reduced-motion: reduce` is honoured without disabling the
 * controls.
 * @returns The orbit, a stable ref to it, and the handlers the canvas binds.
 */
export function useGalaxyCamera(): GalaxyCamera {
  const [orbit, setOrbit] = useState<OrbitState>(DEFAULT_ORBIT)
  const orbitRef = useRef<OrbitState>(DEFAULT_ORBIT)
  const gesture = useRef<Gesture>({ pointers: new Map(), span: 0 })

  const apply = useCallback((action: OrbitAction): void => {
    // Read through the ref, not through state: a gesture can dispatch several
    // times inside one batched event and each must see the previous result.
    const next = orbitReducer(orbitRef.current, action)
    orbitRef.current = next
    setOrbit(next)
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId)
      const { pointers } = gesture.current
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      gesture.current.span = pinchSpan(pointers)
    },
    []
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      const { pointers } = gesture.current
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size > 1) {
        apply({ type: 'dolly', factor: pinchFactor(gesture.current) })
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      apply({
        type: 'rotate',
        ...dragRotation(dx, dy, rect.width, rect.height),
      })
    },
    [apply]
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      release(event.currentTarget, event.pointerId)
      const { pointers } = gesture.current
      pointers.delete(event.pointerId)
      gesture.current.span = pinchSpan(pointers)
    },
    []
  )

  // A pointer that leaves mid-drag ends the gesture rather than leaving a stale
  // anchor behind: without this the next move would rotate by the whole gap.
  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      const { pointers } = gesture.current
      for (const pointerId of pointers.keys())
        release(event.currentTarget, pointerId)
      pointers.clear()
      gesture.current.span = 0
    },
    []
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
      const action = keyAction(event.key)
      if (!action) return
      event.preventDefault()
      apply(action)
    },
    [apply]
  )

  return {
    orbit,
    orbitRef,
    zoomIn: useCallback(
      () => apply({ type: 'dolly', factor: 1 / ZOOM_STEP }),
      [apply]
    ),
    zoomOut: useCallback(
      () => apply({ type: 'dolly', factor: ZOOM_STEP }),
      [apply]
    ),
    onKeyDown,
    onPointerCancel: onPointerUp,
    onPointerDown,
    onPointerLeave,
    onPointerMove,
    onPointerUp,
  }
}

/** Distance between the first two active pointers, or 0 below two pointers. */
function pinchSpan(pointers: Pointers): number {
  const [first, second] = [...pointers.values()]
  if (!first || !second) return 0
  return Math.hypot(second.x - first.x, second.y - first.y)
}

/** Dolly factor for the current pinch, recording the span it consumed. */
function pinchFactor(gesture: Gesture): number {
  const previous = gesture.span
  const span = pinchSpan(gesture.pointers)
  gesture.span = span
  // A zero span is a degenerate pinch; the reducer rejects the factor as a
  // no-op rather than collapsing the distance.
  return span > 0 ? previous / span : 0
}

/** Releases capture only when this element holds it, which a leave may not. */
function release(target: HTMLCanvasElement, pointerId: number): void {
  if (target.hasPointerCapture(pointerId))
    target.releasePointerCapture(pointerId)
}

/** Keyboard parity for the drag and pinch affordances. */
function keyAction(key: string): OrbitAction | undefined {
  if (key === 'ArrowLeft')
    return { type: 'rotate', azimuth: -KEY_TURN, polar: 0 }
  if (key === 'ArrowRight')
    return { type: 'rotate', azimuth: KEY_TURN, polar: 0 }
  if (key === 'ArrowUp') return { type: 'rotate', azimuth: 0, polar: -KEY_TURN }
  if (key === 'ArrowDown')
    return { type: 'rotate', azimuth: 0, polar: KEY_TURN }
  if (key === '+' || key === '=')
    return { type: 'dolly', factor: 1 / ZOOM_STEP }
  if (key === '-' || key === '_') return { type: 'dolly', factor: ZOOM_STEP }
  return undefined
}

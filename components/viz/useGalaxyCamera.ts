'use client'
import { useCallback, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import {
  DEFAULT_ORBIT,
  ZOOM_STEP,
  dragRotation,
  orbitReducer,
  type OrbitAction,
  type OrbitState,
} from '@/lib/viz/orbit'
import { KEY_PAN, dragPan } from '@/lib/viz/pan'
import { capture, release } from './galaxyPanCapture'
import {
  clearGesture,
  createGesture,
  isClickGesture,
  liftGesture,
  moveGesture,
  pressGesture,
} from './galaxyPanGesture'

/** Radians one arrow key turns the camera. */
const KEY_TURN = Math.PI / 24

/** Which way each arrow points, as (rightward, downward) on screen. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** A pointer event on the galaxy canvas, the only element these handlers bind. */
type CanvasPointer = ReactPointerEvent<HTMLCanvasElement>

/** Camera controls shared by the canvas, the zoom buttons, and the keyboard. */
export interface GalaxyCamera {
  /** Current orbit, for rendering. */
  readonly orbit: OrbitState
  /** The same orbit, readable from a render loop without re-subscribing. */
  readonly orbitRef: RefObject<OrbitState>
  readonly zoomIn: () => void
  readonly zoomOut: () => void
  /**
   * One dolly by an arbitrary factor, for an input finer-grained than a press:
   * a wheel notch is a fraction of a step, not a whole one. Below 1 moves the
   * camera closer, and the reducer clamps it like every other zoom.
   */
  readonly dolly: (factor: number) => void
  /**
   * Whether the gesture this pointer-up ends was a click rather than a drag.
   * Read it before handing the event on: `onPointerUp` retires the gesture.
   */
  readonly isClick: (event: CanvasPointer) => boolean
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void
  readonly onPointerCancel: (event: CanvasPointer) => void
  readonly onPointerDown: (event: CanvasPointer) => void
  readonly onPointerLeave: (event: CanvasPointer) => void
  readonly onPointerMove: (event: CanvasPointer) => void
  readonly onPointerUp: (event: CanvasPointer) => void
}

/**
 * @description Owns the galaxy camera. One finger rotates; two fingers pinch
 * and pan at once (`galaxyPanGesture` says what the hand did, this spends it);
 * the zoom buttons, the keys, and the wheel (via `useGalaxyWheelZoom`) reach the
 * same reducer. The keyboard therefore has parity with every pointer affordance:
 * unshifted arrows rotate, shifted arrows pan, plus and minus dolly, and Home
 * re-centres. Every transition is user-initiated; nothing here runs on a clock
 * or damps toward a target, which is how `prefers-reduced-motion: reduce` is
 * honoured without disabling the controls.
 * @returns The orbit, a stable ref to it, and the handlers the canvas binds.
 */
export function useGalaxyCamera(): GalaxyCamera {
  const [orbit, setOrbit] = useState<OrbitState>(DEFAULT_ORBIT)
  const orbitRef = useRef<OrbitState>(DEFAULT_ORBIT)
  const gesture = useRef(createGesture())

  const apply = useCallback((action: OrbitAction): void => {
    // Read through the ref, not through state: a gesture can dispatch several
    // times inside one batched event and each must see the previous result.
    const next = orbitReducer(orbitRef.current, action)
    orbitRef.current = next
    setOrbit(next)
  }, [])

  const dolly = useCallback(
    (factor: number): void => apply({ type: 'dolly', factor }),
    [apply]
  )

  const onPointerDown = useCallback((event: CanvasPointer): void => {
    const { clientX, clientY, currentTarget, pointerId } = event
    capture(currentTarget, pointerId)
    // Focus is what arms the arrow keys and the wheel, and Safari does not
    // reliably give it to a `tabindex` element on click. Asking for it here
    // means one drag arms every non-pointer control the canvas has, and
    // `preventScroll` stops a part-visible canvas jumping the page mid-gesture.
    currentTarget.focus({ preventScroll: true })
    pressGesture(gesture.current, pointerId, clientX, clientY)
  }, [])

  const onPointerMove = useCallback(
    (event: CanvasPointer): void => {
      const { clientX, clientY, pointerId } = event
      const move = moveGesture(gesture.current, pointerId, clientX, clientY)
      if (!move) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (move.kind === 'rotate') {
        apply({
          type: 'rotate',
          ...dragRotation(move.dx, move.dy, rect.width, rect.height),
        })
        return
      }
      // Two fingers: both components of one sample are spent, never one or the
      // other. The span they changed is the zoom, the midpoint they carried is
      // the pan, measured at the distance the dolly just left the camera at.
      apply({ type: 'dolly', factor: move.factor })
      apply({
        type: 'pan',
        ...dragPan(move.dx, move.dy, rect.height, orbitRef.current.distance),
      })
    },
    [apply]
  )

  const onPointerUp = useCallback((event: CanvasPointer): void => {
    release(event.currentTarget, event.pointerId)
    liftGesture(gesture.current, event.pointerId)
  }, [])

  const isClick = useCallback(
    (event: CanvasPointer): boolean =>
      isClickGesture(gesture.current, event.clientX, event.clientY),
    []
  )

  // A pointer that leaves mid-gesture ends it rather than leaving a stale
  // anchor behind: without this the next move would spend the whole gap.
  const onPointerLeave = useCallback((event: CanvasPointer): void => {
    for (const pointerId of gesture.current.pointers.keys())
      release(event.currentTarget, pointerId)
    clearGesture(gesture.current)
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
      const action = keyAction(event.key, event.shiftKey)
      if (!action) return
      event.preventDefault()
      apply(action)
    },
    [apply]
  )

  return {
    orbit,
    orbitRef,
    zoomIn: useCallback(() => dolly(1 / ZOOM_STEP), [dolly]),
    zoomOut: useCallback(() => dolly(ZOOM_STEP), [dolly]),
    dolly,
    isClick,
    onKeyDown,
    onPointerCancel: onPointerUp,
    onPointerDown,
    onPointerLeave,
    onPointerMove,
    onPointerUp,
  }
}

/**
 * Keyboard parity for the drag, the pinch, and the two-finger pan. Shifted
 * arrows move the camera rather than the galaxy — shift-Right takes the view
 * rightward, the way a scroll key does — while the fingers carry the galaxy
 * itself; each is its own input's convention. Home is the one key back for a
 * viewer who panned somewhere they did not mean to, and it moves the pivot only:
 * a reset that discarded the rotation and zoom would take more than was asked.
 */
function keyAction(key: string, shift: boolean): OrbitAction | undefined {
  if (key === 'Home') return { type: 'recenter' }
  if (key === '+' || key === '=')
    return { type: 'dolly', factor: 1 / ZOOM_STEP }
  if (key === '-' || key === '_') return { type: 'dolly', factor: ZOOM_STEP }
  const arrow = ARROWS[key]
  if (!arrow) return undefined
  const [across, down] = arrow
  if (shift)
    return { type: 'pan', right: across * KEY_PAN, up: -down * KEY_PAN }
  return { type: 'rotate', azimuth: across * KEY_TURN, polar: down * KEY_TURN }
}

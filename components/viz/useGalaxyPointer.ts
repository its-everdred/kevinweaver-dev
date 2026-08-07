'use client'
import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { GalaxyCamera } from './useGalaxyCamera'

/** Pointer position over the canvas, in CSS pixels. */
export interface PointerPosition {
  readonly x: number
  readonly y: number
}

/** The canvas pointer surface: camera gestures plus a hover position. */
export interface GalaxyPointer {
  /** Where the pointer is, or null when it is not over the canvas. */
  readonly pointerRef: RefObject<PointerPosition | null>
  readonly onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLCanvasElement>) => void
}

/**
 * @description Records where the pointer is over the galaxy canvas so the
 * render loop can reveal the label of the repo arm under it. The camera's own
 * handler runs first and unchanged: this only reads a position afterwards, and
 * never claims the event, captures the pointer, or calls `preventDefault`, so
 * drag-to-rotate keeps every gesture it had. A highlight during a drag is
 * simply a highlight during a drag.
 * @param camera The camera controls whose handlers this wraps.
 * @returns The hover position and the handlers the canvas binds in place of
 * the camera's move and leave.
 */
export function useGalaxyPointer(camera: GalaxyCamera): GalaxyPointer {
  const pointerRef = useRef<PointerPosition | null>(null)
  const cameraMove = camera.onPointerMove
  const cameraLeave = camera.onPointerLeave

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      cameraMove(event)
      const rect = event.currentTarget.getBoundingClientRect()
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    },
    [cameraMove]
  )

  // A pointer that leaves takes its highlight with it, the same way it ends
  // the camera gesture: otherwise the last-hovered label would stay revealed.
  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      cameraLeave(event)
      pointerRef.current = null
    },
    [cameraLeave]
  )

  return { pointerRef, onPointerMove, onPointerLeave }
}

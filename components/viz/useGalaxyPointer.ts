'use client'
import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { GalaxyScene } from '@/packages/aiur-galaxy/src/galaxyScene'
import { repoFileCount } from './galaxyDay'
import { clearGalaxySelection, publishGalaxySelection } from './galaxySelection'
import { useInstrumentRuntime } from './instrumentRuntime'
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
  readonly onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void
}

/**
 * @description Records where the pointer is over the galaxy canvas so the
 * render loop can reveal the label of the repo arm under it, and turns a click
 * — as opposed to a drag — into the shared repo selection. The camera's own
 * handlers run first and unchanged: this only reads a position afterwards, and
 * never claims the event, captures the pointer, or calls `preventDefault`, so
 * drag-to-rotate keeps every gesture it had. A highlight during a drag is
 * simply a highlight during a drag.
 * @param camera The camera controls whose handlers this wraps.
 * @param sceneRef The live scene, which owns the pick. Before it exists there
 * is nothing under the pointer, so a click reads as a click on empty space.
 * @returns The hover position and the handlers the canvas binds in place of
 * the camera's move, leave, and up.
 */
export function useGalaxyPointer(
  camera: GalaxyCamera,
  sceneRef: RefObject<GalaxyScene | null>
): GalaxyPointer {
  const runtime = useInstrumentRuntime()
  const repoOf = runtime.status === 'ready' ? runtime.viz.input.repoOf : null
  const pointerRef = useRef<PointerPosition | null>(null)
  const cameraMove = camera.onPointerMove
  const cameraLeave = camera.onPointerLeave
  const cameraUp = camera.onPointerUp
  const isClick = camera.isClick

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

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      // Asked before the camera retires the gesture, because that is where the
      // press position lives.
      const clicked = isClick(event)
      const rect = event.currentTarget.getBoundingClientRect()
      cameraUp(event)
      if (!clicked) return
      const arm = sceneRef.current?.selectAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      )
      if (!arm) {
        clearGalaxySelection()
        return
      }
      publishGalaxySelection({
        repoId: arm.repoId,
        name: arm.name,
        // Files, not vertices: the layout folds a large repo onto fewer stars,
        // so `arm.starCount` would report a fraction of the file count the day
        // list shows for the same repo.
        fileCount: repoOf ? repoFileCount(repoOf, arm.repoId) : null,
        lastStep: arm.lastStep,
      })
    },
    [cameraUp, isClick, repoOf, sceneRef]
  )

  return { pointerRef, onPointerMove, onPointerLeave, onPointerUp }
}

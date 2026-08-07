'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'
import { formatDayISO } from '@/lib/viz/driver'
import { orbitPosition, type OrbitState } from '@/lib/viz/orbit'
// Imported per module rather than through the package barrel. The barrel also
// re-exports the canvas-2D `renderUniverse`, which nothing in the app calls;
// pulling it into the lazy island puts the deferred-JS budget over its cap.
import {
  createGalaxyScene,
  type GalaxyScene,
} from '@/packages/aiur-galaxy/src/galaxyScene'
import { layoutUniverse } from '@/packages/aiur-galaxy/src/galaxy'
import {
  nextWindowStep,
  playbackWindowEnd,
  universeFrame,
} from '@/packages/aiur-galaxy/src/universePlayback'
import { resolveContributors } from '@/packages/aiur-galaxy/src/contributors'
import type {
  UniverseActor,
  UniverseSnapshot,
} from '@/packages/aiur-galaxy/src/types'
import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
} from './galaxyTimeline'
import { installGalaxyTestHarness } from './galaxyTestHarness'
import type { PointerPosition } from './useGalaxyPointer'

/** One day of playback per second. */
const STEP_MS = 1000
const EASE = 0.12
/**
 * Playback runs the rolling one-year window from the most recent day toward
 * the past. Sweeping the whole history forward at one day per second would run
 * for over an hour; a year is a six-minute pass, and the days outside it stay
 * reachable by seeking.
 */
const DIRECTION = 'backward'

/** What the galaxy render loop needs from its host component. */
export interface GalaxySceneHost {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  /** The universe to render, or null until the data arrives. */
  readonly universe: UniverseSnapshot | null
  /** ISO date of day 0, for the shared clock's labels. */
  readonly windowStart: string
  /** The viewer's camera, read every frame rather than pushed on change. */
  readonly orbitRef: RefObject<OrbitState>
  /** The hover position, for the repo highlight. */
  readonly pointerRef: RefObject<PointerPosition | null>
  /**
   * Filled with the live scene for as long as it exists, so a click can reach
   * the pick without the pointer hook owning any of the scene's lifetime.
   */
  readonly sceneRef: RefObject<GalaxyScene | null>
}

/**
 * @description Owns the galaxy scene for as long as its universe lives: it
 * builds the WebGL scene, initializes the shared clock, advances playback one
 * day per second through the rolling window, renders each frame, and releases
 * every listener, loop, and GPU resource on teardown. A scene that fails to
 * build leaves the page rendered rather than throwing through the component.
 * @param host The canvas, data, and interaction refs to render from.
 */
export function useGalaxyScene(host: GalaxySceneHost): void {
  const { canvasRef, universe, windowStart, orbitRef, pointerRef, sceneRef } = host

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !universe) return
    const layout = layoutUniverse(universe)
    let scene: GalaxyScene | null = null
    try {
      scene = createGalaxyScene(canvas, { layout })
    } catch {
      return
    }
    let live: GalaxyScene | null = scene
    sceneRef.current = scene

    // Initialize the shared clock from this universe's bounds. Reduced-motion
    // users see a static day: playback only advances on an explicit seek.
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const opening = playbackWindowEnd(universe.stepCount)
    publishGalaxyTimeline({
      step: opening,
      date: formatDayISO(windowStart, opening),
      playing: !reducedMotion,
      total: universe.stepCount,
      direction: DIRECTION,
      windowStartISO: windowStart,
    })
    const removeHarness = installGalaxyTestHarness(universe.stepCount)

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = (): void => {
      live?.resize(
        Math.round(canvas.clientWidth * dpr),
        Math.round(canvas.clientHeight * dpr)
      )
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let raf = 0
    let last = performance.now()
    let overflow = 0
    const eased: Partial<Record<UniverseActor, { x: number; y: number }>> = {}
    const frame = (now: number): void => {
      const clock = getGalaxyTimeline()
      if (clock.total === universe.stepCount) {
        if (!reducedMotion && now - last >= STEP_MS && clock.playing) {
          last = now
          seekGalaxyTimeline(
            nextWindowStep(clock.step, universe.stepCount, clock.direction),
            universe.stepCount
          )
        }
        if (live) {
          // The camera is read here rather than pushed on change so a scene
          // rebuilt for newly loaded data adopts the viewer's camera instead of
          // snapping back to the build framing.
          const view = orbitPosition(orbitRef.current)
          live.setCamera(view.x, view.y, view.z)
          const hover = pointerRef.current
          live.setHighlight(
            hover
              ? live.pickRepo(hover.x, hover.y, canvas.clientWidth, canvas.clientHeight)
              : null
          )
          const playback = universeFrame(universe, clock.step, clock.direction)
          const stats = live.setFrame(layout, playback)
          overflow = surfaceBeamOverflow(canvas, stats.beamOverflow, overflow)
          const targets = resolveContributors(layout, playback)
          live.setContributors(easedContributors(eased, targets))
          live.render()
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      removeHarness()
      live = null
      sceneRef.current = null
      scene?.dispose()
    }
  }, [canvasRef, orbitRef, pointerRef, sceneRef, universe, windowStart])
}

/**
 * @description Surfaces a beam-budget overrun on the canvas instead of letting
 * the scene drop beams silently: `data-beam-overflow` counts the contributions
 * on the current step that produced no beam.
 * @param canvas The galaxy canvas.
 * @param overflow Contributions this step that produced no beam.
 * @param previous The value already surfaced, so a steady state writes no DOM.
 * @returns The value now surfaced.
 */
function surfaceBeamOverflow(
  canvas: HTMLCanvasElement,
  overflow: number,
  previous: number
): number {
  if (overflow === previous) return previous
  if (overflow > 0) canvas.dataset.beamOverflow = String(overflow)
  else delete canvas.dataset.beamOverflow
  return overflow
}

function easedContributors(
  current: Partial<Record<UniverseActor, { x: number; y: number }>>,
  targets: readonly { actor: UniverseActor; x: number; y: number; active: boolean }[]
): readonly { actor: UniverseActor; x: number; y: number }[] {
  for (const target of targets) {
    const existing = current[target.actor]
    if (!existing) {
      current[target.actor] = { x: target.x, y: target.y }
      continue
    }
    existing.x += (target.x - existing.x) * EASE
    existing.y += (target.y - existing.y) * EASE
  }
  return targets.map((target) => ({
    actor: target.actor,
    x: current[target.actor]?.x ?? target.x,
    y: current[target.actor]?.y ?? target.y,
  }))
}

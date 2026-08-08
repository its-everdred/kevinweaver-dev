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
import { discSpin } from '@/packages/aiur-galaxy/src/galaxyWorld'
import { playbackWindowEnd } from '@/packages/aiur-galaxy/src/universePlayback'
import type { UniverseSnapshot } from '@/packages/aiur-galaxy/src/types'
import { loadContributorAvatars } from './contributorAvatars'
import { createGalaxyDayClock } from './galaxyDayClock'
import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
} from './galaxyTimeline'
import { installGalaxyTestHarness } from './galaxyTestHarness'
import type { PointerPosition } from './useGalaxyPointer'

/**
 * Playback runs the rolling one-year window from the most recent day toward
 * the past. Sweeping the whole history forward at one day per second would run
 * for over an hour; a year is a six-minute pass, and the days outside it stay
 * reachable by seeking.
 */
const DIRECTION = 'backward'

/**
 * Milliseconds between rendered frames — thirty a second. The disc is a slow
 * scene by construction: a day lasts a second and the turn covers a degree and
 * a half in it, so half the frames a display offers carry no visible change.
 * Skipping them is the difference between a galaxy a weak machine can hold on
 * screen and one that saturates it.
 */
const FRAME_MS = 1000 / 30

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
    // The nodes are already on screen in their actor colours; the avatars land
    // on them whenever they decode, and never if they cannot.
    const stopAvatars = loadContributorAvatars((actor, image) =>
      live?.setContributorImage(actor, image)
    )

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

    // The clock resolves a day, and the day after it, once each: building a
    // playback frame walks the whole contribution log (138,634 entries at the
    // full history) and allocates a key per live file, so doing it per
    // animation frame cost millions of allocations a second and stalled the
    // page outright. The day after is what the contributor nodes are already
    // travelling toward while the day on screen is still being drawn.
    const days = createGalaxyDayClock(universe, layout)
    let raf = 0
    /** Wall clock the disc's turn is measured from, never the playback step. */
    const opened = performance.now()
    let overflow = 0
    /**
     * What the last rendered frame depended on. Under reduced motion nothing
     * advances on its own — no turn, no playback, no transition — so once a
     * frame is on screen it stays correct until the viewer seeks, hovers, or
     * moves the camera. Re-rendering it sixty times a second is work nobody
     * asked for, and "every infinite animation stops" is the rule reduced
     * motion is asking us to honour, not merely a request to hold the day still.
     */
    let settled = ''
    /**
     * Wall-clock time of the last rendered frame, so the loop can draw at
     * `FRAME_MS` rather than at whatever rate the display offers. Nothing here
     * moves fast enough to need 60 fps: the day changes once a second and the
     * disc turns a degree and a half in that time. Drawing this scene twice as
     * often as it changes costs a phone its battery and a weak machine its
     * responsiveness, and buys no visible smoothness.
     */
    let drawn = Number.NEGATIVE_INFINITY
    const frame = (now: number): void => {
      const clock = getGalaxyTimeline()
      if (clock.total === universe.stepCount) {
        const animated = !reducedMotion && clock.playing
        const day = days.advance(clock.step, clock.direction, now, animated)
        if (day !== clock.step) seekGalaxyTimeline(day, universe.stepCount)
        if (now - drawn < FRAME_MS) {
          raf = requestAnimationFrame(frame)
          return
        }
        drawn = now
        if (reducedMotion && live) {
          const hover = pointerRef.current
          const orbit = orbitRef.current
          const state = `${clock.step} ${clock.direction} ${hover?.x ?? ''},${hover?.y ?? ''} ${orbit.azimuth},${orbit.polar},${orbit.distance}`
          if (state === settled) {
            raf = requestAnimationFrame(frame)
            return
          }
          settled = state
        }
        if (live) {
          // The camera is read here rather than pushed on change so a scene
          // rebuilt for newly loaded data adopts the viewer's camera instead of
          // snapping back to the build framing.
          const view = orbitPosition(orbitRef.current)
          live.setCamera(view.x, view.y, view.z)
          live.setRotation(discSpin(now - opened, reducedMotion))
          const hover = pointerRef.current
          live.setHighlight(
            hover
              ? live.pickRepo(hover.x, hover.y, canvas.clientWidth, canvas.clientHeight)
              : null
          )
          const playback = days.day(clock.step, clock.direction)
          const stats = live.setFrame(layout, playback.frame, days.reach(now, animated))
          overflow = surfaceBeamOverflow(canvas, stats.beamOverflow, overflow)
          live.setContributors(
            days.glide.at(playback.targets, days.onward(), days.phase(now, animated))
          )
          live.render()
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      stopAvatars()
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

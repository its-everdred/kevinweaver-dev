'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { formatDayISO } from '@/lib/viz/driver'
import {
  buildUniverse,
  createGalaxyScene,
  layoutUniverse,
  nextUniverseStep,
  resolveContributors,
  universeFrame,
  type GalaxyScene,
  type UniverseActor,
} from '@/packages/aiur-galaxy/src'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
} from './galaxyTimeline'
import { installGalaxyTestHarness } from './galaxyTestHarness'

/** Stable identifier used to locate the separately requested galaxy chunk. */
export const GALAXY_CHUNK_MARKER = 'kw-galaxy-universe'

const STEP_MS = 1000
const EASE = 0.12

function galaxyLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Repository galaxies unavailable'
  if (runtime.status === 'loading') return 'Repository galaxies loading'
  return 'Repository galaxies: one spiral disc where every repo is an arm and every file a star, brightening across the contribution window.'
}

/**
 * @description Renders the galaxy-cluster universe via the aiur-galaxy WebGL
 * renderer. This component is the playback owner: it advances the shared
 * galaxy timeline store (the single source of truth for the current day) and
 * renders the current frame. The contributions strip, events log, and
 * transport all read the same store.
 * @returns The interactive galaxy canvas and its playback controls.
 */
export const GalaxyUniverse = memo(function GalaxyUniverse(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const sceneRef = useRef<GalaxyScene | null>(null)
  const contributorRef = useRef<Partial<Record<UniverseActor, { x: number; y: number }>>>({})

  const universe = useMemo(() => {
    if (!viz) return null
    const repos = viz.head.repos.map((repo) => ({ id: repo.id, name: repo.name }))
    const events = viz.head.events.map((event) => ({
      repo: event.repo,
      path: event.path,
      step: viz.head.manifest.dayCount - 1 - event.day,
      actor: event.actor as UniverseActor,
    }))
    return buildUniverse(repos, events, viz.head.manifest.dayCount)
  }, [viz])

  const windowStart = viz?.head.manifest.windowStart ?? ''

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
    sceneRef.current = scene

    // Initialize the shared clock from this universe's bounds. Reduced-motion
    // users see a static day: playback only advances on an explicit seek.
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    publishGalaxyTimeline({
      step: 0,
      date: formatDayISO(windowStart, 0),
      playing: !reducedMotion,
      total: universe.stepCount,
      direction: 'forward',
      windowStartISO: windowStart,
    })
    const removeHarness = installGalaxyTestHarness(universe.stepCount)

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = (): void => {
      if (!sceneRef.current) return
      sceneRef.current.resize(
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
    const frame = (now: number): void => {
      const current = getGalaxyTimeline()
      if (current.total === universe.stepCount) {
        if (!reducedMotion && now - last >= STEP_MS && current.playing) {
          last = now
          const next = nextUniverseStep(
            universeFrame(universe, current.step, current.direction),
            current.direction
          )
          seekGalaxyTimeline(next, universe.stepCount)
        }
        if (sceneRef.current) {
          const playback = universeFrame(universe, current.step, current.direction)
          const stats = sceneRef.current.setFrame(layout, playback)
          overflow = surfaceBeamOverflow(canvas, stats.beamOverflow, overflow)
          const metrics = {
            width: Math.round(canvas.clientWidth * dpr),
            height: Math.round(canvas.clientHeight * dpr),
          }
          const targets = resolveContributors(layout, playback, metrics)
          const contributors = easedContributors(contributorRef.current, targets)
          sceneRef.current.setContributors(contributors)
          sceneRef.current.render()
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      removeHarness()
      sceneRef.current = null
      scene?.dispose()
    }
  }, [universe, windowStart])

  const onPointerLeave = (): void => {
    pointerRef.current = null
  }

  const scrubToX = (clientX: number, element: HTMLCanvasElement): void => {
    if (!universe) return
    const rect = element.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const step = Math.max(
      0,
      Math.min(
        universe.stepCount - 1,
        Math.round(fraction * (universe.stepCount - 1))
      )
    )
    seekGalaxyTimeline(step, universe.stepCount)
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    scrubToX(event.clientX, event.currentTarget)
  }
  const onPointerDrag = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!event.buttons) return
    scrubToX(event.clientX, event.currentTarget)
  }

  const label = galaxyLabel(runtime)
  return (
    <canvas
      aria-label={label}
      data-chunk={GALAXY_CHUNK_MARKER}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerDrag}
      onPointerUp={onPointerLeave}
      ref={canvasRef}
      role="img"
      style={{ cursor: 'pointer', display: 'block', height: '100%', width: '100%' }}
      tabIndex={0}
    >
      {label}. The most recently active repos sit in the core and the oldest on
      the rim; contributions light stars permanently over the window.
    </canvas>
  )
})

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

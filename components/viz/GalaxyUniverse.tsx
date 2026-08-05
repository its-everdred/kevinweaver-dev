'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { formatDayISO } from '@/lib/viz/driver'
import {
  buildUniverse,
  DEFAULT_UNIVERSE_THEME,
  layoutUniverse,
  nextUniverseStep,
  renderUniverse,
  resolveContributors,
  universeFrame,
  type ContributorNode,
  type PlaybackDirection,
  type UniverseActor,
} from '@/packages/aiur-dag/src'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { publishGalaxyTimeline } from './galaxyTimeline'

/** Stable identifier used to locate the separately requested galaxy chunk. */
export const GALAXY_CHUNK_MARKER = 'kw-galaxy-universe'

const STEP_MS = 900
const EASE = 0.12
const DIRECTION_LABELS: Record<PlaybackDirection, string> = {
  forward: 'forward',
  backward: 'backward',
}

function galaxyLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Repository galaxies unavailable'
  if (runtime.status === 'loading') return 'Repository galaxies loading'
  return 'Repository galaxies: every repo is a galaxy, every file a star, across the contribution window.'
}

/**
 * @description Renders the galaxy-cluster universe: each repo is a galaxy and
 * each file a star, with repo labels, hover-for-file-name, and contributor
 * nodes (kw and AK) that travel to the day's contributions.
 * @returns The interactive galaxy canvas and its playback controls.
 */
export const GalaxyUniverse = memo(function GalaxyUniverse(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const directionRef = useRef<PlaybackDirection>('forward')
  const stepRef = useRef(0)
  const contributorRef = useRef<Partial<Record<UniverseActor, { x: number; y: number }>>>({})
  const [direction, setDirection] = useState<PlaybackDirection>('forward')
  const [date, setDate] = useState('')

  const layoutRef = useRef<ReturnType<typeof layoutUniverse> | null>(null)

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
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = (): void => {
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      layoutRef.current = layoutUniverse(universe)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      if (now - last >= STEP_MS) {
        last = now
        stepRef.current = nextUniverseStep(
          universeFrame(universe, stepRef.current, directionRef.current),
          directionRef.current
        )
      }
      const layout = layoutRef.current
      if (!layout) {
        raf = requestAnimationFrame(frame)
        return
      }
      const playback = universeFrame(universe, stepRef.current, directionRef.current)
      if (playback.step >= 0 && windowStart) {
        const dateLabel = formatDayISO(windowStart, playback.step)
        setDate(dateLabel)
        publishGalaxyTimeline({ step: playback.step, date: dateLabel })
      }
      const metrics = { width: canvas.width, height: canvas.height }
      const targets = resolveContributors(layout, playback, metrics)
      const contributors = easedContributors(contributorRef.current, targets)
      renderUniverse(
        ctx,
        metrics,
        { layout, frame: playback, pointer: pointerRef.current, contributors },
        DEFAULT_UNIVERSE_THEME
      )
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [universe, windowStart])

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current = {
      x: event.nativeEvent.offsetX * (event.currentTarget.width / rect.width),
      y: event.nativeEvent.offsetY * (event.currentTarget.height / rect.height),
    }
  }
  const onPointerLeave = (): void => {
    pointerRef.current = null
  }

  const toggle = (): void => {
    const next: PlaybackDirection =
      directionRef.current === 'forward' ? 'backward' : 'forward'
    directionRef.current = next
    setDirection(next)
  }

  const jump = (fraction: number): void => {
    if (!universe) return
    const step = Math.max(
      0,
      Math.min(
        universe.stepCount - 1,
        Math.round(fraction * (universe.stepCount - 1))
      )
    )
    stepRef.current = step
  }

  const label = galaxyLabel(runtime)
  return (
    <>
      <canvas
        aria-label={label}
        data-chunk={GALAXY_CHUNK_MARKER}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        ref={canvasRef}
        role="img"
        style={{ display: 'block', height: '100%', width: '100%' }}
        tabIndex={0}
      >
        {label}. Each repo is a galaxy and each file is a star; contributions
        light stars over the window.
      </canvas>
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginTop: '0.4rem',
          padding: '0 0.25rem',
        }}
      >
        <button disabled={!universe} onClick={toggle} type="button">
          play {DIRECTION_LABELS[direction]}
        </button>
        <button disabled={!universe} onClick={() => jump(0)} type="button">
          start
        </button>
        <button disabled={!universe} onClick={() => jump(1)} type="button">
          end
        </button>
        <input
          aria-label="scrub the contribution timeline"
          disabled={!universe}
          max="1"
          min="0"
          onChange={(event) => jump(Number(event.target.value))}
          step="any"
          style={{ flex: 1 }}
          type="range"
        />
        <span>{date}</span>
      </div>
    </>
  )
})

function easedContributors(
  current: Partial<Record<UniverseActor, { x: number; y: number }>>,
  targets: readonly ContributorNode[]
): readonly ContributorNode[] {
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
    active: target.active,
  }))
}

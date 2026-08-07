'use client'

import { memo, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { type OrbitState } from '@/lib/viz/orbit'
import { buildUniverse, type UniverseActor } from '@/packages/aiur-galaxy/src'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { useGalaxyCamera } from './useGalaxyCamera'
import { useGalaxyPointer } from './useGalaxyPointer'
import { useGalaxyScene } from './useGalaxyScene'
import styles from './GalaxyUniverse.module.css'

/** Stable identifier used to locate the separately requested galaxy chunk. */
export const GALAXY_CHUNK_MARKER = 'kw-galaxy-universe'

function galaxyLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Repository galaxies unavailable.'
  if (runtime.status === 'loading') return 'Repository galaxies loading.'
  // The camera hint belongs in the name: a canvas with an `aria-label` never
  // announces its fallback subtree, so this is the only place a keyboard user
  // is told that the arrow and plus/minus keys drive the view.
  return 'Repository galaxies: one spiral disc where every repo is an arm and every file a star, brightening across the contribution window. Drag or use the arrow keys to rotate it, and pinch, press plus or minus, or use the zoom buttons to change the distance.'
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
  const camera = useGalaxyCamera()
  const pointer = useGalaxyPointer(camera)

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

  useGalaxyScene({
    canvasRef,
    universe,
    windowStart: viz?.head.manifest.windowStart ?? '',
    orbitRef: camera.orbitRef,
    pointerRef: pointer.pointerRef,
  })

  const label = galaxyLabel(runtime)
  return (
    <div className={styles.stage}>
      <canvas
        aria-label={label}
        data-chunk={GALAXY_CHUNK_MARKER}
        data-orbit={formatOrbit(camera.orbit)}
        onKeyDown={camera.onKeyDown}
        onPointerCancel={camera.onPointerCancel}
        onPointerDown={camera.onPointerDown}
        onPointerLeave={pointer.onPointerLeave}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={camera.onPointerUp}
        ref={canvasRef}
        role="img"
        style={{
          cursor: 'grab',
          display: 'block',
          height: '100%',
          // Without this the browser claims the pinch and the drag as a scroll
          // or a page zoom, and neither gesture ever reaches the camera.
          touchAction: 'none',
          width: '100%',
        }}
        tabIndex={0}
      >
        {label} The most recently active repos sit in the core and the oldest on
        the rim; contributions light stars permanently over the window.
      </canvas>
      <div className={styles.zoomGroup}>
        <button
          aria-label="Zoom in"
          className={styles.zoom}
          onClick={camera.zoomIn}
          type="button"
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          aria-label="Zoom out"
          className={styles.zoom}
          onClick={camera.zoomOut}
          type="button"
        >
          <span aria-hidden="true">−</span>
        </button>
      </div>
    </div>
  )
})

/**
 * @description Surfaces the camera on the canvas, the way `data-beam-overflow`
 * surfaces the beam budget: the orbit is otherwise invisible to anything
 * outside the WebGL context.
 * @param orbit The current camera orbit.
 * @returns Azimuth, polar angle, and distance, space separated.
 */
function formatOrbit(orbit: OrbitState): string {
  return [orbit.azimuth, orbit.polar, orbit.distance]
    .map((term) => term.toFixed(3))
    .join(' ')
}

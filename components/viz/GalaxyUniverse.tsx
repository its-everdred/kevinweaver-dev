'use client'

import { memo, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type { BundleHead } from '@/lib/bundle/loader'
import { type OrbitState } from '@/lib/viz/orbit'
// Per module, not through the barrel: see the note in useGalaxyScene.ts.
import { buildUniverse } from '@/packages/aiur-galaxy/src/buildUniverse'
import type { GalaxyScene } from '@/packages/aiur-galaxy/src/galaxyScene'
import { privateRepo } from '@/packages/aiur-galaxy/src/privateRepo'
import type {
  UniverseActor,
  UniverseSnapshot,
} from '@/packages/aiur-galaxy/src/types'
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

/**
 * @description Builds the universe the galaxy renders: every real file event,
 * plus the synthesized `private` repo standing in for the green days the file
 * history cannot place. Extracted from the component so both index conventions
 * that meet here are directly testable.
 * @param head The decoded bundle head.
 * @returns The universe snapshot, with `private` as an ordinary repo in it.
 */
export function buildGalaxyUniverse(head: BundleHead): UniverseSnapshot {
  const { dayCount } = head.manifest
  const repos = head.repos.map((repo) => ({ id: repo.id, name: repo.name }))
  // A bundle event counts its day back from the newest, while a timeline step
  // counts forward from the oldest; `grid.human` is indexed by the latter, so
  // its index is already a step and needs no conversion of its own.
  const events = head.events.map((event) => ({
    repo: event.repo,
    path: event.path,
    step: dayCount - 1 - event.day,
    actor: event.actor as UniverseActor,
  }))
  // Most green days name no file the history can place, so they are
  // synthesized into one more repo here, before the universe is built.
  // Everything after this point treats `private` as ordinary; see
  // privateRepo.ts for what those stars do and do not claim to be.
  const synthetic = privateRepo({
    human: head.grid.human,
    agent: head.grid.agent,
    covered: new Set(events.map((event) => event.step)),
    stepCount: dayCount,
  })
  if (!synthetic) return buildUniverse(repos, events, dayCount)
  return buildUniverse(
    [...repos, synthetic.repo],
    events.concat(synthetic.events),
    dayCount
  )
}

function galaxyLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Repository map unavailable.'
  if (runtime.status === 'loading') return 'Repository map loading.'
  // The camera hint belongs in the name: a canvas with an `aria-label` never
  // announces its fallback subtree, so this is the only place a keyboard user
  // is told that the arrow and plus/minus keys drive the view.
  return 'Repository map: one spiral disc where every repo is an arm and every file a star, brightening across the contribution window. Drag or use the arrow keys to rotate it, and pinch, press plus or minus, or use the zoom buttons to change the distance.'
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
  // The scene is owned by the render-loop hook and read by the pointer hook,
  // which is where a click has to reach the pick.
  const sceneRef = useRef<GalaxyScene | null>(null)
  const camera = useGalaxyCamera()
  const pointer = useGalaxyPointer(camera, sceneRef)

  const universe = useMemo(
    () => (viz ? buildGalaxyUniverse(viz.head) : null),
    [viz]
  )

  useGalaxyScene({
    canvasRef,
    universe,
    windowStart: viz?.head.manifest.windowStart ?? '',
    orbitRef: camera.orbitRef,
    pointerRef: pointer.pointerRef,
    sceneRef,
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
        onPointerUp={pointer.onPointerUp}
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
        the rim; contributions light stars permanently over the window. Days the
        contribution graph counts but the file history cannot place are one repo
        at the core, standing for volume rather than for named files.
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

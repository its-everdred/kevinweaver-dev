'use client'

import { memo, useSyncExternalStore } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { getVizTransport } from '@/lib/viz/driver'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { useCanvasSurface } from './useCanvasSurface'

const transport = getVizTransport()

/**
 * @description Displays the current payload date without coupling paint to React state.
 * @returns The current playback date or payload status.
 */
export function GraphDate(): ReactNode {
  const runtime = useInstrumentRuntime()
  const snapshot = useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getServerSnapshot
  )
  return (
    <span
      style={{
        color: 'var(--aqua)',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {snapshot.ready
        ? snapshot.dateLabel
        : runtime.status === 'unavailable'
          ? 'data unavailable'
          : 'loading data'}
    </span>
  )
}

/**
 * @description Renders the independently observed five-year scrubber surface.
 * @returns The interactive overview canvas and agent-birth caption.
 */
export const Overview = memo(function Overview(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const label = overviewLabel(runtime)
  const { canvasProps, geometry, ref, toLocal } = useCanvasSurface({
    id: 'overview',
    driver: viz?.driver ?? null,
    label,
  })

  const scrub = (event: PointerEvent<HTMLCanvasElement>): void => {
    const point = toLocal(event)
    const measured = geometry.current
    if (!point || !measured || !viz) return
    viz.driver.scrubTo(point.x / measured.cssWidth)
  }
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    scrub(event)
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event)
  }
  const endDrag = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const birth = viz?.render.grid.agentBirthDay ?? -1
  const birthLabel = viz?.render.meta.agentBirthLabel
  const birthDate = viz?.render.meta.agentBirthSubLabel

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ height: 'var(--kw-overview-h, 50px)' }}>
        <canvas
          {...canvasProps}
          ref={ref}
          onPointerCancel={endDrag}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
        >
          {label}. Drag horizontally to inspect a day.
        </canvas>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 3,
          color: 'var(--text-dim)',
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.09em',
          textTransform: 'uppercase',
        }}
      >
        <span>drag to scrub</span>
        {birth >= 0 && birthLabel ? (
          <span style={{ color: 'var(--purple)' }}>
            ◆ {birthDate} · {birthLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
})

function overviewLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable')
    return 'Contribution overview unavailable'
  if (runtime.status === 'loading') return 'Contribution overview loading'
  const { windowStart, windowEnd } = runtime.viz.head.manifest
  return `Contribution overview from ${windowStart} through ${windowEnd}`
}

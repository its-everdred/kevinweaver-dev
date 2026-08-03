'use client'

import { memo, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { useCanvasSurface } from './useCanvasSurface'

/** Stable identifier used to locate the separately requested graph chunk. */
export const GOURCE_CHUNK_MARKER = 'kw-gource-island'

const LEGEND = [
  ['commit', 'var(--aqua)'],
  ['pr', 'var(--purple)'],
  ['issue', 'var(--yellow)'],
  ['review', 'var(--blue)'],
] as const

/**
 * @description Renders the idle-deferred repository graph and its legend.
 * @returns The graph canvas and event legend.
 */
const Gource = memo(function Gource(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const attach = (): void => setEnabled(true)
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(attach, { timeout: 1000 })
      return () => window.cancelIdleCallback(handle)
    }
    const handle = window.setTimeout(attach, 0)
    return () => window.clearTimeout(handle)
  }, [])
  const label = gourceLabel(runtime)
  const { canvasProps, ref } = useCanvasSurface({
    id: 'gource',
    driver: viz?.driver ?? null,
    label,
    enabled,
  })

  return (
    <>
      <canvas {...canvasProps} data-chunk={GOURCE_CHUNK_MARKER} ref={ref}>
        {label}. Repository and file activity is animated over the contribution
        window.
      </canvas>
      <div
        aria-label="repository event legend"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 10,
          display: 'flex',
          gap: 13,
          padding: '5px 9px',
          borderRadius: 4,
          color: 'var(--fg3)',
          background: 'var(--surface-bar)',
          fontSize: 'var(--fs-micro)',
          letterSpacing: '.05em',
        }}
      >
        {LEGEND.map(([name, color]) => (
          <span
            key={name}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <i
              aria-hidden="true"
              style={{
                display: 'block',
                width: 14,
                height: 2,
                background: color,
              }}
            />
            {name}
          </span>
        ))}
      </div>
    </>
  )
})

function gourceLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Repository graph unavailable'
  if (runtime.status === 'loading') return 'Repository graph loading'
  const { repoCount, windowEnd } = runtime.viz.head.manifest
  return `Repository graph for ${repoCount} repositories through ${windowEnd}`
}

export default Gource

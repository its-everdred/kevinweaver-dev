'use client'

import { memo } from 'react'
import type { ReactNode } from 'react'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { useCanvasSurface } from './useCanvasSurface'
import { useRibbonInteraction } from './useRibbonInteraction'

/**
 * @description Renders the independently observed 53-week contribution surface.
 * @returns The interactive ribbon canvas. The DEC-011 contribution table
 * (mounted in the Instrument region) is a sibling in the accessibility tree —
 * the canvas is deliberately not wired to it via aria-describedby (KW-025
 * note 4: the accessible-description algorithm would flatten every table row
 * into one enormous string).
 */
export const Ribbon = memo(function Ribbon(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const label = ribbonLabel(runtime)
  const { canvasProps, geometry, ref, toLocal } = useCanvasSurface({
    id: 'ribbon',
    driver: viz?.driver ?? null,
    label,
  })
  const interaction = useRibbonInteraction({ viz, geometry, toLocal })

  return (
    <div
      ref={interaction.container}
      onKeyDown={interaction.onKeyDown}
      style={{
        position: 'relative',
        height: 'var(--kw-ribbon-h, clamp(120px, 20vh, 200px))',
      }}
      tabIndex={0}
    >
      <canvas
        {...canvasProps}
        ref={ref}
        onPointerCancel={interaction.onPointerCancel}
        onPointerDown={interaction.onPointerDown}
        onPointerLeave={interaction.onPointerLeave}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.onPointerUp}
      >
        {label}
      </canvas>
      <div
        ref={interaction.tooltip}
        aria-hidden="true"
        hidden
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 5,
          padding: '8px 10px',
          background: 'var(--bg-h)',
          border: '2px solid var(--bg2)',
          borderRadius: 4,
          color: 'var(--fg1)',
          fontSize: 'var(--fs-small)',
          lineHeight: 1.5,
          whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-focus)',
        }}
      />
    </div>
  )
})

function ribbonLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Contribution grid unavailable'
  if (runtime.status === 'loading') return 'Contribution grid loading'
  return `Contribution grid, 53 weeks ending ${runtime.viz.head.manifest.windowEnd}. Full daily figures follow in the adjacent table.`
}

'use client'

import { memo, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { formatDayISO } from '@/lib/viz/driver'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import {
  getGalaxyTimeline,
  seekGalaxyTimeline,
  subscribeGalaxyTimeline,
} from './galaxyTimeline'

/**
 * @description Renders the full-width adaptive contribution strip. Every day in
 * the window is drawn as a cell compressed to the pane width, expanding and
 * contracting with the surface; the current day is highlighted from the shared
 * galaxy timeline. Clicking or dragging scrubs the timeline.
 * @returns The contribution strip canvas.
 */
export const Ribbon = memo(function Ribbon(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [snapshot, setSnapshot] = useState(() => getGalaxyTimeline())
  const label = ribbonLabel(runtime)
  const grid = viz?.render.grid
  const windowStart = viz?.head.manifest.windowStart ?? ''

  useEffect(() => {
    return subscribeGalaxyTimeline(() => setSnapshot(getGalaxyTimeline()))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grid) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = (): void => {
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (): void => {
      const dayCount = grid.dayCount
      const cellW = canvas.width / Math.max(1, dayCount)
      const cellH = canvas.height
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let day = 0; day < dayCount; day++) {
        const level = grid.level[day] ?? 0
        ctx.fillStyle = levelColor(level)
        ctx.fillRect(day * cellW, 0, cellW, cellH)
      }
      const current = getGalaxyTimeline().step
      if (current >= 0 && current < dayCount) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillRect(current * cellW, 0, cellW, cellH)
        ctx.strokeStyle = 'var(--fg0)'
        ctx.lineWidth = Math.max(1, dpr)
        ctx.strokeRect(
          current * cellW + 0.5,
          0.5,
          Math.max(cellW - 1, 1),
          cellH - 1
        )
      }
    }
    draw()
    const unsubscribe = subscribeGalaxyTimeline(() => draw())
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [grid])

  const scrubToX = (clientX: number, element: HTMLCanvasElement): void => {
    if (!grid) return
    const rect = element.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const step = Math.max(0, Math.min(grid.dayCount - 1, Math.round(fraction * (grid.dayCount - 1))))
    seekGalaxyTimeline(step, formatDayISO(windowStart, step), grid.dayCount)
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    scrubToX(event.clientX, event.currentTarget)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!event.buttons) return
    scrubToX(event.clientX, event.currentTarget)
  }

  return (
    <div
      style={{
        position: 'relative',
        height: 'var(--kw-ribbon-h, clamp(32px, 6vh, 64px))',
        width: '100%',
      }}
    >
      <canvas
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        ref={canvasRef}
        role="img"
        style={{ display: 'block', height: '100%', width: '100%', cursor: 'pointer' }}
        tabIndex={0}
      >
        {label}. The highlighted column is the current day.
      </canvas>
      <span
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          padding: '2px 6px',
          color: 'var(--text-faint)',
          fontSize: 'var(--fs-micro)',
        }}
      >
        {snapshot.date}
      </span>
    </div>
  )
})

function levelColor(level: number): string {
  // Contribution density bands, green like GitHub's contribution graph.
  const palette = [
    'var(--bg2)',
    '#0e4429',
    '#006d32',
    '#26a641',
    '#39d353',
  ]
  return palette[Math.min(4, level)] ?? palette[0]!
}

function ribbonLabel(runtime: InstrumentRuntimeState): string {
  if (runtime.status === 'unavailable') return 'Contribution grid unavailable'
  if (runtime.status === 'loading') return 'Contribution grid loading'
  return `Contribution grid across the full window. Full daily figures follow in the adjacent table.`
}

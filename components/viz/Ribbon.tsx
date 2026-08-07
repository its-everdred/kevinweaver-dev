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

const MONTH_LABELS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

/**
 * @description Renders the full-width GitHub-style contribution graph. Every
 * day is a square in a 7-row weekday grid, one column per week, spanning the
 * pane width; the current day is highlighted from the shared galaxy timeline.
 * Clicking or dragging scrubs the timeline.
 * @returns The contribution graph canvas.
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
      if (dayCount <= 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
      const weeks = Math.ceil(dayCount / 7)
      const widthPx = canvas.width
      const heightPx = canvas.height
      // Square cells sized to fill the width, capped so the 7-row grid fits.
      let cellPx = Math.max(1, Math.floor(widthPx / weeks))
      const byHeight = Math.max(1, Math.floor(heightPx / 7))
      if (cellPx > byHeight) cellPx = byHeight
      const gapPx = cellPx >= 4 ? Math.max(1, Math.round(dpr)) : 0
      const stepPx = cellPx + gapPx
      const gridW = weeks * stepPx - (gapPx || 0)
      const originXPx = Math.max(0, Math.floor((widthPx - gridW) / 2))
      const originYPx = Math.max(0, Math.floor((heightPx - 7 * stepPx) / 2))

      ctx.clearRect(0, 0, widthPx, heightPx)
      for (let day = 0; day < dayCount; day++) {
        const week = Math.floor(day / 7)
        const weekday = day % 7
        const level = grid.level[day] ?? 0
        ctx.fillStyle = levelColor(level)
        ctx.fillRect(
          originXPx + week * stepPx,
          originYPx + weekday * stepPx,
          cellPx,
          cellPx
        )
      }

      const current = getGalaxyTimeline().step
      if (current >= 0 && current < dayCount) {
        const week = Math.floor(current / 7)
        const weekday = current % 7
        const x = originXPx + week * stepPx
        const y = originYPx + weekday * stepPx
        ctx.strokeStyle = '#fbf1c7'
        ctx.lineWidth = Math.max(1, dpr)
        ctx.strokeRect(x - 0.5, y - 0.5, cellPx + 1, cellPx + 1)
      }

      ctx.font = `${Math.max(9, Math.round(10 * dpr))}px monospace`
      ctx.fillStyle = '#a89984'
      ctx.textAlign = 'left'
      let lastLabelWeek = Number.NEGATIVE_INFINITY
      let lastMonth = ''
      for (let week = 0; week < weeks; week++) {
        const day = week * 7
        const month = monthLabelForDay(windowStart, day)
        if (!month || month === lastMonth) continue
        const x = originXPx + week * stepPx
        if (x - lastLabelWeek < 26 * dpr) continue
        ctx.fillText(month, x, Math.max(originYPx - dpr * 3, dpr * 8))
        lastLabelWeek = x
        lastMonth = month
      }
    }
    draw()
    const unsubscribe = subscribeGalaxyTimeline(() => draw())
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [grid, windowStart])

  const scrubToX = (clientX: number, element: HTMLCanvasElement): void => {
    if (!grid) return
    const rect = element.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const step = Math.max(0, Math.min(grid.dayCount - 1, Math.round(fraction * (grid.dayCount - 1))))
    seekGalaxyTimeline(step, grid.dayCount)
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
        height: 'var(--kw-ribbon-h, clamp(64px, 12vh, 128px))',
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
        {label}. The outlined square is the current day.
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

function monthLabelForDay(windowStart: string, day: number): string | null {
  if (!windowStart) return null
  const iso = formatDayISO(windowStart, day)
  const month = Number(iso.slice(5, 7))
  return MONTH_LABELS[month - 1] ?? null
}

function levelColor(level: number): string {
  // Contribution density bands, green like GitHub's contribution graph.
  // Concrete hex, not CSS tokens: the canvas 2D API does not resolve var().
  const palette = [
    '#504945',
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
  return `Contribution graph across the full window. Full daily figures follow in the adjacent table.`
}

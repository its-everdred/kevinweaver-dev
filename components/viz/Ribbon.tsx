'use client'

import { memo, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatDayISO, weekdayOfISO } from '@/lib/viz/driver'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { getGalaxyTimeline, subscribeGalaxyTimeline } from './galaxyTimeline'
import { paintRibbon } from './ribbonPaint'
import { ribbonLayout, ribbonWindow, type RibbonWindow } from './ribbonWindow'
import { useRibbonInteraction } from './useRibbonInteraction'

/**
 * @description Renders the full-width GitHub-style contribution graph. One
 * year of history is on screen at a time — 7 weekday rows by 53 week columns,
 * year boundaries marked along the strip, the shared galaxy timeline's current
 * day ringed. The window follows that timeline: seeking or playing to a day
 * older than the window pages it back. Clicking or dragging scrubs the clock,
 * which is the only way to seek now that the galaxy canvas rotates instead.
 * @returns The contribution graph canvas.
 */
export const Ribbon = memo(function Ribbon(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [snapshot, setSnapshot] = useState(() => getGalaxyTimeline())
  const grid = viz?.render.grid
  const windowStartISO = viz?.head.manifest.windowStart ?? ''
  const dayCount = grid?.dayCount ?? 0
  const startWeekday = windowStartISO ? weekdayOfISO(windowStartISO) : 0
  const visible = ribbonWindow(snapshot.step, dayCount, startWeekday)
  const label = ribbonLabel(runtime, {
    dayCount,
    step: snapshot.step,
    visible,
    windowStartISO,
  })
  const interaction = useRibbonInteraction({ dayCount, startWeekday })

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
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }
    const draw = (): void => {
      // The clock is read here, not closed over: the draw is a pure function
      // of (payload, step, geometry), which is what makes it screenshotable.
      const step = getGalaxyTimeline().step
      paintRibbon(ctx, {
        dpr,
        grid,
        heightPx: canvas.height,
        layout: ribbonLayout(canvas.width, canvas.height, dpr),
        step,
        widthPx: canvas.width,
        window: ribbonWindow(step, grid.dayCount, startWeekday),
        windowStartISO,
      })
    }
    resize()
    draw()
    // Resizing the backing store blanks it, so every resize repaints.
    const observer = new ResizeObserver(() => {
      resize()
      draw()
    })
    observer.observe(canvas)
    const unsubscribe = subscribeGalaxyTimeline(draw)
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [grid, startWeekday, windowStartISO])

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
        onPointerCancel={interaction.onPointerCancel}
        onPointerDown={interaction.onPointerDown}
        onPointerMove={interaction.onPointerMove}
        onPointerUp={interaction.onPointerUp}
        ref={canvasRef}
        role="img"
        style={{
          display: 'block',
          height: '100%',
          width: '100%',
          cursor: 'pointer',
        }}
        tabIndex={0}
      >
        {label} The ringed square is the current day.
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

interface LabelInput {
  readonly dayCount: number
  readonly step: number
  readonly visible: RibbonWindow
  readonly windowStartISO: string
}

/**
 * The canvas text alternative. It names the year on screen and the day the
 * clock is on, because neither is recoverable from the adjacent table — the
 * table lists every day, the strip shows one year of them.
 */
function ribbonLabel(
  runtime: InstrumentRuntimeState,
  input: LabelInput
): string {
  if (runtime.status === 'unavailable') return 'Contribution grid unavailable'
  if (runtime.status === 'loading') return 'Contribution grid loading'
  const { dayCount, step, visible, windowStartISO } = input
  if (dayCount <= 0 || !windowStartISO) return 'Contribution grid unavailable'
  const first = formatDayISO(windowStartISO, Math.max(0, visible.start))
  const last = formatDayISO(windowStartISO, Math.min(dayCount - 1, visible.end))
  const current =
    step >= 0 && step < dayCount
      ? ` Current day ${formatDayISO(windowStartISO, step)}.`
      : ''
  return `Contribution grid, one year of daily contributions from ${first} to ${last}.${current} Full daily figures follow in the adjacent table.`
}

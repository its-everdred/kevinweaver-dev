'use client'

import { memo, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatDayISO, weekdayOfISO } from '@/lib/viz/driver'
import {
  useInstrumentRuntime,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { getGalaxyTimeline, subscribeGalaxyTimeline } from './galaxyTimeline'
import { useRibbonCanvas } from './ribbonCanvas'
import {
  RIBBON_DEFAULT_COLUMNS,
  ribbonWindow,
  type RibbonWindow,
} from './ribbonWindow'
import { useRibbonInteraction } from './useRibbonInteraction'

/**
 * @description Renders the full-width GitHub-style contribution graph. The
 * squares fill the pane: 7 weekday rows, and as many week columns as the pane
 * is wide, so a wide browser holds more than a year of history and a phone
 * holds less. Year boundaries are marked along the strip and the shared galaxy
 * timeline's current day is ringed. The window follows that timeline: seeking
 * or playing to a day older than the window pages it back. Clicking or dragging
 * scrubs the clock, which is the only way to seek now that the galaxy canvas
 * rotates instead.
 * @returns The contribution graph canvas.
 */
export const Ribbon = memo(function Ribbon(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [snapshot, setSnapshot] = useState(() => getGalaxyTimeline())
  const [columns, setColumns] = useState(RIBBON_DEFAULT_COLUMNS)
  const grid = viz?.render.grid
  const windowStartISO = viz?.head.manifest.windowStart ?? ''
  const dayCount = grid?.dayCount ?? 0
  const startWeekday = windowStartISO ? weekdayOfISO(windowStartISO) : 0
  const visible = ribbonWindow(snapshot.step, dayCount, startWeekday, columns)
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

  useRibbonCanvas({
    canvasRef,
    grid,
    onColumns: setColumns,
    startWeekday,
    windowStartISO,
  })

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
          // The strip owns the whole gesture, as the galaxy canvas does. Left
          // to the browser, a finger drag across the squares is a page scroll
          // and the scrub is cancelled before its first move.
          touchAction: 'none',
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
 * The canvas text alternative. It names the stretch on screen and the day the
 * clock is on, because neither is recoverable from the adjacent table — the
 * table lists every day, the strip shows the weeks the pane has room for.
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
  return `Contribution grid, daily contributions from ${first} to ${last}.${current} Full daily figures follow in the adjacent table.`
}

'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'
import { getGalaxyTimeline, subscribeGalaxyTimeline } from './galaxyTimeline'
import { paintRibbon, type RibbonPaintOptions } from './ribbonPaint'
import { createRibbonTravel } from './ribbonTravel'
import {
  ribbonCell,
  ribbonLayout,
  ribbonWindow,
  type RibbonLayout,
} from './ribbonWindow'

/** What the strip's draw loop needs from its host component. */
export interface RibbonCanvasHost {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  /** The payload's density series, or undefined until the data arrives. */
  readonly grid: RibbonPaintOptions['grid'] | undefined
  /** Weekday of payload day 0, as `weekdayOfISO` reports it. */
  readonly startWeekday: number
  /** ISO date of payload day 0. */
  readonly windowStartISO: string
  /**
   * Reports the week columns the pane measured out. Must be referentially
   * stable — a `useState` setter — or the canvas is rebuilt every render.
   */
  readonly onColumns: (columns: number) => void
}

/**
 * @description Owns the contribution strip's canvas for as long as its payload
 * lives: it sizes the backing store to the pane, paints a frame whenever the
 * shared clock or the pane changes, and carries the current day's ring between
 * the days playback stops on.
 * @param host The canvas, payload, and column callback to draw from.
 *
 * The frame loop only runs while the ring is crossing. Every other state of
 * this surface — paused, seeked, hovered, resized, reduced motion — paints once
 * and stops, because a strip that keeps asking for frames after it has settled
 * is what stalled this page the last time it had a render loop.
 */
export function useRibbonCanvas(host: RibbonCanvasHost): void {
  const { canvasRef, grid, onColumns, startWeekday, windowStartISO } = host

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grid) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    // Reduced motion keeps the ring on the day it names and never travels it,
    // so the loop below never starts and the strip stays what it always was: a
    // still image that repaints when the clock or the pane asks it to.
    const animated = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
    const travel = createRibbonTravel()
    const measure = (): RibbonLayout =>
      ribbonLayout(canvas.width, canvas.height, dpr, grid.dayCount)
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      // The text alternative names the stretch on screen, so it has to follow
      // the lattice the pane's width just measured out.
      onColumns(measure().columns)
    }
    let raf = 0
    function frame(now: number): void {
      raf = 0
      draw(now)
    }
    const draw = (now: number): void => {
      // The clock is read here, not closed over: the draw is a pure function of
      // (payload, step, geometry, ring), which is what makes it screenshotable.
      // `now` is the only thing handed in, and the travel turns it into a
      // settled ring the instant playback stops or a seek lands.
      const clock = getGalaxyTimeline()
      const layout = measure()
      const visible = ribbonWindow(
        clock.step,
        grid.dayCount,
        startWeekday,
        layout.columns
      )
      const ring = travel.ring({
        animated,
        direction: clock.direction,
        level: (day) => grid.level[day] ?? 0,
        now,
        playing: clock.playing,
        seat: (day) => ribbonCell(visible, day),
        step: clock.step,
      })
      paintRibbon(ctx, {
        dpr,
        grid,
        heightPx: canvas.height,
        layout,
        ring,
        step: clock.step,
        widthPx: canvas.width,
        window: visible,
        windowStartISO,
      })
      // The loop lives exactly as long as the crossing does, and a crossing is
      // a quarter of a second. Settling releases the frame from whichever path
      // noticed — a pause or a seek lands on this draw, not on the queued frame
      // after it — so a still strip is never one frame away from another one.
      if (ring?.moving) {
        if (!raf) raf = requestAnimationFrame(frame)
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    const repaint = (): void => draw(performance.now())
    resize()
    repaint()
    // Resizing the backing store blanks it, so every resize repaints.
    const observer = new ResizeObserver(() => {
      resize()
      repaint()
    })
    observer.observe(canvas)
    const unsubscribe = subscribeGalaxyTimeline(repaint)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      unsubscribe()
    }
  }, [canvasRef, grid, onColumns, startWeekday, windowStartISO])
}

'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getGalaxyTimeline,
  subscribeGalaxyTimeline,
  type GalaxyTimelineSnapshot,
} from './galaxyTimeline'

/** One day of playback per second: the slot a day's reveal has to fill. */
const STEP_MS = 1000

/** The day being drawn, and whether playback walked into it or jumped to it. */
export interface DayClock {
  /** Current timeline step, -1 before the clock has started. */
  readonly step: number
  /** ISO date label for that step. */
  readonly date: string
  /** True only when the step arrived as playback's own one-per-second tick. */
  readonly streaming: boolean
}

const START: DayClock = { step: -1, date: '', streaming: false }

/** The clock snapshot a day was folded from, beside the day itself. */
interface ClockState {
  readonly source: GalaxyTimelineSnapshot | null
  readonly day: DayClock
}

const UNREAD: ClockState = { source: null, day: START }

/**
 * @description Follows the shared galaxy clock and reports the day to draw,
 * marking whether playback ticked into it or something jumped to it.
 * @returns The day being played.
 *
 * The fold happens as React renders the new snapshot rather than in an effect,
 * because the day has to be right in the same commit the step changed in: an
 * effect would paint one frame of the previous day's reveal before catching up.
 */
export function useDayClock(): DayClock {
  const snapshot = useSyncExternalStore(
    subscribeGalaxyTimeline,
    getGalaxyTimeline,
    getGalaxyTimeline
  )
  const [state, setState] = useState<ClockState>(UNREAD)
  if (state.source === snapshot) return state.day
  const day = readClock(state.day, snapshot)
  setState({ source: snapshot, day })
  return day
}

/**
 * @description Resolves how many of a day's lines are visible. The count is
 * derived from how far the step has progressed through its one-second slot, not
 * accumulated in a timer of its own, so it stays locked to the clock every
 * other surface reads and a seek needs no teardown. A day that was jumped to, a
 * paused clock, and a reduced-motion viewer all get the day whole.
 * @param clock The day being drawn.
 * @param total Contributions that day carries.
 * @returns Lines to render, counting from the most recent.
 */
export function useDayReveal(clock: DayClock, total: number): number {
  const [reveal, setReveal] = useState({ step: -1, count: 0 })

  useEffect(() => {
    if (!clock.streaming || total <= 1) return
    const started = performance.now()
    let raf = 0
    const tick = (stamp: number): void => {
      const elapsed = stamp - started
      const shown = Math.min(total, Math.floor((elapsed * total) / STEP_MS) + 1)
      setReveal({ step: clock.step, count: shown })
      if (shown < total) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clock, total])

  if (!clock.streaming || total <= 1) return total
  // Until the step's first frame runs, a streamed day is its most recent line
  // alone; the frames after it walk the rest of the day out at a constant rate.
  if (reveal.step !== clock.step) return 1
  return Math.min(reveal.count, total)
}

/**
 * @description Folds a clock snapshot into the day to draw.
 * @param previous The day already drawn.
 * @param now The clock snapshot to fold in.
 * @returns The day to draw now, or `previous` unchanged when nothing moved.
 */
function readClock(previous: DayClock, now: GalaxyTimelineSnapshot): DayClock {
  const streaming =
    now.step === previous.step
      ? previous.streaming && now.playing
      : isAdvance(previous.step, now)
  if (
    now.step === previous.step &&
    now.date === previous.date &&
    streaming === previous.streaming
  )
    return previous
  return { step: now.step, date: now.date, streaming }
}

/**
 * @description Reads a step change as playback's own tick rather than a seek.
 * The clock publishes no cause, so the tick is identified by its shape: one
 * step, in the direction playback is running, while playback is running. A
 * scrub, a rollover, a jump, and a reduced-motion viewer are all anything else,
 * and render the day whole.
 * @param from The step last drawn.
 * @param now The clock snapshot that replaced it.
 * @returns True when the step advanced by playback and may be animated.
 */
function isAdvance(from: number, now: GalaxyTimelineSnapshot): boolean {
  if (from < 0 || !now.playing || prefersReducedMotion()) return false
  return now.step === from + (now.direction === 'forward' ? 1 : -1)
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

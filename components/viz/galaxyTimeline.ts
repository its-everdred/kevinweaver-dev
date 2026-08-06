'use client'

import { formatDayISO } from '@/lib/viz/driver'

/** Playback direction for the shared timeline. */
export type GalaxyDirection = 'forward' | 'backward'

/** Snapshot published by the galaxy timeline, the single clock for the page. */
export interface GalaxyTimelineSnapshot {
  /** Current day index (0 is the oldest day). */
  readonly step: number
  /** ISO date label for the current step. */
  readonly date: string
  /** True while playback is advancing. */
  readonly playing: boolean
  /** Total number of timeline steps. */
  readonly total: number
  /** Playback direction. */
  readonly direction: GalaxyDirection
  /** ISO date of the first day in the window. */
  readonly windowStartISO: string
}

let snapshot: GalaxyTimelineSnapshot = {
  step: -1,
  date: '',
  playing: true,
  total: 0,
  direction: 'forward',
  windowStartISO: '',
}
const listeners = new Set<() => void>()

/** Subscribes to galaxy timeline updates. Returns an unsubscribe function. */
export function subscribeGalaxyTimeline(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Returns the current galaxy timeline snapshot. */
export function getGalaxyTimeline(): GalaxyTimelineSnapshot {
  return snapshot
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

/**
 * @description Publishes the current galaxy timeline step.
 * @param next The next snapshot to broadcast.
 *
 * This is the single source of truth: the contributions strip, galaxy scene,
 * and events log all read this store, so a seek or an automatic advance is
 * reflected everywhere at once.
 */
export function publishGalaxyTimeline(next: GalaxyTimelineSnapshot): void {
  if (
    next.step === snapshot.step &&
    next.playing === snapshot.playing &&
    next.direction === snapshot.direction &&
    next.total === snapshot.total
  )
    return
  snapshot = next
  notify()
}

/**
 * @description Seeks the timeline to a specific day.
 * @param step Target day index (clamped to [0, total - 1]).
 * @param total Total step count.
 */
export function seekGalaxyTimeline(step: number, total: number): void {
  const clamped = Math.max(0, Math.min(total - 1, step))
  const date =
    snapshot.windowStartISO && total > 0
      ? formatDayISO(snapshot.windowStartISO, clamped)
      : ''
  snapshot = {
    ...snapshot,
    step: clamped,
    date,
    total,
  }
  notify()
}

/** @description Pauses or resumes playback. */
export function setGalaxyPlaying(playing: boolean): void {
  if (playing === snapshot.playing) return
  snapshot = { ...snapshot, playing }
  notify()
}

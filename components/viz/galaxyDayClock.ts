'use client'

import { beamReach } from '@/packages/aiur-galaxy/src/beamTiming'
import {
  createContributorGlide,
  dayPhase,
  resolveContributors,
  type ContributorGlide,
  type ContributorNode,
} from '@/packages/aiur-galaxy/src/contributors'
import type { UniverseLayout } from '@/packages/aiur-galaxy/src/galaxy'
import type { BeamReach } from '@/packages/aiur-galaxy/src/galaxyScene'
import {
  activeSteps,
  nextActiveWindowStep,
  universeFrame,
} from '@/packages/aiur-galaxy/src/universePlayback'
import type { UniverseFrame } from '@/packages/aiur-galaxy/src/universePlayback'
import type {
  PlaybackDirection,
  UniverseSnapshot,
} from '@/packages/aiur-galaxy/src/types'

/** One day of playback per second. */
export const STEP_MS = 1000

/** Everything one day of playback draws, resolved once for that whole day. */
export interface GalaxyDay {
  readonly step: number
  readonly direction: PlaybackDirection
  readonly frame: UniverseFrame
  /** Where the day puts each contributor node, in field units. */
  readonly targets: readonly ContributorNode[]
}

/** The day the galaxy is drawing, and how far through its slot it is. */
export interface GalaxyDayClock {
  /** Carries the contributor nodes along one unbroken path between days. */
  readonly glide: ContributorGlide
  /**
   * Opens whichever day the shared clock is on, and hands a day that has had
   * its whole slot on to the next day carrying contributions.
   * @param step The day the shared clock is on.
   * @param direction Playback direction.
   * @param now The frame's timestamp.
   * @param animated False under reduced motion and while paused, where
   * playback never advances itself at all.
   * @returns The day now on screen, which the caller seeks the clock to when
   * it differs from the one it passed in.
   */
  advance(
    step: number,
    direction: PlaybackDirection,
    now: number,
    animated: boolean
  ): number
  /**
   * Resolves a day, and the one after it, once each.
   * @param step The day to draw.
   * @param direction Playback direction.
   * @returns That day's frame and contributor targets.
   */
  day(step: number, direction: PlaybackDirection): GalaxyDay
  /** Where the nodes are bound after the day `day` last resolved. */
  onward(): readonly ContributorNode[]
  /** How much of each of the day's beams to draw, by beam index. */
  reach(now: number, animated: boolean): BeamReach
  /** How far through its slot the day on screen is. */
  phase(now: number, animated: boolean): number
}

/**
 * @description Owns the day playback is holding: how long it has been held,
 * when it is handed on, which day it is handed to, and what both of those days
 * draw. Grey days are skipped rather than dwelt on: roughly three days in five
 * carry nothing, and a day with nothing on it draws no contributor node and no
 * beam, so stepping onto one spends its whole slot on an empty frame.
 * @param universe The universe being played.
 * @param layout The layout its stars were placed by.
 * @returns A day clock over that universe's timeline.
 */
export function createGalaxyDayClock(
  universe: UniverseSnapshot,
  layout: UniverseLayout
): GalaxyDayClock {
  // Which days are green, resolved once: the contribution log is far too long
  // to search per frame, and this answer never changes.
  const green = activeSteps(universe)
  const total = universe.stepCount
  const glide = createContributorGlide()
  /** The day on screen, so a seek opens a transition the way an advance does. */
  let shown = -1
  /** When it opened, which is what its transition is measured from. */
  let opened = 0
  const open = (step: number, at: number): void => {
    shown = step
    opened = at
    glide.open()
  }
  const nextGreen = (step: number, direction: PlaybackDirection): number =>
    nextActiveWindowStep(step, total, direction, green)
  const resolve = (step: number, direction: PlaybackDirection): GalaxyDay => {
    const frame = universeFrame(universe, step, direction)
    return { step, direction, frame, targets: resolveContributors(layout, frame) }
  }
  const holds = (
    day: GalaxyDay | null,
    step: number,
    direction: PlaybackDirection
  ): day is GalaxyDay =>
    day !== null && day.step === step && day.direction === direction
  /** The day being drawn, and the one the nodes are already heading toward. */
  let today: GalaxyDay | null = null
  let after: GalaxyDay | null = null
  return {
    glide,
    advance(step, direction, now, animated) {
      if (step !== shown) open(step, now)
      if (animated && now - opened >= STEP_MS) open(nextGreen(step, direction), now)
      return shown
    },
    day(step, direction) {
      if (holds(today, step, direction)) return today
      // Playing into a day the lookahead already resolved costs nothing: the
      // contribution log is walked once per day, not twice.
      today = holds(after, step, direction) ? after : resolve(step, direction)
      after = resolve(nextGreen(step, direction), direction)
      return today
    },
    onward() {
      return after?.targets ?? []
    },
    reach(now, animated) {
      const since = now - opened
      return (beam) => beamReach(since, beam, animated)
    },
    phase(now, animated) {
      return dayPhase(now - opened, STEP_MS, animated)
    },
  }
}

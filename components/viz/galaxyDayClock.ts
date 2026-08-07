'use client'

import {
  beamReach,
  createContributorGlide,
  dayTransition,
  type ContributorGlide,
} from '@/packages/aiur-galaxy/src/contributors'
import {
  activeSteps,
  nextActiveWindowStep,
} from '@/packages/aiur-galaxy/src/universePlayback'
import type {
  PlaybackDirection,
  UniverseSnapshot,
} from '@/packages/aiur-galaxy/src/types'

/** One day of playback per second. */
export const STEP_MS = 1000

/** The day the galaxy is drawing, and how far through its change it is. */
export interface GalaxyDayClock {
  /** Carries the contributor nodes between days at a steady speed. */
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
  /** How much of each beam to draw at this point in the day. */
  reach(now: number, animated: boolean): number
  /** How far the contributor nodes have moved into the day. */
  phase(now: number, animated: boolean): number
}

/**
 * @description Owns the day playback is holding: how long it has been held,
 * when it is handed on, and which day it is handed to. Grey days are skipped
 * rather than dwelt on — roughly three days in five carry nothing, and a day
 * with nothing on it draws no contributor node and no beam, so stepping onto
 * one spends its whole slot on an empty frame.
 * @param universe The universe being played.
 * @returns A day clock over that universe's timeline.
 */
export function createGalaxyDayClock(universe: UniverseSnapshot): GalaxyDayClock {
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
  return {
    glide,
    advance(step, direction, now, animated) {
      if (step !== shown) open(step, now)
      if (animated && now - opened >= STEP_MS)
        open(nextActiveWindowStep(step, total, direction, green), now)
      return shown
    },
    reach(now, animated) {
      return beamReach(now - opened, STEP_MS, animated)
    },
    phase(now, animated) {
      return dayTransition(now - opened, animated)
    },
  }
}

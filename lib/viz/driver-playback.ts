import { FIXED_DT, SPEEDS } from './sim/types'
import { advanceCursor, seekCursor } from './sim/cursor'
import type { SimState } from './sim/types'

export type VizSeekMode = 'direct' | 'consumer' | 'motion'

export interface VizPlaybackProjection {
  readonly day: number
  readonly moving: boolean
}

export interface VizSeekState {
  readonly speedIndex: number
  readonly playing: boolean
}

export interface VizPlaybackTrajectory {
  project(tick: number, speedIndex: number): VizPlaybackProjection
  rebase(tick: number, day: number): void
  syncCanonical(tick: number, day: number): void
}

/**
 * @description Anchors simulation clock and cursor fields to an exact projected day.
 * @param state Mutable simulation state to reconcile.
 * @param tick Exact fixed-step clock value.
 * @param day Exact fractional cursor day for the tick.
 */
export function anchorVizPlaybackDay(
  state: SimState,
  tick: number,
  day: number
): void {
  state.tick = tick
  const dayInt = Math.floor(day)
  state.cursorDay = day
  if (dayInt < state.cursorDayInt) advanceCursor(state, dayInt)
  else if (dayInt > state.cursorDayInt) seekCursor(state, dayInt)
  state.cursorDayInt = dayInt
}

/**
 * @description Creates an exact, speed-aware playback cursor with dwell and wrap phases.
 * @param day0 Final available day and wrap target.
 * @param sweepTicks Canonical default-speed sweep length.
 * @param dwellTicks Fixed steps spent at day0 after reset or wrap.
 * @returns Mutable trajectory isolated from rendering and lifecycle state.
 */
export function createVizPlaybackTrajectory(
  day0: number,
  sweepTicks: number,
  dwellTicks: number
): VizPlaybackTrajectory {
  let anchorTick = 0
  let anchorDay = day0
  let dwellUntilTick = dwellTicks

  function project(tick: number, speedIndex: number): VizPlaybackProjection {
    if (tick <= dwellUntilTick) return { day: anchorDay, moving: false }
    const elapsed = tick - Math.max(anchorTick, dwellUntilTick)
    const speed = SPEEDS[speedIndex]
    if (speed === undefined)
      throw new RangeError(`speed index ${speedIndex} is invalid`)
    const day = anchorDay - speed * FIXED_DT * elapsed
    if (day > 0) return { day, moving: true }
    anchorTick = tick
    anchorDay = day0
    dwellUntilTick = tick + dwellTicks
    return { day: day0, moving: true }
  }

  function rebase(tick: number, day: number): void {
    anchorTick = tick
    anchorDay = day
    if (tick >= dwellUntilTick) dwellUntilTick = tick
  }

  function syncCanonical(tick: number, day: number): void {
    const position = ((tick % sweepTicks) + sweepTicks) % sweepTicks
    anchorTick = tick
    anchorDay = day
    dwellUntilTick =
      position <= dwellTicks ? tick + dwellTicks - position : tick
  }

  return { project, rebase, syncCanonical }
}

/**
 * @description Resolves which consumer state survives an internal seek mode.
 * @param mode Direct harness, consumer scrub, or automatic motion-policy seek.
 * @param speedIndex Currently selected transport speed.
 * @param running Whether the animation lifecycle is active.
 * @param defaultSpeedIndex Canonical speed used by direct deterministic seeks.
 * @returns Speed and playback flags to restore after resetting simulation state.
 */
export function resolveVizSeekState(
  mode: VizSeekMode,
  speedIndex: number,
  running: boolean,
  defaultSpeedIndex: number
): VizSeekState {
  return {
    speedIndex: mode === 'direct' ? defaultSpeedIndex : speedIndex,
    playing: mode === 'consumer' && running,
  }
}

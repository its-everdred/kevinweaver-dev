import { liveIdsAscending } from './sim/cursor'
import { digestSimState } from './sim/state'
import type { VizFrameInfo, VizQualityTier } from './driver'
import type { SimState } from './sim/types'

export interface VizDriverInfoOptions {
  readonly state: SimState
  readonly repoNames: readonly string[]
  readonly date: string
  readonly reducedMotion: boolean
  readonly settled: boolean
  readonly winStart: number
  readonly total: number
  readonly highlightCell: VizFrameInfo['highlightCell']
  readonly qualityTier: VizQualityTier
}

/**
 * @description Builds the immutable frame projection published by a driver.
 * @param options - Current state and render metadata for one frame.
 * @returns The subscriber-safe visualization frame information.
 */
export function buildVizDriverInfo(
  options: VizDriverInfoOptions
): VizFrameInfo {
  const { state } = options
  const digest = digestSimState(state)
  return {
    tick: state.tick,
    cursorDay: state.cursorDay,
    cursorDayInt: state.cursorDayInt,
    date: options.date,
    speedIndex: state.speedIndex,
    playing: state.playing,
    reducedMotion: options.reducedMotion,
    settled: options.settled,
    nLive: digest.nLive,
    liveRepos: liveRepoNames(state, options.repoNames),
    ghostRepos: digest.ghostRepos,
    liveHash: digest.liveHash,
    rngState: digest.rngState,
    rngDraws: digest.rngDraws,
    winStart: options.winStart,
    highlightCell: options.highlightCell,
    beams: activeBeams(state),
    drawCalls: { graph: 0, ribbon: 0, overview: 0, total: options.total },
    qualityTier: options.qualityTier,
  }
}

function liveRepoNames(state: SimState, repoNames: readonly string[]): string[] {
  const names: string[] = []
  const ids = new Int32Array(state.entityCount)
  const count = liveIdsAscending(state, ids)
  for (let index = 0; index < count; index++) {
    const id = ids[index]
    if (id !== undefined && id < state.repoCount) names.push(repoNames[id] ?? '')
  }
  return names
}

function activeBeams(state: SimState): number {
  return state.beamLife.filter((life) => life > 0).length
}

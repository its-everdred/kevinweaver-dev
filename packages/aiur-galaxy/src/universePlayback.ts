import type {
  PlaybackDirection,
  UniverseContribution,
  UniverseSnapshot,
} from './types'

/** A universe playback frame: which files are live and which just contributed. */
export interface UniverseFrame {
  /** Timeline step index, clamped to [0, stepCount). */
  readonly step: number
  /** Files live at this step (repo-qualified, e.g. "repoId:path"). */
  readonly liveFiles: ReadonlySet<string>
  /** Files touched at the current step (repo-qualified), in snapshot order. */
  readonly currentFiles: readonly string[]
  /** Repos that contributed at the current step, by repo id. */
  readonly currentRepos: ReadonlySet<number>
  /** Current-step contributions with their actor, in snapshot order. */
  readonly currentContributions: readonly UniverseContribution[]
  /** Total number of timeline steps. */
  readonly total: number
  /** Progress in [0, 1], 1 at the newest step in either direction. */
  readonly progress: number
}

/**
 * @description Clamps a step index into the universe timeline's valid range.
 * @param value Requested index.
 * @param stepCount Timeline length.
 * @returns An integer in [0, stepCount - 1], or -1 when stepCount is 0.
 */
export function clampStep(value: number, stepCount: number): number {
  if (stepCount <= 0) return -1
  return Math.min(stepCount - 1, Math.max(0, Math.floor(value)))
}

function key(repo: number, file: string): string {
  return `${repo}:${file}`
}

/**
 * @description Resolves the live file set at a timeline step.
 * @param contributions Oldest-first contribution log.
 * @param step Clamped step index.
 * @param direction Playback direction.
 * @returns The union of files touched by steps up to (forward) or from
 * (backward) the step, repo-qualified.
 */
export function universeLiveAt(
  contributions: readonly UniverseContribution[],
  step: number,
  direction: PlaybackDirection
): ReadonlySet<string> {
  const live = new Set<string>()
  if (step < 0 || contributions.length === 0) return live
  if (direction === 'forward') {
    for (const contribution of contributions) {
      if (contribution.step > step) break
      live.add(key(contribution.repo, contribution.file))
    }
    return live
  }
  for (const contribution of contributions) {
    if (contribution.step < step) continue
    live.add(key(contribution.repo, contribution.file))
  }
  return live
}

/**
 * @description Builds the universe playback frame at a timeline step.
 * @param snapshot The universe snapshot.
 * @param step Step index.
 * @param direction Playback direction.
 * @returns The immutable frame at this position.
 */
export function universeFrame(
  snapshot: UniverseSnapshot,
  step: number,
  direction: PlaybackDirection
): UniverseFrame {
  const total = snapshot.stepCount
  const clamped = clampStep(step, total)
  const liveFiles = universeLiveAt(snapshot.contributions, clamped, direction)
  const currentFiles: string[] = []
  const currentRepos = new Set<number>()
  const currentContributions: UniverseContribution[] = []
  if (clamped >= 0) {
    for (const contribution of snapshot.contributions) {
      if (contribution.step !== clamped) continue
      currentFiles.push(key(contribution.repo, contribution.file))
      currentRepos.add(contribution.repo)
      currentContributions.push(contribution)
    }
  }
  return {
    step: clamped,
    liveFiles,
    currentFiles,
    currentRepos,
    currentContributions,
    total,
    progress: total <= 0 ? 0 : (clamped + 1) / total,
  }
}

/**
 * @description Returns the step one beyond a frame in a direction.
 * @param frame The current frame.
 * @param direction Direction to advance.
 * @returns The next step index, clamped to the timeline end.
 */
export function nextUniverseStep(frame: UniverseFrame, direction: PlaybackDirection): number {
  const delta = direction === 'forward' ? 1 : -1
  return clampStep(frame.step + delta, frame.total)
}

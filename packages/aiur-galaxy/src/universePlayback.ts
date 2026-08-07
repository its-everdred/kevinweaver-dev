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
  /**
   * Repos whose most recent contribution is still within `RECENT_REPO_STEPS`,
   * mapped to how many steps of playback have passed since it. A repo that
   * contributed on this step maps to 0. Recency runs in playback order, so
   * backward playback ages a repo toward the past.
   */
  readonly recentRepos: ReadonlyMap<number, number>
  /** Current-step contributions with their actor, in snapshot order. */
  readonly currentContributions: readonly UniverseContribution[]
  /** Total number of timeline steps. */
  readonly total: number
  /** Progress in [0, 1], 1 at the newest step in either direction. */
  readonly progress: number
}

/**
 * Steps the default playback window covers. One step is one day, so this is a
 * rolling year: at one day per second it is a six-minute pass, where sweeping
 * the whole history would take over an hour.
 */
export const PLAYBACK_WINDOW_STEPS = 365

/**
 * Steps a repo stays in a frame's recent set after contributing. One step is
 * one day, so a repo is "recent" for the few days of playback that follow its
 * contribution and then ages out.
 */
export const RECENT_REPO_STEPS = 4

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

/**
 * @description The step the default playback window begins on: the most recent
 * day in the timeline.
 * @param stepCount Timeline length.
 * @returns The newest step, or -1 for an empty timeline.
 */
export function playbackWindowEnd(stepCount: number): number {
  return clampStep(stepCount - 1, stepCount)
}

/**
 * @description The oldest step the default playback window reaches: one year
 * back from the most recent day, or the start of the data when the history is
 * shorter than that.
 * @param stepCount Timeline length.
 * @returns The window's oldest step, or -1 for an empty timeline.
 */
export function playbackWindowStart(stepCount: number): number {
  return clampStep(stepCount - PLAYBACK_WINDOW_STEPS, stepCount)
}

/**
 * @description Advances one step inside the rolling playback window. Backward
 * playback starts at the most recent day and walks back a year, then rolls over
 * to the most recent day again rather than stranding on a step it can never
 * leave. Days a seek reached outside the window still play, so the bound is on
 * the default view and not on the data.
 * @param step The current step.
 * @param stepCount Timeline length.
 * @param direction Playback direction.
 * @returns The next step, clamped to the timeline.
 */
export function nextWindowStep(
  step: number,
  stepCount: number,
  direction: PlaybackDirection
): number {
  if (stepCount <= 0) return -1
  const current = clampStep(step, stepCount)
  const start = playbackWindowStart(stepCount)
  const end = playbackWindowEnd(stepCount)
  // Only the window's own edge rolls over. A step a seek put *outside* the
  // window keeps advancing until the data itself runs out.
  if (direction === 'forward') return current === end ? start : current + 1
  return current === start || current === 0 ? end : current - 1
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
  const recentRepos = new Map<number, number>()
  const currentContributions: UniverseContribution[] = []
  if (clamped >= 0) {
    for (const contribution of snapshot.contributions) {
      // Age in playback order: forward playback leaves a contribution behind,
      // backward playback approaches it from the future. A step the current
      // direction has not reached yet is never recent, so its age is negative.
      const age =
        direction === 'forward'
          ? clamped - contribution.step
          : contribution.step - clamped
      if (age >= 0 && age < RECENT_REPO_STEPS) {
        const previous = recentRepos.get(contribution.repo)
        if (previous === undefined || age < previous)
          recentRepos.set(contribution.repo, age)
      }
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
    recentRepos,
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

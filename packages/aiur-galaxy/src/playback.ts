import type {
  PlaybackDirection,
  PlaybackFrame,
  RepoSnapshot,
  SnapshotCommit,
} from './types'

/**
 * @description Clamps an index into the commit timeline's valid range.
 * @param value Requested index, possibly out of range.
 * @param total Commit count.
 * @returns An integer in [0, total - 1], or -1 when total is 0.
 */
export function clampCommitIndex(value: number, total: number): number {
  if (total <= 0) return -1
  return Math.min(total - 1, Math.max(0, Math.floor(value)))
}

/**
 * @description Resolves the set of live files at a commit index.
 * @param commits Oldest-first commit log.
 * @param index Clamped commit index.
 * @param direction Playback direction.
 * @returns The union of files touched by commits up to (forward) or from
 * (backward) the index.
 */
export function liveFilesAt(
  commits: readonly SnapshotCommit[],
  index: number,
  direction: PlaybackDirection
): ReadonlySet<string> {
  const live = new Set<string>()
  if (index < 0 || commits.length === 0) return live
  if (direction === 'forward') {
    for (let cursor = 0; cursor <= index; cursor++) {
      addCommitFiles(live, commits[cursor])
    }
    return live
  }
  for (let cursor = index; cursor < commits.length; cursor++) {
    addCommitFiles(live, commits[cursor])
  }
  return live
}

function addCommitFiles(live: Set<string>, commit: SnapshotCommit | undefined): void {
  if (!commit) return
  for (const path of commit.files) live.add(path)
}

/**
 * @description Builds the playback frame for a commit index.
 * @param snapshot The repo snapshot.
 * @param index Commit index into the oldest-first log.
 * @param direction Playback direction.
 * @returns The immutable frame at this position.
 */
export function playbackFrame(
  snapshot: RepoSnapshot,
  index: number,
  direction: PlaybackDirection
): PlaybackFrame {
  const total = snapshot.commits.length
  const commitIndex = clampCommitIndex(index, total)
  const commit =
    commitIndex < 0 || total === 0 ? null : (snapshot.commits[commitIndex] ?? null)
  const liveFiles = liveFilesAt(snapshot.commits, commitIndex, direction)
  return {
    commitIndex,
    commit,
    liveFiles,
    currentFiles: commit?.files ?? [],
    total,
    progress: total <= 0 ? 0 : (commitIndex + 1) / total,
  }
}

/**
 * @description Returns the index one commit beyond a frame in a direction.
 * @param frame The current frame.
 * @param direction Direction to advance.
 * @returns The next commit index, clamped to the timeline end.
 */
export function nextCommitIndex(frame: PlaybackFrame, direction: PlaybackDirection): number {
  const delta = direction === 'forward' ? 1 : -1
  return clampCommitIndex(frame.commitIndex + delta, frame.total)
}

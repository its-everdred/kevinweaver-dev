/**
 * Core types for aiur-dag.
 *
 * A snapshot is the package's only input: the repo's full current file tree
 * plus the contribution log with enough per-commit detail to build links.
 * Everything downstream (DAG build, layout, playback) is a pure function of
 * this snapshot plus a playback position, so rendering is deterministic.
 */

/** One file in the repo's current tree, keyed by its repo-relative path. */
export interface SnapshotFile {
  readonly path: string
}

/** One commit from the repo log. */
export interface SnapshotCommit {
  /** Full 40-hex commit SHA. */
  readonly sha: string
  /** ISO 8601 commit timestamp. */
  readonly date: string
  /** Committer name from the log. */
  readonly author: string
  /** Absolute URL to the commit on the host (used to build contribution links). */
  readonly url: string
  /** Repo-relative paths touched by this commit. */
  readonly files: readonly string[]
}

/** The full input contract consumed by aiur-dag. */
export interface RepoSnapshot {
  readonly repo: {
    readonly owner: string
    readonly name: string
    /** Default branch, e.g. "main". */
    readonly branch: string
  }
  /** Every current file in the repo tree, oldest-first not implied. */
  readonly files: readonly SnapshotFile[]
  /** Commits ordered oldest-first. */
  readonly commits: readonly SnapshotCommit[]
}

/** One repository in a multi-repo universe: a galaxy. */
export interface UniverseRepo {
  readonly id: number
  readonly name: string
  /** Repo-relative files that become this galaxy's stars. */
  readonly files: readonly string[]
}

/** A shared contribution timeline entry across all repos. */
export interface UniverseContribution {
  /** Timeline step index in [0, stepCount). */
  readonly step: number
  /** Repo id this contribution belongs to. */
  readonly repo: number
  /** Repo-relative file path touched. */
  readonly file: string
}

/** The full input contract for a multi-repo galaxy-cluster visualization. */
export interface UniverseSnapshot {
  readonly repos: readonly UniverseRepo[]
  /** Oldest-first by step index; stepCount is the timeline length. */
  readonly contributions: readonly UniverseContribution[]
  readonly stepCount: number
}

/** A node in the file-tree DAG: either a directory or a file leaf. */
export interface DagNode {
  readonly id: string
  readonly path: string
  readonly name: string
  /** True when this node is a file leaf; false for directories. */
  readonly isFile: boolean
  /** Parent directory id, or null for the repo root node. */
  readonly parent: string | null
  /** Child ids (directories first, then files), stable. */
  readonly children: readonly string[]
  /** Nesting depth, repo root is 0. */
  readonly depth: number
}

/** A directed graph of the repo's file tree. */
export interface FileDag {
  readonly nodes: ReadonlyMap<string, DagNode>
  /** Id of the repo root directory node. */
  readonly rootId: string
}

/** Playback direction through the commit timeline. */
export type PlaybackDirection = 'forward' | 'backward'

/** The immutable result of resolving a playback position. */
export interface PlaybackFrame {
  /** Index into commits (oldest-first). Clamped to the valid range. */
  readonly commitIndex: number
  /** The commit rendered at this position, or null when no commits exist. */
  readonly commit: SnapshotCommit | null
  /**
   * Files considered "live" at this position.
   * Forward: every file touched by commits[0..commitIndex].
   * Backward: every file touched by commits[commitIndex..end].
   */
  readonly liveFiles: ReadonlySet<string>
  /** Files touched by the current commit, in snapshot order. */
  readonly currentFiles: readonly string[]
  /** Total number of commits. */
  readonly total: number
  /** Progress in [0, 1], 1 at the newest commit in either direction. */
  readonly progress: number
}

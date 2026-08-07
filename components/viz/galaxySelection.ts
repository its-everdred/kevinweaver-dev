'use client'

/**
 * Snapshot published by the galaxy selection. The repo pane has two modes and
 * this store is which one it is in: every field null means the pane follows the
 * day being played, and a `repoId` means it is pinned to that repo. Pinned is
 * still distinct from a repo that simply never contributed — that one has a
 * `repoId` and a `lastStep` of -1.
 */
export interface GalaxySelection {
  /** Pinned repo's id, or null while the pane follows the day being played. */
  readonly repoId: number | null
  /** Full `"owner/name"` of the pinned repo. */
  readonly name: string | null
  /** Stars the pinned repo contributes to the disc. */
  readonly fileCount: number | null
  /** Step of the repo's most recent contribution, -1 when it never had one. */
  readonly lastStep: number | null
}

/** Nothing pinned: the pane follows the day being played. */
const FOLLOW_DAY: GalaxySelection = {
  repoId: null,
  name: null,
  fileCount: null,
  lastStep: null,
}

let snapshot: GalaxySelection = FOLLOW_DAY
const listeners = new Set<() => void>()

/** Subscribes to galaxy selection updates. Returns an unsubscribe function. */
export function subscribeGalaxySelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Returns the current galaxy selection snapshot. */
export function getGalaxySelection(): GalaxySelection {
  return snapshot
}

/**
 * @description Reads which of the repo pane's two modes a selection is.
 * @param selection The published selection.
 * @returns True when the pane is pinned to a repo, false when it follows the
 * day being played.
 */
export function isRepoPinned(selection: GalaxySelection): boolean {
  return selection.repoId !== null
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

/**
 * @description Pins the galaxy and the repo pane to one repo.
 * @param next The selection to broadcast.
 *
 * This is the single source of truth for the selection: the scene colors that
 * repo's stars and holds its label revealed, and the repo pane reads the same
 * store, so neither can disagree with the other. A repeat publish of the repo
 * already selected is dropped rather than re-rendering every subscriber on
 * every frame the pointer rests on the same arm.
 */
export function publishGalaxySelection(next: GalaxySelection): void {
  if (next.repoId === snapshot.repoId) return
  snapshot = next
  notify()
}

/**
 * @description Unpins the pane, returning it to the day being played. Clicking
 * empty space in the galaxy and the pane's own dismiss control both land here.
 */
export function clearGalaxySelection(): void {
  if (snapshot.repoId === null) return
  snapshot = FOLLOW_DAY
  notify()
}

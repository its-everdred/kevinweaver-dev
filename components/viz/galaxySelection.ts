'use client'

/**
 * Snapshot published by the galaxy selection, the single record of which repo
 * the viewer last clicked. Every field is null when nothing is selected, which
 * is a different state from a repo that simply never contributed: that one has
 * a `repoId` and a `lastStep` of -1.
 */
export interface GalaxySelection {
  /** Selected repo's id, or null when the viewer has cleared the selection. */
  readonly repoId: number | null
  /** Full `"owner/name"` of the selected repo. */
  readonly name: string | null
  /** Stars the selected repo contributes to the disc. */
  readonly fileCount: number | null
  /** Step of the repo's most recent contribution, -1 when it never had one. */
  readonly lastStep: number | null
}

/** Nothing selected: what the store holds before the first click and after a clear. */
const EMPTY: GalaxySelection = {
  repoId: null,
  name: null,
  fileCount: null,
  lastStep: null,
}

let snapshot: GalaxySelection = EMPTY
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

function notify(): void {
  listeners.forEach((listener) => listener())
}

/**
 * @description Publishes the repo the viewer has selected in the galaxy.
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

/** @description Clears the selection, as clicking empty space does. */
export function clearGalaxySelection(): void {
  if (snapshot.repoId === null) return
  snapshot = EMPTY
  notify()
}

'use client'

/** Snapshot published by the galaxy universe for the events tail to read. */
export interface GalaxyTimelineSnapshot {
  readonly step: number
  readonly date: string
}

let snapshot: GalaxyTimelineSnapshot = { step: -1, date: '' }
const listeners = new Set<() => void>()

/** Subscribes to galaxy timeline updates. Returns an unsubscribe function. */
export function subscribeGalaxyTimeline(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Returns the current galaxy timeline snapshot. */
export function getGalaxyTimeline(): GalaxyTimelineSnapshot {
  return snapshot
}

/** Publishes the current galaxy timeline step (0 is the oldest day). */
export function publishGalaxyTimeline(next: GalaxyTimelineSnapshot): void {
  if (next.step === snapshot.step) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

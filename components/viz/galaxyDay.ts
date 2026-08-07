'use client'

import type { BundleHead } from '@/lib/bundle/loader'
import type { BundleEvent } from '@/lib/bundle/schema'

/** A repository that took at least one contribution on the day being played. */
export interface DayRepo {
  /** Payload repository id — the same id the galaxy selection publishes. */
  readonly id: number
  /** Full `"owner/name"`, or a placeholder when the record never resolved. */
  readonly name: string
  /** Contributions the repository took on that day. */
  readonly count: number
}

/**
 * @description Maps a timeline step onto the payload's event day. Steps count
 * up from the oldest day in the window and the event log counts back from the
 * newest, so the two are mirror images; every surface that needs the day being
 * played crosses between them here rather than repeating the arithmetic.
 * @param dayCount Days in the window.
 * @param step The current timeline step.
 * @returns The event day index, or -1 before the clock has started.
 */
export function eventDayForStep(dayCount: number, step: number): number {
  if (step < 0 || dayCount <= 0) return -1
  return dayCount - 1 - step
}

/**
 * @description The contributions recorded on the day a step lands on, most
 * recent first.
 * @param head The decoded payload, or null while it is still loading.
 * @param step The current timeline step.
 * @returns That day's events, empty for a day with none.
 *
 * The payload's log is emitted newest day first and the loader asserts that
 * ordering, so a day's slice already reads most recent first. Within a day the
 * payload carries nothing finer than the commit an event came from, so the
 * order it was written in is the order that stands.
 */
export function dayContributions(
  head: BundleHead | null,
  step: number
): readonly BundleEvent[] {
  if (!head) return []
  const day = eventDayForStep(head.manifest.dayCount, step)
  if (day < 0) return []
  return head.events.filter((event) => event.day === day)
}

/**
 * @description The repositories contributed to on the day a step lands on, in
 * the order their first contribution of that day appears.
 * @param head The decoded payload, or null while it is still loading.
 * @param step The current timeline step.
 * @returns One entry per repository, empty for a day with no contributions.
 */
/**
 * @description Counts the files a repo owns, which is not the number of stars
 * the disc draws for it: the layout folds a large repo's files onto fewer
 * vertices, so a `RepoArm`'s star count reports a fraction of the truth. Both
 * the day list and a clicked repo read this, so the pane cannot disagree with
 * itself about the same repo.
 * @param repoOf Per-file repo ownership from the decoded payload.
 * @param repoId The repo to count.
 * @returns How many files the repo owns.
 */
export function repoFileCount(repoOf: ArrayLike<number>, repoId: number): number {
  let count = 0
  for (let index = 0; index < repoOf.length; index += 1)
    if (repoOf[index] === repoId) count += 1
  return count
}

export function dayRepos(
  head: BundleHead | null,
  step: number
): readonly DayRepo[] {
  const byId = new Map<number, DayRepo>()
  for (const event of dayContributions(head, step)) {
    const seen = byId.get(event.repo)
    if (seen) {
      byId.set(event.repo, { ...seen, count: seen.count + 1 })
      continue
    }
    byId.set(event.repo, {
      id: event.repo,
      name: head?.repos[event.repo]?.name ?? `repo-${event.repo}`,
      count: 1,
    })
  }
  return [...byId.values()]
}

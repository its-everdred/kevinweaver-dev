'use client'

import type { BundleHead } from '@/lib/bundle/loader'
import type { BundleEvent } from '@/lib/bundle/schema'
// Per module, not through the barrel: see the note in useGalaxyScene.ts.
import type { UniverseRepoInput } from '@/packages/aiur-galaxy/src/buildUniverse'
import {
  privateRepo,
  PRIVATE_REPO_ID,
  PRIVATE_REPO_NAME,
  type PrivateRepo,
} from '@/packages/aiur-galaxy/src/privateRepo'

/** Everything the galaxy draws for one payload, in the payload's own shape. */
export interface GalaxyEventLog {
  /**
   * Real file events followed by the synthesized stand-ins, and so not ordered
   * by day as a whole: the payload's own log is newest day first and the
   * stand-ins are appended after it. Nothing depends on that, because
   * `privateRepo` synthesizes only for days no file event covers and so never
   * splits one day across the two halves.
   */
  readonly events: readonly BundleEvent[]
  /** Each day's slice of the above, keyed by event day. */
  readonly byDay: ReadonlyMap<number, readonly BundleEvent[]>
  /** The synthesized repo, absent when every green day is already placed. */
  readonly synthetic: UniverseRepoInput | undefined
}

/**
 * Derivations already taken, keyed by the payload they came from. The runtime
 * publishes a fresh head object per payload and holds it for as long as that
 * payload is current, so a key lives exactly as long as its result is valid.
 */
const LOGS = new WeakMap<BundleHead, GalaxyEventLog>()

/**
 * @description Everything the galaxy draws for a payload: every real file event
 * plus the synthesized stand-ins for the green days the file history cannot
 * place. Taken once per payload and shared, because the log, the repo pane, and
 * the disc disagreeing about which days carry activity is the bug this module
 * exists to close. 847 of the payload's 1193 green days are synthesized, and a
 * surface reading `head.events` alone reports every one of them as empty while
 * the disc beside it fires beams.
 * @param head The decoded payload.
 * @returns The merged log, indexed by day.
 *
 * `buildGalaxyUniverse` in GalaxyUniverse.tsx still calls `privateRepo` itself.
 * It should build from `events` and `synthetic` here instead: the two agree
 * today only because both are pure functions of the same head, which is a
 * coincidence waiting to be spent rather than a guarantee.
 */
export function galaxyEventLog(head: BundleHead): GalaxyEventLog {
  const cached = LOGS.get(head)
  if (cached) return cached
  const log = buildEventLog(head)
  LOGS.set(head, log)
  return log
}

/**
 * @description Reads whether a contribution is one of the synthesized stand-ins
 * rather than a file the history can name. Its path is a slot in a bounded pool
 * and its repo is not a repository, so a surface has to ask this before it
 * prints either one.
 * @param event The contribution to classify.
 * @returns True when nothing about the event names a real file.
 */
export function isUnplaced(event: BundleEvent): boolean {
  return event.repo === PRIVATE_REPO_ID
}

/**
 * @description Names the repository a contribution belongs to. Payload repo ids
 * are indices into `repos`; the synthesized repo's id is not, so it is named
 * from the constant the galaxy labels its arm with rather than looked up.
 * @param head The decoded payload, or null while it is still loading.
 * @param repoId The repository the contribution names.
 * @returns The repository's name, or a placeholder when it never resolved.
 */
export function repoLabel(head: BundleHead | null, repoId: number): string {
  if (repoId === PRIVATE_REPO_ID) return PRIVATE_REPO_NAME
  return head?.repos[repoId]?.name ?? `repo-${repoId}`
}

/**
 * @description Merges the payload's file events with the days only the calendar
 * can vouch for, and indexes the result by day so the once-a-second step change
 * is a lookup rather than a scan of every event in the window.
 * @param head The decoded payload.
 * @returns The merged log.
 */
function buildEventLog(head: BundleHead): GalaxyEventLog {
  const { dayCount } = head.manifest
  const synthesized = synthesize(head)
  const events: BundleEvent[] = [...head.events]
  // A bundle event counts its day back from the newest while a timeline step
  // counts forward from the oldest, so the synthesis crosses back here.
  for (const event of synthesized?.events ?? [])
    events.push({
      day: dayCount - 1 - event.step,
      repo: event.repo,
      path: event.path,
      actor: event.actor,
    })
  return { events, byDay: indexByDay(events), synthetic: synthesized?.repo }
}

/**
 * @description Runs the synthesis the galaxy runs, on the same inputs. A
 * payload whose calendar cannot be read leaves the log holding its file events
 * alone, which is this module's own bug rather than a blank page.
 * @param head The decoded payload.
 * @returns The synthesized repo and its events, or undefined when every green
 * day is already placed.
 */
function synthesize(head: BundleHead): PrivateRepo | undefined {
  const { dayCount } = head.manifest
  try {
    return privateRepo({
      human: head.grid.human,
      agent: head.grid.agent,
      covered: new Set(head.events.map((event) => dayCount - 1 - event.day)),
      stepCount: dayCount,
    })
  } catch {
    return undefined
  }
}

/**
 * @description Groups a merged log by the day each event landed on.
 * @param events The merged log.
 * @returns One slice per day that carries anything.
 */
function indexByDay(
  events: readonly BundleEvent[]
): ReadonlyMap<number, readonly BundleEvent[]> {
  const byDay = new Map<number, BundleEvent[]>()
  for (const event of events) {
    const slice = byDay.get(event.day)
    if (slice) slice.push(event)
    else byDay.set(event.day, [event])
  }
  return byDay
}

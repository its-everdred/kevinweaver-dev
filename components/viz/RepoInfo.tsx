'use client'

import { Fragment, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { RepoRecord } from '@/lib/bundle/schema'
import { formatDayISO } from '@/lib/viz/driver'
import { dayRepos, type DayRepo } from './galaxyDay'
import {
  clearGalaxySelection,
  getGalaxySelection,
  isRepoPinned,
  subscribeGalaxySelection,
  type GalaxySelection,
} from './galaxySelection'
import { getGalaxyTimeline, subscribeGalaxyTimeline } from './galaxyTimeline'
import { useInstrumentRuntime } from './instrumentRuntime'
import { RepoDayList } from './RepoDayList'
import styles from './RepoInfo.module.css'

/**
 * Extensions that are backup litter rather than something a repo is written in.
 * The payload carries `bak` for three repos, and filtering it here rather than
 * in the pipeline is correct immediately: fixing the source needs the bundle
 * regenerated with GitHub credentials, so the committed data would stay wrong
 * until CI next runs. This filter also stays correct once it does.
 */
const HIDDEN_EXT = new Set(['bak'])

/** One label/value pair in the pane's definition list. */
interface InfoRow {
  readonly label: string
  readonly value: string
  /** True for a value long enough to need more than the one line a row gets. */
  readonly wrap?: boolean
}

/**
 * @description Renders the repo pane in whichever of its two modes the shared
 * selection store is in: with nothing pinned it follows the day being played
 * and lists the repos contributed to on that step; pinned, it shows that repo's
 * summary — files, last activity, and the payload record the instrument runtime
 * already holds — beside a dismiss control that hands the pane back to the day.
 * It owns no state of its own, so the pane and the scene never disagree, and it
 * issues no request.
 * @returns The pinned repo's summary, or the day's list of repos.
 */
export function RepoInfo(): ReactNode {
  const selection = useSyncExternalStore(
    subscribeGalaxySelection,
    getGalaxySelection,
    getGalaxySelection
  )
  const clock = useSyncExternalStore(
    subscribeGalaxyTimeline,
    getGalaxyTimeline,
    getGalaxyTimeline
  )
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const record = findRecord(viz?.head.repos, selection.repoId)
  const name = isRepoPinned(selection)
    ? (selection.name ?? record?.name ?? null)
    : null
  const rows = name
    ? buildRows(selection, record, viz?.head.manifest.windowStart ?? '')
    : []
  const day = name ? [] : dayRepos(viz?.head ?? null, clock.step)

  // The live region is rendered on every branch so a selection announces the
  // change instead of replacing an element the screen reader is not watching.
  return (
    <div className={styles.info}>
      <p aria-live="polite" className="sr-only">
        {announce(name, rows, day)}
      </p>
      {name ? (
        <>
          <p className={styles.head}>
            <a
              className={styles.name}
              href={`https://github.com/${name}`}
              rel="noreferrer"
              target="_blank"
            >
              {name}
            </a>
            <button
              aria-label="Show the day's repos"
              className={styles.dismiss}
              onClick={clearGalaxySelection}
              type="button"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </p>
          <dl className={styles.rows}>
            {rows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd className={row.wrap ? styles.wrap : undefined}>
                  {row.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </>
      ) : (
        <RepoDayList repos={day} step={clock.step} viz={viz} />
      )}
    </div>
  )
}

/**
 * @description Resolves the pinned repo against the payload the runtime already
 * decoded. A miss is expected while the bundle is still loading, and whenever
 * the selection outlives the record it was published from.
 * @param repos The decoded repository records, when the runtime is ready.
 * @param repoId The pinned repository id.
 * @returns The matching record, or null.
 */
function findRecord(
  repos: readonly RepoRecord[] | undefined,
  repoId: number | null
): RepoRecord | null {
  if (!repos || repoId === null) return null
  return repos.find((repo) => repo.id === repoId) ?? null
}

/**
 * @description Builds the pane's rows, widest-value-last so a clipped pane
 * still shows the counts the operator asked for.
 * @param selection The published selection.
 * @param record The payload record behind it, when it resolved.
 * @param windowStart ISO date of day 0, for resolving the last active step.
 * @returns The label/value rows to render.
 */
function buildRows(
  selection: GalaxySelection,
  record: RepoRecord | null,
  windowStart: string
): readonly InfoRow[] {
  const rows: InfoRow[] = [
    { label: 'files', value: countLabel(selection.fileCount) },
    { label: 'last active', value: lastActive(selection, record, windowStart) },
  ]
  if (!record) return rows
  rows.push({ label: 'first commit', value: record.from })
  rows.push({ label: 'commits', value: String(record.vol) })
  rows.push({ label: 'stars', value: String(record.stars) })
  const ext = record.ext.filter((entry) => !HIDDEN_EXT.has(entry))
  if (ext.length > 0)
    rows.push({ label: 'ext', value: ext.join(' '), wrap: true })
  return rows
}

const countLabel = (count: number | null): string =>
  count === null ? 'unknown' : String(count)

/**
 * @description Resolves when the repo was last touched. The galaxy's step is
 * preferred because it is the day the scene is lighting; the record's own last
 * day is the fallback for a repo with no contribution inside the window.
 * @param selection The published selection.
 * @param record The payload record behind it, when it resolved.
 * @param windowStart ISO date of day 0.
 * @returns An ISO day, or `never` when nothing dates the repo.
 */
function lastActive(
  selection: GalaxySelection,
  record: RepoRecord | null,
  windowStart: string
): string {
  const step = selection.lastStep
  if (step !== null && step >= 0 && windowStart)
    return formatDayISO(windowStart, step)
  return record?.to ?? 'never'
}

/**
 * @description Composes the one-line announcement for the pane's live region,
 * so a change reports the mode the pane is in instead of re-reading all of it.
 * @param name The pinned repository, or null while the pane follows the day.
 * @param rows The rows rendered beside it.
 * @param day The day's repos, when the pane is following the day.
 * @returns The text the live region carries.
 */
function announce(
  name: string | null,
  rows: readonly InfoRow[],
  day: readonly DayRepo[]
): string {
  if (name) {
    const detail = rows.map((row) => `${row.label} ${row.value}`).join(', ')
    return `${name} selected. ${detail}.`
  }
  if (day.length === 0) return 'no repositories contributed on this day'
  return `following the day: ${day.map((repo) => repo.name).join(', ')}`
}

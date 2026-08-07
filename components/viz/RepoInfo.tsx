'use client'

import { Fragment, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { RepoRecord } from '@/lib/bundle/schema'
import { formatDayISO } from '@/lib/viz/driver'
import {
  getGalaxySelection,
  subscribeGalaxySelection,
  type GalaxySelection,
} from './galaxySelection'
import { useInstrumentRuntime } from './instrumentRuntime'
import styles from './RepoInfo.module.css'

/** How many extensions fit the pane before the list stops being readable. */
const MAX_EXT = 4

/** One label/value pair in the pane's definition list. */
interface InfoRow {
  readonly label: string
  readonly value: string
}

/**
 * @description Renders whichever repo the viewer last clicked in the galaxy:
 * its name, the number of files it contributes to the disc, and when it was
 * last active, enriched with the payload record the instrument runtime already
 * holds. It reads the shared selection store rather than owning any state, so
 * the pane and the scene never disagree, and it issues no request of its own.
 * @returns The selected repo's summary, or the empty-state hint before the
 * first click.
 */
export function RepoInfo(): ReactNode {
  const selection = useSyncExternalStore(
    subscribeGalaxySelection,
    getGalaxySelection,
    getGalaxySelection
  )
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const record = findRecord(viz?.head.repos, selection.repoId)
  const name = selection.name ?? record?.name ?? null
  const rows = name
    ? buildRows(selection, record, viz?.head.manifest.windowStart ?? '')
    : []

  // The live region is rendered on every branch so a selection announces the
  // change instead of replacing an element the screen reader is not watching.
  return (
    <div className={styles.info}>
      <p aria-live="polite" className="sr-only">
        {announce(name, rows)}
      </p>
      {name ? (
        <>
          <a
            className={styles.name}
            href={`https://github.com/${name}`}
            rel="noreferrer"
            target="_blank"
          >
            {name}
          </a>
          <dl className={styles.rows}>
            {rows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </>
      ) : (
        <p className={styles.hint}>_ click a repo in the galaxy</p>
      )}
    </div>
  )
}

/**
 * @description Resolves the clicked repo against the payload the runtime
 * already decoded. A miss is expected while the bundle is still loading, and
 * whenever the selection outlives the record it was published from.
 * @param repos The decoded repository records, when the runtime is ready.
 * @param repoId The clicked repository id.
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
  if (record.ext.length > 0)
    rows.push({ label: 'ext', value: record.ext.slice(0, MAX_EXT).join(' ') })
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
 * so a click reports the repo instead of re-reading the whole pane.
 * @param name The selected repository, or null.
 * @param rows The rows rendered beside it.
 * @returns The text the live region carries.
 */
function announce(name: string | null, rows: readonly InfoRow[]): string {
  if (!name) return 'no repository selected'
  const detail = rows.map((row) => `${row.label} ${row.value}`).join(', ')
  return `${name} selected. ${detail}.`
}

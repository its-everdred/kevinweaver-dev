'use client'

import type { RepoRecord } from '@/lib/bundle/schema'
import { formatDayISO } from '@/lib/viz/driver'
import type { DayRepo } from './galaxyDay'
import type { GalaxySelection } from './galaxySelection'

/**
 * Extensions that are backup litter rather than something a repo is written in.
 * The payload carries `bak` for three repos, and filtering it here rather than
 * in the pipeline is correct immediately: fixing the source needs the bundle
 * regenerated with GitHub credentials, so the committed data would stay wrong
 * until CI next runs. This filter also stays correct once it does.
 */
const HIDDEN_EXT = new Set(['bak'])

/** One label/value pair in the pane's definition list. */
export interface InfoRow {
  readonly label: string
  readonly value: string
  /** True for a value long enough to need more than the one line a row gets. */
  readonly wrap?: boolean
}

/**
 * @description Reads whether a selection is the synthesized `private` repo.
 * Real repos carry their payload index as an id, so the synthesized one is the
 * only one with a negative id and needs no magic name match. It is a different
 * kind of thing from every other repo the pane shows: it names no files, so it
 * is given no file count and no link.
 * @param repoId The selected repository id, or null with nothing pinned.
 * @returns True for the synthesized repo.
 */
export function isSyntheticRepo(repoId: number | null): boolean {
  return (repoId ?? 0) < 0
}

/**
 * @description Resolves the pinned repo against the payload the runtime already
 * decoded. A miss is expected while the bundle is still loading, and whenever
 * the selection outlives the record it was published from.
 * @param repos The decoded repository records, when the runtime is ready.
 * @param repoId The pinned repository id.
 * @returns The matching record, or null.
 */
export function findRecord(
  repos: readonly RepoRecord[] | undefined,
  repoId: number | null
): RepoRecord | null {
  if (!repos || repoId === null) return null
  return repos.find((repo) => repo.id === repoId) ?? null
}

/**
 * @description Builds the pane's rows, widest-value-last so a clipped pane
 * still shows the counts the operator asked for. The synthesized repo owns no
 * file entity, so it is given no file count: a number there would be about
 * something else, and the note above it already says what its stars are.
 * @param selection The published selection.
 * @param record The payload record behind it, when it resolved.
 * @param windowStart ISO date of day 0, for resolving the last active step.
 * @returns The label/value rows to render.
 */
export function buildRows(
  selection: GalaxySelection,
  record: RepoRecord | null,
  windowStart: string
): readonly InfoRow[] {
  const rows: InfoRow[] = []
  if (!isSyntheticRepo(selection.repoId))
    rows.push({ label: 'files', value: countLabel(selection.fileCount) })
  rows.push({
    label: 'last active',
    value: lastActive(selection, record, windowStart),
  })
  if (!record) return rows
  rows.push({ label: 'first commit', value: record.from })
  rows.push({ label: 'commits', value: String(record.vol) })
  rows.push({ label: 'stars', value: String(record.stars) })
  const ext = record.ext.filter((entry) => !HIDDEN_EXT.has(entry))
  if (ext.length > 0)
    rows.push({ label: 'ext', value: ext.join(' '), wrap: true })
  return rows
}

/**
 * @description Composes the one-line announcement for the pane's live region,
 * so a change reports the mode the pane is in instead of re-reading all of it.
 * @param name The pinned repository, or null while the pane follows the day.
 * @param rows The rows rendered beside it.
 * @param day The day's repos, when the pane is following the day.
 * @returns The text the live region carries.
 */
export function announce(
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

'use client'

import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type { BundleHead } from '@/lib/bundle/loader'
import type { BundleEvent } from '@/lib/bundle/schema'
import { dayContributions } from './galaxyDay'
import { isUnplaced, repoLabel } from './galaxyEventLog'
import { useInstrumentRuntime } from './instrumentRuntime'
import { PrivateFile, PRIVATE_FILE_CSS } from './privateFile'
import { privatePath } from './privatePath'
import { useDayClock, useDayReveal, type DayRange } from './useDayReveal'
import { useRowCapacity } from './useRowCapacity'

const EVENTS_CSS = `
.kw-events{display:flex;flex-direction:column;height:100%;min-height:0;font-size:var(--fs-micro);line-height:1.5;overflow:hidden;}
.kw-events .day{color:var(--text-strong);font-weight:700;margin-bottom:2px;}
.kw-events .rows{display:flex;flex-direction:column;gap:2px;flex:1 1 0;min-width:0;min-height:0;overflow:hidden;}
.kw-events .e{white-space:nowrap;color:var(--text-muted);display:flex;gap:1ch;min-width:0;align-items:center;min-height:24px;}
.kw-events .e .repo{color:var(--aqua);flex:0 0 auto;}
.kw-events .e a.file{display:flex;align-items:center;min-height:24px;}
.kw-events .e .file{color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kw-events .e .actor{flex:0 0 auto;color:var(--purple);}
.kw-events .tail{color:var(--text-faint);}
${PRIVATE_FILE_CSS}`

interface Row {
  readonly key: string
  readonly repo: string
  readonly file: string
  readonly actor: string
  readonly href: string
  /** True when `file` is a fabricated stand-in rather than a path in a repo. */
  readonly unplaced: boolean
}

/**
 * @description Renders the day the shared clock is playing as a log that churns
 * through it: the pane fills with the day's most recent contributions and then
 * keeps moving, dropping a line off the top for every older line it brings in,
 * until the day's oldest contribution has passed through as the one-second slot
 * ends. Only the rows the pane can show are ever mounted, so a three-line day
 * and the payload's eight-thousand-line day cost the same DOM. A row that names
 * a file links to it on the host; a day the contribution graph counts and the
 * file history cannot place names none, and shows an invented path behind a
 * blur so the log reads as work under redaction rather than as an apology.
 * @returns A live, role=log window onto the day's per-repo file contributions.
 */
export function EventsTail(): ReactNode {
  const runtime = useInstrumentRuntime()
  const head = runtime.status === 'ready' ? runtime.viz.head : null
  const clock = useDayClock()
  const paneRef = useRef<HTMLDivElement>(null)
  const capacity = useRowCapacity(paneRef)
  const events = useMemo(
    () => dayContributions(head, clock.step),
    [head, clock.step]
  )
  const range = useDayReveal(clock, events.length, capacity)
  const rows = buildRows(head, events, range)

  return (
    <div
      aria-label="contribution events for the highlighted day"
      className="kw-events"
      id="kw-event-log"
      role="log"
    >
      <style href="kw-events" precedence="region">
        {EVENTS_CSS}
      </style>
      {/* The one thing this log says out loud. The rows below churn far too
          fast to narrate, and the date is already in here, so neither of them
          is left inside a live region to announce itself. */}
      <p aria-live="polite" className="sr-only">
        {daySummary(clock.date, events)}
      </p>
      {clock.date ? (
        <p aria-hidden="true" className="day">
          {clock.date}
        </p>
      ) : null}
      <div aria-live="off" className="rows" ref={paneRef}>
        {rows.map((row) => (
          <p className="e" key={row.key}>
            <span className="actor">{row.actor}</span>
            <span aria-hidden={row.unplaced || undefined} className="repo">
              {row.repo}
            </span>
            <RowFile row={row} />
          </p>
        ))}
        {events.length === 0 ? (
          <p className="tail">_ no contributions this day</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * @description Renders a row's file column: a link to the file on its host when
 * the history places the contribution, and the redacted stand-in when it cannot.
 * @param row The row being drawn.
 * @returns The file column.
 */
function RowFile({ row }: { readonly row: Row }): ReactNode {
  if (row.href)
    return (
      <a className="file" href={row.href} rel="noreferrer" target="_blank">
        {row.file}
      </a>
    )
  if (row.unplaced) return <PrivateFile path={row.file} />
  return <span className="file">{row.file}</span>
}

/**
 * @description Builds the rows for the slice of the day currently on screen,
 * most recent of the slice first.
 * @param head The decoded payload, or null while it is still loading.
 * @param events The day's contributions, most recent first.
 * @param range The slice the reveal has the pane showing.
 * @returns One row per contribution in the slice.
 *
 * Keys are the contribution's position in the day, so a sliding window reuses
 * the row elements it already has instead of tearing every one of them down on
 * a frame that moved the window by one line.
 */
function buildRows(
  head: BundleHead | null,
  events: readonly BundleEvent[],
  range: DayRange
): readonly Row[] {
  const out: Row[] = []
  for (let index = range.start; index < range.end; index += 1) {
    const event = events[index]
    if (!event) break
    const unplaced = isUnplaced(event)
    const repo = head?.repos[event.repo]
    out.push({
      key: String(index),
      repo: shortRepo(repoLabel(head, event.repo)),
      // Keyed on the pool slot, never on the row, so a star keeps one name.
      file: unplaced ? privatePath(event.path) : shortPath(event.path),
      actor: event.actor === 1 ? 'ak' : 'kw',
      // Never a link for the synthesized repo: it names no file to link to, and
      // github.com/private is somebody else's page.
      href: repo && !unplaced ? repoBlobUrl(repo.name, event.path) : '',
      unplaced,
    })
  }
  return out
}

/**
 * @description The one line the log announces per day, standing in for a churn
 * no screen reader could follow. A day the file history cannot place is counted
 * like any other and then said to name no files, so a listener is never sent
 * looking through the rows for links that were never there.
 * @param date The day being drawn, empty before the clock has started.
 * @param events The day's contributions.
 * @returns The announcement, or empty while there is no day to announce.
 */
function daySummary(date: string, events: readonly BundleEvent[]): string {
  if (!date) return ''
  if (events.length === 0) return `${date}: no contributions`
  const total = `${events.length} contribution${events.length === 1 ? '' : 's'}`
  const unplaced = events.filter(isUnplaced).length
  if (unplaced === 0) return `${date}: ${total}`
  if (unplaced === events.length)
    return `${date}: ${total}, none placed to a file`
  return `${date}: ${total}, ${unplaced} not placed to a file`
}

function shortRepo(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

function shortPath(path: string): string {
  return path.length > 28 ? `${path.slice(0, 25)}…` : path
}

function repoBlobUrl(repoName: string, file: string): string {
  const branch = 'main'
  return `https://github.com/${repoName}/blob/${branch}/${file}`
}

'use client'

import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type { BundleHead } from '@/lib/bundle/loader'
import type { BundleEvent } from '@/lib/bundle/schema'
import { dayContributions } from './galaxyDay'
import { useInstrumentRuntime } from './instrumentRuntime'
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
`

interface Row {
  readonly key: string
  readonly repo: string
  readonly file: string
  readonly actor: string
  readonly href: string
}

/**
 * @description Renders the day the shared clock is playing as a log that churns
 * through it: the pane fills with the day's most recent contributions and then
 * keeps moving, dropping a line off the top for every older line it brings in,
 * until the day's oldest contribution has passed through as the one-second slot
 * ends. Only the rows the pane can show are ever mounted, so a three-line day
 * and the payload's eight-thousand-line day cost the same DOM. Each row links
 * to the file on the host.
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
        {daySummary(clock.date, events.length)}
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
            <span className="repo">{row.repo}</span>
            {row.href ? (
              <a
                className="file"
                href={row.href}
                rel="noreferrer"
                target="_blank"
              >
                {row.file}
              </a>
            ) : (
              <span className="file">{row.file}</span>
            )}
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
    const repo = head?.repos[event.repo]
    const label = repo?.name ?? `repo-${event.repo}`
    out.push({
      key: String(index),
      repo: shortRepo(label),
      file: shortPath(event.path),
      actor: event.actor === 1 ? 'ak' : 'kw',
      href: repo ? repoBlobUrl(repo.name, event.path) : '',
    })
  }
  return out
}

/**
 * @description The one line the log announces per day, standing in for a churn
 * no screen reader could follow.
 * @param date The day being drawn, empty before the clock has started.
 * @param count Contributions that day carries.
 * @returns The announcement, or empty while there is no day to announce.
 */
function daySummary(date: string, count: number): string {
  if (!date) return ''
  if (count === 0) return `${date}: no contributions`
  return `${date}: ${count} contribution${count === 1 ? '' : 's'}`
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

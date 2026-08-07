'use client'

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { BundleHead } from '@/lib/bundle/loader'
import { dayContributions } from './galaxyDay'
import { useInstrumentRuntime } from './instrumentRuntime'
import { useDayClock, useDayReveal } from './useDayReveal'

const EVENTS_CSS = `
.kw-events{display:flex;flex-direction:column;gap:2px;font-size:var(--fs-micro);line-height:1.5;overflow:hidden;}
.kw-events .day{color:var(--text-strong);font-weight:700;margin-bottom:2px;}
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
 * Rows the log will build for one day. The pane clips well before this; the cap
 * is what keeps the busiest day in the payload — over eight thousand
 * contributions — from building eight thousand nodes nobody can see.
 */
const MAX_ROWS = 60

/**
 * @description Renders every contribution of the day the shared clock is
 * playing, most recent first, filling the day in one line at a time across that
 * day's one-second slot. Each row links to the file on the host.
 * @returns A live, role=log list of the day's per-repo file contributions.
 */
export function EventsTail(): ReactNode {
  const runtime = useInstrumentRuntime()
  const head = runtime.status === 'ready' ? runtime.viz.head : null
  const clock = useDayClock()
  const rows = useMemo(() => buildRows(head, clock.step), [head, clock.step])
  const visible = useDayReveal(clock, rows.length)

  return (
    <div className="kw-events" id="kw-event-log" role="log">
      <style href="kw-events" precedence="region">
        {EVENTS_CSS}
      </style>
      <p aria-label="contribution events for the highlighted day" aria-live="polite">
        <span className="sr-only">contribution events for the highlighted day</span>
      </p>
      {clock.date ? <p className="day">{clock.date}</p> : null}
      {rows.slice(0, visible).map((row) => (
        <p className="e" key={row.key}>
          <span className="actor">{row.actor}</span>
          <span className="repo">{row.repo}</span>
          {row.href ? (
            <a className="file" href={row.href} rel="noreferrer" target="_blank">
              {row.file}
            </a>
          ) : (
            <span className="file">{row.file}</span>
          )}
        </p>
      ))}
      {rows.length === 0 ? (
        <p className="tail">_ no contributions this day</p>
      ) : null}
    </div>
  )
}

/**
 * @description Builds the day's rows from the payload the runtime already
 * decoded, most recent first.
 * @param head The decoded payload, or null while it is still loading.
 * @param step The step being drawn.
 * @returns The rows to render, capped at `MAX_ROWS`.
 */
function buildRows(head: BundleHead | null, step: number): readonly Row[] {
  const out: Row[] = []
  for (const event of dayContributions(head, step)) {
    if (out.length >= MAX_ROWS) break
    const repo = head?.repos[event.repo]
    const label = repo?.name ?? `repo-${event.repo}`
    out.push({
      key: `${step} ${label} ${event.path} ${event.actor}`,
      repo: shortRepo(label),
      file: shortPath(event.path),
      actor: event.actor === 1 ? 'ak' : 'kw',
      href: repo ? repoBlobUrl(repo.name, event.path) : '',
    })
  }
  return out
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

'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useInstrumentRuntime } from './instrumentRuntime'
import { getGalaxyTimeline, subscribeGalaxyTimeline } from './galaxyTimeline'

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

const MAX_ROWS = 60

function shortRepo(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

/**
 * @description Renders every contribution of the currently highlighted day in
 * the galaxy universe, updating as playback crosses days. Each row links to the
 * file on the host.
 * @returns A live, role=log list of the day's per-repo file contributions.
 */
export function EventsTail(): ReactNode {
  const runtime = useInstrumentRuntime()
  const viz = runtime.status === 'ready' ? runtime.viz : null
  const [rows, setRows] = useState<readonly Row[]>([])
  const [date, setDate] = useState('')

  useEffect(() => {
    if (!viz) return
    const head = viz.head
    const short = (name: string): string =>
      name.length > 28 ? `${name.slice(0, 25)}\u2026` : name

    const renderDay = (step: number): void => {
      const dateLabel = getGalaxyTimeline().date
      setDate(dateLabel)
      const eventDay = head.manifest.dayCount - 1 - step
      const out: Row[] = []
      for (const event of head.events) {
        if (event.day !== eventDay) continue
        const repo = head.repos[event.repo]
        const label = repo?.name ?? `repo-${event.repo}`
        const repoShort = shortRepo(label)
        const href = repo ? repoBlobUrl(repo.name, event.path) : ''
        out.push({
          key: `${step}\u0000${label}\u0000${event.path}\u0000${event.actor}`,
          repo: repoShort,
          file: short(event.path),
          actor: event.actor === 1 ? 'ak' : 'kw',
          href,
        })
      }
      setRows(out.slice(0, MAX_ROWS))
    }

    const firstStep = getGalaxyTimeline().step
    if (firstStep >= 0) renderDay(firstStep)
    return subscribeGalaxyTimeline(() => {
      const step = getGalaxyTimeline().step
      if (step >= 0) renderDay(step)
    })
  }, [viz])

  return (
    <div className="kw-events" id="kw-event-log" role="log">
      <style href="kw-events" precedence="region">
        {EVENTS_CSS}
      </style>
      <p aria-label="contribution events for the highlighted day" aria-live="polite">
        <span className="sr-only">contribution events for the highlighted day</span>
      </p>
      {date ? <p className="day">{date}</p> : null}
      {rows.map((row) => (
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

function repoBlobUrl(repoName: string, file: string): string {
  const branch = 'main'
  return `https://github.com/${repoName}/blob/${branch}/${file}`
}

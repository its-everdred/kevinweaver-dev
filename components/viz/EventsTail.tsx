'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatDayISO } from '@/lib/viz/driver'
import { useInstrumentRuntime } from './instrumentRuntime'

const EVENTS_CSS = `
.kw-events{display:flex;flex-direction:column;gap:2px;font-size:var(--fs-micro);line-height:1.5;overflow:hidden;}
.kw-events .e{white-space:pre;color:var(--text-muted);display:flex;gap:1ch;min-width:0;}
.kw-events .e .repo{color:var(--aqua);flex:0 0 auto;}
.kw-events .e .file{color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kw-events .e .ok{color:var(--green);margin-left:auto;flex:0 0 auto;}
.kw-events .e-enter{animation:kw-logIn .3s ease both;}
.kw-events .tail{color:var(--text-faint);}
`

interface Row {
  readonly key: string
  readonly repo: string
  readonly file: string
  readonly day: string
}

const MAX_ROWS = 40

/**
 * @description Streams the most recent contribution events as the playhead crosses days.
 * @returns A live, role=log stream of per-repo file touches.
 */
export function EventsTail(): ReactNode {
  const runtime = useInstrumentRuntime()
  const [rows, setRows] = useState<readonly Row[]>([])
  const seen = useRef(new Set<string>())
  const viz = runtime.status === 'ready' ? runtime.viz : null

  useEffect(() => {
    if (!viz) return
    const head = viz.head
    const short = (name: string): string =>
      name.length > 28 ? `${name.slice(0, 25)}\u2026` : name
    const maybePush = (day: number): void => {
      const dayISO = formatDayISO(head.manifest.windowStart, day)
      // Event days are stored as offsets from the newest day; `day` here is an
      // absolute index into the window, so the newest day is dayCount - 1.
      const eventDay = head.manifest.dayCount - 1 - day
      for (const event of head.events) {
        if (event.day !== eventDay) continue
        const repo = head.repos[event.repo]
        const label = repo?.short ?? `repo-${event.repo}`
        const key = `${dayISO}\u0000${label}\u0000${event.path}`
        if (seen.current.has(key)) continue
        seen.current.add(key)
        setRows((current) =>
          [{ key, repo: label, file: short(event.path), day: dayISO }, ...current].slice(
            0,
            MAX_ROWS
          )
        )
      }
    }
    maybePush(viz.input.dayCount - 1)
    return viz.driver.subscribe((info) => {
      if (info.cursorDayInt !== info.cursorDay) return
      maybePush(info.cursorDayInt)
    })
  }, [viz])

  return (
    <div className="kw-events" id="kw-event-log" role="log">
      <style href="kw-events" precedence="region">
        {EVENTS_CSS}
      </style>
      <p aria-label="recent contribution events" aria-live="polite">
        <span className="sr-only">recent contribution events</span>
      </p>
      {rows.map((row, index) => (
        <p className={index < 8 ? 'e e-enter' : 'e'} key={row.key}>
          <span className="repo">{row.repo}</span>
          <span className="file">{row.file}</span>
          <span aria-hidden="true" className="ok">
            ok
          </span>
        </p>
      ))}
      {rows.length === 0 ? (
        <p className="tail">_ no events crossed yet</p>
      ) : null}
    </div>
  )
}

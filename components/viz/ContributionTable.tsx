import type { ReactNode } from 'react'
import type { BundleMeta, GridSeries } from '@/lib/bundle/schema'
import { bandLabel, level } from '@/lib/viz/tokens/level'

/**
 * @description The DEC-011 accessible text equivalent of the contribution
 * canvases: a server-rendered, visually hidden `<table>` with one `<td>` per
 * day in the published window. One artefact, three jobs — the screen-reader
 * text equivalent, the no-JS fallback, and the indexable content surface
 * (`viz-runtime` §9.4). Synchronous server component: no `'use client'`, no
 * hooks, no fetch. Hidden visually by KW-003's `.sr-only` and nothing else.
 */

export interface ContributionTableProps {
  /** BundleHead.grid from KW-015's boot(); the wire series decoded by KW-012. */
  grid: GridSeries
  /** BundleHead.manifest, projected onto the four fields this table renders. */
  meta: Pick<
    BundleMeta,
    'windowStart' | 'windowEnd' | 'dayCount' | 'generatedAt'
  >
  /** Element id for the <table>, for a sibling's aria-describedby. */
  id?: string
  /** Appended to `sr-only`; never replaces it. */
  className?: string
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Dates are UTC-pinned and rendered in one locale (Invariant 4, property 4). */
const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const NUM = new Intl.NumberFormat('en-US')

/** No Date arithmetic on local time, ever. */
function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1))
}
const addDays = (base: Date, n: number): Date =>
  new Date(base.getTime() + n * 86_400_000)
const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
const dayLabel = (d: Date): string => DAY_FMT.format(d)

export function ContributionTable({
  grid,
  meta,
  id,
  className,
}: ContributionTableProps): ReactNode {
  // Fail closed. A wrong text equivalent is worse than none.
  if (
    !grid ||
    !meta ||
    grid.dayCount !== meta.dayCount ||
    grid.dayCount <= 0 ||
    grid.human.length !== grid.dayCount ||
    grid.agent.length !== grid.dayCount
  ) {
    return null
  }

  const start = toUtcDate(grid.start)
  const leading = start.getUTCDay() // 0..6 padding cells before day 0
  const weeks = Math.ceil((leading + grid.dayCount) / 7)
  let sum = 0
  for (let i = 0; i < grid.dayCount; i += 1)
    sum += (grid.human[i] ?? 0) + (grid.agent[i] ?? 0)

  return (
    <table
      id={id}
      data-testid="contribution-table"
      className={['sr-only', className].filter(Boolean).join(' ')}
    >
      <caption>
        {`Contributions by day, ${dayLabel(toUtcDate(meta.windowStart))} – ${dayLabel(
          toUtcDate(meta.windowEnd)
        )}. ${NUM.format(sum)} contributions across ${NUM.format(
          grid.dayCount
        )} days.`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Week</th>
          {WEEKDAYS.map((weekday) => (
            <th key={weekday} scope="col">
              {weekday}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: weeks }, (_, w) => {
          const weekStart = addDays(start, w * 7 - leading)
          return (
            <tr key={isoDay(weekStart)}>
              <th scope="row">{`Week of ${dayLabel(weekStart)}`}</th>
              {WEEKDAYS.map((name, k) => {
                const i = w * 7 + k - leading
                if (i < 0 || i >= grid.dayCount) return <td key={name} />
                const day = addDays(start, i)
                const count = (grid.human[i] ?? 0) + (grid.agent[i] ?? 0)
                const lv = level(count)
                return (
                  <td
                    key={name}
                    data-day={isoDay(day)}
                    data-count={count}
                    data-level={lv}
                  >
                    {`${dayLabel(day)}: ${NUM.format(count)} contribution${
                      count === 1 ? '' : 's'
                    } (level ${lv}, band ${bandLabel(lv)})`}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

'use client'

import type { ReactNode } from 'react'
import type { DayRepo } from './galaxyDay'
import { publishGalaxySelection } from './galaxySelection'
import type { InstrumentViz } from './instrumentRuntime'
import styles from './RepoInfo.module.css'

/** What the repo pane's day mode needs from the pane. */
export interface RepoDayListProps {
  /** Repos contributed to on the day being played. */
  readonly repos: readonly DayRepo[]
  /** The step they were read from. */
  readonly step: number
  /** The decoded runtime, for resolving a pinned repo's star count. */
  readonly viz: InstrumentViz | null
}

/**
 * @description Lists the repos contributed to on the day being played, each one
 * a control that pins the pane and the scene to it.
 * @param props The day's repos and the runtime they were read from.
 * @returns The day's list, or the hint for a day with no contributions.
 */
export function RepoDayList(props: RepoDayListProps): ReactNode {
  if (props.repos.length === 0)
    return <p className={styles.hint}>_ no repos this day</p>
  return (
    <ul className={styles.day}>
      {props.repos.map((repo) => (
        <li key={repo.id}>
          <button
            className={styles.dayRepo}
            onClick={() => pinRepo(repo, props.step, props.viz)}
            type="button"
          >
            <span className={styles.dayName}>{repo.name}</span>
            <span className={styles.dayCount}>{repo.count}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * @description Pins the pane and the scene to a repo picked out of the day's
 * list. The star count is counted from the runtime's file entities, which is
 * the same count the scene's own pick publishes, so a repo pinned here reads
 * identically to the same repo clicked in the disc.
 * @param repo The repo the viewer picked.
 * @param step The step it was listed on, which is its last activity by
 * definition — it contributed on that day.
 * @param viz The decoded runtime, when it is ready.
 */
function pinRepo(repo: DayRepo, step: number, viz: InstrumentViz | null): void {
  publishGalaxySelection({
    repoId: repo.id,
    name: repo.name,
    fileCount: starCount(viz, repo.id),
    lastStep: step,
  })
}

function starCount(viz: InstrumentViz | null, repoId: number): number | null {
  if (!viz) return null
  const owners = viz.input.repoOf
  let count = 0
  for (let index = 0; index < owners.length; index += 1)
    if (owners[index] === repoId) count += 1
  return count
}

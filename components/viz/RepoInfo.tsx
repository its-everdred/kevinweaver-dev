'use client'

import { Fragment, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { dayRepos } from './galaxyDay'
import {
  clearGalaxySelection,
  getGalaxySelection,
  isRepoPinned,
  subscribeGalaxySelection,
} from './galaxySelection'
import { getGalaxyTimeline, subscribeGalaxyTimeline } from './galaxyTimeline'
import { useInstrumentRuntime } from './instrumentRuntime'
import { RepoDayList } from './RepoDayList'
import {
  announce,
  buildRows,
  findRecord,
  isSyntheticRepo,
} from './repoInfoRows'
import styles from './RepoInfo.module.css'

/**
 * @description Renders the repo pane in whichever of its two modes the shared
 * selection store is in: with nothing pinned it follows the day being played
 * and lists the repos contributed to on that step; pinned, it shows that repo's
 * summary (files, last activity, and the payload record the instrument runtime
 * already holds) beside a dismiss control that hands the pane back to the day.
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
  const synthetic = isSyntheticRepo(selection.repoId)
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
            {synthetic ? (
              <span className={styles.name}>{name}</span>
            ) : (
              <a
                className={styles.name}
                href={`https://github.com/${name}`}
                rel="noreferrer"
                target="_blank"
              >
                {name}
              </a>
            )}
            <button
              aria-label="Show the day's repos"
              className={styles.dismiss}
              onClick={clearGalaxySelection}
              type="button"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </p>
          {synthetic ? (
            <p className={styles.note}>
              days the contribution graph counts that the file history cannot
              place: pull requests, issues, reviews, and work in repositories
              that were never cloned, private work among them. Contribution
              volumes rather than named files.
            </p>
          ) : null}
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

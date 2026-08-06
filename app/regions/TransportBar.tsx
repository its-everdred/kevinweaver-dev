'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import {
  PauseIcon,
  PlayIcon,
  SkipEndIcon,
  SkipStartIcon,
} from '@/components/icons'
import {
  getGalaxyTimeline,
  seekGalaxyTimeline,
  setGalaxyPlaying,
  subscribeGalaxyTimeline,
} from '@/components/viz/galaxyTimeline'
import type { TransportBarProps } from './_contract'
import styles from './TransportBar.module.css'

interface SeekStyle extends CSSProperties {
  readonly '--kw-seek-pct'?: string
}

/**
 * @description Renders the playback strip that drives the shared galaxy
 * timeline (the single source of truth for the current day). Play/pause,
 * scrubbing, and the start/live jumps all write to that store, so the
 * contributions strip, galaxy scene, and events log advance together at
 * exactly one day per second.
 * @param props Region envelope used by the page composer.
 * @returns The transport bar subtree.
 */
export default function TransportBar(props: TransportBarProps): ReactNode {
  const [snap, setSnap] = useState(() => getGalaxyTimeline())
  useEffect(() => subscribeGalaxyTimeline(() => setSnap(getGalaxyTimeline())), [])

  const maxDay = Math.max(0, snap.total - 1)
  const ready = snap.total > 0
  const pct = maxDay === 0 ? 0 : (Math.max(0, snap.step) / maxDay) * 100
  const idle = !ready

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return
    if (event.repeat || event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    setGalaxyPlaying(!snap.playing)
  }

  const seekTo = (day: number): void => {
    if (!ready) return
    const clamped = Math.max(0, Math.min(maxDay, day))
    seekGalaxyTimeline(clamped, snap.total)
  }

  const seekCss: SeekStyle = { '--kw-seek-pct': `${pct}%` }

  return (
    <div
      id={props.id}
      className={[styles.bar, props.className].filter(Boolean).join(' ')}
      style={props.style}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={styles.play}
        aria-label={snap.playing ? 'Pause playback' : 'Resume playback'}
        aria-pressed={snap.playing}
        aria-disabled={idle}
        onClick={() => setGalaxyPlaying(!snap.playing)}
      >
        {snap.playing ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
      </button>
      <div className={styles.seekWrap}>
        <input
          type="range"
          className={styles.seek}
          min={0}
          max={maxDay}
          step={1}
          value={ready ? snap.step : 0}
          aria-label="Seek through the contribution history"
          aria-valuetext={
            ready
              ? `${snap.date} · day ${snap.step + 1} of ${snap.total}`
              : 'no data loaded'
          }
          aria-disabled={idle}
          onChange={(event) => seekTo(event.currentTarget.valueAsNumber)}
          style={seekCss}
        />
      </div>
      <button
        type="button"
        className={styles.jump}
        aria-label="Jump to the start of the contribution history"
        aria-disabled={idle}
        onClick={() => seekTo(0)}
      >
        <SkipStartIcon size={11} />
      </button>
      <button
        type="button"
        className={styles.jumpLive}
        aria-label="Jump to the most recent day"
        aria-disabled={idle}
        onClick={() => seekTo(maxDay)}
      >
        <SkipEndIcon size={11} />
      </button>
      <span className={styles.dateLabel} aria-hidden="true">
        {snap.date || '–'}
      </span>
    </div>
  )
}

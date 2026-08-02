'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  PauseIcon,
  PlayIcon,
  SkipEndIcon,
  SkipStartIcon,
} from '@/components/icons'
import { getVizTransport } from '@/lib/viz/driver'
import { SPEEDS } from '@/lib/viz/sim/types'
import type { TransportBarProps } from './_contract'
import styles from './TransportBar.module.css'

const transport = getVizTransport()
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export type FreshnessTone = 'ok' | 'warn' | 'dim'

export interface FreshnessReadout {
  readonly label: string
  readonly tone: FreshnessTone
  readonly title: string
}

/**
 * Calculates a deterministic freshness label from the payload timestamp.
 * @param generatedAtISO RFC3339 timestamp from the payload manifest.
 * @param nowMs Current time in milliseconds, or null during server rendering.
 * @returns A freshness readout, or null when the timestamp is absent or invalid.
 */
export function freshness(
  generatedAtISO: string | null | undefined,
  nowMs: number | null
): FreshnessReadout | null {
  if (!generatedAtISO) return null
  const generatedMs = Date.parse(generatedAtISO)
  if (Number.isNaN(generatedMs)) return null
  const title = `data generated ${generatedAtISO}`
  if (nowMs === null) {
    return {
      label: `generated ${generatedAtISO.slice(0, 10)}`,
      tone: 'ok',
      title,
    }
  }
  const age = Math.max(0, nowMs - generatedMs)
  if (age < HOUR_MS) return { label: 'fresh · <1h ago', tone: 'ok', title }
  if (age < DAY_MS) {
    return {
      label: `fresh · ${Math.floor(age / HOUR_MS)}h ago`,
      tone: 'ok',
      title,
    }
  }
  const days = Math.floor(age / DAY_MS)
  if (days < 7) return { label: `${days}d ago`, tone: 'warn', title }
  return { label: `stale · ${days}d ago`, tone: 'dim', title }
}

/**
 * Renders the 38 px playback strip and its keyboard-operable controls.
 * @param props Region envelope used by the page composer.
 * @returns The transport bar subtree.
 */
export default function TransportBar({
  id,
  className,
  style,
}: TransportBarProps) {
  const snap = useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getServerSnapshot
  )
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    const handle = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(handle)
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return
    if (event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    transport.toggle()
  }, [])

  const maxDay = Math.max(0, snap.dayCount - 1)
  const pct = maxDay === 0 ? 0 : (snap.dayIndex / maxDay) * 100
  const birthPct =
    snap.birthDayIndex < 0 || maxDay === 0
      ? null
      : (snap.birthDayIndex / maxDay) * 100
  const speed = SPEEDS[snap.speedIndex] ?? SPEEDS[0]
  const fresh = freshness(snap.generatedAt, nowMs)
  const idle = !snap.ready || undefined

  return (
    <div
      id={id}
      className={[styles.bar, className].filter(Boolean).join(' ')}
      style={style}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={styles.play}
        aria-label={snap.playing ? 'Pause playback' : 'Resume playback'}
        aria-pressed={snap.playing}
        aria-disabled={idle}
        onClick={() => snap.ready && transport.toggle()}
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
          value={snap.dayIndex}
          aria-label="Seek through the contribution history"
          aria-valuetext={
            snap.ready
              ? `${snap.dateLabel} · day ${snap.dayIndex + 1} of ${snap.dayCount}`
              : 'no data loaded'
          }
          aria-disabled={idle}
          onChange={(event) =>
            transport.seekToDay(event.currentTarget.valueAsNumber)
          }
          style={{ '--kw-seek-pct': `${pct}%` } as CSSProperties}
        />
        {birthPct !== null && (
          <span
            aria-hidden="true"
            className={styles.birth}
            style={{ '--kw-seek-birth-pct': `${birthPct}%` } as CSSProperties}
          />
        )}
      </div>

      <button
        type="button"
        className={styles.jump}
        aria-label={`Jump to the start of the window, ${snap.windowStartLabel}`}
        aria-disabled={idle}
        onClick={() => snap.ready && transport.seekToDay(0)}
      >
        <SkipStartIcon size={11} />
        {snap.windowStartLabel}
      </button>

      {snap.birthDayIndex >= 0 && (
        <button
          type="button"
          className={styles.jumpBirth}
          aria-label="Jump to agent initialization"
          aria-disabled={idle}
          onClick={() => snap.ready && transport.seekToDay(snap.birthDayIndex)}
        >
          <span aria-hidden="true" className={styles.mark}>
            ◆
          </span>
          init
        </button>
      )}

      <button
        type="button"
        className={styles.jumpLive}
        aria-label="Jump to the most recent day"
        aria-disabled={idle}
        onClick={() => snap.ready && transport.seekToDay(maxDay)}
      >
        <SkipEndIcon size={11} />
        live
      </button>

      <button
        type="button"
        className={styles.speed}
        aria-label={`Playback speed: ${speed} days per second. Activate to change.`}
        aria-disabled={idle}
        onClick={() =>
          snap.ready &&
          transport.setSpeedIndex((snap.speedIndex + 1) % SPEEDS.length)
        }
      >
        {speed} days/sec
      </button>

      {fresh !== null && (
        <span className={styles.pill} title={fresh.title}>
          <span
            aria-hidden="true"
            className={`${styles.dot} ${styles[fresh.tone]}`}
          />
          {fresh.label}
        </span>
      )}
    </div>
  )
}

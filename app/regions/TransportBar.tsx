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
interface SeekStyle extends CSSProperties {
  readonly '--kw-seek-pct'?: string
  readonly '--kw-seek-birth-pct'?: string
}
export type FreshnessTone = 'ok' | 'warn' | 'dim'
export interface FreshnessReadout {
  readonly label: string
  readonly tone: FreshnessTone
  readonly title: string
}
function readout(
  label: string,
  tone: FreshnessTone,
  title: string
): FreshnessReadout {
  return { label, tone, title }
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
  if (nowMs === null)
    return readout(`generated ${generatedAtISO.slice(0, 10)}`, 'ok', title)
  const age = Math.max(0, nowMs - generatedMs)
  if (age < HOUR_MS) return readout('fresh · <1h ago', 'ok', title)
  if (age < DAY_MS)
    return readout(`fresh · ${Math.floor(age / HOUR_MS)}h ago`, 'ok', title)
  const days = Math.floor(age / DAY_MS)
  if (days < 7) return readout(`${days}d ago`, 'warn', title)
  return readout(`stale · ${days}d ago`, 'dim', title)
}

function subscribeToClock(setNowMs: (nowMs: number) => void) {
  setNowMs(Date.now())
  const handle = setInterval(() => setNowMs(Date.now()), 60_000)
  return () => clearInterval(handle)
}

/**
 * Renders the 38 px playback strip and its keyboard-operable controls.
 * @param props Region envelope used by the page composer.
 * @returns The transport bar subtree.
 */
export default function TransportBar(props: TransportBarProps) {
  const snap = useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getServerSnapshot
  )
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => subscribeToClock(setNowMs), [])
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return
    if (event.repeat || event.target instanceof HTMLButtonElement) return
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
  const nextSpeed = (snap.speedIndex + 1) % SPEEDS.length
  const fresh = freshness(snap.generatedAt, nowMs)
  const idle = !snap.ready || undefined
  const startLabel = snap.ready
    ? `Jump to the start of the window, ${snap.windowStartLabel}`
    : 'Jump to the start of the contribution history'
  const seekCss: SeekStyle = { '--kw-seek-pct': `${pct}%` }
  const birthCss: SeekStyle = { '--kw-seek-birth-pct': `${birthPct}%` }
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
          style={seekCss}
        />
        {birthPct !== null && (
          <span aria-hidden="true" className={styles.birth} style={birthCss} />
        )}
      </div>
      <button
        type="button"
        className={styles.jump}
        aria-label={startLabel}
        aria-disabled={idle}
        onClick={() => snap.ready && transport.seekToDay(0)}
      >
        <SkipStartIcon size={11} />
        <span className={styles.longLabel}>{snap.windowStartLabel}</span>
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
        <span className={styles.longLabel}>live</span>
      </button>
      <button
        type="button"
        className={styles.speed}
        aria-label={`Playback speed: ${speed} days per second. Activate to change.`}
        aria-disabled={idle}
        onClick={() => snap.ready && transport.setSpeedIndex(nextSpeed)}
      >
        <span className={styles.longLabel}>{speed} days/sec</span>
        <span aria-hidden="true" className={styles.shortLabel}>
          {speed}×
        </span>
      </button>
      {fresh !== null && (
        <span className={styles.pill} title={fresh.title}>
          <span
            aria-hidden="true"
            className={`${styles.dot} ${styles[fresh.tone]}`}
          />
          <span className={styles.freshLabel}>{fresh.label}</span>
        </span>
      )}
    </div>
  )
}

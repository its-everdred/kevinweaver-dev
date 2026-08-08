'use client'

import { useEffect, useState } from 'react'
import {
  getGalaxyTimeline,
  subscribeGalaxyTimeline,
} from '@/components/viz/galaxyTimeline'

/**
 * Width of an ISO `YYYY-MM-DD` day. The header font is monospace, so `ch` is
 * the exact advance; combined with tabular figures the slot is the same size
 * for every day, and the once-a-second update cannot twitch the sticky header.
 */
const SLOT = '10ch'

/** Rendered before the timeline has published a day (SSR and cold hydrate). */
const PLACEHOLDER = '–'

/**
 * Reads out the day the shared galaxy timeline is currently on.
 *
 * This is the same clock the transport bar scrubs. It lives in the header
 * because the header is sticky: the day under playback stays legible wherever
 * the reader has scrolled to.
 *
 * Deliberately NOT a live region. Playback advances one day per second, so an
 * `aria-live` readout here would talk over the whole page. The on-demand
 * announcement stays where it already was — the transport slider's
 * `aria-valuetext`, which names the date, the day index, and the total.
 *
 * @returns The header's fixed-width day slot.
 */
export function HeaderDate() {
  const [snap, setSnap] = useState(getGalaxyTimeline)
  useEffect(
    () => subscribeGalaxyTimeline(() => setSnap(getGalaxyTimeline())),
    []
  )
  const iso = snap.date

  return (
    <span
      style={{
        alignItems: 'center',
        display: 'flex',
        padding: '0 var(--sp-2)',
      }}
    >
      {iso ? <span className="sr-only">playback date</span> : null}
      <span
        aria-hidden={iso ? undefined : 'true'}
        style={{
          color: 'var(--fg1)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: SLOT,
          textAlign: 'right',
        }}
      >
        {iso || PLACEHOLDER}
      </span>
    </span>
  )
}

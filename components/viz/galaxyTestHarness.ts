import type { VizTestHarness } from '@/lib/viz/testHarness'
import {
  getGalaxyTimeline,
  seekGalaxyTimeline,
  setGalaxyPlaying,
} from './galaxyTimeline'

/**
 * @description Browser-only controls exposed for deterministic visualization
 * integration tests. Bound to the galaxy timeline store (the page's single
 * source of truth), not to the legacy lib/viz driver.
 */
export interface GalaxyTestHarness {
  pause(): void
  play(): void
  seekTick(step: number): GalaxyHarnessInfo
  seekDay(day: number): GalaxyHarnessInfo
  inspect(): GalaxyHarnessInfo
  setQuality(_quality: 'high' | 'low' | 'auto'): void
}

declare global {
  interface Window {
    __galaxyTestHarness?: boolean
  }
}

export interface GalaxyHarnessInfo {
  readonly step: number
  readonly date: string
  readonly playing: boolean
  readonly total: number
}

/**
 * @description Installs the galaxy-timeline test harness when the test query
 * flag is present. Overwrites any legacy driver harness so the page's real
 * clock is the one tests drive.
 * @param total Total number of timeline steps.
 * @returns A cleanup that removes this harness only when it still owns the hook.
 */
export function installGalaxyTestHarness(total: number): () => void {
  if (typeof window === 'undefined') return () => undefined
  if (new URLSearchParams(window.location.search).get('viz-test') !== '1')
    return () => undefined
  // Mark ownership before assignment so the legacy driver harness's async
  // install, which may resolve after this one, does not clobber the page's
  // real clock (lib/viz/testHarness.ts reads this marker).
  window.__galaxyTestHarness = true
  const harness: GalaxyTestHarness = {
    pause: () => setGalaxyPlaying(false),
    play: () => setGalaxyPlaying(true),
    seekTick: (step) => {
      seekGalaxyTimeline(step, total)
      return readInfo()
    },
    seekDay: (day) => {
      seekGalaxyTimeline(day, total)
      return readInfo()
    },
    inspect: readInfo,
    setQuality: () => undefined,
  }
  // The driver's legacy harness owns the declared global type; the galaxy
  // harness overwrites the runtime value. Cast because the two shapes share no
  // supertype worth modelling.
  window.__viz = harness as unknown as VizTestHarness
  const remove = () => {
    if (window.__viz === (harness as unknown as VizTestHarness)) {
      delete window.__viz
      delete window.__galaxyTestHarness
    }
  }
  return remove
}

function readInfo(): GalaxyHarnessInfo {
  const snap = getGalaxyTimeline()
  return {
    step: snap.step,
    date: snap.date,
    playing: snap.playing,
    total: snap.total,
  }
}

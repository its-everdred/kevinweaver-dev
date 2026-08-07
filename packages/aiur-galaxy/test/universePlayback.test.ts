import { describe, expect, it } from 'vitest'

import {
  PLAYBACK_WINDOW_STEPS,
  RECENT_REPO_STEPS,
  activeSteps,
  clampStep,
  nextActiveWindowStep,
  nextUniverseStep,
  nextWindowStep,
  playbackWindowEnd,
  playbackWindowStart,
  universeFrame,
  universeLiveAt,
} from '../src/universePlayback'
import type { UniverseSnapshot } from '../src/types'

const SNAPSHOT: UniverseSnapshot = {
  repos: [
    { id: 0, name: 'a/r1', files: ['a.ts', 'b.ts'] },
    { id: 1, name: 'a/r2', files: ['c.ts', 'd.ts'] },
  ],
  contributions: [
    { step: 0, repo: 0, file: 'a.ts', actor: 0 },
    { step: 0, repo: 1, file: 'c.ts', actor: 1 },
    { step: 1, repo: 0, file: 'b.ts', actor: 0 },
    { step: 2, repo: 1, file: 'd.ts', actor: 1 },
  ],
  stepCount: 3,
}

describe('clampStep', () => {
  it('clamps to the valid range', () => {
    expect(clampStep(-3, 3)).toBe(0)
    expect(clampStep(99, 3)).toBe(2)
    expect(clampStep(0, 0)).toBe(-1)
  })
})

describe('universeLiveAt', () => {
  it('accumulates files from the start in forward order', () => {
    expect([...universeLiveAt(SNAPSHOT.contributions, 0, 'forward')].sort()).toEqual([
      '0:a.ts',
      '1:c.ts',
    ])
    expect([...universeLiveAt(SNAPSHOT.contributions, 2, 'forward')].sort()).toEqual([
      '0:a.ts',
      '0:b.ts',
      '1:c.ts',
      '1:d.ts',
    ])
  })

  it('accumulates files from the end in backward order', () => {
    expect([...universeLiveAt(SNAPSHOT.contributions, 2, 'backward')].sort()).toEqual([
      '1:d.ts',
    ])
    expect([...universeLiveAt(SNAPSHOT.contributions, 0, 'backward')].sort()).toEqual([
      '0:a.ts',
      '0:b.ts',
      '1:c.ts',
      '1:d.ts',
    ])
  })
})

describe('universeFrame', () => {
  it('resolves current files and repos at a step', () => {
    const frame = universeFrame(SNAPSHOT, 0, 'forward')
    expect([...frame.currentFiles].sort()).toEqual(['0:a.ts', '1:c.ts'])
    expect([...frame.currentRepos].sort()).toEqual([0, 1])
    expect(frame.total).toBe(3)
    expect(frame.progress).toBeCloseTo(1 / 3)
  })

  it('handles an empty timeline', () => {
    const empty = { ...SNAPSHOT, contributions: [], stepCount: 0 }
    const frame = universeFrame(empty, 0, 'forward')
    expect(frame.currentFiles).toEqual([])
    expect(frame.currentRepos.size).toBe(0)
    expect(frame.recentRepos.size).toBe(0)
    expect(frame.progress).toBe(0)
  })
})

describe('the frame recency window', () => {
  /**
   * One repo, one contribution, and a full recency window of room on both
   * sides of it, so the contribution can age out in either direction without
   * the step clamping against the end of the timeline.
   */
  const TOUCH_STEP = RECENT_REPO_STEPS + 5
  const TRAIL: UniverseSnapshot = {
    repos: [{ id: 7, name: 'a/trail', files: ['t.ts'] }],
    contributions: [{ step: TOUCH_STEP, repo: 7, file: 't.ts', actor: 0 }],
    stepCount: TOUCH_STEP + RECENT_REPO_STEPS + 5,
  }

  function ageAt(step: number, direction: 'forward' | 'backward'): number | undefined {
    return universeFrame(TRAIL, step, direction).recentRepos.get(7)
  }

  it('reports zero steps of age on the step a repo contributes', () => {
    expect(ageAt(TOUCH_STEP, 'forward')).toBe(0)
    expect(ageAt(TOUCH_STEP, 'backward')).toBe(0)
  })

  it('ages a repo in playback order, not in calendar order', () => {
    // Forward playback leaves the contribution behind; backward playback
    // approaches it from the future, so its trail runs the other way.
    expect([1, 2, 3].map((n) => ageAt(TOUCH_STEP + n, 'forward'))).toEqual([1, 2, 3])
    expect([1, 2, 3].map((n) => ageAt(TOUCH_STEP - n, 'backward'))).toEqual([1, 2, 3])
  })

  it('drops a repo once it ages past the recency window', () => {
    // Asserted against the constant, not a copy of its value: the window is a
    // tuning knob, and pinning the number here only breaks on every retune.
    expect(ageAt(TOUCH_STEP + RECENT_REPO_STEPS, 'forward')).toBeUndefined()
    expect(ageAt(TOUCH_STEP - RECENT_REPO_STEPS, 'backward')).toBeUndefined()
    // A step the other direction has not reached yet is not recent either.
    expect(ageAt(TOUCH_STEP - 1, 'forward')).toBeUndefined()
    expect(ageAt(TOUCH_STEP + 1, 'backward')).toBeUndefined()
  })

  it('keeps the freshest contribution when a repo has several', () => {
    const frame = universeFrame(SNAPSHOT, 2, 'forward')
    // Repo 0 touched a.ts at step 0 and b.ts at step 1; step 2 is one step on.
    expect(frame.recentRepos.get(0)).toBe(1)
    expect(frame.recentRepos.get(1)).toBe(0)
  })
})

describe('the rolling playback window', () => {
  /** A history far longer than a year, so the window really is a window. */
  const TOTAL = 2400

  it('covers one year and ends on the most recent step', () => {
    expect(PLAYBACK_WINDOW_STEPS).toBe(365)
    expect(playbackWindowEnd(TOTAL)).toBe(TOTAL - 1)
    expect(playbackWindowStart(TOTAL)).toBe(TOTAL - PLAYBACK_WINDOW_STEPS)
  })

  it('never reaches past the data on a history shorter than a year', () => {
    expect(playbackWindowStart(100)).toBe(0)
    expect(playbackWindowEnd(100)).toBe(99)
    expect(playbackWindowStart(0)).toBe(-1)
    expect(playbackWindowEnd(0)).toBe(-1)
  })

  it('advances backward through time from the most recent step', () => {
    expect(nextWindowStep(playbackWindowEnd(TOTAL), TOTAL, 'backward')).toBe(TOTAL - 2)
    expect(nextWindowStep(TOTAL - 2, TOTAL, 'backward')).toBe(TOTAL - 3)
  })

  it('rolls back to the most recent step at the window edge', () => {
    // A year of one-day steps, then the window rolls over rather than
    // stranding playback on a step it can never leave.
    expect(nextWindowStep(playbackWindowStart(TOTAL), TOTAL, 'backward')).toBe(TOTAL - 1)
  })

  it('keeps playing the days a seek reached outside the window', () => {
    // R11b: the bound is on the default view, not on the data. A seek to an
    // older day plays on backward from there until the data runs out.
    expect(nextWindowStep(40, TOTAL, 'backward')).toBe(39)
    expect(nextWindowStep(0, TOTAL, 'backward')).toBe(TOTAL - 1)
  })

  it('rolls a forward window over at the most recent step', () => {
    expect(nextWindowStep(TOTAL - 1, TOTAL, 'forward')).toBe(playbackWindowStart(TOTAL))
    expect(nextWindowStep(TOTAL - 2, TOTAL, 'forward')).toBe(TOTAL - 1)
  })

  it('stays on the one valid step of an empty or single-day timeline', () => {
    expect(nextWindowStep(0, 0, 'backward')).toBe(-1)
    expect(nextWindowStep(0, 1, 'backward')).toBe(0)
  })
})

describe('the days playback dwells on', () => {
  /**
   * Twelve days carrying three green ones: a pair, a long grey run, and a
   * single. The payload has the same shape at scale — 2,356 of its 6,056 days
   * are green — so most of a pass is a day with no node and no beam on it.
   */
  const SPARSE: UniverseSnapshot = {
    repos: [{ id: 0, name: 'a/r1', files: ['a.ts'] }],
    contributions: [
      { step: 2, repo: 0, file: 'a.ts', actor: 0 },
      { step: 3, repo: 0, file: 'a.ts', actor: 0 },
      { step: 9, repo: 0, file: 'a.ts', actor: 0 },
    ],
    stepCount: 12,
  }
  const GREEN = activeSteps(SPARSE)

  it('flags every day that carries a contribution, and no other', () => {
    expect([...GREEN]).toEqual([0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0])
  })

  it('flags a day per step even when the log runs out early', () => {
    expect(activeSteps({ ...SPARSE, contributions: [] })).toHaveLength(12)
    expect(activeSteps({ ...SPARSE, stepCount: 0 })).toHaveLength(0)
  })

  it('advances to the next green day instead of onto a grey one', () => {
    expect(nextActiveWindowStep(9, SPARSE.stepCount, 'backward', GREEN)).toBe(3)
    expect(nextActiveWindowStep(3, SPARSE.stepCount, 'backward', GREEN)).toBe(2)
    expect(nextActiveWindowStep(3, SPARSE.stepCount, 'forward', GREEN)).toBe(9)
  })

  it('carries a day reached by seeking off to the next green one', () => {
    // Only where playback goes next is decided here, never where it is now: a
    // viewer who scrubs onto a grey day is shown that day, and the skip takes
    // over from it in the direction of travel.
    expect(nextActiveWindowStep(6, SPARSE.stepCount, 'backward', GREEN)).toBe(3)
    expect(nextActiveWindowStep(6, SPARSE.stepCount, 'forward', GREEN)).toBe(9)
  })

  it('wraps from the oldest green day round to the newest', () => {
    // Backward playback runs out of green days below step 2. The window's own
    // rollover puts it back on the most recent day, and the skip carries it on
    // to the newest day with anything on it.
    expect(nextActiveWindowStep(2, SPARSE.stepCount, 'backward', GREEN)).toBe(9)
  })

  it('still advances a day at a time when no day is green at all', () => {
    const grey = new Uint8Array(SPARSE.stepCount)
    expect(nextActiveWindowStep(5, SPARSE.stepCount, 'backward', grey)).toBe(4)
    expect(nextActiveWindowStep(0, 0, 'backward', grey)).toBe(-1)
  })
})

describe('nextUniverseStep', () => {
  it('advances and clamps in both directions', () => {
    const frame = universeFrame(SNAPSHOT, 1, 'forward')
    expect(nextUniverseStep(frame, 'forward')).toBe(2)
    expect(nextUniverseStep(frame, 'backward')).toBe(0)
    expect(nextUniverseStep(universeFrame(SNAPSHOT, 2, 'forward'), 'forward')).toBe(2)
    expect(nextUniverseStep(universeFrame(SNAPSHOT, 0, 'backward'), 'backward')).toBe(0)
  })
})

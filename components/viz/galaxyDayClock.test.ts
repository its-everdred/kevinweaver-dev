import { describe, expect, it } from 'vitest'

import { DAY_TRANSITION_MS } from '@/packages/aiur-galaxy/src/contributors'
import type { UniverseSnapshot } from '@/packages/aiur-galaxy/src/types'
import { STEP_MS, createGalaxyDayClock } from './galaxyDayClock'

/**
 * Twelve days carrying three green ones, with long grey runs between them.
 * The payload has the same shape at scale: 2,356 of its 6,056 days are green.
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

describe('createGalaxyDayClock', () => {
  it('holds a day for its whole slot, then skips the grey days after it', () => {
    const days = createGalaxyDayClock(SPARSE)
    expect(days.advance(9, 'backward', 0, true)).toBe(9)
    expect(days.advance(9, 'backward', STEP_MS - 1, true)).toBe(9)
    // Steps 8 down to 4 have nothing on them: no beam, no contributor node.
    expect(days.advance(9, 'backward', STEP_MS, true)).toBe(3)
    // The day that follows opens at once, rather than a slot later.
    expect(days.phase(STEP_MS, true)).toBe(0)
  })

  it('never advances itself when nothing may animate', () => {
    // Reduced motion and a paused clock both arrive here as `animated: false`.
    const days = createGalaxyDayClock(SPARSE)
    days.advance(9, 'backward', 0, false)
    expect(days.advance(9, 'backward', STEP_MS * 10, false)).toBe(9)
  })

  it('shows a day reached by seeking, and moves on from it', () => {
    const days = createGalaxyDayClock(SPARSE)
    days.advance(9, 'backward', 0, true)
    // The viewer chose this grey day, so it is the day on screen. It keeps a
    // whole slot of its own, and only then does playback skip on.
    expect(days.advance(6, 'backward', 400, true)).toBe(6)
    expect(days.advance(6, 'backward', 400 + STEP_MS - 1, true)).toBe(6)
    expect(days.advance(6, 'backward', 400 + STEP_MS, true)).toBe(3)
  })

  it('measures a day from the moment it opens, however it was reached', () => {
    const days = createGalaxyDayClock(SPARSE)
    days.advance(9, 'backward', 0, true)
    days.advance(3, 'backward', 250, true)
    expect(days.phase(250, true)).toBe(0)
    expect(days.phase(250 + DAY_TRANSITION_MS, true)).toBe(1)
  })

  it('draws the beams out of the node and back into it across a day', () => {
    const days = createGalaxyDayClock(SPARSE)
    days.advance(9, 'backward', 0, true)
    expect(days.reach(0, true)).toBe(0)
    expect(days.reach(DAY_TRANSITION_MS, true)).toBe(1)
    expect(days.reach(STEP_MS / 2, true)).toBe(1)
    expect(days.reach(STEP_MS, true)).toBe(0)
  })

  it('lands on the finished day at once when nothing may animate', () => {
    const days = createGalaxyDayClock(SPARSE)
    days.advance(9, 'backward', 0, false)
    expect(days.reach(0, false)).toBe(1)
    expect(days.phase(0, false)).toBe(1)
  })

  it('moves its node on from where it was drawn, not from the day it left', () => {
    const days = createGalaxyDayClock(SPARSE)
    days.advance(9, 'backward', 0, true)
    days.glide.at([{ actor: 0, x: 0, y: 0, active: true }], 1)
    days.advance(3, 'backward', 400, true)
    const shown = days.glide.at([{ actor: 0, x: 1, y: 0, active: true }], 0.5)
    expect(shown[0]?.x).toBeCloseTo(0.5, 12)
  })
})

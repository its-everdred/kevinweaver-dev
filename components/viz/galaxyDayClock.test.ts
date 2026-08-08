import { describe, expect, it } from 'vitest'

import {
  BEAM_EXTEND_MS,
  BEAM_STAGGER_MS,
  beamOffset,
} from '@/packages/aiur-galaxy/src/beamTiming'
import { DAY_MIDPOINT } from '@/packages/aiur-galaxy/src/contributors'
import { layoutUniverse } from '@/packages/aiur-galaxy/src/galaxy'
import type { UniverseSnapshot } from '@/packages/aiur-galaxy/src/types'
import { STEP_MS, createGalaxyDayClock } from './galaxyDayClock'

/**
 * Twelve days carrying three green ones, with long grey runs between them.
 * The payload has the same shape at scale: 2,356 of its 6,056 days are green.
 */
const SPARSE: UniverseSnapshot = {
  repos: [{ id: 0, name: 'a/r1', files: ['a.ts', 'b.ts'] }],
  contributions: [
    { step: 2, repo: 0, file: 'a.ts', actor: 0 },
    { step: 3, repo: 0, file: 'a.ts', actor: 0 },
    // A second file on the same day, so the day sits somewhere its neighbours
    // do not and a lookahead can be told from the day it looks ahead from.
    { step: 3, repo: 0, file: 'b.ts', actor: 0 },
    { step: 9, repo: 0, file: 'a.ts', actor: 0 },
  ],
  stepCount: 12,
}

const LAYOUT = layoutUniverse(SPARSE)

function clock(): ReturnType<typeof createGalaxyDayClock> {
  return createGalaxyDayClock(SPARSE, LAYOUT)
}

describe('createGalaxyDayClock', () => {
  it('holds a day for its whole slot, then skips the grey days after it', () => {
    const days = clock()
    expect(days.advance(9, 'backward', 0, true)).toBe(9)
    expect(days.advance(9, 'backward', STEP_MS - 1, true)).toBe(9)
    // Steps 8 down to 4 have nothing on them: no beam, no contributor node.
    expect(days.advance(9, 'backward', STEP_MS, true)).toBe(3)
    // The day that follows opens at once, rather than a slot later.
    expect(days.phase(STEP_MS, true)).toBe(0)
  })

  it('never advances itself when nothing may animate', () => {
    // Reduced motion and a paused clock both arrive here as `animated: false`.
    const days = clock()
    days.advance(9, 'backward', 0, false)
    expect(days.advance(9, 'backward', STEP_MS * 10, false)).toBe(9)
  })

  it('shows a day reached by seeking, and moves on from it', () => {
    const days = clock()
    days.advance(9, 'backward', 0, true)
    // The viewer chose this grey day, so it is the day on screen. It keeps a
    // whole slot of its own, and only then does playback skip on.
    expect(days.advance(6, 'backward', 400, true)).toBe(6)
    expect(days.advance(6, 'backward', 400 + STEP_MS - 1, true)).toBe(6)
    expect(days.advance(6, 'backward', 400 + STEP_MS, true)).toBe(3)
  })

  it('measures a day from the moment it opens, however it was reached', () => {
    const days = clock()
    days.advance(9, 'backward', 0, true)
    days.advance(3, 'backward', 250, true)
    expect(days.phase(250, true)).toBe(0)
    expect(days.phase(250 + STEP_MS * DAY_MIDPOINT, true)).toBe(DAY_MIDPOINT)
    expect(days.phase(250 + STEP_MS, true)).toBe(1)
  })

  it('starts each of a day beams at its own moment in that day', () => {
    const days = clock()
    days.advance(9, 'backward', 0, true)
    const late = 3
    const start = beamOffset(late) * BEAM_STAGGER_MS
    expect(days.reach(0, true)(0)).toBe(0)
    expect(days.reach(BEAM_EXTEND_MS, true)(0)).toBe(1)
    // The later beam has not left its node at the moment the first one lands.
    expect(days.reach(BEAM_EXTEND_MS, true)(late)).toBe(0)
    expect(days.reach(start + BEAM_EXTEND_MS + 1, true)(late)).toBe(1)
  })

  it('lands on the finished day at once when nothing may animate', () => {
    const days = clock()
    days.advance(9, 'backward', 0, false)
    expect(days.reach(0, false)(0)).toBe(1)
    expect(days.reach(0, false)(7)).toBe(1)
    expect(days.phase(0, false)).toBe(DAY_MIDPOINT)
  })

  it('resolves the day on screen and the day it hands on to', () => {
    const days = clock()
    const today = days.day(9, 'backward')
    expect(today.frame.step).toBe(9)
    expect(today.targets).toHaveLength(1)
    // Where the node is bound next: step 3, the next green day going back.
    expect(days.onward()).toHaveLength(1)
    expect(days.onward()[0]?.x).not.toBe(today.targets[0]?.x)
  })

  it('resolves a day once, and only once, however many frames it lasts', () => {
    const days = clock()
    expect(days.day(9, 'backward')).toBe(days.day(9, 'backward'))
  })

  it('hands its lookahead on rather than resolving the same day twice', () => {
    // The whole contribution log is walked to build a day, so playing into a
    // day the clock has already looked at must cost nothing at all.
    const days = clock()
    days.day(9, 'backward')
    const ahead = days.onward()
    expect(days.day(3, 'backward').targets).toBe(ahead)
  })

  it('moves its node on from where it was drawn, not from the day it left', () => {
    const days = clock()
    days.advance(9, 'backward', 0, true)
    days.glide.at([{ actor: 0, x: 0, y: 0, active: true }], [], DAY_MIDPOINT)
    days.advance(3, 'backward', 400, true)
    const shown = days.glide.at([{ actor: 0, x: 1, y: 0, active: true }], [], 0.25)
    expect(shown[0]?.x).toBeCloseTo(0.5, 12)
  })
})

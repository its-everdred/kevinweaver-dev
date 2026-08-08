import { describe, expect, it } from 'vitest'

import {
  BEAM_EXTEND_MS,
  BEAM_HOLD_MS,
  BEAM_STAGGER_MS,
  beamOffset,
  beamReach,
} from '../src/beamTiming'

/** One day of playback per second, the rate the window is swept at. */
const SLOT_MS = 1000

describe('beamOffset', () => {
  it('gives every beam its own place in the stagger window', () => {
    const offsets = Array.from({ length: 24 }, (_, beam) => beamOffset(beam))
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(1)
    }
    // Neighbouring beams land far apart, so a day's lines arrive scattered
    // rather than in the order the contribution log happens to hold them.
    expect(new Set(offsets).size).toBe(offsets.length)
    expect(Math.min(...offsets)).toBeLessThan(0.1)
    expect(Math.max(...offsets)).toBeGreaterThan(0.9)
  })

  it('gives one beam the same place every time it is asked', () => {
    for (const beam of [0, 1, 7, 512])
      expect(beamOffset(beam)).toBe(beamOffset(beam))
  })
})

describe('beamReach', () => {
  /** The first beam starts the moment the day does, so it anchors the timings. */
  const FIRST = 0

  /**
   * When a beam is whole, a millisecond past the instant its extend completes:
   * that instant is a ratio of two floats and lands a hair either side of 1.
   */
  function arrivalOf(beam: number): number {
    return beamOffset(beam) * BEAM_STAGGER_MS + BEAM_EXTEND_MS + 1
  }

  it('extends out of its node faster than a third of a second', () => {
    expect(beamReach(0, FIRST, true)).toBe(0)
    expect(beamReach(BEAM_EXTEND_MS / 2, FIRST, true)).toBeCloseTo(0.5, 12)
    expect(beamReach(BEAM_EXTEND_MS, FIRST, true)).toBe(1)
    expect(BEAM_EXTEND_MS).toBeLessThan(320)
  })

  it('is lit for well under half a day, then draws itself back in', () => {
    expect(beamReach(BEAM_EXTEND_MS + BEAM_HOLD_MS, FIRST, true)).toBe(1)
    const life = BEAM_EXTEND_MS * 2 + BEAM_HOLD_MS
    expect(beamReach(life - BEAM_EXTEND_MS / 2, FIRST, true)).toBeCloseTo(
      0.5,
      12
    )
    expect(beamReach(life, FIRST, true)).toBe(0)
    // The disc is a fan of lines for a moment, not for most of the second.
    expect(life).toBeLessThan(SLOT_MS / 2)
  })

  it('starts each beam at its own moment inside the day', () => {
    const late = 3
    const start = beamOffset(late) * BEAM_STAGGER_MS
    expect(start).toBeGreaterThan(0)
    expect(beamReach(start, late, true)).toBe(0)
    expect(beamReach(arrivalOf(late), late, true)).toBe(1)
    // Its neighbour is somewhere else entirely at that same instant.
    expect(beamReach(arrivalOf(late), FIRST, true)).not.toBe(1)
  })

  it('has every beam whole well before the day ends', () => {
    for (let beam = 0; beam < 64; beam++) {
      const arrived = arrivalOf(beam)
      expect(beamReach(arrived, beam, true)).toBe(1)
      expect(arrived).toBeLessThan(SLOT_MS)
    }
    // The last beam is also drawn back in before the next day opens.
    expect(
      BEAM_STAGGER_MS + BEAM_EXTEND_MS * 2 + BEAM_HOLD_MS
    ).toBeLessThanOrEqual(SLOT_MS)
  })

  it('draws every beam whole when nothing may animate', () => {
    for (const since of [0, BEAM_EXTEND_MS / 2, SLOT_MS])
      for (const beam of [0, 5, 41])
        expect(beamReach(since, beam, false)).toBe(1)
  })
})

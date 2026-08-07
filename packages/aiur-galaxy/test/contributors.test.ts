import { describe, expect, it } from 'vitest'

import {
  DAY_TRANSITION_MS,
  beamReach,
  createContributorGlide,
  dayTransition,
} from '../src/contributors'
import type { ContributorNode } from '../src/contributors'

/** One day of playback per second, the rate the window is swept at. */
const SLOT_MS = 1000

function node(x: number, y: number): readonly ContributorNode[] {
  return [{ actor: 0, x, y, active: true }]
}

/** Where a node is drawn, copied out: the glide hands back its own objects. */
function drawnAt(
  glide: ReturnType<typeof createContributorGlide>,
  targets: readonly ContributorNode[],
  phase: number
): { x: number; y: number } {
  const shown = glide.at(targets, phase)[0]
  if (!shown) throw new Error('the glide dropped a node it was given')
  return { x: shown.x, y: shown.y }
}

describe('dayTransition', () => {
  it('runs from nothing to complete over one transition', () => {
    expect(dayTransition(0, true)).toBe(0)
    expect(dayTransition(DAY_TRANSITION_MS / 2, true)).toBeCloseTo(0.5, 12)
    expect(dayTransition(DAY_TRANSITION_MS, true)).toBe(1)
    expect(dayTransition(DAY_TRANSITION_MS * 4, true)).toBe(1)
  })

  it('finishes well inside a day, so every day is rested on', () => {
    // Both halves of a day's change have to fit inside its slot: the beams
    // retract over one transition and the next day's grow over another.
    expect(DAY_TRANSITION_MS * 2).toBeLessThan(SLOT_MS)
  })

  it('lands on the final state at once when nothing may animate', () => {
    // Reduced motion and a paused clock both arrive as `animated: false`: the
    // day changes and there is no transition between the two at all.
    for (const since of [0, 8, DAY_TRANSITION_MS, SLOT_MS])
      expect(dayTransition(since, false)).toBe(1)
  })
})

describe('beamReach', () => {
  it('extends out of the node as the day opens', () => {
    expect(beamReach(0, SLOT_MS, true)).toBe(0)
    expect(beamReach(DAY_TRANSITION_MS / 2, SLOT_MS, true)).toBeCloseTo(0.5, 12)
    expect(beamReach(DAY_TRANSITION_MS, SLOT_MS, true)).toBe(1)
  })

  it('stands at full length through the middle of the day', () => {
    expect(beamReach(SLOT_MS / 2, SLOT_MS, true)).toBe(1)
  })

  it('retracts back into the node as the day closes', () => {
    expect(beamReach(SLOT_MS - DAY_TRANSITION_MS, SLOT_MS, true)).toBe(1)
    expect(beamReach(SLOT_MS - DAY_TRANSITION_MS / 2, SLOT_MS, true)).toBeCloseTo(0.5, 12)
    expect(beamReach(SLOT_MS, SLOT_MS, true)).toBe(0)
  })

  it('draws the whole beam when nothing may animate', () => {
    for (const since of [0, DAY_TRANSITION_MS / 2, SLOT_MS])
      expect(beamReach(since, SLOT_MS, false)).toBe(1)
  })
})

describe('createContributorGlide', () => {
  const HERE = node(0.2, 0.4)
  const THERE = node(0.8, 0.9)

  it('places a node it has never seen where its day puts it', () => {
    expect(drawnAt(createContributorGlide(), THERE, 0)).toEqual({ x: 0.8, y: 0.9 })
  })

  it('moves at a steady speed, covering equal ground in equal time', () => {
    // The exponential ease this replaced covered a third of what was left of
    // the distance every frame: fast off the mark and creeping at the end,
    // which is the opposite of moving from position to position at one speed.
    const glide = createContributorGlide()
    glide.at(HERE, 1)
    glide.open()
    const path = [0, 0.25, 0.5, 0.75, 1].map((phase) => drawnAt(glide, THERE, phase))
    const legs = path
      .slice(1)
      .map((point, index) => Math.hypot(point.x - path[index]!.x, point.y - path[index]!.y))
    for (const leg of legs) expect(leg).toBeCloseTo(legs[0]!, 12)
    expect(legs[0]).toBeGreaterThan(0)
  })

  it('arrives exactly on the day it was moving toward', () => {
    const glide = createContributorGlide()
    glide.at(HERE, 1)
    glide.open()
    glide.at(THERE, 0.5)
    expect(drawnAt(glide, THERE, 1)).toEqual({ x: 0.8, y: 0.9 })
  })

  it('settles a day played into where a day seeked to would settle', () => {
    // Transient animation is free to differ; the resting frame is not, or a
    // seek and a pass through the same day disagree about the same picture.
    const played = createContributorGlide()
    played.at(HERE, 1)
    played.open()
    played.at(THERE, 0.4)
    expect(drawnAt(played, THERE, 1)).toEqual(drawnAt(createContributorGlide(), THERE, 1))
  })

  it('hands back the same array every frame, so a frame allocates nothing', () => {
    const glide = createContributorGlide()
    expect(glide.at(HERE, 1)).toBe(glide.at(THERE, 1))
  })

  it('drops an actor with no work on the day being drawn', () => {
    const glide = createContributorGlide()
    glide.at([{ actor: 0, x: 0.2, y: 0.4, active: true }], 1)
    expect(glide.at([{ actor: 1, x: 0.6, y: 0.6, active: true }], 1)).toEqual([
      { actor: 1, x: 0.6, y: 0.6 },
    ])
  })
})

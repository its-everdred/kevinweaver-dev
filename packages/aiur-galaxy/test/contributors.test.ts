import { describe, expect, it } from 'vitest'

import {
  DAY_MIDPOINT,
  createContributorGlide,
  dayPhase,
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
  next: readonly ContributorNode[],
  phase: number
): { x: number; y: number } {
  const shown = glide.at(targets, next, phase)[0]
  if (!shown) throw new Error('the glide dropped a node it was given')
  return { x: shown.x, y: shown.y }
}

describe('dayPhase', () => {
  it('runs from the moment the day opens to the moment it closes', () => {
    expect(dayPhase(0, SLOT_MS, true)).toBe(0)
    expect(dayPhase(SLOT_MS / 2, SLOT_MS, true)).toBe(DAY_MIDPOINT)
    expect(dayPhase(SLOT_MS, SLOT_MS, true)).toBe(1)
    expect(dayPhase(SLOT_MS * 4, SLOT_MS, true)).toBe(1)
    expect(dayPhase(-40, SLOT_MS, true)).toBe(0)
  })

  it('rests on the day itself when nothing may animate', () => {
    // The midpoint is where a moving node passes its own day, so a paused or
    // reduced-motion frame lands on the day's own position rather than on a
    // point half way to a day nobody is playing toward.
    for (const since of [0, 8, SLOT_MS]) expect(dayPhase(since, SLOT_MS, false)).toBe(DAY_MIDPOINT)
  })
})

describe('createContributorGlide', () => {
  const HERE = node(0.2, 0.4)
  const THERE = node(0.8, 0.9)
  const LATER = node(0.3, 0.1)
  const AFTER = node(0.9, 0.2)

  /** A glide already resting on `HERE`, with a fresh day open on it. */
  function opened(): ReturnType<typeof createContributorGlide> {
    const glide = createContributorGlide()
    glide.at(HERE, HERE, DAY_MIDPOINT)
    glide.open()
    return glide
  }

  it('places a node it has never seen where its day puts it', () => {
    expect(drawnAt(createContributorGlide(), THERE, LATER, DAY_MIDPOINT)).toEqual({
      x: 0.8,
      y: 0.9,
    })
  })

  it('moves at a steady speed, covering equal ground in equal time', () => {
    const glide = opened()
    const path = [0, 0.125, 0.25, 0.375, 0.5].map((phase) =>
      drawnAt(glide, THERE, LATER, phase)
    )
    const legs = path
      .slice(1)
      .map((point, index) => Math.hypot(point.x - path[index]!.x, point.y - path[index]!.y))
    for (const leg of legs) expect(leg).toBeCloseTo(legs[0]!, 12)
    expect(legs[0]).toBeGreaterThan(0)
  })

  it('passes through its day at the midpoint of the day', () => {
    expect(drawnAt(opened(), THERE, LATER, DAY_MIDPOINT)).toEqual({ x: 0.8, y: 0.9 })
  })

  it('is already on its way to the next day when the day ends', () => {
    const glide = opened()
    glide.at(THERE, LATER, DAY_MIDPOINT)
    // Half way along the leg to tomorrow: the next day opens with the node
    // already in motion, and reaches tomorrow at that day's own midpoint.
    expect(drawnAt(glide, THERE, LATER, 1)).toEqual({ x: 0.55, y: 0.5 })
  })

  it('never stands still, not even across the day it is handed on at', () => {
    const glide = opened()
    const path = [0.2, 0.4, 0.6, 0.8, 1].map((phase) => drawnAt(glide, THERE, LATER, phase))
    glide.open()
    for (const phase of [0.2, 0.4, 0.6, 0.8, 1])
      path.push(drawnAt(glide, LATER, AFTER, phase))
    for (let index = 1; index < path.length; index++)
      expect(
        Math.hypot(path[index]!.x - path[index - 1]!.x, path[index]!.y - path[index - 1]!.y)
      ).toBeGreaterThan(0)
  })

  it('holds on its day when the day after has no work for that actor', () => {
    const glide = opened()
    glide.at(THERE, [], DAY_MIDPOINT)
    // Nowhere to be going: the node is hidden on the day that follows, so it
    // rests on the work it did rather than sliding off toward nothing.
    expect(drawnAt(glide, THERE, [], 1)).toEqual({ x: 0.8, y: 0.9 })
  })

  it('settles a day played into where a day seeked to would settle', () => {
    // Transient animation is free to differ; the resting frame is not, or a
    // seek and a pass through the same day disagree about the same picture.
    const played = opened()
    played.at(THERE, LATER, 0.4)
    const rest = dayPhase(0, SLOT_MS, false)
    expect(drawnAt(played, THERE, LATER, rest)).toEqual(
      drawnAt(createContributorGlide(), THERE, LATER, rest)
    )
  })

  it('hands back the same array every frame, so a frame allocates nothing', () => {
    const glide = createContributorGlide()
    expect(glide.at(HERE, THERE, 1)).toBe(glide.at(THERE, LATER, 1))
  })

  it('drops an actor with no work on the day being drawn', () => {
    const glide = createContributorGlide()
    glide.at([{ actor: 0, x: 0.2, y: 0.4, active: true }], [], DAY_MIDPOINT)
    expect(
      glide.at([{ actor: 1, x: 0.6, y: 0.6, active: true }], [], DAY_MIDPOINT)
    ).toEqual([{ actor: 1, x: 0.6, y: 0.6 }])
  })
})

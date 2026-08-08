import { describe, expect, it } from 'vitest'

import {
  DAY_MIDPOINT,
  FADE_STEPS,
  WANDER_MS,
  WANDER_RADIUS,
  contributorAlpha,
  contributorWander,
  createContributorGlide,
  dayPhase,
  firstContributionSteps,
} from '../src/contributors'
import type { ContributorNode } from '../src/contributors'
import type { UniverseSnapshot } from '../src/types'

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

  it('draws nothing for an actor it has never seen work', () => {
    const glide = createContributorGlide()
    expect(
      glide.at([{ actor: 1, x: 0.6, y: 0.6, active: true }], [], DAY_MIDPOINT)
    ).toEqual([{ actor: 1, x: 0.6, y: 0.6, alpha: 1 }])
  })
})

describe('a contributor with nothing to do', () => {
  /** A glide with actor 0 rested on `HERE` and a fresh day open on it. */
  function idled(): ReturnType<typeof createContributorGlide> {
    const glide = createContributorGlide()
    glide.at(node(0.2, 0.4), [], DAY_MIDPOINT)
    glide.open()
    return glide
  }

  /** Where the glide put one actor, or a thrown error when it dropped it. */
  function held(
    glide: ReturnType<typeof createContributorGlide>,
    actor: number,
    elapsedMs: number,
    reducedMotion = false
  ): { x: number; y: number } {
    const shown = glide
      .at([], [], DAY_MIDPOINT, contributorWander(elapsedMs, reducedMotion))
      .find((point) => point.actor === actor)
    if (!shown) throw new Error(`the glide dropped actor ${actor}`)
    return { x: shown.x, y: shown.y }
  }

  it('stays on screen on the days it does not work', () => {
    // The node used to be omitted from the frame entirely, which the scene
    // reads as "hide it": kw and AK blinked out of existence on every day the
    // other one carried alone.
    const glide = idled()
    expect(glide.at([], [], DAY_MIDPOINT).map((point) => point.actor)).toEqual([0])
  })

  it('leaves an idle node exactly where its last day left it', () => {
    expect(held(idled(), 0, 0)).toEqual({ x: 0.2, y: 0.4 })
  })

  it('floats, but slowly enough to read as floating rather than as travel', () => {
    const glide = idled()
    held(glide, 0, 0)
    const second = held(glide, 0, SLOT_MS)
    const moved = Math.hypot(second.x - 0.2, second.y - 0.4)
    expect(moved).toBeGreaterThan(0)
    // A node is 0.12 world units across and the field is six of those wide, so
    // a node's own width is 0.02 in field x. A second of drifting has to cover
    // a small fraction of that, or this is a second glide and not a float.
    expect(moved).toBeLessThan(WANDER_RADIUS / 4)
  })

  it('never strays further than a node width from the work it last did', () => {
    const glide = idled()
    held(glide, 0, 0)
    for (let elapsed = 0; elapsed <= WANDER_MS * 4; elapsed += WANDER_MS / 64) {
      const at = held(glide, 0, elapsed)
      expect(Math.hypot(at.x - 0.2, at.y - 0.4)).toBeLessThanOrEqual(
        WANDER_RADIUS * 2
      )
    }
  })

  it('does not merely orbit: the two axes never close into an ellipse', () => {
    // A circle reads as a second orbit inside a disc that is already turning.
    // The two axes run at an irrational-looking ratio, so a full pass of one
    // leaves the other somewhere it has not been.
    const first = contributorWander(WANDER_MS, false)
    expect(first.x).toBeCloseTo(0, 12)
    expect(Math.abs(first.y)).toBeGreaterThan(WANDER_RADIUS / 4)
  })

  it('never moves at all under reduced motion, at any elapsed time', () => {
    // The render loop idles once a reduced-motion frame is settled, and its
    // settled key holds the step and the camera but not the clock. A node
    // whose position moved with wall time would either never be redrawn or
    // force the key to change every frame; it must simply not move.
    const glide = idled()
    for (const elapsed of [0, 250, SLOT_MS, WANDER_MS / 3, WANDER_MS * 7])
      expect(held(glide, 0, elapsed, true)).toEqual({ x: 0.2, y: 0.4 })
  })

  it('glides on from where it floated to, not from the day it left', () => {
    const glide = idled()
    held(glide, 0, 0)
    const floated = held(glide, 0, WANDER_MS / 5)
    // Work resumes: the day opens on wherever the node actually is, so the
    // first frame of the new day is the frame the float ended on.
    glide.open()
    const resumed = glide.at(node(0.9, 0.1), [], 0)[0]
    expect(resumed?.x).toBeCloseTo(floated.x, 12)
    expect(resumed?.y).toBeCloseTo(floated.y, 12)
  })

  it('floats the two nodes apart, never as one dragged pair', () => {
    const glide = createContributorGlide()
    glide.at(
      [
        { actor: 0, x: 0.2, y: 0.4, active: true },
        { actor: 1, x: 0.7, y: 0.7, active: true },
      ],
      [],
      DAY_MIDPOINT
    )
    glide.open()
    held(glide, 0, 0)
    const human = held(glide, 0, WANDER_MS / 4)
    const agent = held(glide, 1, WANDER_MS / 4)
    expect(human.x - 0.2).not.toBeCloseTo(agent.x - 0.7, 12)
  })
})

describe('contributorAlpha', () => {
  it('draws an actor whole from its first day of work onward', () => {
    expect(contributorAlpha(100, 100)).toBe(1)
    expect(contributorAlpha(6055, 100)).toBe(1)
  })

  it('fades it out over the days before it existed', () => {
    expect(contributorAlpha(100 - FADE_STEPS, 100)).toBe(0)
    expect(contributorAlpha(100 - FADE_STEPS / 2, 100)).toBeCloseTo(0.5, 12)
    expect(contributorAlpha(0, 100)).toBe(0)
  })

  it('draws an actor whose history starts at the window start whole', () => {
    expect(contributorAlpha(0, 0)).toBe(1)
  })
})

describe('firstContributionSteps', () => {
  const SNAPSHOT: UniverseSnapshot = {
    repos: [{ id: 0, name: 'a/r1', files: ['a.ts'] }],
    contributions: [
      { step: 9, repo: 0, file: 'a.ts', actor: 1 },
      { step: 2, repo: 0, file: 'a.ts', actor: 0 },
      { step: 7, repo: 0, file: 'a.ts', actor: 1 },
    ],
    stepCount: 12,
  }

  it('finds each actor its own earliest day, whatever order the log is in', () => {
    expect(firstContributionSteps(SNAPSHOT)).toEqual([2, 7])
  })

  it('never places an actor the log does not name', () => {
    expect(
      firstContributionSteps({ ...SNAPSHOT, contributions: [] })
    ).toEqual([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY])
  })
})

describe('a contributor that did not exist yet', () => {
  /** A glide that knows the agent's first day, with both nodes placed. */
  function born(): ReturnType<typeof createContributorGlide> {
    const glide = createContributorGlide([0, 100])
    glide.at(
      [
        { actor: 0, x: 0.2, y: 0.4, active: true },
        { actor: 1, x: 0.7, y: 0.7, active: true },
      ],
      [],
      DAY_MIDPOINT
    )
    return glide
  }

  function alphaAt(step: number): readonly number[] {
    return born()
      .at([], [], DAY_MIDPOINT, undefined, step)
      .map((point) => point.alpha)
  }

  it('draws both nodes whole on a day both of them existed on', () => {
    expect(alphaAt(100)).toEqual([1, 1])
  })

  it('fades the newer actor out on the days before its first commit', () => {
    expect(alphaAt(100 - FADE_STEPS)).toEqual([1, 0])
    expect(alphaAt(0)).toEqual([1, 0])
  })

  it('applies the rule to every actor, not to one named in the renderer', () => {
    // The same rule run for the human: nothing here knows which actor is the
    // agent, and hardcoding that is what rots the moment a third one appears.
    const glide = createContributorGlide([50, 0])
    glide.at(node(0.2, 0.4), [], DAY_MIDPOINT)
    expect(glide.at([], [], DAY_MIDPOINT, undefined, 10)[0]?.alpha).toBe(0)
  })
})

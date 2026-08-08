import { starKey } from './galaxy'
import type { StarPosition, UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
import type { UniverseActor, UniverseSnapshot } from './types'

/**
 * Contributor placement lives here rather than beside the canvas-2D renderer
 * that used to own it. The WebGL galaxy needs only this function, and importing
 * it from `universeRender` pulled that entire renderer into the lazy island's
 * chunk, which has a hard byte budget it does not fit inside.
 *
 * The day-to-day move of a node is here too. How far its beams are drawn is
 * not: that runs on its own clock now, and lives in `beamTiming`.
 */

/** Both actors, in the order the scene draws them. */
const ACTORS = [0, 1] as const

/** Where a node passes through its own day, as a fraction of the day's slot. */
export const DAY_MIDPOINT = 0.5

/** A contributor node to draw, with its label and per-actor color. */
export interface ContributorNode {
  readonly actor: UniverseActor
  readonly x: number
  readonly y: number
  readonly active: boolean
}

/** Where a contributor node is drawn, which is not always where its day is. */
export interface ContributorPoint {
  readonly actor: UniverseActor
  readonly x: number
  readonly y: number
  /** How opaque to draw it: 0 on the days before this actor's first work. */
  readonly alpha: number
}

/** A contributor node's unbroken path through the days it works on. */
export interface ContributorGlide {
  /** Opens a day: wherever the nodes are drawn now is what they move from. */
  open(): void
  /**
   * Places the nodes on that path.
   * @param targets Where the day being drawn puts them.
   * @param next Where the day after that puts them; an actor missing from it
   * has nowhere to go on and rests on the day being drawn instead.
   * @param phase How far through the day's slot the scene is, from `dayPhase`.
   * @param wander How far an idle node has floated, from `contributorWander`.
   * @param step The day being drawn, which is what decides whether an actor
   * existed yet.
   * @returns One point per actor already seen at work, in the same array on
   * every frame.
   */
  at(
    targets: readonly ContributorNode[],
    next: readonly ContributorNode[],
    phase: number,
    wander?: ContributorWander,
    step?: number
  ): readonly ContributorPoint[]
}

/** How far an idle node has floated from where it stopped, in field units. */
export interface ContributorWander {
  readonly x: number
  readonly y: number
}

/** No float at all, which is every frame under reduced motion. */
export const NO_WANDER: ContributorWander = { x: 0, y: 0 }

/**
 * How long an idle node takes to work through one pass of its float. Forty
 * seconds to cross its own width and come back is a hover rather than a
 * journey: the disc itself comes round once in four minutes and a day's glide
 * can cross the whole field in one second, so this is slower than the scene's
 * slowest existing motion and two orders under its fastest.
 */
export const WANDER_MS = 40_000
/**
 * How far an idle node strays from where it stopped, in field units. A node is
 * 0.12 world units across and the field is six of those wide, so this is one
 * node width either side of the work it last did: enough to read as still
 * alive, never enough to read as having gone somewhere.
 */
export const WANDER_RADIUS = 0.02
/**
 * The rate of the second axis against the first. Anything near a whole number
 * closes the two into an ellipse, and an ellipse inside a turning disc reads
 * as a second orbit; the golden ratio's conjugate is as far from any simple
 * ratio as a number gets, so the path keeps folding back over itself instead.
 */
const WANDER_SKEW = 0.618

/**
 * Days an actor's node takes to fade out ahead of its own first contribution.
 * Playback runs newest to oldest, so this is the run-up to the day the actor
 * was created seen in reverse: about a week, which at a day a second is long
 * enough to read as a fade and short enough not to read as a fault.
 */
export const FADE_STEPS = 6

/**
 * @description How far through its slot the day being drawn is.
 * @param sinceMs Milliseconds since the day being drawn became the current one.
 * @param slotMs How long a day is held for.
 * @param animated False under reduced motion and while the clock is paused,
 * where a day's change is not drawn at all.
 * @returns A fraction in [0, 1]; always `DAY_MIDPOINT` when nothing may
 * animate, because that is the point a moving node passes its own day at, and
 * a still frame of a day has to be the day itself.
 */
export function dayPhase(sinceMs: number, slotMs: number, animated: boolean): number {
  if (!animated) return DAY_MIDPOINT
  if (!(sinceMs > 0)) return 0
  return Math.min(1, sinceMs / slotMs)
}

/**
 * @description How far an idle node has floated from where it stopped working.
 * A pure function of elapsed wall time, exactly as `discSpin` is: which day is
 * on screen, which way playback runs, and whether it is paused are none of
 * them inputs, so nothing about the timeline can make a resting node jump.
 *
 * Under reduced motion it is the zero offset at every elapsed time, and that
 * is load-bearing rather than merely polite. The render loop stops drawing
 * once a reduced-motion frame is settled, and its settled key holds the step
 * and the camera but not the clock; a node whose position moved with wall time
 * would either never be redrawn or force that key to change sixty times a
 * second. It must simply not move.
 * @param elapsedMs Milliseconds since the scene was built.
 * @param reducedMotion Whether `prefers-reduced-motion: reduce` is set.
 * @returns The offset in field units, both axes zero under reduced motion.
 */
export function contributorWander(
  elapsedMs: number,
  reducedMotion: boolean
): ContributorWander {
  if (reducedMotion || !Number.isFinite(elapsedMs)) return NO_WANDER
  const turn = (2 * Math.PI * elapsedMs) / WANDER_MS
  return {
    x: WANDER_RADIUS * Math.sin(turn),
    y: WANDER_RADIUS * Math.sin(turn * WANDER_SKEW),
  }
}

/**
 * @description How opaque an actor's node is on a given day. Before an actor's
 * first contribution there was nothing to draw: the agent's first commit is
 * months into a sixteen-year window, and without this its node stands on the
 * disc for every year that came before it as a marker for something that did
 * not exist. Stated for any actor rather than for that one, because it is the
 * same rule for the human and naming an actor here is what rots.
 * @param step The day being drawn, counting forward from the oldest.
 * @param first The step of that actor's earliest contribution.
 * @returns 1 from the actor's own first day onward, falling to 0 across the
 * `FADE_STEPS` days before it.
 */
export function contributorAlpha(step: number, first: number): number {
  if (step >= first) return 1
  return Math.max(0, 1 - (first - step) / FADE_STEPS)
}

/**
 * @description The earliest step each actor contributed on. Resolved once per
 * universe and never per frame: the contribution log runs to six figures, and
 * walking it on the frame path is a regression this scene has already paid for
 * once.
 * @param snapshot The universe snapshot.
 * @returns One entry per actor, infinite for an actor the log never names, so
 * a node nothing ever placed can never fade into view either.
 */
export function firstContributionSteps(
  snapshot: UniverseSnapshot
): readonly number[] {
  const first = ACTORS.map(() => Number.POSITIVE_INFINITY)
  for (const contribution of snapshot.contributions)
    if (contribution.step < (first[contribution.actor] ?? -Infinity))
      first[contribution.actor] = contribution.step
  return first
}

/**
 * @description Carries contributor nodes along one unbroken path through the
 * disc. A node reaches the day it is on at the midpoint of that day's slot and
 * spends the rest of the slot on its way to the next day, so it is always in
 * motion: the previous glide landed on the day and then stood still for the
 * remaining two thirds of the second. Its buffers are allocated once, because
 * this runs on the frame path.
 *
 * A day an actor does not work on is not a day it disappears on. It keeps the
 * node where its last day left it and floats it very slowly about that spot,
 * and the day work resumes glides on from wherever the float had reached.
 * @param born Each actor's earliest step, from `firstContributionSteps`; an
 * actor without one is drawn whole on every day.
 * @returns A glide holding one node per actor.
 */
export function createContributorGlide(
  born: readonly number[] = []
): ContributorGlide {
  const points = ACTORS.map((actor) => ({ actor, x: 0, y: 0, alpha: 1 }))
  const from = ACTORS.map(() => ({ x: 0, y: 0, placed: false }))
  /** What an idle node's float is measured from, once it has stopped work. */
  const rest = ACTORS.map(() => ({ x: 0, y: 0, adrift: false }))
  const shown: ContributorPoint[] = []
  return {
    open() {
      for (const actor of ACTORS) {
        const start = from[actor]
        const point = points[actor]
        if (!start || !point) continue
        start.x = point.x
        start.y = point.y
      }
    },
    at(targets, next, phase, wander = NO_WANDER, step = 0) {
      shown.length = 0
      for (const actor of ACTORS) {
        const point = points[actor]
        const start = from[actor]
        const held = rest[actor]
        if (!point || !start || !held) continue
        const target = targets.find((node) => node.actor === actor)
        // An actor never yet seen at work has no place to be held at, so it is
        // not drawn at all rather than held at the middle of the field.
        if (!target && !start.placed) continue
        if (target) {
          if (!start.placed) place(start, target)
          glidePoint(point, start, target, onwardOf(next, target), phase)
          held.adrift = false
        } else floatPoint(point, held, wander, actor)
        point.alpha = contributorAlpha(step, born[actor] ?? 0)
        shown.push(point)
      }
      return shown
    },
  }
}

/**
 * Carries an idle node on from wherever its last day left it. The float is
 * measured from a point fixed at the moment work stopped, so the node leaves
 * that spot at the speed the float is already travelling rather than jumping
 * to wherever the offset happens to stand — and `open` then hands the glide
 * the floated position, so resuming work is continuous in the same way.
 *
 * The two nodes take the float in opposite senses. Sharing it moves them by
 * the same vector on every frame they are both idle, which the eye reads as
 * one pair being dragged rather than as two things adrift.
 */
function floatPoint(
  point: { x: number; y: number },
  held: { x: number; y: number; adrift: boolean },
  wander: ContributorWander,
  actor: UniverseActor
): void {
  const sense = actor === 0 ? 1 : -1
  const x = wander.x * sense
  const y = wander.y * sense
  if (!held.adrift) {
    held.adrift = true
    held.x = point.x - x
    held.y = point.y - y
  }
  point.x = held.x + x
  point.y = held.y + y
}

/** A node seen for the first time has nowhere to come from but its own day. */
function place(
  start: { x: number; y: number; placed: boolean },
  target: ContributorNode
): void {
  start.placed = true
  start.x = target.x
  start.y = target.y
}

/** Where this actor is bound after today, or today's own place when it is idle. */
function onwardOf(
  next: readonly ContributorNode[],
  target: ContributorNode
): ContributorNode {
  return next.find((node) => node.actor === target.actor) ?? target
}

/**
 * Places a node on the leg of its path the slot has reached: it closes on its
 * day over the first half and leaves for the next one over the second, so the
 * day's end leaves it half way along that leg and the next day's midpoint puts
 * it exactly on the next day. Each leg is weighted rather than offset from
 * where it began, so the node lands on a day's own position to the last bit.
 */
function glidePoint(
  point: { x: number; y: number },
  start: { readonly x: number; readonly y: number },
  target: ContributorNode,
  onward: ContributorNode,
  phase: number
): void {
  const closing = phase <= DAY_MIDPOINT
  const leg = closing ? start : target
  const toward = closing ? target : onward
  const along = closing ? phase / DAY_MIDPOINT : phase - DAY_MIDPOINT
  point.x = leg.x * (1 - along) + toward.x * along
  point.y = leg.y * (1 - along) + toward.y * along
}

/** @description The star a contribution names, or undefined when absent. */
export function starFor(
  layout: UniverseLayout,
  repoId: number,
  file: string
): StarPosition | undefined {
  const index = layout.starIndex.get(starKey(repoId, file))
  return index === undefined ? undefined : layout.stars[index]
}

/**
 * @description Resolves contributor node positions from a frame and layout.
 * @param layout The universe layout.
 * @param frame The current universe frame.
 * @returns One node per actor with current contributions, at the centroid of
 * its current stars in field units; actors with none are omitted.
 */
export function resolveContributors(
  layout: UniverseLayout,
  frame: UniverseFrame
): readonly ContributorNode[] {
  const nodes: ContributorNode[] = []
  for (const actor of ACTORS) {
    const points: StarPosition[] = []
    for (const contribution of frame.currentContributions) {
      const star = starFor(layout, contribution.repo, contribution.file)
      if (contribution.actor === actor && star) points.push(star)
    }
    if (points.length === 0) continue
    nodes.push({
      actor,
      x: points.reduce((sum, star) => sum + star.x, 0) / points.length,
      y: points.reduce((sum, star) => sum + star.y, 0) / points.length,
      active: true,
    })
  }
  return nodes
}

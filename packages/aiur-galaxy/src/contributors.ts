import { starKey } from './galaxy'
import type { StarPosition, UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
import type { UniverseActor } from './types'

/**
 * Contributor placement lives here rather than beside the canvas-2D renderer
 * that used to own it. The WebGL galaxy needs only this function, and importing
 * it from `universeRender` pulled that entire renderer into the lazy island's
 * chunk, which has a hard byte budget it does not fit inside.
 *
 * The day-to-day move of a node is here too, and so is how far its beams are
 * drawn: a beam starts at the node and is measured from it, so the two are one
 * transition and are stated once.
 */

/** Both actors, in the order the scene draws them. */
const ACTORS = [0, 1] as const

/**
 * How long a day's change takes to draw, in milliseconds. Playback holds a day
 * for a second and both halves of the change happen inside it: the closing
 * day's beams retract over one transition and the opening day's grow over
 * another, which leaves them at full length for the third of a second between.
 */
export const DAY_TRANSITION_MS = 320

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
}

/** A contributor node's steady move from the day it left to the day it is on. */
export interface ContributorGlide {
  /** Opens a day: wherever the nodes are drawn now is what they move from. */
  open(): void
  /**
   * Places the nodes part of the way through that move.
   * @param targets Where the day being drawn puts them.
   * @param phase How far through the move the scene is, from `dayTransition`.
   * @returns One point per target, in the same array on every frame.
   */
  at(
    targets: readonly ContributorNode[],
    phase: number
  ): readonly ContributorPoint[]
}

/**
 * @description How far through a day's change the scene is.
 * @param sinceMs Milliseconds since the day being drawn became the current one.
 * @param animated False under reduced motion and while the clock is paused,
 * where a day's change is not drawn at all.
 * @returns 0 at the start of the change and 1 once it is done; always 1 when
 * nothing may animate, so the scene lands straight on the final state.
 */
export function dayTransition(sinceMs: number, animated: boolean): number {
  if (!animated) return 1
  if (!(sinceMs > 0)) return 0
  return Math.min(1, sinceMs / DAY_TRANSITION_MS)
}

/**
 * @description How much of the way from its contributor node toward its star a
 * beam is drawn. Beams grow out of the node as a day opens and are drawn back
 * into it as the day closes, rather than appearing and vanishing whole.
 * @param sinceMs Milliseconds since the day being drawn became the current one.
 * @param slotMs How long a day is held for.
 * @param animated Whether a day's change may be drawn at all.
 * @returns A fraction in [0, 1], a whole beam through the middle of the day.
 */
export function beamReach(
  sinceMs: number,
  slotMs: number,
  animated: boolean
): number {
  return Math.min(
    dayTransition(sinceMs, animated),
    dayTransition(slotMs - sinceMs, animated)
  )
}

/**
 * @description Moves contributor nodes between their days at a steady speed:
 * a fixed distance over a fixed time, which is the whole of "steady". The
 * exponential ease this replaces covered a fixed fraction of what was left
 * every frame, so it started fast and crept at the end. Its buffers are
 * allocated once, because this runs on the frame path.
 * @returns A glide holding one node per actor.
 */
export function createContributorGlide(): ContributorGlide {
  const points = ACTORS.map((actor) => ({ actor, x: 0, y: 0 }))
  const from = ACTORS.map(() => ({ x: 0, y: 0, placed: false }))
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
    at(targets, phase) {
      shown.length = 0
      for (const target of targets) {
        const point = points[target.actor]
        const start = from[target.actor]
        if (!point || !start) continue
        if (!start.placed) place(start, target)
        // Weighted rather than offset from the start, so the node lands
        // exactly on its day: a seek and a pass through settle on one frame.
        point.x = start.x * (1 - phase) + target.x * phase
        point.y = start.y * (1 - phase) + target.y * phase
        shown.push(point)
      }
      return shown
    },
  }
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

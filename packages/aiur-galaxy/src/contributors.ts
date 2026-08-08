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
   * @returns One point per target, in the same array on every frame.
   */
  at(
    targets: readonly ContributorNode[],
    next: readonly ContributorNode[],
    phase: number
  ): readonly ContributorPoint[]
}

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
 * @description Carries contributor nodes along one unbroken path through the
 * disc. A node reaches the day it is on at the midpoint of that day's slot and
 * spends the rest of the slot on its way to the next day, so it is always in
 * motion: the previous glide landed on the day and then stood still for the
 * remaining two thirds of the second. Its buffers are allocated once, because
 * this runs on the frame path.
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
    at(targets, next, phase) {
      shown.length = 0
      for (const target of targets) {
        const point = points[target.actor]
        const start = from[target.actor]
        if (!point || !start) continue
        if (!start.placed) place(start, target)
        glidePoint(point, start, target, onwardOf(next, target), phase)
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

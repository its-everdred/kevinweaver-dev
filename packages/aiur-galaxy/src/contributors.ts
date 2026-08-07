import { starKey } from './galaxy'
import type { StarPosition, UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
import type { UniverseActor } from './types'

/**
 * Contributor placement lives here rather than beside the canvas-2D renderer
 * that used to own it. The WebGL galaxy needs only this function, and importing
 * it from `universeRender` pulled that entire renderer into the lazy island's
 * chunk, which has a hard byte budget it does not fit inside.
 */

/** A contributor node to draw, with its label and per-actor color. */
export interface ContributorNode {
  readonly actor: UniverseActor
  readonly x: number
  readonly y: number
  readonly active: boolean
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
  for (const actor of [0, 1] as const) {
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

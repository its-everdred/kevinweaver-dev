import { Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { layoutUniverse } from '../src/galaxy'
import type { UniverseLayout } from '../src/galaxy'
import {
  DISC_STILL,
  DISC_TURN_MS,
  discSpin,
  discTurn,
  turnMatrix,
  turnX,
  turnY,
  worldX,
  worldY,
  worldZ,
} from '../src/galaxyWorld'
import type { UniverseContribution, UniverseSnapshot } from '../src/types'

/**
 * Repos in recency order, one file each, so ordinal `n` is repo `n` and the
 * arm geometry is the only thing deciding where a segment lands.
 */
function windingSnapshot(count: number): UniverseSnapshot {
  const repos = []
  const contributions: UniverseContribution[] = []
  for (let id = 0; id < count; id++) {
    repos.push({ id, name: `a/r${id}`, files: [`f${id}.ts`] })
    contributions.push({ step: count - id, repo: id, file: `f${id}.ts`, actor: 0 })
  }
  return { repos, contributions, stepCount: count + 1 }
}

/**
 * The signed angle from one arm segment to the next one further out, wrapped
 * into (-PI, PI] so a winding that has passed the half turn still reads as the
 * step it is rather than as its complement.
 */
function windingStep(disc: UniverseLayout, inner: number, outer: number): number {
  const near = disc.repos[inner]
  const far = disc.repos[outer]
  if (!near || !far) throw new Error('the winding fixture lost an arm segment')
  expect(far.radius).toBeGreaterThan(near.radius)
  const delta =
    Math.atan2(far.y - 0.5, far.x - 0.5) - Math.atan2(near.y - 0.5, near.x - 0.5)
  return Math.atan2(Math.sin(delta), Math.cos(delta))
}

describe('discSpin', () => {
  it('starts the disc where the layout put it', () => {
    expect(discSpin(0, false)).toBeCloseTo(0, 12)
  })

  it('advances on elapsed time alone, so a paused clock never freezes it', () => {
    // Playback can be paused, scrubbed, or run backwards; none of that is a
    // reason for the disc to stop turning, so the angle is a function of
    // elapsed wall time and of nothing else.
    expect(discSpin(2000, false)).toBeCloseTo(discSpin(1000, false) * 2, 12)
    expect(discSpin(90_000, false)).toBeCloseTo(discSpin(30_000, false) * 3, 12)
  })

  it('takes minutes to come round, not seconds', () => {
    expect(DISC_TURN_MS).toBeGreaterThanOrEqual(60_000)
    expect(Math.abs(discSpin(DISC_TURN_MS, false))).toBeCloseTo(2 * Math.PI, 12)
  })

  it('stops completely under reduced motion', () => {
    // The repository rule is that every infinite animation stops under
    // `prefers-reduced-motion: reduce`. This is the whole of that stop: the
    // angle is zero at every elapsed time, so the disc never moves at all.
    for (const elapsed of [0, 16, 1000, DISC_TURN_MS, DISC_TURN_MS * 7.5])
      expect(discSpin(elapsed, true)).toBe(0)
  })

  it('turns the way the arms trail, never the way they unwind', () => {
    const disc = layoutUniverse(windingSnapshot(40))
    // Two arms, so ordinals two apart share one and differ by a single radius
    // step: small enough that the angle between them is unambiguous.
    const winding = Math.sign(windingStep(disc, 20, 22))
    expect(winding).not.toBe(0)
    // A spiral's arms trail its rotation: the tip of an arm lags its root, so
    // the disc turns against the sense the arm winds out in. Turning with it
    // puts the tips in front and the arms read as unwinding.
    expect(Math.sign(discSpin(1000, false))).toBe(-winding)
  })
})

describe('disc turn', () => {
  it('turns a field point about the disc center', () => {
    const quarter = discTurn(Math.PI / 2)
    expect(turnX(quarter, 0.9, 0.5)).toBeCloseTo(0.5, 12)
    expect(turnY(quarter, 0.9, 0.5)).toBeCloseTo(0.9, 12)
    // The center is the axis, so it is the one point the turn never moves.
    expect(turnX(quarter, 0.5, 0.5)).toBeCloseTo(0.5, 12)
    expect(turnY(quarter, 0.5, 0.5)).toBeCloseTo(0.5, 12)
  })

  it('holds every star at the radius the layout gave it', () => {
    const turn = discTurn(-0.7)
    const radius = (x: number, y: number): number => Math.hypot(x - 0.5, y - 0.5)
    for (const point of [
      { x: 0.8, y: 0.55 },
      { x: 0.2, y: 0.9 },
    ])
      expect(radius(turnX(turn, point.x, point.y), turnY(turn, point.x, point.y))).toBeCloseTo(
        radius(point.x, point.y),
        12
      )
  })

  it('leaves the disc alone when it has not turned yet', () => {
    expect(turnX(DISC_STILL, 0.7, 0.3)).toBe(0.7)
    expect(turnY(DISC_STILL, 0.7, 0.3)).toBe(0.3)
  })

  it('draws the star field through the same turn the beams are aimed with', () => {
    // The star field turns as a whole, through one matrix; the beams, labels,
    // and contributor nodes are placed one point at a time. The two paths have
    // to agree exactly, or a beam misses the star it is drawn to.
    const turn = discTurn(-0.7)
    const matrix = turnMatrix(new Matrix4(), turn)
    for (const point of [
      { x: 0.8, y: 0.55, z: 0.52 },
      { x: 0.2, y: 0.9, z: 0.48 },
    ]) {
      const drawn = new Vector3(
        worldX(point.x),
        worldY(point.y),
        worldZ(point.z)
      ).applyMatrix4(matrix)
      expect(drawn.x).toBeCloseTo(worldX(turnX(turn, point.x, point.y)), 12)
      expect(drawn.y).toBeCloseTo(worldY(turnY(turn, point.x, point.y)), 12)
      expect(drawn.z).toBeCloseTo(worldZ(point.z), 12)
    }
  })
})

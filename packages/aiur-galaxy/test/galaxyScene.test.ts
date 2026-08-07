import { LineBasicMaterial, PerspectiveCamera, Vector3 } from 'three'
import type { BufferAttribute } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  createBeamField,
  pickRepoArm,
  placeCamera,
  repoScreenPosition,
  resizeCamera,
} from '../src/galaxyScene'
import { createStarField } from '../src/galaxyStars'
import type { RepoArm } from '../src/galaxy'
import {
  ORIGINS,
  THEME,
  frameAt,
  indexOf,
  layout,
  toHex,
  vertexOf,
} from './galaxyFixtures'

describe('createBeamField', () => {
  it('draws one segment per contribution, colored by actor', () => {
    const source = layout()
    const beams = createBeamField(THEME)
    const stats = beams.setFrame(source, frameAt(0), ORIGINS)
    expect(stats).toEqual({ drawn: 2, dropped: 0 })
    expect(beams.lines.geometry.drawRange.count).toBe(4)
    const color = beams.lines.geometry.getAttribute('color') as BufferAttribute
    const drawn = [toHex(vertexOf(color, 0)), toHex(vertexOf(color, 2))]
    expect(drawn).toEqual([THEME.contributor, THEME.agent])
    beams.dispose()
  })

  it('draws nothing on a step with no contributions', () => {
    const source = layout()
    const beams = createBeamField(THEME)
    beams.setFrame(source, frameAt(0), ORIGINS)
    const stats = beams.setFrame(source, frameAt(1), ORIGINS)
    expect(stats).toEqual({ drawn: 0, dropped: 0 })
    expect(beams.lines.geometry.drawRange.count).toBe(0)
    beams.dispose()
  })

  it('reports overflow instead of dropping beams silently', () => {
    const source = layout()
    const beams = createBeamField(THEME, 1)
    expect(beams.setFrame(source, frameAt(0), ORIGINS)).toEqual({ drawn: 1, dropped: 1 })
    beams.dispose()
  })

  it('ends each beam at its star and starts it at its actor', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    const beams = createBeamField(THEME)
    beams.setFrame(source, frameAt(0), ORIGINS)
    const stars = field.points.geometry.getAttribute('position') as BufferAttribute
    const ends = beams.lines.geometry.getAttribute('position') as BufferAttribute
    expect(vertexOf(ends, 0)).toEqual([ORIGINS[0]?.x, ORIGINS[0]?.y, ORIGINS[0]?.z])
    expect(vertexOf(ends, 1)).toEqual(vertexOf(stars, indexOf(source, 0, 'a.ts')))
    expect(vertexOf(ends, 2)).toEqual([ORIGINS[1]?.x, ORIGINS[1]?.y, ORIGINS[1]?.z])
    expect(vertexOf(ends, 3)).toEqual(vertexOf(stars, indexOf(source, 1, 'd.ts')))
    field.dispose()
    beams.dispose()
  })

  it('moves beam origins with the contributor nodes', () => {
    const source = layout()
    const beams = createBeamField(THEME)
    beams.setFrame(source, frameAt(0), ORIGINS)
    beams.setOrigins([{ actor: 0, x: 2, y: 2, z: 2 }])
    const ends = beams.lines.geometry.getAttribute('position') as BufferAttribute
    expect(vertexOf(ends, 0)).toEqual([2, 2, 2])
    // The agent had no node this frame, so its beam keeps its last origin.
    expect(vertexOf(ends, 2)).toEqual([ORIGINS[1]?.x, ORIGINS[1]?.y, ORIGINS[1]?.z])
    beams.dispose()
  })

  it('releases its geometry and material on dispose', () => {
    const beams = createBeamField(THEME)
    const geometry = vi.spyOn(beams.lines.geometry, 'dispose')
    const material = vi.spyOn(beams.lines.material as LineBasicMaterial, 'dispose')
    beams.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})

describe('pickRepoArm', () => {
  const METRICS = { width: 600, height: 400 }

  function arm(repoId: number, name: string, x: number): RepoArm {
    return {
      repoId,
      name,
      ordinal: repoId,
      lastStep: 0,
      x,
      y: 0.5,
      z: 0.5,
      radius: Math.abs(x - 0.5),
      starOffset: 0,
      starCount: 0,
    }
  }

  const ARMS: readonly RepoArm[] = [arm(10, 'a/left', 0.35), arm(11, 'a/right', 0.65)]

  function viewFrom(x: number, z: number): PerspectiveCamera {
    const camera = new PerspectiveCamera(60, METRICS.width / METRICS.height, 0.1, 100)
    placeCamera(camera, x, 0, z)
    return camera
  }

  function screenOf(repo: RepoArm, camera: PerspectiveCamera) {
    return repoScreenPosition(repo, camera, METRICS)
  }

  it('picks the arm under the pointer', () => {
    const camera = viewFrom(0, 2.6)
    for (const repo of ARMS)
      expect(pickRepoArm(ARMS, camera, screenOf(repo, camera), METRICS)).toBe(repo.repoId)
  })

  it('picks the nearer of two arms', () => {
    const camera = viewFrom(0, 2.6)
    const left = screenOf(ARMS[0]!, camera)
    const right = screenOf(ARMS[1]!, camera)
    const near = { x: left.x + (right.x - left.x) * 0.2, y: left.y }
    expect(pickRepoArm(ARMS, camera, near, METRICS)).toBe(10)
  })

  it('picks nothing when the pointer is nowhere near an arm', () => {
    const camera = viewFrom(0, 2.6)
    expect(pickRepoArm(ARMS, camera, { x: 0, y: 0 }, METRICS)).toBeNull()
    expect(pickRepoArm([], camera, { x: 300, y: 200 }, METRICS)).toBeNull()
  })

  it('never picks an arm the camera has moved past', () => {
    // The dolly floor puts the camera inside the disc's own extent, where an
    // arm can sit behind it and project to a mirrored, meaningless point.
    const rim = arm(12, 'a/rim', 0.92)
    const camera = viewFrom(1.2, 0)
    const behind = screenOf(rim, camera)
    expect(behind.visible).toBe(false)
    expect(pickRepoArm([rim], camera, behind, METRICS)).toBeNull()
  })
})

describe('camera', () => {
  it('resizes the projection aspect and nothing else', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100)
    placeCamera(camera, 1.5, -2, 3)
    const position = camera.position.clone()
    const quaternion = camera.quaternion.clone()
    const projection = camera.projectionMatrix.clone()

    resizeCamera(camera, 1200, 400)

    // A user who has zoomed and rotated keeps that camera across a resize; only
    // the aspect (and therefore the projection matrix) moves.
    expect(camera.aspect).toBeCloseTo(3, 12)
    expect(camera.position.equals(position)).toBe(true)
    expect(camera.quaternion.equals(quaternion)).toBe(true)
    expect(camera.projectionMatrix.equals(projection)).toBe(false)
  })

  it('never derives a non-finite aspect from a collapsed viewport', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100)
    resizeCamera(camera, 800, 0)
    expect(Number.isFinite(camera.aspect)).toBe(true)
  })

  it('places the camera at a world point and aims it at the disc center', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100)
    placeCamera(camera, 0, 0, 4)
    expect(camera.position.toArray()).toEqual([0, 0, 4])
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    expect(forward.x).toBeCloseTo(0, 12)
    expect(forward.y).toBeCloseTo(0, 12)
    expect(forward.z).toBeCloseTo(-1, 12)
  })
})

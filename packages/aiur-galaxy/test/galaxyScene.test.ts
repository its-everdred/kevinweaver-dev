import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildGalaxyPoints,
  createBeamField,
  createRepoLabels,
  createStarField,
  placeCamera,
  resizeCamera,
} from '../src/galaxyScene'
import { layoutUniverse, starKey } from '../src/galaxy'
import { universeFrame } from '../src/universePlayback'
import type { UniverseFrame } from '../src/universePlayback'
import type { UniverseLayout } from '../src/galaxy'
import type { UniverseSnapshot } from '../src/types'

const SNAPSHOT: UniverseSnapshot = {
  repos: [
    { id: 0, name: 'a/r1', files: ['a.ts', 'b.ts', 'c.ts'] },
    { id: 1, name: 'a/r2', files: ['d.ts'] },
    { id: 2, name: 'a/quiet', files: ['q.ts'] },
  ],
  contributions: [
    { step: 0, repo: 0, file: 'a.ts', actor: 0 },
    { step: 0, repo: 1, file: 'd.ts', actor: 1 },
    { step: 2, repo: 0, file: 'b.ts', actor: 0 },
  ],
  stepCount: 6,
}

const THEME = {
  background: 0x1d2021,
  star: 0x8b98ab,
  liveStar: 0xb7d3ef,
  currentStar: 0xd8f2b0,
  contributor: 0x61afef,
  agent: 0xc678dd,
  label: 0xd8dee9,
}

const ORIGINS = [
  { actor: 0 as const, x: -1, y: -0.5, z: 0.5 },
  { actor: 1 as const, x: 1, y: 0.5, z: 0.5 },
]

function layout(): UniverseLayout {
  return layoutUniverse(SNAPSHOT)
}

function frameAt(step: number): UniverseFrame {
  return universeFrame(SNAPSHOT, step, 'forward')
}

function vertexOf(attribute: THREE.BufferAttribute, index: number): number[] {
  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)]
}

function colorOf(points: THREE.Points, index: number): number[] {
  return vertexOf(points.geometry.getAttribute('color') as THREE.BufferAttribute, index)
}

function indexOf(source: UniverseLayout, repoId: number, file: string): number {
  const index = source.starIndex.get(starKey(repoId, file))
  if (index === undefined) throw new Error(`no star for ${repoId}:${file}`)
  return index
}

/** Rec.709 relative luminance of an already-linearized three.js color. */
function luminance(hex: number): number {
  const color = new THREE.Color(hex)
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

/** WCAG contrast ratio between two colors, both in the working color space. */
function contrast(hex: number, against: number): number {
  const high = Math.max(luminance(hex), luminance(against))
  const low = Math.min(luminance(hex), luminance(against))
  return (high + 0.05) / (low + 0.05)
}

function toHex(rgb: readonly number[]): number {
  return new THREE.Color(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0).getHex()
}

/** Indices whose color triple changed between two snapshots of the buffer. */
function changedVertices(before: Float32Array, after: Float32Array): number[] {
  const changed: number[] = []
  for (let index = 0; index * 3 < after.length; index++) {
    const offset = index * 3
    if (
      before[offset] !== after[offset] ||
      before[offset + 1] !== after[offset + 1] ||
      before[offset + 2] !== after[offset + 2]
    )
      changed.push(index)
  }
  return changed
}

interface FakeCanvas {
  width: number
  height: number
  getContext(kind: string): Record<string, unknown> | null
}

/** Records the text a label sprite paints, without a DOM. */
const painted: string[] = []

function stubCanvasDocument(): void {
  painted.length = 0
  const create = (): FakeCanvas => ({
    width: 0,
    height: 0,
    getContext: () => ({
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      fillText: (text: string) => painted.push(text),
    }),
  })
  vi.stubGlobal('document', { createElement: create })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildGalaxyPoints', () => {
  it('builds one vertex for every star in the whole disc', () => {
    const source = layout()
    const points = buildGalaxyPoints(source, THEME)
    expect(points.geometry.getAttribute('position').count).toBe(source.starCount)
    expect(points.geometry.getAttribute('color').count).toBe(source.starCount)
    expect(points.geometry.getAttribute('size').count).toBe(source.starCount)
    const material = points.material as THREE.ShaderMaterial
    expect(material.transparent).toBe(true)
    expect(material.blending).toBe(THREE.AdditiveBlending)
    points.geometry.dispose()
    material.dispose()
  })

  it('renders an untouched star measurably against the background', () => {
    const source = layout()
    const points = buildGalaxyPoints(source, THEME)
    const quiet = indexOf(source, 2, 'q.ts')
    expect(toHex(colorOf(points, quiet))).toBe(THEME.star)
    // Peak star pixel over the background: an untouched star must clear the
    // same 4.5:1 contrast the accessibility suite demands of body text.
    expect(contrast(THEME.star, THEME.background)).toBeGreaterThanOrEqual(4.5)
    points.geometry.dispose()
    ;(points.material as THREE.ShaderMaterial).dispose()
  })
})

describe('createStarField', () => {
  it('promotes only the current step and keeps earlier stars bright', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.currentStar)
    field.setFrame(source, frameAt(1))
    field.setFrame(source, frameAt(2))
    field.setFrame(source, frameAt(3))
    field.setFrame(source, frameAt(4))
    field.setFrame(source, frameAt(5))
    // Zapped at step 0, still bright five steps later: brightness never reverts.
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 1, 'd.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 2, 'q.ts')))).toBe(THEME.star)
    field.dispose()
  })

  it('writes only the vertices the step it leaves and the step it enters name', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(1))
    field.setFrame(source, frameAt(2))
    const colors = field.points.geometry.getAttribute('color').array as Float32Array
    const before = Float32Array.from(colors)
    const written = field.setFrame(source, frameAt(3))
    const changed = changedVertices(before, colors)
    // Step 3 names nothing; only step 2's star demotes from current to live.
    expect(changed).toEqual([indexOf(source, 0, 'b.ts')])
    expect(written).toBe(1)
    field.dispose()
  })

  it('performs no attribute writes when the step repeats', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(2))
    const attribute = field.points.geometry.getAttribute('color') as THREE.BufferAttribute
    const colors = attribute.array as Float32Array
    colors.fill(-1)
    const version = attribute.version
    expect(field.setFrame(source, frameAt(2))).toBe(0)
    expect(colors.every((value) => value === -1)).toBe(true)
    expect(attribute.version).toBe(version)
    field.dispose()
  })

  it('demotes without reverting when playback steps backward', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(1))
    field.setFrame(source, frameAt(2))
    const colors = field.points.geometry.getAttribute('color').array as Float32Array
    const before = Float32Array.from(colors)
    const written = field.setFrame(source, frameAt(1))
    expect(changedVertices(before, colors)).toEqual([indexOf(source, 0, 'b.ts')])
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    expect(written).toBe(1)
    field.dispose()
  })

  it('resyncs cumulative brightness across a seek', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    // Jump past step 2 without rendering it: its star must still be bright.
    field.setFrame(source, frameAt(5))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 2, 'q.ts')))).toBe(THEME.star)
    field.dispose()
  })

  it('releases its geometry and material on dispose', () => {
    const field = createStarField(layout(), THEME)
    const geometry = vi.spyOn(field.points.geometry, 'dispose')
    const material = vi.spyOn(field.points.material as THREE.ShaderMaterial, 'dispose')
    field.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})

describe('createRepoLabels', () => {
  it('gives every repo exactly one always-visible label sprite', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    expect(labels.sprites).toHaveLength(source.repos.length)
    expect(labels.sprites.every((sprite) => sprite.visible)).toBe(true)
    expect(painted).toEqual(['r1', 'r2', 'quiet'])
    labels.dispose()
  })

  it('releases every label texture on dispose', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    const textures = labels.sprites.map((sprite) => {
      const map = sprite.material.map
      if (!map) throw new Error('label sprite has no texture')
      return vi.spyOn(map, 'dispose')
    })
    const materials = labels.sprites.map((sprite) => vi.spyOn(sprite.material, 'dispose'))
    labels.dispose()
    for (const spy of [...textures, ...materials]) expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('createBeamField', () => {
  it('draws one segment per contribution, colored by actor', () => {
    const source = layout()
    const beams = createBeamField(THEME)
    const stats = beams.setFrame(source, frameAt(0), ORIGINS)
    expect(stats).toEqual({ drawn: 2, dropped: 0 })
    expect(beams.lines.geometry.drawRange.count).toBe(4)
    const color = beams.lines.geometry.getAttribute('color') as THREE.BufferAttribute
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
    const stars = field.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const ends = beams.lines.geometry.getAttribute('position') as THREE.BufferAttribute
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
    const ends = beams.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(vertexOf(ends, 0)).toEqual([2, 2, 2])
    // The agent had no node this frame, so its beam keeps its last origin.
    expect(vertexOf(ends, 2)).toEqual([ORIGINS[1]?.x, ORIGINS[1]?.y, ORIGINS[1]?.z])
    beams.dispose()
  })

  it('releases its geometry and material on dispose', () => {
    const beams = createBeamField(THEME)
    const geometry = vi.spyOn(beams.lines.geometry, 'dispose')
    const material = vi.spyOn(beams.lines.material as THREE.LineBasicMaterial, 'dispose')
    beams.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})

describe('camera', () => {
  it('resizes the projection aspect and nothing else', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
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
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    resizeCamera(camera, 800, 0)
    expect(Number.isFinite(camera.aspect)).toBe(true)
  })

  it('places the camera at a world point and aims it at the disc center', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    placeCamera(camera, 0, 0, 4)
    expect(camera.position.toArray()).toEqual([0, 0, 4])
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    expect(forward.x).toBeCloseTo(0, 12)
    expect(forward.y).toBeCloseTo(0, 12)
    expect(forward.z).toBeCloseTo(-1, 12)
  })
})

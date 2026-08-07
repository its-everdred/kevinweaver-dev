import { Color, Points, BufferAttribute } from 'three'
import { vi } from 'vitest'

import { layoutUniverse, starKey } from '../src/galaxy'
import type { UniverseLayout } from '../src/galaxy'
import { universeFrame } from '../src/universePlayback'
import type { UniverseFrame } from '../src/universePlayback'
import type { GalaxySceneTheme } from '../src/galaxyWorld'
import type { UniverseSnapshot } from '../src/types'

/** Three repos, two of them touched, so a quiet repo stays observable. */
export const SNAPSHOT: UniverseSnapshot = {
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

export const THEME: GalaxySceneTheme = {
  background: 0x1d2021,
  star: 0x8b98ab,
  liveStar: 0xb7d3ef,
  currentStar: 0xd8f2b0,
  selectedStar: 0xffa64d,
  contributor: 0x61afef,
  agent: 0xc678dd,
  label: 0xd8dee9,
}

export const ORIGINS = [
  { actor: 0 as const, x: -1, y: -0.5, z: 0.5 },
  { actor: 1 as const, x: 1, y: 0.5, z: 0.5 },
]

export function layout(): UniverseLayout {
  return layoutUniverse(SNAPSHOT)
}

export function frameAt(step: number): UniverseFrame {
  return universeFrame(SNAPSHOT, step, 'forward')
}

export function vertexOf(attribute: BufferAttribute, index: number): number[] {
  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)]
}

export function colorOf(points: Points, index: number): number[] {
  return vertexOf(points.geometry.getAttribute('color') as BufferAttribute, index)
}

export function indexOf(source: UniverseLayout, repoId: number, file: string): number {
  const index = source.starIndex.get(starKey(repoId, file))
  if (index === undefined) throw new Error(`no star for ${repoId}:${file}`)
  return index
}

export function toHex(rgb: readonly number[]): number {
  return new Color(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0).getHex()
}

/** Indices whose color triple changed between two snapshots of the buffer. */
export function changedVertices(before: Float32Array, after: Float32Array): number[] {
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

/** Records the text a label paints, without a DOM. */
export const painted: string[] = []

export function stubCanvasDocument(): void {
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

import { describe, expect, it } from 'vitest'

import { buildFileDag } from '../src/buildDag'
import { layoutDag } from '../src/layout'
import type { RepoSnapshot } from '../src/types'

function snapshot(files: readonly string[]): RepoSnapshot {
  return {
    repo: { owner: 'a', name: 'r', branch: 'main' },
    files: files.map((path) => ({ path })),
    commits: [],
  }
}

describe('layoutDag', () => {
  it('is deterministic: same input, same positions', () => {
    const dag = buildFileDag(snapshot(['a.ts', 'b.ts', 'c/d.ts']))
    const first = layoutDag(dag)
    const second = layoutDag(buildFileDag(snapshot(['a.ts', 'b.ts', 'c/d.ts'])))
    for (const [id, pos] of first.positions) {
      const other = second.positions.get(id)
      expect(other).toBeDefined()
      expect(pos.x).toBeCloseTo(other?.x ?? -1)
      expect(pos.y).toBeCloseTo(other?.y ?? -1)
    }
  })

  it('places deeper files on larger radii', () => {
    const dag = buildFileDag(snapshot(['root.ts', 'deep/a.ts', 'deep/nest/b.ts']))
    const layout = layoutDag(dag)
    const shallow = layout.positions.get('root.ts')
    const mid = layout.positions.get('deep/a.ts')
    const deep = layout.positions.get('deep/nest/b.ts')
    const radiusOf = (x?: number, y?: number) => {
      if (x === undefined || y === undefined) return -1
      return Math.hypot(x - 0.5, y - 0.5)
    }
    const rShallow = radiusOf(shallow?.x, shallow?.y)
    const rMid = radiusOf(mid?.x, mid?.y)
    const rDeep = radiusOf(deep?.x, deep?.y)
    expect(rDeep).toBeGreaterThan(rMid)
    expect(rMid).toBeGreaterThan(rShallow)
  })

  it('reports no files for an empty tree', () => {
    expect(layoutDag(buildFileDag(snapshot([]))).hasFiles).toBe(false)
  })

  it('positions are within the field', () => {
    const dag = buildFileDag(snapshot(['a/b/c.ts', 'x.ts']))
    for (const position of layoutDag(dag).positions.values()) {
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.x).toBeLessThanOrEqual(1)
      expect(position.y).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeLessThanOrEqual(1)
    }
  })
})

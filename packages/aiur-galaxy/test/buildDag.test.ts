import { describe, expect, it } from 'vitest'

import { buildFileDag } from '../src/buildDag'
import type { RepoSnapshot } from '../src/types'

function snapshot(files: readonly string[]): RepoSnapshot {
  return {
    repo: { owner: 'a', name: 'r', branch: 'main' },
    files: files.map((path) => ({ path })),
    commits: [],
  }
}

describe('buildFileDag', () => {
  it('creates a root node with no children for an empty tree', () => {
    const dag = buildFileDag(snapshot([]))
    expect(dag.nodes.size).toBe(1)
    expect(dag.rootId).toBe('')
    expect(dag.nodes.get('')?.children).toEqual([])
  })

  it('creates file leaves and intermediate directory nodes', () => {
    const dag = buildFileDag(
      snapshot(['a/b/c.ts', 'a/b/d.ts', 'e.ts', 'f/g/h.ts'])
    )
    expect(dag.nodes.get('a/b/c.ts')?.isFile).toBe(true)
    expect(dag.nodes.get('a/b')?.isFile).toBe(false)
    expect(dag.nodes.get('a/b')?.children).toEqual(['a/b/c.ts', 'a/b/d.ts'])
    expect(dag.nodes.get('')?.children).toContain('e.ts')
    expect(dag.nodes.get('e.ts')?.depth).toBe(1)
    expect(dag.nodes.get('a/b/c.ts')?.depth).toBe(3)
  })

  it('deduplicates shared directories across branches', () => {
    const dag = buildFileDag(snapshot(['x/y/a.ts', 'x/y/b.ts', 'x/z/c.ts']))
    expect(dag.nodes.get('x/y')?.children).toEqual(['x/y/a.ts', 'x/y/b.ts'])
    expect(dag.nodes.get('x')?.children).toEqual(['x/y', 'x/z'])
  })

  it('ignores duplicate file paths and empty strings', () => {
    const dag = buildFileDag(snapshot(['a.ts', 'a.ts', '', 'b.ts']))
    expect(dag.nodes.size).toBe(3)
    expect(dag.nodes.has('a.ts')).toBe(true)
  })
})

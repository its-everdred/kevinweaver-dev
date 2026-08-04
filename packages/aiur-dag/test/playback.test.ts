import { describe, expect, it } from 'vitest'

import {
  clampCommitIndex,
  liveFilesAt,
  nextCommitIndex,
  playbackFrame,
} from '../src/playback'
import type { RepoSnapshot, SnapshotCommit } from '../src/types'

function commit(
  sha: string,
  date: string,
  files: readonly string[]
): SnapshotCommit {
  return { sha, date, author: 'kw', url: `https://example.com/${sha}`, files }
}

const SNAPSHOT: RepoSnapshot = {
  repo: { owner: 'a', name: 'r', branch: 'main' },
  files: [
    { path: 'a.ts' },
    { path: 'b.ts' },
    { path: 'c.ts' },
    { path: 'd.ts' },
  ],
  commits: [
    commit('1', '2026-01-01T00:00:00Z', ['a.ts', 'b.ts']),
    commit('2', '2026-01-02T00:00:00Z', ['b.ts', 'c.ts']),
    commit('3', '2026-01-03T00:00:00Z', ['d.ts']),
  ],
}

describe('clampCommitIndex', () => {
  it('clamps to the valid range', () => {
    expect(clampCommitIndex(-5, 3)).toBe(0)
    expect(clampCommitIndex(99, 3)).toBe(2)
    expect(clampCommitIndex(1.9, 3)).toBe(1)
    expect(clampCommitIndex(0, 0)).toBe(-1)
  })
})

describe('liveFilesAt', () => {
  it('accumulates files from the start in forward order', () => {
    expect([...liveFilesAt(SNAPSHOT.commits, 0, 'forward')].sort()).toEqual([
      'a.ts',
      'b.ts',
    ])
    expect([...liveFilesAt(SNAPSHOT.commits, 2, 'forward')].sort()).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'd.ts',
    ])
  })

  it('accumulates files from the end in backward order', () => {
    expect([...liveFilesAt(SNAPSHOT.commits, 2, 'backward')].sort()).toEqual([
      'd.ts',
    ])
    expect([...liveFilesAt(SNAPSHOT.commits, 0, 'backward')].sort()).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'd.ts',
    ])
  })

  it('returns empty for an empty log or negative index', () => {
    expect(liveFilesAt([], 0, 'forward').size).toBe(0)
    expect(liveFilesAt(SNAPSHOT.commits, -1, 'forward').size).toBe(0)
  })
})

describe('playbackFrame', () => {
  it('resolves the commit and current files at an index', () => {
    const frame = playbackFrame(SNAPSHOT, 1, 'forward')
    expect(frame.commit?.sha).toBe('2')
    expect(frame.currentFiles).toEqual(['b.ts', 'c.ts'])
    expect(frame.total).toBe(3)
    expect(frame.progress).toBeCloseTo(2 / 3)
  })

  it('handles an empty log', () => {
    const empty = { ...SNAPSHOT, commits: [] }
    const frame = playbackFrame(empty, 0, 'forward')
    expect(frame.commit).toBeNull()
    expect(frame.currentFiles).toEqual([])
    expect(frame.progress).toBe(0)
  })
})

describe('nextCommitIndex', () => {
  it('advances and clamps in both directions', () => {
    const frame = playbackFrame(SNAPSHOT, 1, 'forward')
    expect(nextCommitIndex(frame, 'forward')).toBe(2)
    expect(nextCommitIndex(frame, 'backward')).toBe(0)
    const end = playbackFrame(SNAPSHOT, 2, 'forward')
    expect(nextCommitIndex(end, 'forward')).toBe(2)
    const start = playbackFrame(SNAPSHOT, 0, 'backward')
    expect(nextCommitIndex(start, 'backward')).toBe(0)
  })
})

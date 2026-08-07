import { describe, expect, it, vi } from 'vitest'

import {
  clearGalaxySelection,
  getGalaxySelection,
  isRepoPinned,
  publishGalaxySelection,
  subscribeGalaxySelection,
} from '../../components/viz/galaxySelection'

/** The store is a module singleton; each test starts from a distinct repo id. */
let testCounter = 0
function baselineRepo(): number {
  testCounter += 1
  return 500 + testCounter
}

function select(repoId: number, name: string, fileCount = 3, lastStep = 7): void {
  publishGalaxySelection({ repoId, name, fileCount, lastStep })
}

describe('galaxySelection', () => {
  it('publishes a selected repo and notifies subscribers', () => {
    const repoId = baselineRepo()
    const listener = vi.fn()
    const unsubscribe = subscribeGalaxySelection(listener)
    select(repoId, 'owner/name', 12, 4)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getGalaxySelection()).toEqual({
      repoId,
      name: 'owner/name',
      fileCount: 12,
      lastStep: 4,
    })
    unsubscribe()
  })

  it('starts with nothing selected', () => {
    clearGalaxySelection()
    expect(getGalaxySelection()).toEqual({
      repoId: null,
      name: null,
      fileCount: null,
      lastStep: null,
    })
  })

  it('reads an empty selection as following the day, not as nothing to show', () => {
    clearGalaxySelection()
    expect(isRepoPinned(getGalaxySelection())).toBe(false)
  })

  it('reads a published repo as pinned, including one that never contributed', () => {
    select(baselineRepo(), 'owner/name')
    expect(isRepoPinned(getGalaxySelection())).toBe(true)
    publishGalaxySelection({
      repoId: baselineRepo(),
      name: 'owner/quiet',
      fileCount: 0,
      lastStep: -1,
    })
    expect(isRepoPinned(getGalaxySelection())).toBe(true)
  })

  it('does not re-notify when the same repo is published again', () => {
    const repoId = baselineRepo()
    select(repoId, 'owner/name')
    const listener = vi.fn()
    const unsubscribe = subscribeGalaxySelection(listener)
    select(repoId, 'owner/name')
    select(repoId, 'owner/name')
    expect(listener).toHaveBeenCalledTimes(0)
    unsubscribe()
  })

  it('notifies when the selection moves to another repo', () => {
    const repoId = baselineRepo()
    select(repoId, 'owner/first')
    const listener = vi.fn()
    const unsubscribe = subscribeGalaxySelection(listener)
    select(repoId + 1, 'owner/second')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getGalaxySelection().name).toBe('owner/second')
    unsubscribe()
  })

  it('clears the selection back to empty and notifies once', () => {
    select(baselineRepo(), 'owner/name')
    const listener = vi.fn()
    const unsubscribe = subscribeGalaxySelection(listener)
    clearGalaxySelection()
    expect(getGalaxySelection().repoId).toBeNull()
    expect(getGalaxySelection().name).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    // Clearing an already empty selection is the deduped repeat publish.
    clearGalaxySelection()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('keeps a repo that never contributed distinguishable from no selection', () => {
    const repoId = baselineRepo()
    publishGalaxySelection({
      repoId,
      name: 'owner/quiet',
      fileCount: 0,
      lastStep: -1,
    })
    expect(getGalaxySelection().lastStep).toBe(-1)
    expect(getGalaxySelection().repoId).toBe(repoId)
  })

  it('stops notifying an unsubscribed listener', () => {
    const listener = vi.fn()
    subscribeGalaxySelection(listener)()
    select(baselineRepo(), 'owner/name')
    expect(listener).toHaveBeenCalledTimes(0)
  })
})

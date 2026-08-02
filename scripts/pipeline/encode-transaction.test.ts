import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { persistWith } from './encode-transaction.ts'
import type { PersistenceOperations } from './encode-transaction.ts'

describe('state persistence transaction', () => {
  it('discards state without promotion when journal writing fails', async () => {
    const operations = faults('stage')

    await expect(
      persistWith(operations, 'state', state(), 'temporary', 'target')
    ).rejects.toThrow('stage failed')

    expect(operations.calls).toEqual(['stage', 'discard'])
  })

  it('rolls back a generation when state commit fails', async () => {
    const operations = faults('commit')

    await expect(
      persistWith(operations, 'state', state(), 'temporary', 'target')
    ).rejects.toThrow('commit failed')

    expect(operations.calls).toEqual([
      'stage',
      'promote',
      'commit',
      'rollback',
      'discard',
    ])
  })

  it('discards state without redundant rollback when promotion fails', async () => {
    const operations = faults('promote')

    await expect(
      persistWith(operations, 'state', state(), 'temporary', 'target')
    ).rejects.toThrow('promote failed')

    expect(operations.calls).toEqual(['stage', 'promote', 'discard'])
  })

  it('retains committed state and generation when cleanup fails', async () => {
    const operations = faults('finalize')

    await expect(
      persistWith(operations, 'state', state(), 'temporary', 'target')
    ).rejects.toThrow('finalize failed')

    expect(operations.calls).toEqual(['stage', 'promote', 'commit', 'finalize'])
  })
})

function faults(
  failure: 'stage' | 'promote' | 'commit' | 'finalize'
): PersistenceOperations & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    stage: async () => failIf(calls, failure, 'stage'),
    promote: async () => failIf(calls, failure, 'promote'),
    commit: async () => failIf(calls, failure, 'commit'),
    rollback: async () => void calls.push('rollback'),
    discard: async () => void calls.push('discard'),
    finalize: async () => failIf(calls, failure, 'finalize'),
  }
}

function failIf(calls: string[], failure: string, phase: string): void {
  calls.push(phase)
  if (phase === failure) throw new Error(`${phase} failed`)
}

function state() {
  return { schema: 1 as const, repos: {}, bundleHash: 'sha256-current' }
}

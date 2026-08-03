import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { persistWith } from './encode-transaction.ts'
import type { PersistenceOperations } from './encode-transaction.ts'

describe('state persistence transaction', () => {
  it('rolls back only when state writing fails', async () => {
    const operations = faults('write')

    await expect(
      persistWith(operations, 'state', state(), 'target')
    ).rejects.toThrow('write failed')

    expect(operations.calls).toEqual(['write', 'rollback'])
  })

  it('retains the promoted generation when cleanup fails', async () => {
    const operations = faults('finalize')

    await expect(
      persistWith(operations, 'state', state(), 'target')
    ).rejects.toThrow('finalize failed')

    expect(operations.calls).toEqual(['write', 'finalize'])
  })
})

function faults(
  failure: 'write' | 'finalize'
): PersistenceOperations & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    write: async () => failIf(calls, failure, 'write'),
    rollback: async () => void calls.push('rollback'),
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

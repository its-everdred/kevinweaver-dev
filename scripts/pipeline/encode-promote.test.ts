import { describe, expect, it } from 'vitest'
import type { FileOperations } from './encode-promote.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { promoteWith, recoverWith, rollbackWith } from './encode-promote.ts'

describe('bundle promotion', () => {
  it('refuses promotion before prior-generation recovery', async () => {
    const disk = fakeDisk(['target.previous', 'temporary'])

    await expect(
      promoteWith(disk.operations, 'temporary', 'target')
    ).rejects.toThrow('Bundle recovery must run before promotion.')

    expect(disk.paths()).toEqual(['target.previous', 'temporary'])
  })

  it('restores the good generation when promotion rename fails', async () => {
    const disk = fakeDisk(['target', 'temporary'], 'temporary')

    await expect(
      promoteWith(disk.operations, 'temporary', 'target')
    ).rejects.toThrow('rename failed')

    expect(disk.paths()).toEqual(['target', 'temporary'])
  })

  it('restores the state-matching generation after target promotion', async () => {
    const disk = fakeDisk(['target', 'target.previous'])

    await recoverWith(disk.operations, hashFor('new', 'old'), 'target', 'old')

    expect(disk.paths()).toEqual(['target'])
  })

  it('finalizes the state-matching target after state persistence', async () => {
    const disk = fakeDisk(['target', 'target.previous'])

    await recoverWith(disk.operations, hashFor('new', 'old'), 'target', 'new')

    expect(disk.paths()).toEqual(['target'])
  })

  it('refuses ambiguous generations that do not match state', async () => {
    const disk = fakeDisk(['target', 'target.previous'])

    await expect(
      recoverWith(disk.operations, hashFor('new', 'old'), 'target', 'other')
    ).rejects.toThrow('No bundle generation matches pipeline state.')

    expect(disk.paths()).toEqual(['target', 'target.previous'])
  })

  it('restores previous when the promoted target cannot be hashed', async () => {
    const disk = fakeDisk(['target', 'target.previous'])
    const hash = async (path: string): Promise<string> => {
      if (path === 'target') throw new Error('damaged target')
      return 'old'
    }

    await recoverWith(disk.operations, hash, 'target', 'old')

    expect(disk.paths()).toEqual(['target'])
  })

  it('restores a previous-only generation only when its hash matches state', async () => {
    const disk = fakeDisk(['target.previous'])

    await recoverWith(disk.operations, hashFor('', 'old'), 'target', 'old')

    expect(disk.paths()).toEqual(['target'])
  })

  it('leaves a previous-only mismatch untouched', async () => {
    const disk = fakeDisk(['target.previous'])

    await expect(
      recoverWith(disk.operations, hashFor('', 'old'), 'target', 'other')
    ).rejects.toThrow('No bundle generation matches pipeline state.')

    expect(disk.paths()).toEqual(['target.previous'])
  })

  it('leaves a previous-only hash failure untouched', async () => {
    const disk = fakeDisk(['target.previous'])
    const broken = async (): Promise<string> =>
      Promise.reject(new Error('damaged'))

    await expect(
      recoverWith(disk.operations, broken, 'target', 'old')
    ).rejects.toThrow('No bundle generation matches pipeline state.')

    expect(disk.paths()).toEqual(['target.previous'])
  })

  it('retains both generations when rollback restoration fails', async () => {
    const disk = fakeDisk(['target', 'target.previous'], 'target.previous')

    await expect(rollbackWith(disk.operations, 'target')).rejects.toThrow(
      'rename failed'
    )

    expect(disk.paths()).toEqual(['target', 'target.previous'])
  })
})

function hashFor(target: string, previous: string) {
  return async (path: string): Promise<string> =>
    path === 'target' ? target : previous
}

function fakeDisk(
  initial: readonly string[],
  failingSource?: string
): {
  operations: FileOperations
  paths(): string[]
} {
  const entries = new Set(initial)
  return {
    operations: {
      exists: async (path) => entries.has(path),
      remove: async (path) => void entries.delete(path),
      rename: async (source, target) => {
        if (source === failingSource) throw new Error('rename failed')
        if (!entries.delete(source)) throw missingPath(source)
        entries.add(target)
      },
    },
    paths: () => [...entries].sort(),
  }
}

function missingPath(path: string): Error & { code: string } {
  return Object.assign(new Error(`Missing path: ${path}`), { code: 'ENOENT' })
}

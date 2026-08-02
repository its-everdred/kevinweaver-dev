import { describe, expect, it } from 'vitest'
import type { FileOperations } from './encode-promote.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { promoteWith } from './encode-promote.ts'

describe('bundle promotion', () => {
  it('recovers a prior generation before promotion', async () => {
    const disk = fakeDisk(['target.previous', 'temporary'])

    await promoteWith(disk.operations, 'temporary', 'target')

    expect(disk.paths()).toEqual(['target', 'target.previous'])
  })

  it('restores the good generation when promotion rename fails', async () => {
    const disk = fakeDisk(['target', 'temporary'], 'temporary')

    await expect(
      promoteWith(disk.operations, 'temporary', 'target')
    ).rejects.toThrow('rename failed')

    expect(disk.paths()).toEqual(['target', 'temporary'])
  })
})

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

import { rename, rm, stat } from 'node:fs/promises'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readBundleHash } from './encode-hash.ts'
import type { PipelineState } from './state.ts'

export interface FileOperations {
  exists(path: string): Promise<boolean>
  remove(path: string): Promise<void>
  rename(source: string, target: string): Promise<void>
}

const files: FileOperations = {
  exists: async (path) => {
    try {
      await stat(path)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
  rename,
}

export async function promote(
  tempDir: string,
  targetDir: string
): Promise<void> {
  await promoteWith(files, tempDir, targetDir)
}

export async function promoteWith(
  operations: FileOperations,
  tempDir: string,
  targetDir: string
): Promise<void> {
  const previous = previousPath(targetDir)
  await recoverPrevious(operations, previous, targetDir)
  await backUpTarget(operations, targetDir, previous)
  await moveTemporary(operations, tempDir, targetDir, previous)
}

export async function finalizePromotion(targetDir: string): Promise<void> {
  await files.remove(previousPath(targetDir))
}

export async function rollbackPromotion(targetDir: string): Promise<void> {
  await rollbackWith(files, targetDir)
}

/** Restores the previous generation without deleting it before replacement. */
export async function rollbackWith(
  operations: FileOperations,
  target: string
): Promise<void> {
  const previous = previousPath(target)
  if (!(await operations.exists(previous))) return
  if (!(await operations.exists(target)))
    return operations.rename(previous, target)
  await restorePrevious(operations, target, previous)
}

/** Resolves an interrupted promotion using the persisted generation digest. */
export async function recoverPromotion(
  targetDir: string,
  state: PipelineState | null
): Promise<void> {
  await recoverWith(files, readBundleHash, targetDir, state?.bundleHash)
}

export async function recoverWith(
  operations: FileOperations,
  hashFor: (directory: string) => Promise<string>,
  target: string,
  expectedHash: string | undefined
): Promise<void> {
  const previous = previousPath(target)
  if (!(await operations.exists(previous))) return
  if (!(await operations.exists(target)))
    return operations.rename(previous, target)
  await settleGenerations(operations, hashFor, target, previous, expectedHash)
}

function previousPath(targetDir: string): string {
  return `${targetDir}.previous`
}

async function recoverPrevious(
  operations: FileOperations,
  previous: string,
  target: string
): Promise<void> {
  const hasTarget = await operations.exists(target)
  const hasPrevious = await operations.exists(previous)
  if (hasTarget && hasPrevious)
    throw new PromotionRecoveryError(
      'Bundle recovery must run before promotion.'
    )
  if (hasTarget || !hasPrevious) return
  await operations.rename(previous, target)
}

async function settleGenerations(
  operations: FileOperations,
  hashFor: (directory: string) => Promise<string>,
  target: string,
  previous: string,
  expectedHash: string | undefined
): Promise<void> {
  if (!expectedHash)
    throw new PromotionRecoveryError('Cannot identify prior bundle generation.')
  if (await matchesHash(hashFor, target, expectedHash))
    return operations.remove(previous)
  if ((await hashFor(previous)) !== expectedHash)
    throw new PromotionRecoveryError(
      'No bundle generation matches pipeline state.'
    )
  await restorePrevious(operations, target, previous)
}

async function restorePrevious(
  operations: FileOperations,
  target: string,
  previous: string
): Promise<void> {
  const displaced = `${target}.rollback`
  await operations.remove(displaced)
  await operations.rename(target, displaced)
  try {
    await operations.rename(previous, target)
  } catch (error) {
    await operations.rename(displaced, target)
    throw error
  }
  await operations.remove(displaced)
}

async function matchesHash(
  hashFor: (directory: string) => Promise<string>,
  directory: string,
  expectedHash: string
): Promise<boolean> {
  try {
    return (await hashFor(directory)) === expectedHash
  } catch {
    return false
  }
}

async function backUpTarget(
  operations: FileOperations,
  target: string,
  previous: string
): Promise<void> {
  if (!(await operations.exists(target))) return
  await operations.remove(previous)
  await operations.rename(target, previous)
}

async function moveTemporary(
  operations: FileOperations,
  temporary: string,
  target: string,
  previous: string
): Promise<void> {
  try {
    await operations.rename(temporary, target)
  } catch (error) {
    if (await operations.exists(previous))
      await operations.rename(previous, target)
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

export class PromotionRecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromotionRecoveryError'
  }
}

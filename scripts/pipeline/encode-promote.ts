import { rename, rm, stat } from 'node:fs/promises'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readBundleHash } from './encode-hash.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { PromotionRecoveryError, previousPath, recoverState, recoverWith } from './encode-recovery.ts'
import type { PipelineState } from './state.ts'

/**
 * @description Minimal filesystem boundary required for atomic publication.
 */
export interface FileOperations {
  exists(path: string): Promise<boolean>
  remove(path: string): Promise<void>
  rename(source: string, target: string): Promise<void>
}

export { PromotionRecoveryError, recoverWith }

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

/**
 * @description Atomically publishes one staged bundle generation.
 * @param tempDir Complete staged generation directory.
 * @param targetDir Public generation directory.
 * @returns Resolves after the staged generation becomes visible.
 */
export async function promote(
  tempDir: string,
  targetDir: string
): Promise<void> {
  await promoteWith(files, tempDir, targetDir)
}

/**
 * @description Publishes through an injectable filesystem boundary.
 * @param operations Filesystem operations used for the transaction.
 * @param tempDir Complete staged generation directory.
 * @param targetDir Public generation directory.
 * @returns Resolves after the staged generation becomes visible.
 */
export async function promoteWith(
  operations: FileOperations,
  tempDir: string,
  targetDir: string
): Promise<void> {
  const previous = previousPath(targetDir)
  await assertRecovered(operations, previous)
  await backUpTarget(operations, targetDir, previous)
  await moveTemporary(operations, tempDir, targetDir, previous)
}

/**
 * @description Removes the backup after pipeline state is safely persisted.
 * @param targetDir Public generation directory.
 * @returns Resolves after the backup is removed.
 */
export async function finalizePromotion(targetDir: string): Promise<void> {
  await files.remove(previousPath(targetDir))
}

/**
 * @description Restores the last committed generation after persistence fails.
 * @param targetDir Public generation directory.
 * @returns Resolves after the visible generation is safe.
 */
export async function rollbackPromotion(targetDir: string): Promise<void> {
  await rollbackWith(files, targetDir)
}

/**
 * @description Restores the prior generation, or removes an uncommitted first
 * generation when there is no prior generation to restore.
 * @param operations Filesystem operations used for the transaction.
 * @param target Public generation directory.
 * @returns Resolves after the visible generation is safe.
 */
export async function rollbackWith(
  operations: FileOperations,
  target: string
): Promise<void> {
  const previous = previousPath(target)
  if (!(await operations.exists(previous))) return operations.remove(target)
  if (!(await operations.exists(target)))
    return operations.rename(previous, target)
  await restorePrior(operations, target, previous)
}

async function restorePrior(
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

/**
 * @description Resolves an interrupted promotion using the persisted digest.
 * @param targetDir Public generation directory.
 * @param state Persisted pipeline state, when one exists.
 * @returns Resolves when the visible generation matches state.
 */
export async function recoverPromotion(
  targetDir: string,
  state: PipelineState | null
): Promise<void> {
  await recoverState(files, readBundleHash, targetDir, state)
}

async function assertRecovered(
  operations: FileOperations,
  previous: string
): Promise<void> {
  if (!(await operations.exists(previous))) return
  throw new PromotionRecoveryError('Bundle recovery must run before promotion.')
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

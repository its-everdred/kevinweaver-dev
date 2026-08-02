import type { PipelineState } from './state.ts'
import type { FileOperations } from './encode-promote.ts'

/**
 * @description Resolves an interrupted promotion using the persisted digest.
 * @param operations Filesystem operations used for recovery.
 * @param hashFor Complete generation digest reader.
 * @param target Public generation directory.
 * @param expectedHash Persisted successful generation digest.
 * @returns Resolves when the visible generation matches state.
 */
export async function recoverWith(
  operations: FileOperations,
  hashFor: (directory: string) => Promise<string>,
  target: string,
  expectedHash: string | undefined
): Promise<void> {
  const previous = previousPath(target)
  if (!(await operations.exists(previous))) return
  if (!(await operations.exists(target)))
    return restorePreviousOnly(
      operations,
      hashFor,
      previous,
      target,
      expectedHash
    )
  await settleGenerations(operations, hashFor, target, previous, expectedHash)
}

/**
 * @description Recovers a target generation from persisted pipeline state.
 * @param operations Filesystem operations used for recovery.
 * @param hashFor Complete generation digest reader.
 * @param target Public generation directory.
 * @param state Persisted state, when one exists.
 * @returns Resolves when the visible generation matches state.
 */
export async function recoverState(
  operations: FileOperations,
  hashFor: (directory: string) => Promise<string>,
  target: string,
  state: PipelineState | null
): Promise<void> {
  await recoverWith(operations, hashFor, target, state?.bundleHash)
}

/**
 * @description Derives the transaction backup path for a public generation.
 * @param target Public generation directory.
 * @returns Adjacent backup directory path.
 */
export function previousPath(target: string): string {
  return `${target}.previous`
}

async function restorePreviousOnly(
  operations: FileOperations,
  hashFor: (directory: string) => Promise<string>,
  previous: string,
  target: string,
  expectedHash: string | undefined
): Promise<void> {
  if (!expectedHash || !(await matchesHash(hashFor, previous, expectedHash)))
    throw new PromotionRecoveryError(
      'No bundle generation matches pipeline state.'
    )
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
  if (!(await matchesHash(hashFor, previous, expectedHash)))
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

/**
 * @description Signals that persisted state cannot identify a safe generation.
 */
export class PromotionRecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromotionRecoveryError'
  }
}

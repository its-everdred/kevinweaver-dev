import { rename, rm } from 'node:fs/promises'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readBundleHash } from './encode-hash.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readState, writeState } from './state.ts'
import type { PipelineState } from './state.ts'

/**
 * @description Writes candidate state before its generation becomes visible.
 * @param statePath Committed pipeline state path.
 * @param state Candidate state describing the staged generation.
 * @returns Resolves after the journal is atomically written.
 */
export async function stagePipelineState(
  statePath: string,
  state: PipelineState
): Promise<void> {
  await writeState(journalPath(statePath), state)
}

/**
 * @description Commits the journal after its generation becomes visible.
 * @param statePath Committed pipeline state path.
 * @returns Resolves after the journal atomically replaces committed state.
 */
export async function commitPipelineState(statePath: string): Promise<void> {
  await rename(journalPath(statePath), statePath)
}

/**
 * @description Removes an abandoned state journal and its temporary write.
 * @param statePath Committed pipeline state path.
 * @returns Resolves after journal artifacts are absent.
 */
export async function discardPipelineState(statePath: string): Promise<void> {
  const journal = journalPath(statePath)
  await Promise.all([
    rm(journal, { force: true }),
    rm(`${journal}.tmp`, { force: true }),
  ])
}

/**
 * @description Commits a crash-interrupted first publication when hashes match.
 * @param statePath Committed pipeline state path.
 * @param target Public generation directory.
 * @param current Previously committed state.
 * @returns State that truthfully describes the visible generation.
 */
export async function recoverPipelineState(
  statePath: string,
  target: string,
  current: PipelineState | null
): Promise<PipelineState | null> {
  const pending = await readState(journalPath(statePath))
  if (!pending) return current
  if (await generationMatches(target, pending.bundleHash)) {
    await commitPipelineState(statePath)
    return pending
  }
  await discardPipelineState(statePath)
  return current
}

function journalPath(statePath: string): string {
  return `${statePath}.pending`
}

async function generationMatches(
  target: string,
  expectedHash: string | undefined
): Promise<boolean> {
  if (!expectedHash) return false
  try {
    return (await readBundleHash(target)) === expectedHash
  } catch (error) {
    if (isMissing(error)) return false
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

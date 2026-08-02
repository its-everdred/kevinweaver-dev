import type { PipelineState } from './state.ts'

/**
 * @description Injectable boundaries for publication and state commitment.
 */
export interface PersistenceOperations {
  stage(path: string, state: PipelineState): Promise<void>
  promote(temporary: string, target: string): Promise<void>
  commit(path: string): Promise<void>
  rollback(target: string): Promise<void>
  discard(path: string): Promise<void>
  finalize(target: string): Promise<void>
}

/**
 * @description Publishes a generation with write-ahead state recovery.
 * @param operations Publication and state transaction operations.
 * @param statePath Committed pipeline state path.
 * @param state Candidate state describing the staged generation.
 * @param temporary Complete staged generation directory.
 * @param target Public generation directory.
 * @returns Resolves after state and generation are committed.
 */
export async function persistWith(
  operations: PersistenceOperations,
  statePath: string,
  state: PipelineState,
  temporary: string,
  target: string
): Promise<void> {
  await stageOrDiscard(operations, statePath, state)
  await promoteAndCommit(operations, statePath, temporary, target)
  await operations.finalize(target)
}

async function stageOrDiscard(
  operations: PersistenceOperations,
  statePath: string,
  state: PipelineState
): Promise<void> {
  try {
    await operations.stage(statePath, state)
  } catch (error) {
    await operations.discard(statePath)
    throw error
  }
}

async function promoteAndCommit(
  operations: PersistenceOperations,
  statePath: string,
  temporary: string,
  target: string
): Promise<void> {
  let promoted = false
  try {
    await operations.promote(temporary, target)
    promoted = true
    await operations.commit(statePath)
  } catch (error) {
    if (promoted) await operations.rollback(target)
    await operations.discard(statePath)
    throw error
  }
}

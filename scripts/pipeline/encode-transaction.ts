import type { PipelineState } from './state.ts'

export interface PersistenceOperations {
  write(path: string, state: PipelineState): Promise<void>
  rollback(target: string): Promise<void>
  finalize(target: string): Promise<void>
}

/** Writes the state before cleanup, retaining recovery data after cleanup faults. */
export async function persistWith(
  operations: PersistenceOperations,
  statePath: string,
  state: PipelineState,
  target: string
): Promise<void> {
  await writeOrRollback(operations, statePath, state, target)
  await operations.finalize(target)
}

async function writeOrRollback(
  operations: PersistenceOperations,
  statePath: string,
  state: PipelineState,
  target: string
): Promise<void> {
  try {
    await operations.write(statePath, state)
  } catch (error) {
    await operations.rollback(target)
    throw error
  }
}

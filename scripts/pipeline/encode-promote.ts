import { rename, rm, stat } from 'node:fs/promises'

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
  const previous = previousPath(targetDir)
  await files.remove(targetDir)
  if (await files.exists(previous)) await files.rename(previous, targetDir)
}

function previousPath(targetDir: string): string {
  return `${targetDir}.previous`
}

async function recoverPrevious(
  operations: FileOperations,
  previous: string,
  target: string
): Promise<void> {
  if ((await operations.exists(target)) || !(await operations.exists(previous)))
    return
  await operations.rename(previous, target)
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

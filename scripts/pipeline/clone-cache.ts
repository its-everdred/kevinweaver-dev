import { access } from 'node:fs/promises'
import type { GitExec } from './clone.ts'

/** Checks whether a preserved bare clone is present on disk. */
export async function cacheExists(directory: string): Promise<boolean> {
  try {
    await access(directory)
    return true
  } catch {
    return false
  }
}

/** Confirms that a cache still identifies a remote origin. */
export async function cacheIsValid(
  directory: string,
  exec: GitExec
): Promise<boolean> {
  const result = await exec(
    ['-C', directory, 'config', '--get', 'remote.origin.url'],
    undefined
  )
  return result.code === 0 && result.stdout.trim() !== ''
}

/** Reads sorted local branch heads without contacting the remote. */
export async function cachedHeads(
  directory: string,
  exec: GitExec
): Promise<Record<string, string>> {
  const result = await exec(
    [
      '-C',
      directory,
      'for-each-ref',
      '--format=%(refname) %(objectname)',
      'refs/heads',
    ],
    undefined
  )
  return result.code === 0 ? headsFrom(result.stdout) : {}
}

/** Decodes git's ref listing into a canonical snapshot. */
export function headsFrom(stdout: string): Record<string, string> {
  const entries = stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' '))
  const heads: Record<string, string> = {}
  entries.forEach(([ref, sha]) => {
    if (ref && sha) heads[ref] = sha
  })
  return Object.fromEntries(
    Object.entries(heads).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  )
}

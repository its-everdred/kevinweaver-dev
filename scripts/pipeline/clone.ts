// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { repoDir, synchronize } from './clone-sync.ts'

/**
 * @description Runs Git through an injectable boundary for deterministic tests.
 */
export type GitExec = (
  args: readonly string[],
  cwd: string | undefined
) => Promise<{ code: number; stdout: string; stderr: string }>

/**
 * @description Configures the derived bare-clone cache.
 */
export interface CloneOptions {
  cloneRoot?: string
  retries?: number
  backoffMs?: number
  exec?: GitExec
}

/**
 * @description Reports one clone or fetch attempt sequence.
 */
export interface CloneOutcome {
  repo: string
  dir: string
  ok: boolean
  cached: boolean
  heads: Record<string, string>
  attempts: number
  error: string | null
}

export { repoDir }

/**
 * @description Clones or refreshes one repository and snapshots local heads.
 * @param repo Public repository name.
 * @param opts Cache and retry options.
 * @returns Clone outcome, including retained-cache facts when stale.
 */
export async function syncRepo(
  repo: string,
  opts?: CloneOptions
): Promise<CloneOutcome> {
  return synchronize(repo, opts)
}

/**
 * @description Refreshes every requested repository concurrently.
 * @param repos Public repository names.
 * @param opts Cache and retry options.
 * @returns Clone outcomes in request order.
 */
export async function syncAll(
  repos: readonly string[],
  opts?: CloneOptions
): Promise<CloneOutcome[]> {
  return Promise.all(repos.map((repo) => syncRepo(repo, opts)))
}

import { spawn } from 'node:child_process'
import { access, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Runs git with an injectable boundary for deterministic tests. */
export type GitExec = (
  args: readonly string[],
  cwd: string | undefined
) => Promise<{ code: number; stdout: string; stderr: string }>

/** Configures the derived bare-clone cache. */
export interface CloneOptions {
  cloneRoot?: string
  retries?: number
  backoffMs?: number
  exec?: GitExec
}

/** Reports one clone or fetch attempt sequence. */
export interface CloneOutcome {
  repo: string
  dir: string
  ok: boolean
  cached: boolean
  heads: Record<string, string>
  attempts: number
  error: string | null
}

const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const DEFAULT_RETRIES = 3
const DEFAULT_BACKOFF_MS = 1_000

class InvalidRepositoryError extends Error {
  constructor(repo: string) {
    super(`Invalid repository name: ${repo}`)
    this.name = 'InvalidRepositoryError'
  }
}

function resolveCloneRoot(root: string | undefined): string {
  return resolve(
    root ?? process.env.KW_CLONE_ROOT ?? join(tmpdir(), 'kw-clones-v1')
  )
}

function validateRepo(repo: string): void {
  if (!REPO_NAME.test(repo)) throw new InvalidRepositoryError(repo)
}

function trimError(stderr: string): string | null {
  const lines = stderr.trim().split('\n').filter(Boolean)
  return lines.at(-1)?.trim() ?? null
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

function childEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  const githubToken = 'GITHUB' + '_TOKEN'
  const ghToken = 'GH' + '_TOKEN'
  const contribToken = 'CONTRIB' + '_TOKEN'
  delete environment[githubToken]
  delete environment[ghToken]
  delete environment[contribToken]
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
  }
}

const runGit: GitExec = async (args, cwd) =>
  new Promise((done) => {
    const child = spawn('git', args, { cwd, env: childEnvironment() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) =>
      done({ code: -1, stdout, stderr: error.message })
    )
    child.on('close', (code) => done({ code: code ?? -1, stdout, stderr }))
  })

async function exists(dir: string): Promise<boolean> {
  try {
    await access(dir)
    return true
  } catch {
    return false
  }
}

async function cacheIsValid(dir: string, exec: GitExec): Promise<boolean> {
  const result = await exec(
    ['-C', dir, 'config', '--get', 'remote.origin.url'],
    undefined
  )
  return result.code === 0 && result.stdout.trim() !== ''
}

function readHeads(stdout: string): Record<string, string> {
  const entries = stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' '))
  const heads: Record<string, string> = {}
  for (const [ref, sha] of entries) {
    if (ref && sha) heads[ref] = sha
  }
  return Object.fromEntries(
    Object.entries(heads).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
}

function optionsFor(
  opts: CloneOptions | undefined
): Required<Pick<CloneOptions, 'retries' | 'backoffMs'>> {
  return {
    retries: opts?.retries ?? DEFAULT_RETRIES,
    backoffMs: opts?.backoffMs ?? DEFAULT_BACKOFF_MS,
  }
}

/** Resolves a repository to its stable bare-cache directory. */
export function repoDir(repo: string, cloneRoot: string): string {
  validateRepo(repo)
  return join(resolve(cloneRoot), `${repo.replace('/', '__')}.git`)
}

/** Clones or refreshes one repository and snapshots its local heads. */
export async function syncRepo(
  repo: string,
  opts?: CloneOptions
): Promise<CloneOutcome> {
  validateRepo(repo)
  const cloneRoot = resolveCloneRoot(opts?.cloneRoot)
  const dir = repoDir(repo, cloneRoot)
  const exec = opts?.exec ?? runGit
  const { retries, backoffMs } = optionsFor(opts)
  if (retries < 1 || !Number.isInteger(retries))
    throw new RangeError('retries must be a positive integer')
  if (backoffMs < 0) throw new RangeError('backoffMs must be non-negative')

  let cached = await exists(dir)
  if (cached && !(await cacheIsValid(dir, exec))) {
    await rm(dir, { recursive: true, force: true })
    cached = false
  }
  if (!cached) await mkdir(cloneRoot, { recursive: true })

  let lastError: string | null = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = cached
      ? await exec(
          [
            '-C',
            dir,
            'fetch',
            '--filter=blob:none',
            '--prune',
            '--prune-tags',
            '--tags',
            'origin',
            '+refs/heads/*:refs/heads/*',
          ],
          undefined
        )
      : await exec(
          [
            'clone',
            '--filter=blob:none',
            '--bare',
            '--',
            `https://github.com/${repo}.git`,
            dir,
          ],
          undefined
        )
    if (result.code === 0) {
      const heads = await exec(
        [
          '-C',
          dir,
          'for-each-ref',
          '--format=%(refname) %(objectname)',
          'refs/heads',
        ],
        undefined
      )
      if (heads.code === 0)
        return {
          repo,
          dir,
          ok: true,
          cached,
          heads: readHeads(heads.stdout),
          attempts: attempt,
          error: null,
        }
      lastError = trimError(heads.stderr)
      await rm(dir, { recursive: true, force: true })
      cached = false
    } else {
      lastError = trimError(result.stderr)
      if (!cached) await rm(dir, { recursive: true, force: true })
    }
    if (attempt < retries) await wait(backoffMs * 2 ** (attempt - 1))
  }
  return {
    repo,
    dir,
    ok: false,
    cached,
    heads: {},
    attempts: retries,
    error: lastError,
  }
}

/** Sequentially refreshes every requested repository. */
export async function syncAll(
  repos: readonly string[],
  opts?: CloneOptions
): Promise<CloneOutcome[]> {
  const outcomes: CloneOutcome[] = []
  for (const repo of repos) outcomes.push(await syncRepo(repo, opts))
  return outcomes
}

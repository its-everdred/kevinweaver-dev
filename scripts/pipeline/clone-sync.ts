import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import * as cache from './clone-cache.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { cloneCommand, headsCommand, trimGitError } from './clone-commands.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { runGit } from './clone-runner.ts'
import type { CloneOptions, CloneOutcome, GitExec } from './clone.ts'

const NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const DEFAULT_RETRIES = 3
const DEFAULT_BACKOFF_MS = 1_000

type SyncContext = {
  repo: string
  root: string
  dir: string
  retries: number
  backoffMs: number
  exec: GitExec
  cached: boolean
  heads: Record<string, string>
}

type AttemptResult = { ok: true } | { ok: false; error: string | null }

/**
 * @description Resolves a repository name to its stable bare-cache directory.
 * @param repo Public repository name.
 * @param cloneRoot Bare-clone cache root.
 * @returns Absolute bare-cache path.
 */
export function repoDir(repo: string, cloneRoot: string): string {
  validateRepo(repo)
  return join(resolve(cloneRoot), `${repo.replace('/', '__')}.git`)
}

/**
 * @description Refreshes one clone cache and captures locally measured heads.
 * @param repo Public repository name.
 * @param options Clone and retry options.
 * @returns Refresh outcome, including retained-cache facts on failure.
 */
export async function synchronize(
  repo: string,
  options?: CloneOptions
): Promise<CloneOutcome> {
  const context = await prepare(repo, options)
  return attemptAll(context)
}

async function prepare(
  repo: string,
  options?: CloneOptions
): Promise<SyncContext> {
  validateRepo(repo)
  const context = buildContext(repo, options)
  context.cached = await validatedCache(context)
  if (!context.cached) await mkdir(context.root, { recursive: true })
  return context
}

function buildContext(
  repo: string,
  options: CloneOptions | undefined
): SyncContext {
  const root = resolve(
    options?.cloneRoot ??
      process.env.KW_CLONE_ROOT ??
      join(tmpdir(), 'kw-clones-v1')
  )
  const retries = options?.retries ?? DEFAULT_RETRIES
  const backoffMs = options?.backoffMs ?? DEFAULT_BACKOFF_MS
  validateOptions(retries, backoffMs)
  return {
    repo,
    root,
    dir: repoDir(repo, root),
    retries,
    backoffMs,
    exec: options?.exec ?? runGit,
    cached: false,
    heads: {},
  }
}

function validateOptions(retries: number, backoffMs: number): void {
  if (retries < 1 || !Number.isInteger(retries))
    throw new RangeError('retries must be a positive integer')
  if (backoffMs < 0) throw new RangeError('backoffMs must be non-negative')
}

async function validatedCache(context: SyncContext): Promise<boolean> {
  if (!(await cache.cacheExists(context.dir))) return false
  if (await cache.cacheIsValid(context.dir, context.repo, context.exec))
    return true
  await rm(context.dir, { recursive: true, force: true })
  return false
}

async function attemptAll(context: SyncContext): Promise<CloneOutcome> {
  let error: string | null = null
  for (let attempt = 1; attempt <= context.retries; attempt += 1) {
    const result = await attemptOnce(context)
    if (result.ok) return successful(context, attempt)
    error = result.error
    if (attempt < context.retries)
      await wait(context.backoffMs * 2 ** (attempt - 1))
  }
  return failed(context, error)
}

async function attemptOnce(context: SyncContext): Promise<AttemptResult> {
  const result = await context.exec(
    cloneCommand(context.repo, context.dir, context.cached),
    undefined
  )
  if (result.code !== 0) return failedAttempt(context, result.stderr)
  const heads = await context.exec(headsCommand(context.dir), undefined)
  if (heads.code === 0) {
    context.heads = cache.headsFrom(heads.stdout)
    return { ok: true }
  }
  await rm(context.dir, { recursive: true, force: true })
  context.cached = false
  return { ok: false, error: trimGitError(heads.stderr) }
}

async function failedAttempt(
  context: SyncContext,
  stderr: string
): Promise<AttemptResult> {
  if (!context.cached) await rm(context.dir, { recursive: true, force: true })
  return { ok: false, error: trimGitError(stderr) }
}

async function successful(
  context: SyncContext,
  attempts: number
): Promise<CloneOutcome> {
  return {
    repo: context.repo,
    dir: context.dir,
    ok: true,
    cached: context.cached,
    heads: context.heads,
    attempts,
    error: null,
  }
}

async function failed(
  context: SyncContext,
  error: string | null
): Promise<CloneOutcome> {
  return {
    repo: context.repo,
    dir: context.dir,
    ok: false,
    cached: context.cached,
    heads: context.cached
      ? await cache.cachedHeads(context.dir, context.exec)
      : {},
    attempts: context.retries,
    error,
  }
}

function validateRepo(repo: string): void {
  if (!NAME.test(repo)) throw new InvalidRepositoryError(repo)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

class InvalidRepositoryError extends Error {
  constructor(repo: string) {
    super(`Invalid repository name: ${repo}`)
    this.name = 'InvalidRepositoryError'
  }
}

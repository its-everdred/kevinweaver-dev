import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import * as clone from './clone.ts'
import type { ActorId } from './identity.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extractRepo, GitLogError } from './extract-log.ts'
import type { RepoStatus } from '../../lib/bundle/schema.ts'

/** One author-attributed file touch ready for deterministic encoding. */
export interface RawEvent {
  day: string
  repo: string
  sha: string
  path: string
  actor: ActorId
}

/** A raw event retaining Git's original author timestamp. */
export interface ExtractedEvent extends RawEvent {
  authorDate: string
}

/** Per-repository extraction state returned to the stateful pipeline stage. */
export interface RepoExtract {
  n: string
  first: string
  last: string
  private: false
  status: RepoStatus
  consecutiveFailures: number
  lastOk: string | null
  heads: Record<string, string>
  events: ExtractedEvent[]
  error: string | null
}

/** Complete deterministic extraction result. */
export interface ExtractResult {
  events: ExtractedEvent[]
  repos: RepoExtract[]
  commitScope: '--all'
  cloneRoot: string
}

/** Configures extraction and its clone boundary. */
export interface ExtractOptions {
  cloneRoot?: string
  retries?: number
  backoffMs?: number
  exec?: clone.GitExec
}

function cloneRootFor(root: string | undefined): string {
  return resolve(
    root ?? process.env.KW_CLONE_ROOT ?? join(tmpdir(), 'kw-clones-v1')
  )
}

function bounds(events: readonly ExtractedEvent[]): {
  first: string
  last: string
} {
  const days = events.map((event) => event.day).sort()
  return { first: days[0] ?? '', last: days.at(-1) ?? '' }
}

function isoSecond(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Compares events by the canonical byte-deterministic order. */
export function compareRawEvents(a: RawEvent, b: RawEvent): number {
  if (a.day !== b.day) return a.day < b.day ? 1 : -1
  if (a.repo !== b.repo) return a.repo < b.repo ? -1 : 1
  if (a.sha !== b.sha) return a.sha < b.sha ? -1 : 1
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

function stale(
  repo: string,
  prior: RepoExtract | undefined,
  error: string | null
): RepoExtract {
  return {
    n: repo,
    first: prior?.first ?? '',
    last: prior?.last ?? '',
    private: false,
    status: 'stale',
    consecutiveFailures: (prior?.consecutiveFailures ?? 0) + 1,
    lastOk: prior?.lastOk ?? null,
    heads: prior?.heads ?? {},
    events: prior?.events ?? [],
    error,
  }
}

/** Extracts the requested cache into one canonical author-attributed event stream. */
export async function extractAll(
  repos: readonly string[],
  prior: readonly RepoExtract[],
  opts?: ExtractOptions
): Promise<ExtractResult> {
  if (repos.length === 0)
    throw new RangeError('at least one repository is required')
  const cloneRoot = cloneRootFor(opts?.cloneRoot)
  const priorByRepo = new Map(prior.map((repo) => [repo.n, repo]))
  const outcomes = await clone.syncAll(repos, opts)
  const extracted: RepoExtract[] = []
  for (const outcome of outcomes) {
    const before = priorByRepo.get(outcome.repo)
    if (!outcome.ok) {
      extracted.push(await staleFromCache(outcome, before))
      continue
    }
    const events = await extractRepo(outcome.repo, outcome.dir)
    const { first, last } = bounds(events)
    extracted.push({
      n: outcome.repo,
      first,
      last,
      private: false,
      status: 'ok',
      consecutiveFailures: 0,
      lastOk: isoSecond(),
      heads: outcome.heads,
      events,
      error: null,
    })
  }
  const events = extracted.flatMap((repo) => repo.events).sort(compareRawEvents)
  if (events.length === 0)
    throw new GitLogError('all repositories', 'no attributable events')
  return {
    events,
    repos: extracted.sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0)),
    commitScope: '--all',
    cloneRoot,
  }
}

async function staleFromCache(
  outcome: clone.CloneOutcome,
  prior: RepoExtract | undefined
): Promise<RepoExtract> {
  if (!outcome.cached)
    throw new GitLogError(outcome.repo, 'preserved bare clone is unavailable')
  const events = await extractRepo(outcome.repo, outcome.dir)
  const { first, last } = bounds(events)
  return {
    ...stale(outcome.repo, prior, outcome.error),
    first,
    last,
    heads: outcome.heads,
    events,
  }
}

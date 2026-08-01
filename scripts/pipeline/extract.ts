import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import { syncAll, type GitExec } from './clone.ts'
// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import { actorId, classify, type ActorId } from './identity.ts'
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
  exec?: GitExec
}

interface LogRecord {
  sha: string
  authorDate: string
  authorEmail: string
  paths: string[]
}

class GitLogError extends Error {
  constructor(repo: string, message: string) {
    super(`Could not extract ${repo}: ${message}`)
    this.name = 'GitLogError'
  }
}

function cloneRootFor(root: string | undefined): string {
  return resolve(
    root ?? process.env.KW_CLONE_ROOT ?? join(tmpdir(), 'kw-clones-v1')
  )
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

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  return path
    .slice(1, -1)
    .replace(/\\([\\"abfnrtv]|[0-7]{3})/g, (_, escape: string) => {
      if (/^[0-7]{3}$/.test(escape))
        return String.fromCharCode(Number.parseInt(escape, 8))
      return (
        { a: '\u0007', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }[
          escape
        ] ?? escape
      )
    })
}

function eventFrom(
  record: LogRecord,
  repo: string,
  path: string
): ExtractedEvent | undefined {
  const login = classify(record.authorEmail)
  if (login === null) return undefined
  return {
    day: record.authorDate.slice(0, 10),
    repo,
    sha: record.sha,
    path: unquotePath(path),
    actor: actorId(login),
    authorDate: record.authorDate,
  }
}

function recordFrom(line: string): LogRecord {
  const [sha, authorDate, authorEmail, ...rest] = line.slice(1).split('\x1f')
  if (!sha || !authorDate || !authorEmail || rest.length > 0)
    throw new GitLogError('unknown', 'malformed log header')
  return { sha, authorDate, authorEmail, paths: [] }
}

async function extractRepo(
  repo: string,
  dir: string
): Promise<ExtractedEvent[]> {
  return new Promise((done, fail) => {
    const child = spawn(
      'git',
      [
        '-C',
        dir,
        '-c',
        'core.quotePath=false',
        'log',
        '--all',
        '--no-merges',
        '--no-renames',
        '--no-mailmap',
        '--name-only',
        '--pretty=format:%x01%H%x1f%aI%x1f%ae',
      ],
      { env: childEnvironment() }
    )
    const events: ExtractedEvent[] = []
    let record: LogRecord | undefined
    let remaining = ''
    const flush = () => {
      if (!record) return
      for (const path of record.paths) {
        const event = eventFrom(record, repo, path)
        if (event) events.push(event)
      }
    }
    const consume = (line: string) => {
      if (line.startsWith('\x01')) {
        flush()
        record = recordFrom(line)
      } else if (line !== '' && record) {
        record.paths.push(line)
      }
    }
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      remaining += chunk
      const lines = remaining.split('\n')
      remaining = lines.pop() ?? ''
      for (const line of lines) consume(line)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => fail(new GitLogError(repo, error.message)))
    child.on('close', (code) => {
      if (remaining) consume(remaining)
      flush()
      if (code === 0) done(events)
      else
        fail(
          new GitLogError(
            repo,
            stderr.trim().split('\n').filter(Boolean).at(-1) ?? 'git log failed'
          )
        )
    })
  })
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
  const outcomes = await syncAll(repos, opts)
  const extracted: RepoExtract[] = []
  for (const outcome of outcomes) {
    const before = priorByRepo.get(outcome.repo)
    if (!outcome.ok) {
      extracted.push(stale(outcome.repo, before, outcome.error))
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

import { spawn } from 'node:child_process'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { actorId, classify } from './identity.ts'
import type { ExtractedEvent } from './extract.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { childEnvironment, gitLogArgs } from './extract-log-runtime.ts'

type LogRecord = {
  sha: string
  authorDate: string
  authorEmail: string
  paths: string[]
}

/**
 * Paths that are somebody else's code, committed into the tree. `git log
 * --name-only` reports them as files the author touched, and at the full
 * history they are **85.6% of every path in the payload** — 80,796 of 94,842,
 * nearly all `node_modules`. Left in, two repos that vendored their
 * dependencies own half the galaxy, and the disc claims a dependency tree as
 * authored work.
 *
 * Deliberately short and obvious. Every entry here is a directory the
 * ecosystem agrees is machine-generated, or a build artifact named as such;
 * guessing at project-specific conventions would start dropping real work.
 */
const VENDORED = [
  /(^|\/)node_modules\//,
  /(^|\/)bower_components\//,
  /(^|\/)vendor\//,
  /(^|\/)Pods\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)site-packages\//,
  /\.min\.(js|css)$/,
]

/**
 * @description Whether a path is vendored or generated rather than authored.
 * @param path Repo-relative path from the commit.
 * @returns True when the path should not become a contribution.
 */
export function isVendored(path: string): boolean {
  return VENDORED.some((pattern) => pattern.test(path))
}

/**
 * @description Fingerprints the rules above, so a run can tell whether its
 * event count is comparable with the previous run's. The regression guard
 * assumes a large drop in events means something broke; that only holds while
 * both runs extracted by the same rules. Adding one pattern here legitimately
 * removed 85.6% of the corpus, which the guard read as breakage and refused.
 *
 * Derived from the patterns themselves rather than hand-versioned, because a
 * constant somebody has to remember to bump is a constant that silently stops
 * describing the thing it names.
 * @returns A stable fingerprint of the current extraction rules.
 */
export function extractionRules(): string {
  return VENDORED.map((pattern) => pattern.source).join('|')
}

/** Reports an unavailable or malformed preserved git history. */
export class GitLogError extends Error {
  constructor(repo: string, message: string) {
    super(`Could not extract ${repo}: ${message}`)
    this.name = 'GitLogError'
  }
}

/** Reads attributed file touches from an existing bare clone. */
export async function extractRepo(
  repo: string,
  directory: string
): Promise<ExtractedEvent[]> {
  return new Promise((resolve, reject) =>
    readLog(repo, directory, resolve, reject)
  )
}

function readLog(
  repo: string,
  directory: string,
  resolve: (events: ExtractedEvent[]) => void,
  reject: (error: Error) => void
): void {
  const child = spawn('git', gitLogArgs(directory), { env: childEnvironment() })
  const state = logState(repo)
  const failure = rejectOnce(repo, child, reject)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) =>
    consumeOrReject(state, chunk, failure)
  )
  child.stderr.on('data', (chunk: Buffer) => (state.stderr += chunk.toString()))
  child.on('error', failure)
  child.on('close', (code) => finishOrReject(state, code, resolve, failure))
}

function rejectOnce(
  repo: string,
  child: ReturnType<typeof spawn>,
  reject: (error: Error) => void
): (error: unknown) => void {
  let rejected = false
  return (error) => {
    if (rejected) return
    rejected = true
    child.kill()
    reject(errorFor(repo, error))
  }
}

function errorFor(repo: string, error: unknown): GitLogError {
  if (error instanceof GitLogError) return error
  return new GitLogError(
    repo,
    error instanceof Error ? error.message : 'git log failed'
  )
}

function consumeOrReject(
  state: LogState,
  chunk: string,
  reject: (error: unknown) => void
): void {
  try {
    consumeChunk(state, chunk)
  } catch (error) {
    reject(error)
  }
}

function finishOrReject(
  state: LogState,
  code: number | null,
  resolve: (events: ExtractedEvent[]) => void,
  reject: (error: unknown) => void
): void {
  try {
    finishLog(state, code, resolve, reject)
  } catch (error) {
    reject(error)
  }
}

type LogState = {
  repo: string
  events: ExtractedEvent[]
  record?: LogRecord
  remaining: string
  stderr: string
}

function logState(repo: string): LogState {
  return { repo, events: [], remaining: '', stderr: '' }
}

function consumeChunk(state: LogState, chunk: string): void {
  const lines = `${state.remaining}${chunk}`.split('\n')
  state.remaining = lines.pop() ?? ''
  lines.forEach((line) => consumeLine(state, line))
}

function consumeLine(state: LogState, line: string): void {
  if (line.startsWith('\x01')) {
    flush(state)
    state.record = recordFrom(state.repo, line)
    return
  }
  if (line === '') return
  if (!state.record) throw new GitLogError(state.repo, 'malformed log preamble')
  state.record.paths.push(line)
}

function finishLog(
  state: LogState,
  code: number | null,
  resolve: (events: ExtractedEvent[]) => void,
  reject: (error: Error) => void
): void {
  if (state.remaining) consumeLine(state, state.remaining)
  flush(state)
  if (code === 0) return resolve(state.events)
  reject(
    new GitLogError(
      state.repo,
      state.stderr.trim().split('\n').filter(Boolean).at(-1) ?? 'git log failed'
    )
  )
}

function flush(state: LogState): void {
  state.record?.paths.forEach((path) => addEvent(state, path))
}

function addEvent(state: LogState, path: string): void {
  const record = state.record
  if (!record) return
  if (isVendored(unquotePath(path))) return
  const login = classify(record.authorEmail)
  if (login === null) return
  state.events.push({
    day: record.authorDate.slice(0, 10),
    repo: state.repo,
    sha: record.sha,
    path: unquotePath(path),
    actor: actorId(login),
    authorDate: record.authorDate,
  })
}

function recordFrom(repo: string, line: string): LogRecord {
  const [sha, authorDate, authorEmail = '', ...rest] = line
    .slice(1)
    .split('\x1f')
  // A missing sha/date or an extra separator field means the header is
  // structurally broken. An empty author email is a legitimate git state
  // (`git commit --author="Name <>"`), not a malformed header: such a commit
  // is simply unclassifiable and is filtered out later, never a fatal error.
  if (!sha || !authorDate || rest.length > 0)
    throw new GitLogError(repo, 'malformed log header')
  return { sha, authorDate, authorEmail, paths: [] }
}

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) return path
  return path
    .slice(1, -1)
    .replace(/\\([\\"abfnrtv]|[0-7]{3})/g, (_, escape: string) =>
      decodeEscape(escape)
    )
}

function decodeEscape(escape: string): string {
  if (/^[0-7]{3}$/.test(escape))
    return String.fromCharCode(Number.parseInt(escape, 8))
  return (
    { a: '\u0007', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }[
      escape
    ] ?? escape
  )
}

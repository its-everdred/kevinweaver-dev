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
  const [sha, authorDate, authorEmail, ...rest] = line.slice(1).split('\x1f')
  if (!sha || !authorDate || !authorEmail || rest.length > 0)
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
